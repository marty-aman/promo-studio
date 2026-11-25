// whisper.cpp plumbing (Mac app, step 3): the JSON adapter on real whisper.cpp output, the WAV writer, the
// argument allowlist, model download checks (size + sha256, consent) and a run through a fake whisper binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { wordsFromWhisperCpp, chunksFromWords, wavFromSamples, nativeReady } from '../js/ai/nativewhisper.js';
import { heardWords } from '../js/ai/lyricsync.js';
import { threadCount } from '../js/ai/runtime.js';

const require = createRequire(import.meta.url);
const { createNative, parseWhisperArgs, whisperArgv, progressOf, MODELS } = require('../electron/native.cjs');
const fixture = (n) => fs.readFileSync(new URL(`./fixtures/whispercpp/${n}`, import.meta.url), 'utf8');

const JFK = 'and so my fellow americans ask not what your country can do for you ask what you can do for your country'.split(' ');
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

test('adapter: whisper.cpp JSON of jfk.wav (base, DTW) gives the 22 spoken words with sane times', () => {
  const words = wordsFromWhisperCpp(fixture('jfk-base-dtw.json'));
  assert.deepEqual(words.map((w) => norm(w.w)), JFK);
  assert.equal(words[0].w, 'And');
  assert.equal(words[4].w, 'Americans,'); // punctuation stays on its word
  assert.equal(words[0].t, 0.52); // DTW start of the first word
  for (let i = 0; i < words.length; i++) {
    assert.ok(words[i].end >= words[i].t, `word ${i} ends after it starts`);
    if (i) assert.ok(words[i].t >= words[i - 1].t, `word ${i} is not before the one before`);
    if (i + 1 < words.length) assert.ok(words[i].end <= words[i + 1].t + 1e-9, `word ${i} ends by the next start`);
  }
  // the comma after "Americans" sits over a pause: it must not stretch the word
  assert.ok(words[4].end - words[4].t < 0.6, `Americans lasts ${words[4].end - words[4].t}`);
  assert.ok(words[21].end <= 11.1 && words[21].end > 10.5);
});

test('adapter: without DTW it falls back to the token times', () => {
  const words = wordsFromWhisperCpp(fixture('jfk-base-nodtw.json'));
  assert.deepEqual(words.map((w) => norm(w.w)), JFK);
  assert.equal(words[0].t, 0.32);
});

test('adapter: pieces of one word join, markers and sounds go, bad input is empty', () => {
  const seg = (tokens) => ({ offsets: { from: 0, to: 3000 }, text: '', tokens: tokens.map(([text, from, to, dtw = -1]) => ({ text, offsets: { from, to }, t_dtw: dtw })) });
  const doc = { transcription: [seg([['[_BEG_]', 0, 0], [' Ameri', 500, 700], ['cans', 700, 1100], [',', 1100, 1900], [' [BLANK_AUDIO]', 2000, 2500], [' ♪', 2500, 2600], [' ok', 2600, 2900], ['[_TT_150]', 3000, 3000]])] };
  const w = wordsFromWhisperCpp(doc);
  assert.deepEqual(w, [{ w: 'Americans,', t: 0.5, end: 1.1 }, { w: 'ok', t: 2.6, end: 2.9 }]);
  assert.deepEqual(wordsFromWhisperCpp('not json'), []);
  assert.deepEqual(wordsFromWhisperCpp({}), []);
  assert.deepEqual(wordsFromWhisperCpp(null), []);
});

test('adapter output is what lyricsync.heardWords reads, with the offset added', () => {
  const words = wordsFromWhisperCpp(fixture('jfk-base-dtw.json'));
  const heard = heardWords(chunksFromWords(words), 10);
  assert.equal(heard.length, 22);
  assert.equal(heard[0].t, 10.52);
  assert.equal(heard[0].w, 'And');
});

test('wavFromSamples writes a 16 kHz mono 16-bit WAV', () => {
  const wav = wavFromSamples(new Float32Array([0, 1, -1, 0.5]), 16000);
  const v = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
  assert.equal(wav.length, 52);
});

