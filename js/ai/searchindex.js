// Find a moment: the browser part. Samples a video's frames, runs them through the CLIP model of the shared
// runtime (js/ai/runtime.js: the same consent, download and test stub as Auto-sync lyrics), and keeps the vectors
// per media id in IndexedDB so a video is looked at once. The key includes a fingerprint of the file, so a
// different file under the same id (Replace missing files with another file) is looked at again. Entries of
// files that are missing are kept (a re-link with the same file needs no new pass) but never searched.
import { reportSaveFail } from '../state.js';
import { loadPipeline, modelInfo, runtimeLibrary } from './runtime.js';
import { sampleTimes, fingerprint, cacheKey, isFresh, normalize, toGray, sharpness, rankMoments, extraScoreFor, promptFor, evictIds, HEAD_BYTES } from './clipsearch.js';

export const SEARCH_TASK = 'zero-shot-image-classification';
export const SEARCH_MODEL = 'tinyclip';
const KEEP = 60; // videos kept in the cache (newest first)
const BATCH = 8;
const CLIP_SIDE = 224; // the model's input; frames are drawn with this short side
const SHARP_W = 96;
const THUMB_W = 160;

// ---------------------------------------------------------------- IndexedDB
const DB_NAME = 'pvm-ai-search';
let dbP = null;
function db() {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('frames', { keyPath: 'id' });
        req.result.createObjectStore('meta', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbP.catch(() => (dbP = null));
  }
  return dbP;
}
function tx(stores, mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(stores, mode);
        const r = fn(...stores.map((s) => t.objectStore(s)));
        t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('The browser could not store the search index'));
      }),
  );
}
const dbGet = (id) => tx(['frames'], 'readonly', (s) => s.get(id)).catch(() => null);
async function dbPut(entry) {
  await tx(['frames', 'meta'], 'readwrite', (f, m) => {
    f.put(entry);
    m.put({ id: entry.id, at: entry.at });
  });
  const metas = await tx(['meta'], 'readonly', (m) => m.getAll()).catch(() => []);
  const drop = evictIds(metas, KEEP);
  if (drop.length) await tx(['frames', 'meta'], 'readwrite', (f, m) => drop.forEach((id) => (f.delete(id), m.delete(id)))).catch(() => {});
}
/** Delete every stored search vector (the model files stay; runtime.clearModelCache removes those). */
export async function clearSearchIndex() {
  mem.clear();
  await tx(['frames', 'meta'], 'readwrite', (f, m) => (f.clear(), m.clear())).catch(() => {});
}

// ---------------------------------------------------------------- the model
/**
 * { images(ImageData[]) -> Float32Array[], texts(string[]) -> Float32Array[] }, unit-length vectors.
 * A test stub (setPipelineForTesting(SEARCH_TASK, fake)) provides fake.embedImages / fake.embedTexts.
 */
async function embedderFor(pipe) {
  if (pipe.embedImages && pipe.embedTexts) {
    return { images: async (frames) => (await pipe.embedImages(frames)).map(normalize), texts: async (t) => (await pipe.embedTexts(t)).map(normalize) };
  }
  const { RawImage } = await runtimeLibrary();
  // TinyCLIP's ONNX file is the whole CLIPModel: it wants text and pixels together, so each call gets a
  // stand-in for the other half (a blank picture, a two-word caption), as the zero-shot pipeline does.
  const tok = (texts) => pipe.tokenizer(texts, { padding: true, truncation: true });
  const pixels = async (imgs) => (await pipe.processor(imgs)).pixel_values;
  let blank = null;
  let filler = null;
  const rows = (t, what) => {
    if (!t || !t.dims) throw new Error(`The model gave no ${what}.`);
    const [n, d] = t.dims;
    return Array.from({ length: n }, (_, i) => normalize(t.data.subarray(i * d, (i + 1) * d)));
  };
  return {
    async images(frames) {
      filler = filler || tok(['a photo']);
      const out = await pipe.model({ ...filler, pixel_values: await pixels(frames.map((f) => new RawImage(f.data, f.width, f.height, 4))) });
      return rows(out.image_embeds, 'picture vectors');
    },
    async texts(texts) {
      blank = blank || (await pixels([new RawImage(new Uint8ClampedArray(CLIP_SIDE * CLIP_SIDE * 4), CLIP_SIDE, CLIP_SIDE, 4)]));
      const out = await pipe.model({ ...tok(texts), pixel_values: blank });
      return rows(out.text_embeds, 'text vectors');
    },
  };
}
let embedP = null;
async function embedder({ consented, onProgress }) {
  if (!embedP) {
    embedP = loadPipeline(SEARCH_TASK, SEARCH_MODEL, { consented, onProgress }).then(embedderFor);
    embedP.catch(() => (embedP = null));
  }
  return embedP;
}
/** For the consent prompt: { sizeMB, cached, label, device }. */
export const searchModelInfo = () => modelInfo(SEARCH_MODEL);
/** Tests: forget the loaded model (after setPipelineForTesting). */
export function resetSearchModel() {
  embedP = null;
  mem.clear();
}

