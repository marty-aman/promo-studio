// The Mac self-check (selfcheck.html, App menu > Mac self-check…): one run answers what can only be learned on
// the Mac itself: which encoders WebCodecs has (and whether they run on the hardware encoder), WebGPU, cross-origin
// isolation (multithreaded AI), the AI device, how long a 10 second 1080x1920 encode takes, and (a separate button)
// how long lyric sync and caption timing take on a test clip, per setting. "Copy the
// results" puts it all on the clipboard as JSON to paste back. Works in a browser too (no desktop info there).
import { pickDevice, modelInfo, setRuntimeOverride, threadCount } from './ai/runtime.js';
import { nativeStatus } from './ai/nativewhisper.js';
import { timeSpeech } from './ai/aitiming.js';

const W = 1080;
const H = 1920;
const FPS = 30;
const SECONDS = 10;

const VIDEO = [
  ['H.264 High (avc1.640028)', 'avc1.640028'],
  ['H.264 Main (avc1.4d0028)', 'avc1.4d0028'],
  ['HEVC Main, what the export tries first (hvc1.1.6.L120.B0)', 'hvc1.1.6.L120.B0'],
  ['HEVC Main, second try (hev1.1.6.L120.B0)', 'hev1.1.6.L120.B0'],
  ['VP9 (vp09.00.40.08)', 'vp09.00.40.08'],
  ['AV1 (av01.0.08M.08)', 'av01.0.08M.08'],
];
const AUDIO = [
  ['AAC (mp4a.40.2)', 'mp4a.40.2'],
  ['Opus', 'opus'],
];

const rows = [];
const results = {};
const tbody = document.querySelector('#out tbody');
const status = document.getElementById('status');

function row(label, value, good = null) {
  rows.push([label, value]);
  const tr = document.createElement('tr');
  const a = document.createElement('td');
  a.textContent = label;
  const b = document.createElement('td');
  b.textContent = value;
  if (good !== null) b.className = good ? 'yes' : 'no';
  tr.append(a, b);
  tbody.append(tr);
  document.getElementById('out').hidden = false;
}

async function videoSupport(codec, hardwareAcceleration) {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const cfg = { codec, width: W, height: H, bitrate: 10_000_000, framerate: FPS, hardwareAcceleration };
    if (codec.startsWith('avc1')) cfg.avc = { format: 'avc' };
    if (/^(hvc1|hev1)/.test(codec)) cfg.hevc = { format: 'hevc' };
    return !!(await VideoEncoder.isConfigSupported(cfg)).supported;
  } catch {
    return false;
  }
}

async function audioSupport(codec) {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    return !!(await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported;
  } catch {
    return false;
  }
}