test('threadCount: one thread unless isolated, capped', () => {
  assert.equal(threadCount({ isolated: false, cores: 12 }), 1);
  assert.equal(threadCount({ isolated: true, cores: 12 }), 4);
  assert.equal(threadCount({ isolated: true, cores: 2 }), 2);
  assert.equal(threadCount({ isolated: true, cores: 0 }), 1);
});

test('nativeReady: false in a browser, when off, and when the tool or model is missing', async () => {
  assert.equal((await nativeReady(null)).ready, false);
  const status = (tool, model) => ({ native: { status: async () => ({ tools: { whisper: { installed: tool } }, models: [{ name: 'base', installed: model }] }) } });
  assert.equal((await nativeReady(status(true, true), { on: false, model: 'base' })).why, 'off');
  assert.equal((await nativeReady(status(false, true), { on: true, model: 'base' })).why, 'no-tool');
  assert.equal((await nativeReady(status(true, false), { on: true, model: 'base' })).why, 'no-model');
  assert.deepEqual(await nativeReady(status(true, true), { on: true, model: 'base' }), { ready: true, model: 'base' });
});

test('the argument allowlist refuses anything else', () => {
  assert.deepEqual(parseWhisperArgs(['--model', 'small', '--language', 'en', '--threads', '6']), { model: 'small', language: 'en', threads: 6 });
  for (const bad of [['--model', 'huge'], ['-f', '/etc/passwd'], ['--language', 'en; rm'], ['--threads', '99'], ['--model'], [['--model', 'base']], ['--output-file', 'x', 'y']]) assert.throws(() => parseWhisperArgs(bad));
  assert.throws(() => parseWhisperArgs('--model base'));
  const argv = whisperArgv({ model: 'base', language: 'en', threads: 4, dtw: 'base' }, { model: '/m', wav: '/w', outBase: '/o' });
  assert.deepEqual(argv.slice(0, 4), ['-m', '/m', '-f', '/w']);
  assert.ok(argv.includes('--dtw') && argv.includes('-nfa'));
  assert.equal(progressOf('whisper_print_progress_callback: progress =  45%'), 0.45);
  assert.equal(progressOf('nothing'), null);
});

test('the CSP allows the Deezer frame script by its hash, and the hash is current', async () => {
  const { DEEZER_FRAME_SCRIPT } = await import('../js/manager/isrc.js');
  const { CSP } = require('../electron/serve.cjs');
  const hash = `'sha256-${crypto.createHash('sha256').update(DEEZER_FRAME_SCRIPT).digest('base64')}'`;
  assert.ok(CSP.includes(hash), `CSP must list ${hash}`);
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(CSP));
});

test('the pinned models are the real ones (size and sha256 shape)', () => {
  for (const m of Object.values(MODELS)) {
    assert.match(m.sha256, /^[0-9a-f]{64}$/);
    assert.ok(m.url.startsWith('https://huggingface.co/ggerganov/whisper.cpp/'));
    assert.ok(m.bytes > 100e6);
  }
});

