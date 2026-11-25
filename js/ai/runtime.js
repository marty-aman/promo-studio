// The shared on-device AI runtime: Transformers.js + ONNX Runtime Web, vendored under vendor/transformers/.
// Every AI feature that runs a model in the browser goes through here (lyric auto-sync today; footage
// captions and clip search later), so there is one place that
//  - loads the vendored library (no CDN at run time: wasmPaths points at our own folder),
//  - picks WebGPU when the browser has it, else WASM (multithreaded when the page is cross-origin isolated, as in
//    the Mac app; one thread in a normal browser tab),
//  - in the Mac app, runs whisper.cpp instead when the person turned it on and it is in place (js/ai/nativewhisper.js),
//    falling back to the browser model if that fails and the browser model is already downloaded,
//  - downloads model weights from huggingface.co only after the person agreed (consent is checked here, not
//    just in the UI), and says so in `modelInfo()`,
//  - reports a download that does not fit in the browser's storage to the app's storage-full message,
//  - can be replaced by a fake for tests (setPipelineForTesting), like bgremove.js's segmenter.
// No song data is ever sent: the only network calls are the model files' GET requests to huggingface.co.
import { reportSaveFail } from '../state.js';
import { nativeReady, makeNativePipe } from './nativewhisper.js';

export const VENDOR_BASE = new URL('../../vendor/transformers/', import.meta.url).href;
export const ASR_TASK = 'automatic-speech-recognition';

/** Models the app knows about. `approxMB` is what the download prompt names (encoder + decoder, quantised). */
export const MODELS = {
  'whisper-base': {
    id: 'onnx-community/whisper-base_timestamped',
    task: ASR_TASK,
    label: 'Whisper base (speech and singing, with word times)',
    approxMB: 77,
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    // the files the download is made of, for the cache check and the size line
    files: ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
  },
  // Find a moment (js/ai/searchindex.js). TinyCLIP (Microsoft, MIT): one ONNX file holds the image and text towers,
  // 23.2 MB at q8 against 146.5 MB for CLIP ViT-B/32. Less accurate than B/32 (see docs/ai-search.md).
  tinyclip: {
    id: 'onnx-community/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M-ONNX',
    task: 'zero-shot-image-classification',
    label: 'TinyCLIP (pictures and words)',
    approxMB: 23,
    dtype: 'q8',
    files: ['onnx/model_quantized.onnx'],
  },
};
export const DEFAULT_ASR = 'whisper-base';

const CACHE_NAME = 'transformers-cache'; // the library's own Cache Storage bucket
const fakes = new Map(); // task -> fake pipeline (tests)
const loaded = new Map(); // `${task}|${model}` -> Promise<pipeline>
let libPromise = null;

/** Tests: use `fake` (an async function (input, options) => result) instead of any model for `task`. null removes it. */
export function setPipelineForTesting(task, fake) {
  if (fake) fakes.set(task, fake);
  else fakes.delete(task);
  loaded.clear();
}

/** How many WASM threads: 1 unless the page is cross-origin isolated (SharedArrayBuffer), then the cores, up to MAX_THREADS. */
export const MAX_THREADS = 4;
export function threadCount({ isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated, cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 1 } = {}) {
  return isolated ? Math.max(1, Math.min(MAX_THREADS, cores)) : 1;
}

// For the Mac self-check's timing runs only: force the device ('wasm' | 'webgpu') and the thread count. The threads
// are read once, when the first model loads in a page, so changing them takes a reload (the self-check does that).
const override = { device: null, threads: null };
export function setRuntimeOverride({ device = null, threads = null } = {}) {
  override.device = device === 'wasm' || device === 'webgpu' ? device : null;
  override.threads = Number.isInteger(threads) && threads > 0 ? threads : null;
  loaded.clear();
}
/** The threads the WASM backend uses in this page (the override, else threadCount()). */
export const wasmThreads = () => override.threads || threadCount();

/** WebGPU when the browser really has an adapter; Firefox on Linux has none, so it runs on WASM. */
export async function pickDevice() {
  if (override.device) return override.device;
  try {
    if (typeof navigator !== 'undefined' && navigator.gpu && (await navigator.gpu.requestAdapter())) return 'webgpu';
  } catch {
    /* no adapter */
  }
  return 'wasm';
}

async function lib() {
  if (!libPromise) {
    libPromise = import(`${VENDOR_BASE}transformers.web.min.js`).then((m) => {
      const env = m.env;
      env.allowLocalModels = false; // models come from huggingface.co (once), then from the browser cache
      env.useBrowserCache = true;
      const wasm = env.backends.onnx.wasm;
      wasm.wasmPaths = { mjs: `${VENDOR_BASE}ort-wasm-simd-threaded.asyncify.mjs`, wasm: `${VENDOR_BASE}ort-wasm-simd-threaded.asyncify.wasm` };
      // one thread unless the page is cross-origin isolated (SharedArrayBuffer): the Mac app is, a plain tab is not
      wasm.numThreads = wasmThreads();
      return m;
    });
    libPromise.catch(() => (libPromise = null));
  }
  return libPromise;
}

/** The loaded Transformers.js module, for features that call a model's parts directly (RawImage, Tensor). */
export const runtimeLibrary = () => lib();

const spec = (model) => MODELS[model] || { id: model, task: ASR_TASK, label: model, approxMB: 0, dtype: undefined, files: [] };

