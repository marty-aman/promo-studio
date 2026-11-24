// Find a moment: the browser part. Samples a video's frames, runs them through the CLIP model of the shared
// runtime (js/ai/runtime.js: the same consent, download and test stub as Auto-sync lyrics), and keeps the vectors
// per media id in IndexedDB so a video is looked at once. The key includes a fingerprint of the file, so a
// different file under the same id (Replace missing files with another file) is looked at again. Entries of
// files that are missing are kept (a re-link with the same file needs no new pass) but never searched.
import { reportSaveFail } from '../state.js';
import { blobOf, ensureLoaded } from '../media.js';
import { loadPipeline, modelInfo, runtimeLibrary } from './runtime.js';
import { sampleTimes, fingerprint, cacheKey, isFresh, normalize, toGray, sharpness, rankMoments, extraScoreFor, promptFor, evictIds, HEAD_BYTES, photoCacheKey, isFreshPhoto, batches, photosToIndex, cosine, PHOTO_BATCH, hasFile } from './clipsearch.js';

/** The record's file, read from storage when it is not open (nothing is kept open for it). */
const fileOf = async (rec) => rec.blob || (await blobOf(rec.id));

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
      // v2 adds `photos` (one vector per photo, Manager → Photos smart search)
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        for (const s of ['frames', 'meta', 'photos']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onblocked = () => reject(new Error('Close the app’s other tabs once so the search index can be updated.'));
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => (d.close(), (dbP = null)); // a newer tab needs the upgrade: let it through
        resolve(d);
      };
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
export async function fileFingerprint(blob, bytes = HEAD_BYTES) {
  const head = new Uint8Array(await blob.slice(0, bytes).arrayBuffer());
  const tail = blob.size > bytes ? new Uint8Array(await blob.slice(Math.max(bytes, blob.size - bytes)).arrayBuffer()) : new Uint8Array(0);
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
  const blob = rec && (await fileOf(rec));
  if (!blob) return null;
  const key = cacheKey(rec.id, await fileFingerprint(blob), SEARCH_MODEL);
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
    else if (hasFile(rec)) todo.push(rec);
  }
  if (!todo.length) return { entries, failed };
  const emb = await embedder({ consented, onProgress: (f, t) => onProgress(f * 0.2, t) });
  for (let n = 0; n < todo.length; n++) {
    if (signal && signal.aborted) throw aborted();
    const rec = (await ensureLoaded(todo[n].id)) || todo[n]; // a video is played to sample its frames: open it
    if (!rec.blob) {
      failed.push({ name: rec.name, msg: 'The file could not be read.' });
      continue;
    }
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

// ---------------------------------------------------------------- photos (Manager → Photos: smart search)
// One picture vector per photo, from a small decoded preview (224 px short side), so hundreds of photos do not
// fill the memory. Stored per media id in the same database (store `photos`), keyed by the file's fingerprint
// like a video. Indexing runs in the background in small batches with a pause between them, can be paused or
// stopped, and skips photos already looked at. Missing files keep their entries for a re-link.
const PHOTO_HEAD = 16384; // a photo's fingerprint reads this much from each end
let photoDone = new WeakMap(); // library record -> fresh entry (checked this visit)
let photoBad = new WeakSet(); // records that could not be decoded this visit
const photoFp = new WeakMap(); // record -> Promise<fingerprint>
let stored = null; // Promise<Map id -> entry>, read from IndexedDB once
const loadStored = () =>
  (stored ||= tx(['photos'], 'readonly', (s) => s.getAll())
    .then((list) => new Map((list || []).map((e) => [e.id, e])))
    .catch(() => new Map()));
const fpOf = (rec) => {
  if (!photoFp.has(rec)) photoFp.set(rec, fileOf(rec).then((b) => fileFingerprint(b, PHOTO_HEAD)));
  return photoFp.get(rec);
};

/** The photo index's state, shared by every view of it. `ver` goes up whenever new vectors are ready. */
export const photoIndex = { phase: 'idle', done: 0, total: 0, failed: 0, paused: false, stopped: false, consented: false, msg: '', ver: 0 };
const photoListeners = new Set();
/** Call `fn(photoIndex)` on every change. Returns the unsubscribe. */
export function onPhotoIndex(fn) {
  photoListeners.add(fn);
  return () => photoListeners.delete(fn);
}
const tell = () => {
  for (const fn of [...photoListeners]) {
    try {
      fn(photoIndex);
    } catch (e) {
      console.warn(e);
    }
  }
};
/** The unit-length picture vector of a library photo record, when it has been looked at; else null. */
export const photoVector = (rec) => (rec && photoDone.has(rec) ? photoDone.get(rec).vec : null);
/** Cosine of a query vector against a photo record (null when the photo has no vector yet). */
export const photoScore = (rec, q) => {
  const v = photoVector(rec);
  return v && q ? cosine(v, q) : null;
};

/** A small decoded copy of a photo (short side CLIP_SIDE) as ImageData. Never decodes at full size when the size is known. */
async function photoPreview(rec) {
  const w = rec.width || 0;
  const hh = rec.height || 0;
  const k = w && hh ? Math.min(1, CLIP_SIDE / Math.min(w, hh)) : 0;
  const blob = await fileOf(rec); // read once from storage; the photo is not kept open
  let bmp;
  try {
    bmp = k ? await createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(hh * k)), resizeQuality: 'medium' }) : await createImageBitmap(blob);
  } catch {
    bmp = await createImageBitmap(blob); // a browser without resize options
  }
  try {
    const s = Math.min(1, CLIP_SIDE / Math.min(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bmp.width * s)), height: Math.max(1, Math.round(bmp.height * s)) });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return g.getImageData(0, 0, c.width, c.height);
  } finally {
    if (bmp.close) bmp.close();
  }
}

