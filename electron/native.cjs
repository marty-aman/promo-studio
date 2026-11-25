// Native helper tools for the Mac app (behind window.desktop.native). Today: whisper.cpp, for faster lyric sync and
// speech captions. Plain Node (no Electron imports) so the unit tests can run all of it.
//
//  - Tools are an allowlist (`whisper`). The binary is looked up in <userData>/bin and is never part of the app
//    bundle: the person puts it there (docs/native-whisper.md). The page names a tool and structured options; it
//    never gives a path or a command line, and main builds the argument list itself.
//  - Models are downloaded only after the page says the person agreed (consent === true), checked against a pinned
//    size and sha256, and kept in <userData>/models (counted by the storage meter).
//  - Audio goes in as WAV bytes, is written to a private temp folder, and the folder is removed afterwards.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Readable } = require('node:stream');

/** Tools native.run may start, and the file each one is in <userData>/bin. */
const TOOLS = { whisper: 'whisper' };

const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
/** ggml models. Sizes and sha256 are from the Hugging Face file pages (LFS) and were re-checked by downloading ggml-base.bin. */
const MODELS = {
  base: { file: 'ggml-base.bin', label: 'Whisper base (ggml)', url: `${HF}/ggml-base.bin`, bytes: 147951465, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', dtw: 'base' },
  small: { file: 'ggml-small.bin', label: 'Whisper small (ggml)', url: `${HF}/ggml-small.bin`, bytes: 487601967, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b', dtw: 'small' },
};

const MAX_INPUT = 200 * 1024 * 1024; // a WAV handed to a tool (16 kHz mono 16-bit is about 1.9 MB a minute)
const MAX_JSON = 64 * 1024 * 1024;
const RUN_TIMEOUT = 20 * 60 * 1000;

/**
 * The options a whisper run accepts, from the page's argument list: ['--model', 'base', '--language', 'en',
 * '--threads', '4']. Anything else is refused, so the page cannot add its own flags or paths.
 */
function parseWhisperArgs(args, models = MODELS) {
  const out = { model: 'base', language: 'auto', threads: 4 };
  if (!Array.isArray(args) || args.length % 2) throw new Error('Bad whisper options');
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (typeof v !== 'string') throw new Error('Bad whisper options');
    if (k === '--model') {
      if (!Object.hasOwn(models, v)) throw new Error(`No model called ${v.slice(0, 20)}`);
      out.model = v;
    } else if (k === '--language') {
      if (v !== 'auto' && !/^[a-z]{2,3}$/.test(v)) throw new Error('Bad language');
      out.language = v;
    } else if (k === '--threads') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error('Bad thread count');
      out.threads = n;
    } else throw new Error(`Option ${String(k).slice(0, 20)} is not allowed`);
  }
  return out;
}

/** The command line main builds for whisper-cli: full JSON with token times, one word per segment, progress on stderr. */
function whisperArgv(o, { model, wav, outBase }) {
  const a = ['-m', model, '-f', wav, '-l', o.language, '-t', String(o.threads), '-ojf', '-of', outBase, '-ml', '1', '-sow', '-pp'];
  if (o.dtw) a.push('--dtw', o.dtw, '-nfa'); // DTW word times need flash attention off
  return a;
}

/** "whisper_print_progress_callback: progress =  45%" lines on stderr to a fraction. */
function progressOf(line) {
  const m = /progress\s*=\s*(\d{1,3})\s*%/.exec(line);
  return m ? Math.min(1, Number(m[1]) / 100) : null;
}