// ---------------------------------------------------------------- sampling
const once = (el, ev, ms) =>
  new Promise((resolve) => {
    const done = (v) => {
      clearTimeout(t);
      el.removeEventListener(ev, ok);
      el.removeEventListener('error', bad);
      resolve(v);
    };
    const ok = () => done(true);
    const bad = () => done(false);
    const t = setTimeout(() => done(false), ms);
    el.addEventListener(ev, ok);
    el.addEventListener('error', bad);
  });
const aborted = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

/** The fingerprint of a library record's file (size + hash of both ends). */
export async function fileFingerprint(blob) {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  const tail = blob.size > HEAD_BYTES ? new Uint8Array(await blob.slice(Math.max(HEAD_BYTES, blob.size - HEAD_BYTES)).arrayBuffer()) : new Uint8Array(0);
  return fingerprint(blob.size, head, tail);
}

async function indexVideo(rec, key, emb, { signal, onFrame }) {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  v.src = rec.url;
  try {
    if (v.readyState < 1 && !(await once(v, 'loadedmetadata', 8000))) throw new Error(`“${rec.name}” could not be opened.`);
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : rec.duration;
    if (!dur || !v.videoWidth) throw new Error(`“${rec.name}” has no picture.`);
    const k = CLIP_SIDE / Math.min(v.videoWidth, v.videoHeight);
    const big = Object.assign(document.createElement('canvas'), { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
    const bg = big.getContext('2d', { willReadFrequently: true });
    const small = Object.assign(document.createElement('canvas'), { width: SHARP_W, height: Math.max(8, Math.round((SHARP_W * big.height) / big.width)) });
    const sg = small.getContext('2d', { willReadFrequently: true });
    const thumb = Object.assign(document.createElement('canvas'), { width: THUMB_W, height: Math.max(8, Math.round((THUMB_W * big.height) / big.width)) });
    const tg = thumb.getContext('2d');
    const times = sampleTimes(dur);
    const entry = { id: rec.id, key, name: rec.name, duration: dur, times: [], dim: 0, vecs: null, thumbs: [], sharp: [], luma: [], at: Date.now() };
    const vecs = [];
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const out = await emb.images(batch.map((b) => b.img));
      out.forEach((vec, i) => {
        const b = batch[i];
        vecs.push(vec);
        entry.times.push(b.t);
        entry.thumbs.push(b.thumb);
        entry.sharp.push(b.sharp);
        entry.luma.push(b.luma);
      });
      batch = [];
    };
    for (let i = 0; i < times.length; i++) {
      if (signal && signal.aborted) throw aborted();
      const t = times[i];
      v.currentTime = Math.min(t, Math.max(0, dur - 0.01));
      if (!(await once(v, 'seeked', 4000))) continue;
      // 'seeked' can come before the new picture is ready to draw
      await new Promise((r) => {
        const to = setTimeout(r, 250);
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => (clearTimeout(to), r()));
        else setTimeout(() => (clearTimeout(to), r()), 60);
      });
      bg.drawImage(v, 0, 0, big.width, big.height);
      sg.drawImage(big, 0, 0, small.width, small.height);
      tg.drawImage(big, 0, 0, thumb.width, thumb.height);
      const g = toGray(sg.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
      batch.push({ t, img: bg.getImageData(0, 0, big.width, big.height), thumb: thumb.toDataURL('image/jpeg', 0.7), sharp: +sharpness(g.gray, small.width, small.height).toFixed(2), luma: +g.mean.toFixed(1) });
      if (batch.length >= BATCH) await flush();
      onFrame((i + 1) / times.length);
    }
    await flush();
    if (signal && signal.aborted) throw aborted();
    if (!vecs.length) throw new Error(`No frames of “${rec.name}” could be read.`);
    entry.dim = vecs[0].length;
    entry.vecs = new Float32Array(vecs.length * entry.dim);
    vecs.forEach((x, i) => entry.vecs.set(x, i * entry.dim));
    return entry;
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

// ---------------------------------------------------------------- the index
const mem = new Map(); // media id -> entry (this visit)

/** The entry for a record when it is already looked at (memory, then IndexedDB), else null. */
export async function cachedEntry(rec) {
  if (!rec || !rec.blob) return null;
  const key = cacheKey(rec.id, await fileFingerprint(rec.blob), SEARCH_MODEL);
  const m = mem.get(rec.id);
  if (isFresh(m, key)) return m;
  const e = await dbGet(rec.id);
  if (isFresh(e, key)) {
    mem.set(rec.id, e);
    return e;
  }
  return null;
}

/**
 * Make sure every record (library videos with their file) is looked at. onProgress(fraction, text).
 * Returns { entries: [entry], failed: [{ name, msg }] }. Rejects with AbortError on cancel, or the runtime's
 * 'consent' / 'quota' / 'load' errors.
 */
export async function ensureIndex(recs, { consented = false, signal = null, onProgress = () => {} } = {}) {
  const entries = [];
  const failed = [];
  const todo = [];
  for (const rec of recs) {
    const e = await cachedEntry(rec);
    if (e) entries.push(e);
    else if (rec.blob) todo.push(rec);
  }
  if (!todo.length) return { entries, failed };
  const emb = await embedder({ consented, onProgress: (f, t) => onProgress(f * 0.2, t) });
  for (let n = 0; n < todo.length; n++) {
    if (signal && signal.aborted) throw aborted();
    const rec = todo[n];
    const key = cacheKey(rec.id, await fileFingerprint(rec.blob), SEARCH_MODEL);
    const label = `Looking at “${rec.name}” (${n + 1} of ${todo.length})…`;
    onProgress(0.2 + (0.8 * n) / todo.length, label);
    try {
      const e = await indexVideo(rec, key, emb, { signal, onFrame: (f) => onProgress(0.2 + (0.8 * (n + f)) / todo.length, label) });
      mem.set(rec.id, e);
      entries.push(e);
      await dbPut(e).catch(() => reportSaveFail('the footage search index (it works until you reload)'));
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      failed.push({ name: rec.name, msg: (err && err.message) || String(err) });
    }
  }
  return { entries, failed };
}

/** The unit-length text vector for a description (the model must be loaded or cached). */
export async function textVector(text, { consented = false } = {}) {
  const p = promptFor(text);
  if (!p) return null;
  const emb = await embedder({ consented });
  return (await emb.texts([p]))[0];
}

// ---------------------------------------------------------------- the current search (shared with Suggested)
export const searchState = { query: '', vec: null, results: [], entries: [], at: 0 };

/** Search the entries for a description. Sets searchState and returns the ranked moments. */
export async function runSearch(text, entries, { top = 12 } = {}) {
  const vec = await textVector(text, { consented: true });
  const results = vec ? rankMoments(entries, vec, { top }) : [];
  Object.assign(searchState, { query: String(text || '').trim(), vec, results, entries, at: Date.now() });
  return results;
}

/** Forget the current search (the Suggested cut stops favouring it). */
export function clearSearch() {
  Object.assign(searchState, { query: '', vec: null, results: [], entries: [], at: 0 });
}

/**
 * The extraScore hook for the Suggested cut (applyTake ctx, suggest.js in PR #47): favours stretches that match
 * the last search. null when there is no search, so the cut is unchanged.
 */
export function activeExtraScore() {
  if (!searchState.vec || !searchState.entries.length) return null;
  return extraScoreFor(new Map(searchState.entries.map((e) => [e.id, e])), searchState.vec);
}