const breathe = (ms) => new Promise((r) => setTimeout(r, ms));
let want = null; // the latest records asked for (taken by the running loop)
let last = []; // the records of the last call (for Resume after Stop)
let running = null;
let wake = null;
let warned = false;

async function photoRun() {
  try {
    while (want) {
      const recs = want.filter(hasFile);
      want = null;
      const have = await loadStored();
      // photos looked at before (this browser): check their fingerprint, a few at a time
      let n = 0;
      for (const r of recs) {
        if (photoIndex.stopped) return;
        if (photoDone.has(r) || photoBad.has(r)) continue;
        const e = have.get(r.id);
        if (e && isFreshPhoto(e, photoCacheKey(r.id, await fpOf(r), SEARCH_MODEL))) photoDone.set(r, e);
        if (++n % 40 === 0) await breathe(0);
      }
      const todo = photosToIndex(recs, (r) => photoDone.has(r) || photoBad.has(r));
      const counts = [recs.length, recs.filter((r) => photoBad.has(r)).length, recs.length - todo.length];
      const same = counts[0] === photoIndex.total && counts[1] === photoIndex.failed && counts[2] === photoIndex.done;
      [photoIndex.total, photoIndex.failed, photoIndex.done] = counts;
      if (!same) photoIndex.ver++; // only real changes count, or a redraw would start another round
      if (!todo.length) {
        if (!same || photoIndex.phase !== 'done') (photoIndex.phase = 'done'), tell();
        continue;
      }
      photoIndex.phase = 'running';
      photoIndex.msg = '';
      tell();
      const emb = await embedder({ consented: photoIndex.consented, onProgress: (f, t) => ((photoIndex.msg = t), tell()) });
      photoIndex.msg = '';
      for (const group of batches(todo, PHOTO_BATCH)) {
        while (photoIndex.paused && !photoIndex.stopped) {
          photoIndex.phase = 'paused';
          tell();
          await new Promise((r) => (wake = r));
        }
        if (photoIndex.stopped) return;
        photoIndex.phase = 'running';
        const ok = [];
        const imgs = [];
        for (const r of group) {
          try {
            imgs.push(await photoPreview(r));
            ok.push(r);
          } catch {
            photoBad.add(r);
            photoIndex.failed++;
          }
        }
        if (ok.length) {
          const vecs = await emb.images(imgs);
          const at = Date.now();
          const entries = await Promise.all(ok.map(async (r, i) => ({ id: r.id, key: photoCacheKey(r.id, await fpOf(r), SEARCH_MODEL), dim: vecs[i].length, vec: vecs[i], at })));
          entries.forEach((e, i) => (photoDone.set(ok[i], e), have.set(e.id, e)));
          await tx(['photos'], 'readwrite', (s) => entries.forEach((e) => s.put(e))).catch(() => {
            if (!warned) (warned = true), reportSaveFail('the photo search index (it works until you reload)');
          });
        }
        photoIndex.done += group.length;
        photoIndex.ver++;
        tell();
        await breathe(24); // let the page draw and take clicks between batches
        if (want) break; // photos were added or removed: start over (finished ones are skipped)
      }
      if (!want) photoIndex.phase = 'done';
      tell();
    }
  } catch (e) {
    photoIndex.phase = e && e.code === 'consent' ? 'consent' : 'error';
    photoIndex.msg = (e && e.message) || 'The photos could not be looked at.';
    tell();
  }
}

/**
 * Look at every photo record (library images with their file) in the background. Photos already looked at are
 * skipped. Calling it again while it runs just updates the list (new photos are picked up). Does nothing after
 * stopPhotoIndex() until startPhotoIndex(). Resolves when the run ends.
 */
export function indexPhotos(recs) {
  last = recs;
  if (photoIndex.stopped) return running || Promise.resolve();
  want = recs;
  if (!running) running = photoRun().finally(() => (running = null));
  return running;
}
export function pausePhotoIndex(on = true) {
  photoIndex.paused = on;
  if (!on && wake) wake();
  if (!on && photoIndex.phase === 'paused') photoIndex.phase = 'running';
  tell();
}
/** Stop indexing (photos already done stay). It does not start again on its own until startPhotoIndex(). */
export function stopPhotoIndex() {
  photoIndex.stopped = true;
  photoIndex.paused = false;
  if (wake) wake();
  photoIndex.phase = 'stopped';
  tell();
}
/** Start (or resume after Stop) with the last records asked for, or `recs`. `consented` allows the model download. */
export function startPhotoIndex(recs = last, { consented = false } = {}) {
  if (consented) photoIndex.consented = true;
  photoIndex.stopped = false;
  photoIndex.paused = false;
  if (photoIndex.phase === 'error' || photoIndex.phase === 'consent') photoIndex.phase = 'idle';
  return indexPhotos(recs);
}
/** Delete every stored photo vector. Indexing stays stopped until startPhotoIndex(). */
export async function clearPhotoIndex() {
  stopPhotoIndex();
  if (running) await running.catch(() => {});
  photoDone = new WeakMap();
  photoBad = new WeakSet();
  stored = Promise.resolve(new Map());
  await tx(['photos'], 'readwrite', (s) => s.clear()).catch(() => {});
  Object.assign(photoIndex, { done: 0, failed: 0, phase: 'stopped', msg: '' });
  photoIndex.ver++;
  tell();
}
/** The text vector for a photo search (the model must be cached or agreed to). */
export const photoQueryVector = (text) => textVector(text, { consented: photoIndex.consented });