/** Draw and encode SECONDS of 1080x1920 frames to an MP4 in memory, the way the fast export does. */
async function encodeTest(hardwareAcceleration) {
  const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer/mp4-muxer.mjs');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let failed = null;
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e) });
  enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 10_000_000, framerate: FPS, hardwareAcceleration, avc: { format: 'avc' } });
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d');
  const t0 = performance.now();
  for (let i = 0; i < SECONDS * FPS && !failed; i++) {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `hsl(${(i * 3) % 360},70%,40%)`);
    grad.addColorStop(1, `hsl(${(i * 3 + 140) % 360},70%,20%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.font = 'bold 160px sans-serif';
    g.fillText(`${(i / FPS).toFixed(2)}`, 120, 960);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS) });
    enc.encode(frame, { keyFrame: i % 60 === 0 });
    frame.close();
    while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
  muxer.finalize();
  const seconds = (performance.now() - t0) / 1000;
  return { seconds: +seconds.toFixed(2), speed: +(SECONDS / seconds).toFixed(2), mb: +(target.buffer.byteLength / 1048576).toFixed(1) };
}

async function run() {
  const btn = document.getElementById('run');
  btn.disabled = true;
  rows.length = 0;
  tbody.replaceChildren();
  status.textContent = 'Checking…';
  try {
    const info = window.desktop ? await window.desktop.info() : null;
    results.app = info;
    row('App', info ? `Promo Studio ${info.version} · Electron ${info.electron} · Chrome ${info.chrome} · ${info.platform} ${info.arch}` : 'Not the Mac app (a browser)');
    if (info && info.disk && info.disk.free != null) row('Free disk', `${(info.disk.free / 1e9).toFixed(1)} GB of ${(info.disk.total / 1e9).toFixed(0)} GB`);
    results.ua = navigator.userAgent;
    results.cores = navigator.hardwareConcurrency || null;
    row('Processor cores', String(results.cores || 'unknown'));
    results.crossOriginIsolated = !!globalThis.crossOriginIsolated;
    row('Cross-origin isolated (multithreaded AI)', results.crossOriginIsolated ? 'Yes' : 'No', results.crossOriginIsolated);

    results.video = {};
    for (const [label, codec] of VIDEO) {
      const hw = await videoSupport(codec, 'prefer-hardware');
      const any = hw || (await videoSupport(codec, 'no-preference'));
      results.video[codec] = { hardware: hw, any };
      row(`Video encoder: ${label}`, hw ? 'Hardware' : any ? 'Software only' : 'Not available', hw || (any ? null : false));
    }
    // step 2: which codec the export would use, and whether it can write straight to disk
    const hevcOk = ['hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0'].some((c) => results.video[c] && results.video[c].any);
    results.exportStream = { bridge: !!(info && info.capabilities && info.capabilities.includes('files.saveStream')), hevc: hevcOk };
    row('Export straight to a file on disk', results.exportStream.bridge ? 'Yes' : info ? 'No (this build lacks it)' : 'Mac app only', info ? results.exportStream.bridge : null);
    row('Export codec offered', hevcOk ? 'H.264 or HEVC (H.265)' : 'H.264 only (HEVC is not available here)');
    results.audio = {};
    for (const [label, codec] of AUDIO) {
      const ok = await audioSupport(codec);
      results.audio[codec] = ok;
      row(`Sound encoder: ${label}`, ok ? 'Yes' : 'No', ok);
    }

    results.webgpu = null;
    try {
      const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
      const ai = adapter && (adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null));
      results.webgpu = adapter ? { vendor: ai && ai.vendor, architecture: ai && ai.architecture, description: ai && ai.description } : false;
    } catch (e) {
      results.webgpu = { error: String(e && e.message) };
    }
    row('WebGPU', results.webgpu ? `Yes${results.webgpu.vendor ? ` (${[results.webgpu.vendor, results.webgpu.architecture].filter(Boolean).join(' ')})` : ''}` : 'No', !!results.webgpu && !results.webgpu.error);
    results.aiDevice = await pickDevice();
    row('AI runs on', results.aiDevice === 'webgpu' ? 'The graphics chip (WebGPU)' : 'The processor (WASM)');

    status.textContent = `Encoding ${SECONDS} seconds of 1080 × 1920 video…`;
    const mode = results.video['avc1.640028'] && results.video['avc1.640028'].hardware ? 'prefer-hardware' : 'no-preference';
    if (results.video['avc1.640028'] && results.video['avc1.640028'].any) {
      try {
        results.encode = { mode, ...(await encodeTest(mode)) };
        row(`${SECONDS} s export test (H.264, ${mode === 'prefer-hardware' ? 'hardware' : 'any encoder'})`, `${results.encode.seconds} s (${results.encode.speed}× real time, ${results.encode.mb} MB)`, results.encode.speed >= 1);
      } catch (e) {
        results.encode = { mode, error: String((e && e.message) || e) };
        row(`${SECONDS} s export test`, `Failed: ${results.encode.error}`, false);
      }
    } else row(`${SECONDS} s export test`, 'Skipped: no H.264 encoder', false);
    results.at = new Date().toISOString();
    status.textContent = 'Done. Copy the results and paste them into the chat.';
    document.getElementById('copy').disabled = false;
  } catch (e) {
    status.textContent = `The check stopped: ${(e && e.message) || e}`;
  }
  btn.disabled = false;
  window.__selfcheck = results;
}

// ---------------------------------------------------------------- speech model timing (lyric sync, caption timing)
// The WASM thread count is read once, when the first model loads in a page, so each browser setting is timed in a
// fresh page: choosing another one puts it in the address (#ai=wasm:1) and reloads. Results are kept in sessionStorage.
const AI_KEY = 'pvm.selfcheck.speech';
const aiSel = document.getElementById('ai-config');
const aiStatus = document.getElementById('ai-status');
const aiBody = document.querySelector('#ai-out tbody');
const hashCfg = (location.hash.match(/ai=([\w.:]+)/) || [])[1] || 'auto';
let loadedHere = false; // a browser model was loaded in this page (so its thread count is fixed)

function parseCfg(c) {
  if (c === 'whisper.cpp') return { engine: 'whisper.cpp' };
  if (c === 'webgpu') return { engine: 'browser', device: 'webgpu' };
  if (c.startsWith('wasm:')) return { engine: 'browser', device: 'wasm', threads: Number(c.slice(5)) || 1 };
  return { engine: 'browser' };
}
{
  const c = parseCfg(hashCfg);
  if (c.engine === 'browser') setRuntimeOverride({ device: c.device || null, threads: c.threads || null });
}

async function fillAiOptions() {
  const opts = [['auto', `As the app runs it (${threadCount() > 1 ? `${threadCount()} threads` : '1 thread'}, graphics chip if there is one)`], ['wasm:1', 'Processor, 1 thread (what a browser tab does)']];
  if (threadCount() > 1) opts.push([`wasm:${threadCount()}`, `Processor, ${threadCount()} threads`]);
  if ((await pickDevice().catch(() => 'wasm')) === 'webgpu' || (navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null)))) opts.push(['webgpu', 'Graphics chip (WebGPU)']);
  const st = await nativeStatus();
  if (st) {
    const ok = st.tools.whisper && st.tools.whisper.installed && st.models.some((m) => m.installed);
    opts.push(['whisper.cpp', ok ? 'whisper.cpp (installed in the Mac app)' : 'whisper.cpp (not set up: see Storage > Faster speech)', !ok]);
  }
  aiSel.replaceChildren(...opts.map(([v, label, off]) => Object.assign(document.createElement('option'), { value: v, textContent: label, disabled: !!off, selected: v === hashCfg })));
}

const aiResults = () => {
  try {
    return JSON.parse(sessionStorage.getItem(AI_KEY) || '[]');
  } catch {
    return [];
  }
};
function paintAi() {
  const list = aiResults();
  results.speech = list;
  aiBody.replaceChildren(
    ...list.map((r) => {
      const tr = document.createElement('tr');
      const cell = (t) => tr.append(Object.assign(document.createElement('td'), { textContent: t }));
      cell(`${r.engine === 'whisper.cpp' ? 'whisper.cpp' : `Browser model, ${r.device === 'webgpu' ? 'graphics chip' : `processor, ${r.threads} thread${r.threads === 1 ? '' : 's'}`}`}`);
      if (r.error) {
        const td = Object.assign(document.createElement('td'), { textContent: `Failed: ${r.error}`, colSpan: 4 });
        tr.append(td);
      } else {
        cell(r.engine === 'whisper.cpp' ? 'in each run' : `${r.loadSeconds} s${r.downloaded ? ' (with download)' : ''}`);
        cell(`${r.lyricSync.seconds} s / ${r.lyricSync.secondsWarm} s`);
        cell(`${r.captions.seconds} s`);
        cell(`${r.realtimeFactor}× real time`);
      }
      return tr;
    }),
  );
  document.getElementById('ai-out').hidden = !list.length;
}

async function timeIt(cfg = aiSel.value) {
  const c = parseCfg(cfg);
  if (c.engine === 'browser' && loadedHere && cfg !== hashCfg) {
    // another browser setting needs a fresh page; ask about the download first, once
    if (!(await modelInfo()).cached && !confirm('The speech model is not on this Mac yet. Download it once (about 77 MB from huggingface.co)? Nothing from your files is sent.')) return;
    sessionStorage.setItem('pvm.selfcheck.autorun', '1');
    location.hash = `ai=${cfg}`;
    location.reload();
    return;
  }
  if (c.engine === 'browser' && !(await modelInfo()).cached && !confirm('The speech model is not on this Mac yet. Download it once (about 77 MB from huggingface.co)? Nothing from your files is sent.')) return;
  const btn = document.getElementById('ai-run');
  btn.disabled = true;
  try {
    if (c.engine === 'browser') loadedHere = true;
    const r = await timeSpeech({ ...c, onStatus: (t) => (aiStatus.textContent = t) });
    sessionStorage.setItem(AI_KEY, JSON.stringify([...aiResults(), r]));
    aiStatus.textContent = r.error ? `Stopped: ${r.error}` : 'Done. Pick another setting to compare, or copy the results.';
    paintAi();
    document.getElementById('copy').disabled = false;
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('ai-run').addEventListener('click', () => timeIt());
window.__selfcheckTime = timeIt;
fillAiOptions().then(() => {
  paintAi();
  if (aiResults().length) document.getElementById('copy').disabled = false;
  if (sessionStorage.getItem('pvm.selfcheck.autorun') === '1') {
    sessionStorage.removeItem('pvm.selfcheck.autorun');
    timeIt(hashCfg);
  }
});

document.getElementById('run').addEventListener('click', run);
document.getElementById('copy').addEventListener('click', async () => {
  const text = JSON.stringify(results, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied.';
  } catch {
    status.textContent = 'Could not copy. Select the table and copy it instead.';
  }
});
window.__selfcheckRun = run;