// ---- the main-process side, with a tiny fake model and a fake whisper script
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pvm-native-test-'));
const body = Buffer.from('pretend ggml model bytes '.repeat(40));
const tinyModels = { base: { file: 'ggml-base.bin', label: 'Test base', url: 'https://huggingface.co/x/ggml-base.bin', bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex'), dtw: 'base' } };
const okFetch = (buf) => async () => new Response(buf, { status: 200 });

test('downloadModel: needs consent, checks size and sha256, keeps only a good file', async () => {
  const dir = tmp();
  const n = createNative({ dir, models: tinyModels, fetchFn: okFetch(body) });
  await assert.rejects(() => n.downloadModel('base', {}), /agree/);
  await assert.rejects(() => n.downloadModel('base', { consent: 'yes' }), /agree/);
  await assert.rejects(() => n.downloadModel('nope', { consent: true }), /No such model/);
  const seen = [];
  const st = await n.downloadModel('base', { consent: true, onProgress: (p) => seen.push(p) });
  assert.equal(st.installed, true);
  assert.equal(seen.at(-1).loaded, body.length);
  assert.equal((await n.modelsBytes()), body.length);
  assert.equal((await n.status()).models[0].installed, true);

  const bad = tmp();
  const evil = Buffer.from('X'.repeat(body.length));
  const n2 = createNative({ dir: bad, models: tinyModels, fetchFn: okFetch(evil) });
  await assert.rejects(() => n2.downloadModel('base', { consent: true }), /checksum/);
  assert.deepEqual(fs.readdirSync(path.join(bad, 'models')), []); // nothing left behind
  const short = createNative({ dir: tmp(), models: tinyModels, fetchFn: okFetch(body.subarray(0, 50)) });
  await assert.rejects(() => short.downloadModel('base', { consent: true }), /cut short/);
  const big = createNative({ dir: tmp(), models: tinyModels, fetchFn: okFetch(Buffer.concat([body, body])) });
  await assert.rejects(() => big.downloadModel('base', { consent: true }), /bigger/);
  const http404 = createNative({ dir: tmp(), models: tinyModels, fetchFn: async () => new Response('no', { status: 404 }) });
  await assert.rejects(() => http404.downloadModel('base', { consent: true }), /404/);

  assert.equal(await n.removeModel('base'), true);
  assert.equal(await n.modelsBytes(), 0);
});

test('run: only the allowlisted tool, only when installed, with its model; fake binary round trip', async () => {
  const dir = tmp();
  const n = createNative({ dir, models: tinyModels, fetchFn: okFetch(body) });
  await assert.rejects(() => n.run('ffmpeg', [], { input: new Uint8Array(4) }), /No bundled tool/);
  await assert.rejects(() => n.run('whisper', [], { input: new Uint8Array(4) }), /not installed/);
  fs.mkdirSync(path.join(dir, 'bin'));
  const bin = path.join(dir, 'bin', 'whisper');
  // a fake whisper-cli: prints progress, writes <of>.json. Fails when --dtw is given and a flag file says so.
  fs.writeFileSync(bin, `#!/bin/sh
of=""; dtw=0
while [ $# -gt 0 ]; do case "$1" in -of) of="$2"; shift;; --dtw) dtw=1;; esac; shift; done
if [ "$dtw" = 1 ] && [ -f "${dir}/nodtw" ]; then echo "dtw not supported" >&2; exit 3; fi
echo "whisper_print_progress_callback: progress =  50%" >&2
echo "whisper_print_progress_callback: progress = 100%" >&2
printf '{"transcription":[{"offsets":{"from":0,"to":500},"text":" hi","tokens":[{"text":" hi","offsets":{"from":0,"to":500},"t_dtw":'"$([ $dtw = 1 ] && echo 10 || echo -1)"'}]}]}' > "$of.json"
`);
  fs.chmodSync(bin, 0o755);
  await assert.rejects(() => n.run('whisper', [], { input: new Uint8Array(4) }), /not downloaded/);
  await n.downloadModel('base', { consent: true });
  await assert.rejects(() => n.run('whisper', [], {}), /No audio/);
  await assert.rejects(() => n.run('whisper', ['-f', '/etc/passwd'], { input: new Uint8Array(4) }), /not allowed/);
  const prog = [];
  const r = await n.run('whisper', ['--model', 'base', '--language', 'en'], { input: new Uint8Array([1, 2, 3, 4]), onProgress: (p) => prog.push(p) });
  assert.deepEqual(wordsFromWhisperCpp(r.json), [{ w: 'hi', t: 0.1, end: 0.5 }]);
  assert.deepEqual(prog, [0.5, 1]);
  // this whisper.cpp cannot do DTW: it runs again without, with the rougher times
  fs.writeFileSync(path.join(dir, 'nodtw'), '');
  const r2 = await n.run('whisper', ['--model', 'base'], { input: new Uint8Array([1, 2, 3, 4]) });
  assert.deepEqual(wordsFromWhisperCpp(r2.json), [{ w: 'hi', t: 0, end: 0.5 }]);
  // the temp folder is gone
  assert.equal(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('pvm-whisper-') && fs.existsSync(path.join(os.tmpdir(), f, 'in.wav'))).length, 0);
  // a tool that is not executable does not count as installed
  fs.chmodSync(bin, 0o644);
  assert.equal((await n.status()).tools.whisper.installed, false);
});