async function cachedFiles(s) {
  if (typeof caches === 'undefined' || !s.files.length) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = (await cache.keys()).map((r) => r.url);
    return s.files.every((f) => keys.some((u) => u.includes(s.id) && u.includes(f)));
  } catch {
    return false;
  }
}

/**
 * What the download prompt needs: { id, label, sizeMB, cached, device, fake, threads, native }.
 * `cached` = the weights are already in this browser (no download, no prompt). In the Mac app with whisper.cpp
 * turned on and in place, `native` is the ggml model name, `cached` is true and `device` is 'whisper.cpp'.
 */
export async function modelInfo(model = DEFAULT_ASR) {
  const s = spec(model);
  const fake = fakes.has(s.task);
  if (!fake && s.task === ASR_TASK && model === DEFAULT_ASR) {
    const n = await nativeReady();
    if (n.ready) return { id: `whisper.cpp ggml-${n.model}`, label: 'Whisper (whisper.cpp on this Mac)', sizeMB: 0, cached: true, device: 'whisper.cpp', fake: false, threads: null, native: n.model };
  }
  return { id: s.id, label: s.label, sizeMB: s.approxMB, cached: fake || (await cachedFiles(s)), device: fake ? 'test' : await pickDevice(), fake, threads: wasmThreads(), native: null };
}

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || /quota|storage|disk|space/i.test(String(e.message || e)));

/**
 * The model's pipeline, ready to call. `consented: true` is required unless the weights are already cached
 * (the caller asks first with the size from modelInfo()). onProgress(fraction 0..1, text) while downloading.
 * Rejects with .code 'consent' | 'quota' | 'load'.
 */
export async function loadBrowserPipeline(task, model = DEFAULT_ASR, { onProgress, consented = false } = {}) {
  if (fakes.has(task)) return fakes.get(task);
  const s = spec(model);
  const key = `${task}|${s.id}|${override.device || ''}|${override.threads || ''}`;
  if (loaded.has(key)) return loaded.get(key);
  if (!consented && !(await cachedFiles(s))) {
    const e = new Error(`“${s.label}” needs a one-time download of about ${s.approxMB} MB. Ask first.`);
    e.code = 'consent';
    throw e;
  }
  const p = (async () => {
    const m = await lib();
    const files = new Map(); // file -> { loaded, total }
    const progress_callback = (ev) => {
      if (!onProgress || !ev) return;
      if (ev.status === 'progress' && ev.total) {
        files.set(ev.file, { loaded: ev.loaded, total: ev.total });
        let l = 0;
        let t = 0;
        for (const f of files.values()) (l += f.loaded), (t += f.total);
        onProgress(t ? l / t : 0, `Downloading the model… ${Math.round(l / 1048576)} of ${Math.round(t / 1048576)} MB`);
      } else if (ev.status === 'ready') onProgress(1, 'Model ready');
    };
    const make = (device) => m.pipeline(task, s.id, { device, dtype: s.dtype, progress_callback });
    const device = await pickDevice();
    try {
      return await make(device);
    } catch (e) {
      if (device === 'webgpu' && !isQuota(e)) return make('wasm'); // the GPU could not run it: plain WASM
      throw e;
    }
  })().catch((e) => {
    loaded.delete(key);
    if (e && e.code) throw e;
    const quota = isQuota(e);
    if (quota) reportSaveFail(s.task === ASR_TASK ? 'the speech model' : `the model “${s.label}”`); // the app's storage-full message
    const err = new Error(quota ? 'This browser has no room to keep the model. Free some space (the storage message says how) and try again.' : `The model could not be loaded: ${(e && e.message) || e}`);
    err.code = quota ? 'quota' : 'load';
    err.cause = e;
    throw err;
  });
  loaded.set(key, p);
  return p;
}

/**
 * The speech pipe for `task`. In the Mac app with whisper.cpp on and in place it is whisper.cpp (see nativewhisper.js);
 * if that run fails it uses the browser model for the rest of the session when that model is already downloaded,
 * else the error says what to do. Everywhere else, and for every other model, it is loadBrowserPipeline.
 * Same arguments and result as before: `await pipe(audio, options)`.
 */
export async function loadPipeline(task, model = DEFAULT_ASR, opts = {}) {
  if (!fakes.has(task) && task === ASR_TASK && model === DEFAULT_ASR) {
    const n = await nativeReady();
    if (n.ready) {
      const native = makeNativePipe({ model: n.model });
      let failed = null;
      return async (audio, options) => {
        if (!failed) {
          try {
            return await native(audio, options);
          } catch (e) {
            failed = e;
          }
        }
        // whisper.cpp could not run: the browser model, if it is already here (no download without asking)
        const s = spec(model);
        if (await cachedFiles(s)) return (await loadBrowserPipeline(task, model, { ...opts, consented: true }))(audio, options);
        throw new Error(`whisper.cpp stopped: ${(failed && failed.message) || failed}. Turn it off under Storage > Faster speech to use the browser model (a one-time ${s.approxMB} MB download).`);
      };
    }
  }
  return loadBrowserPipeline(task, model, opts);
}

/** Forget the loaded pipelines and delete every downloaded model file from this browser. Returns true when something was deleted. */
export async function clearModelCache() {
  loaded.clear();
  try {
    return typeof caches !== 'undefined' && (await caches.delete(CACHE_NAME));
  } catch {
    return false;
  }
}