function createNative({ dir, models = MODELS, spawnFn = spawn, fetchFn = (...a) => fetch(...a), tmpBase = os.tmpdir() }) {
  const binDir = path.join(dir, 'bin');
  const modelsDir = path.join(dir, 'models');
  const downloads = new Map(); // model -> AbortController
  const children = new Set();

  async function toolPath(name) {
    if (!Object.hasOwn(TOOLS, name)) throw new Error(`No tool called ${String(name).slice(0, 40)}`);
    const p = path.join(binDir, TOOLS[name]);
    try {
      const st = await fsp.stat(p);
      if (!st.isFile()) return null;
      if (process.platform !== 'win32' && !(st.mode & 0o111)) return null;
      return p;
    } catch {
      return null;
    }
  }

  async function modelState(name) {
    const m = models[name];
    const file = path.join(modelsDir, m.file);
    const st = await fsp.stat(file).catch(() => null);
    const part = await fsp.stat(`${file}.part`).catch(() => null);
    return { name, label: m.label, file: m.file, bytes: m.bytes, installed: !!st && st.size === m.bytes, partial: part ? part.size : 0, downloading: downloads.has(name) };
  }

  /** What the Settings panel shows: which tools are in place, which models are downloaded, and where. */
  async function status() {
    const tools = {};
    for (const name of Object.keys(TOOLS)) tools[name] = { installed: !!(await toolPath(name)) };
    return { tools, models: await Promise.all(Object.keys(models).map(modelState)), binDir, modelsDir, modelsBytes: await modelsBytes() };
  }

  /** Bytes the downloaded models (and unfinished downloads) take, for the storage meter. */
  async function modelsBytes() {
    let n = 0;
    try {
      for (const f of await fsp.readdir(modelsDir)) n += (await fsp.stat(path.join(modelsDir, f)).catch(() => ({ size: 0 }))).size;
    } catch {
      /* no folder yet */
    }
    return n;
  }

  /**
   * Download a model after the person agreed. Checks the size and sha256 against the pinned values and only then
   * moves it into place; a bad or cut-off download is deleted. onProgress({ loaded, total }).
   */
  async function downloadModel(name, { consent, onProgress } = {}) {
    if (consent !== true) throw new Error('The person has to agree to the download first');
    if (!Object.hasOwn(models, name)) throw new Error('No such model');
    if (downloads.has(name)) throw new Error('That model is already downloading');
    const m = models[name];
    await fsp.mkdir(modelsDir, { recursive: true });
    const final = path.join(modelsDir, m.file);
    const part = `${final}.part`;
    if ((await modelState(name)).installed) return modelState(name);
    try {
      const s = await fsp.statfs(modelsDir);
      if (s.bavail * s.bsize < m.bytes * 1.1) throw new Error('There is not enough free disk space for this model');
    } catch (e) {
      if (/free disk/.test(e.message)) throw e;
    }
    const ctl = new AbortController();
    downloads.set(name, ctl);
    const hash = crypto.createHash('sha256');
    let loaded = 0;
    try {
      const res = await fetchFn(m.url, { signal: ctl.signal, redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`The download failed (${res.status})`);
      if (!String(res.url || m.url).startsWith('https://')) throw new Error('The download was not over https');
      const out = fs.createWriteStream(part);
      let lastEmit = 0;
      for await (const chunk of Readable.fromWeb(res.body)) {
        hash.update(chunk);
        loaded += chunk.length;
        if (loaded > m.bytes) throw new Error('The download is bigger than expected');
        if (!out.write(chunk)) await once(out, 'drain');
        const now = Date.now();
        if (onProgress && now - lastEmit > 250) ((lastEmit = now), onProgress({ loaded, total: m.bytes }));
      }
      out.end();
      await once(out, 'finish');
      if (loaded !== m.bytes) throw new Error('The download was cut short. Try again.');
      if (hash.digest('hex') !== m.sha256) throw new Error('The downloaded file does not match its checksum, so it was deleted.');
      await fsp.rename(part, final);
      onProgress && onProgress({ loaded, total: m.bytes });
      return modelState(name);
    } catch (e) {
      await fsp.rm(part, { force: true });
      if (ctl.signal.aborted) throw new Error('Download cancelled');
      throw e;
    } finally {
      downloads.delete(name);
    }
  }

  const cancelDownload = (name) => {
    const c = downloads.get(name);
    if (c) c.abort();
    return !!c;
  };

  async function removeModel(name) {
    if (!Object.hasOwn(models, name)) throw new Error('No such model');
    cancelDownload(name);
    const f = path.join(modelsDir, models[name].file);
    await fsp.rm(f, { force: true });
    await fsp.rm(`${f}.part`, { force: true });
    return true;
  }

  /**
   * Run a tool. `input` is the WAV (Uint8Array). Resolves { json (whisper's full JSON text), seconds }.
   * onProgress(fraction) while it runs.
   */
  async function run(name, args, { input, onProgress } = {}) {
    if (!Object.hasOwn(TOOLS, name)) throw new Error(`No bundled tool called ${String(name).slice(0, 40)}`);
    const bin = await toolPath(name);
    if (!bin) throw new Error('The speech tool is not installed. See Settings > Storage > Faster speech.');
    const o = parseWhisperArgs(args, models);
    const m = models[o.model];
    const modelFile = path.join(modelsDir, m.file);
    if (!(await modelState(o.model)).installed) throw new Error(`The ${o.model} model is not downloaded`);
    if (!input || !input.length || input.length > MAX_INPUT) throw new Error('No audio, or too much of it');
    const work = await fsp.mkdtemp(path.join(tmpBase, 'pvm-whisper-'));
    const t0 = Date.now();
    try {
      const wav = path.join(work, 'in.wav');
      const outBase = path.join(work, 'out');
      await fsp.writeFile(wav, input);
      const attempt = async (opts) => {
        const child = spawnFn(bin, whisperArgv(opts, { model: modelFile, wav, outBase }), { cwd: work, stdio: ['ignore', 'ignore', 'pipe'], env: { PATH: process.env.PATH || '/usr/bin:/bin' } });
        children.add(child);
        let tail = '';
        let buf = '';
        child.stderr.on('data', (d) => {
          const s = String(d);
          tail = (tail + s).slice(-2000);
          buf += s;
          const lines = buf.split(/\r?\n|\r/);
          buf = lines.pop();
          for (const l of lines) {
            const p = progressOf(l);
            if (p !== null && onProgress) onProgress(p);
          }
        });
        const timer = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT);
        const code = await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (c, sig) => resolve(sig ? `signal ${sig}` : c));
        }).finally(() => (clearTimeout(timer), children.delete(child)));
        return { code, tail };
      };
      // DTW word times first; if this build of whisper.cpp cannot do them, once more without (rougher times)
      let r = await attempt({ ...o, dtw: m.dtw });
      if (r.code !== 0) r = await attempt(o);
      if (r.code !== 0) throw new Error(`whisper stopped (${r.code}): ${r.tail.trim().split('\n').slice(-2).join(' ').slice(0, 300)}`);
      const jf = `${outBase}.json`;
      const st = await fsp.stat(jf).catch(() => null);
      if (!st || st.size > MAX_JSON) throw new Error('whisper wrote no result');
      return { json: await fsp.readFile(jf, 'utf8'), seconds: (Date.now() - t0) / 1000 };
    } finally {
      await fsp.rm(work, { recursive: true, force: true });
    }
  }

  const killAll = () => {
    for (const c of children) c.kill('SIGKILL');
    for (const c of downloads.values()) c.abort();
  };

  return { status, modelsBytes, downloadModel, cancelDownload, removeModel, run, killAll, toolPath, binDir, modelsDir };
}

module.exports = { TOOLS, MODELS, MAX_INPUT, parseWhisperArgs, whisperArgv, progressOf, createNative };
