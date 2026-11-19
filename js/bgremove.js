// Remove background from video and image clips.
//  - Person (AI): MediaPipe's selfie segmenter (vendored, runs in the browser, no data leaves the device).
//    Frames are analysed once ("preparing") at PERSON_FPS and kept, so preview and export never wait on it.
//  - Green screen: a chroma key worked out live from a small copy of the frame.
// Both give a low-resolution matte (alpha only) with the source's aspect ratio. The renderer draws the
// matte with exactly the same framing as the picture, so zoom, pan, rotate and flip all line up.

export const MATTE_LONG = 256; // long side of the person matte, px
export const KEY_LONG = 320; // long side of the chroma-key matte, px
export const PERSON_FPS = 12;

export const BG_MODES = [
  ['person', 'Person (AI)'],
  ['chroma', 'Green screen'],
];

export function defaultBgRemove() {
  return {
    enabled: false,
    mode: 'person',
    softness: 0.35, // 0 hard edge .. 1 very soft
    edge: 0, // -1 shrink .. 1 grow the cut-out
    key: '#00ff00', // chroma key colour
    tolerance: 0.35, // chroma: how much of the key colour range is removed
    background: { kind: 'scene', scene: 'smoke', color: '#ff2bd6', color2: '#2b6bff' },
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => {
  const x = clamp(k, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Person confidence 0..1 -> alpha 0..1. `edge` moves the cut line out (grow) or in (shrink); `softness` widens the ramp. */
export function confidenceToAlpha(c, edge = 0, softness = 0.35) {
  const center = 0.5 - clamp(edge, -1, 1) * 0.35;
  const half = 0.03 + clamp(softness, 0, 1) * 0.3;
  return smooth((c - (center - half)) / (2 * half));
}

function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 255, 0];
}

/** Precompute the key colour's chroma direction. */
export function keyOf(hex) {
  const [r, g, b] = hexRgb(hex);
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
  const len = Math.hypot(cb, cr) || 1;
  return { ux: cb / len, uy: cr / len };
}

/**
 * Chroma key alpha 0..1 for one pixel. Measures how far the pixel's colour points in the key's direction
 * (so shadowed and bright parts of a green screen both go), minus how far it points elsewhere.
 */
export function chromaAlpha(r, g, b, key, tolerance = 0.35, softness = 0.35) {
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
  const along = cb * key.ux + cr * key.uy;
  const across = Math.abs(-cb * key.uy + cr * key.ux);
  // relative to brightness, so a shadowed part of the screen counts as much as a lit one
  const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const keyness = (along - across * 1.5) / 255 / (0.25 + y);
  const hi = 0.3 - 0.25 * clamp(tolerance, 0, 1); // at or above: fully removed
  const lo = hi - (0.03 + 0.15 * clamp(softness, 0, 1)); // at or below: fully kept
  return 1 - smooth((keyness - lo) / (hi - lo));
}

/** Matte size for a source of w x h with the given long side. */
export function matteSize(w, h, long) {
  const s = long / Math.max(1, w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Source-second ranges a clip uses: [in, in + duration * speed]. */
export function clipRange(clip, mediaDuration = Infinity) {
  const a = Math.max(0, clip.in || 0);
  const b = Math.min(mediaDuration, a + (clip.duration || 0) * (clip.speed || 1));
  return [a, Math.max(a, b)];
}

/** Frame indices at PERSON_FPS covering ranges (with one frame of margin each side). */
export function framesFor(ranges, fps = PERSON_FPS, maxIndex = Infinity) {
  const set = new Set();
  for (const [a, b] of ranges) {
    for (let i = Math.max(0, Math.floor(a * fps) - 1); i <= Math.min(maxIndex, Math.ceil(b * fps) + 1); i++) set.add(i);
  }
  return [...set].sort((x, y) => x - y);
}

// ------------------------------------------------------------ person segmentation

let segPromise = null;
let segDelegate = null;
let testSegmenter = null;

/** Tests only: use a stand-in with MediaPipe's segment(canvas) shape instead of loading the model. */
export function setSegmenterForTesting(seg) {
  testSegmenter = seg;
  segPromise = null;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function segmenter() {
  if (testSegmenter) return Promise.resolve(testSegmenter);
  if (!segPromise) {
    segPromise = (async () => {
      // MediaPipe reads frames through WebGL even on its CPU path
      if (!hasWebGL()) throw new Error('the person finder needs WebGL, which is off in this browser. Turn on hardware acceleration in the browser settings, or use Green screen');
      const base = new URL('../vendor/mediapipe/', import.meta.url);
      const { ImageSegmenter, FilesetResolver } = await import(new URL('vision_bundle.mjs', base).href);
      const fileset = await FilesetResolver.forVisionTasks(new URL('wasm', base).href);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: new URL('selfie_segmenter.tflite', base).href, delegate },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      try {
        const s = await ImageSegmenter.createFromOptions(fileset, opts('GPU'));
        segDelegate = 'GPU';
        return s;
      } catch {
        const s = await ImageSegmenter.createFromOptions(fileset, opts('CPU'));
        segDelegate = 'CPU';
        return s;
      }
    })();
    segPromise.catch(() => (segPromise = null));
  }
  return segPromise;
}
export const segmenterInfo = () => ({ loaded: !!segDelegate, delegate: segDelegate });

/**
 * A person matte for a still image (the Photo Studio's "Cut out the person" mask): a canvas the
 * image's shape at up to `long` px, white where there is a person, clear elsewhere.
 */
export async function personMatteForImage(img, { long = 768, edge = 0, softness = 0.35 } = {}) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) throw new Error('the photo has not loaded');
  const seg = await segmenter();
  const { w, h } = matteSize(iw, ih, long);
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  src.getContext('2d').drawImage(img, 0, 0, w, h);
  const conf = segmentCanvas(seg, src);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d');
  const data = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255;
    data.data[i * 4 + 3] = Math.round(confidenceToAlpha(conf[i] / 255, edge, softness) * 255);
  }
  g.putImageData(data, 0, 0);
  return out;
}

/** Confidence (0..255 per pixel) of "person" for a canvas. */
function segmentCanvas(seg, canvas) {
  const res = seg.segment(canvas);
  try {
    const mask = res.confidenceMasks && res.confidenceMasks[0];
    const f = mask.getAsFloat32Array();
    const out = new Uint8Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = Math.round(clamp(f[i], 0, 1) * 255);
    return out;
  } finally {
    res.close();
  }
}

// mediaId -> { w, h, fps, frames: Uint8Array[] (sparse), status, done, total, error }
const store = new Map();
const listeners = new Set();
let queue = Promise.resolve();
const queued = new Map(); // mediaId -> Set of frame indices waiting

export function onMatteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (id) => listeners.forEach((fn) => fn(id));

/** Preparation state for a media item: { status: idle|preparing|ready|error, done, total, error }. */
export function personStatus(mediaId) {
  const m = store.get(mediaId);
  if (!m) return { status: 'idle', done: 0, total: 0 };
  return { status: m.status, done: m.done, total: m.total, error: m.error };
}

function seekTo(v, time) {
  return new Promise((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('seeked', finish);
      res();
    };
    v.addEventListener('seeked', finish);
    setTimeout(finish, 3000);
    v.currentTime = time;
  });
}

async function runPerson(rec, indices) {
  const seg = await segmenter();
  let m = store.get(rec.id);
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (rec.kind === 'image') {
    const img = rec.el;
    const sz = matteSize(img.naturalWidth, img.naturalHeight, MATTE_LONG);
    canvas.width = sz.w;
    canvas.height = sz.h;
    g.drawImage(img, 0, 0, sz.w, sz.h);
    Object.assign(m, { w: sz.w, h: sz.h, fps: 0 });
    m.frames[0] = segmentCanvas(seg, canvas);
    m.done = m.total = 1;
    return;
  }
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = rec.url;
  await new Promise((res, rej) => {
    if (v.readyState >= 2) return res();
    v.addEventListener('loadeddata', res, { once: true });
    v.addEventListener('error', () => rej(new Error('Could not read this video')), { once: true });
  });
  const sz = matteSize(v.videoWidth, v.videoHeight, MATTE_LONG);
  canvas.width = sz.w;
  canvas.height = sz.h;
  Object.assign(m, { w: sz.w, h: sz.h, fps: PERSON_FPS });
  for (const i of indices) {
    if (m.frames[i]) continue;
    await seekTo(v, Math.min(i / PERSON_FPS, Math.max(0, (v.duration || rec.duration || 0) - 0.02)));
    g.drawImage(v, 0, 0, sz.w, sz.h);
    m.frames[i] = segmentCanvas(seg, canvas);
    m.done++;
    if (m.done % 6 === 0) emit(rec.id);
  }
  v.removeAttribute('src');
  v.load();
}

/**
 * Make sure person mattes exist for every frame `clips` use from `rec`. Resolves when ready.
 * Work is queued, one media item at a time; calling again for covered frames returns at once.
 */
export function preparePerson(rec, clips, { retry = false } = {}) {
  if (!rec || (rec.kind !== 'video' && rec.kind !== 'image')) return Promise.resolve(false);
  let m = store.get(rec.id);
  if (!m) {
    m = { w: 0, h: 0, fps: PERSON_FPS, frames: [], status: 'idle', done: 0, total: 0, error: null, ready: Promise.resolve(true) };
    store.set(rec.id, m);
  }
  // after a failure, only an explicit retry starts again (otherwise every redraw would retry)
  if (m.status === 'error' && !retry) return Promise.resolve(false);
  if (retry && m.status === 'error') {
    m.done = m.frames.filter(Boolean).length;
    m.total = m.done;
  }
  const want = rec.kind === 'image' ? [0] : framesFor(clips.map((c) => clipRange(c, rec.duration)), PERSON_FPS, Math.ceil((rec.duration || 0) * PERSON_FPS));
  const waiting = queued.get(rec.id) || new Set();
  const missing = want.filter((i) => !m.frames[i] && !waiting.has(i));
  if (!missing.length) return m.ready;
  missing.forEach((i) => waiting.add(i));
  queued.set(rec.id, waiting);
  m.total += missing.length;
  m.status = 'preparing';
  m.error = null;
  emit(rec.id);
  const job = queue.then(async () => {
    try {
      await runPerson(rec, missing);
      missing.forEach((i) => waiting.delete(i));
      if (!waiting.size) m.status = 'ready';
      emit(rec.id);
      return true;
    } catch (e) {
      missing.forEach((i) => waiting.delete(i));
      m.status = 'error';
      m.error = e.message || String(e);
      emit(rec.id);
      return false;
    }
  });
  queue = job.catch(() => {});
  m.ready = job;
  return job;
}

/** Wait until every clip in the project that removes a person background has its mattes (before export). */
export async function ensureMattes(project, getMedia) {
  const byMedia = new Map();
  const all = [...(project.clips || []), ...(project.layers || []).filter((l) => l.type === 'video' && l.visible !== false).flatMap((l) => l.clips)];
  for (const c of all) {
    if (!c.bgRemove || !c.bgRemove.enabled || c.bgRemove.mode !== 'person') continue;
    if (!byMedia.has(c.mediaId)) byMedia.set(c.mediaId, []);
    byMedia.get(c.mediaId).push(c);
  }
  const results = await Promise.all([...byMedia].map(([id, clips]) => preparePerson(getMedia(id), clips)));
  return results.every((r) => r !== false);
}

// ------------------------------------------------------------ mattes for drawing

const matteCanvases = new Map(); // clip id -> { canvas, key }
let keyScratch = null;

function matteCanvas(clipId, w, h) {
  let e = matteCanvases.get(clipId);
  if (!e) {
    e = { canvas: document.createElement('canvas'), key: '' };
    matteCanvases.set(clipId, e);
    if (matteCanvases.size > 64) matteCanvases.delete(matteCanvases.keys().next().value);
  }
  if (e.canvas.width !== w || e.canvas.height !== h) {
    e.canvas.width = w;
    e.canvas.height = h;
    e.key = '';
  }
  return e;
}

function nearestFrame(m, i) {
  for (let d = 0; d <= 3; d++) {
    if (m.frames[i - d]) return i - d;
    if (m.frames[i + d]) return i + d;
  }
  return -1;
}

/**
 * The matte for a clip at the source's current frame, as a canvas (alpha = keep), or null when
 * there is none yet (person mode still preparing) or nothing to cut.
 */
export function matteFor(clip, src) {
  const cfg = clip.bgRemove;
  if (!cfg || !cfg.enabled || !src) return null;
  const time = src instanceof HTMLVideoElement ? src.currentTime : 0;
  const soft = cfg.softness ?? 0.35;
  if (cfg.mode === 'chroma') {
    const w0 = src.videoWidth || src.naturalWidth || src.width;
    const h0 = src.videoHeight || src.naturalHeight || src.height;
    if (!w0 || !h0) return null;
    const sz = matteSize(w0, h0, KEY_LONG);
    const e = matteCanvas(clip.id, sz.w, sz.h);
    const key = `k|${time.toFixed(3)}|${cfg.key}|${cfg.tolerance}|${soft}|${cfg.edge || 0}`;
    if (e.key === key) return e.canvas;
    keyScratch ||= document.createElement('canvas');
    if (keyScratch.width !== sz.w || keyScratch.height !== sz.h) {
      keyScratch.width = sz.w;
      keyScratch.height = sz.h;
    }
    const kg = keyScratch.getContext('2d', { willReadFrequently: true });
    kg.drawImage(src, 0, 0, sz.w, sz.h);
    const img = kg.getImageData(0, 0, sz.w, sz.h);
    const d = img.data;
    const kk = keyOf(cfg.key);
    // grow / shrink by shifting the threshold a little
    const tol = clamp((cfg.tolerance ?? 0.35) - (cfg.edge || 0) * 0.15, 0, 1);
    for (let p = 0; p < d.length; p += 4) {
      d[p + 3] = Math.round(255 * chromaAlpha(d[p], d[p + 1], d[p + 2], kk, tol, soft));
      d[p] = d[p + 1] = d[p + 2] = 0;
    }
    e.canvas.getContext('2d').putImageData(img, 0, 0);
    // while seeking, currentTime is already the new time but the old frame is still showing:
    // don't cache, so the matte is rebuilt from the real frame once the seek lands
    e.key = src.seeking ? '' : key;
    return e.canvas;
  }
  const m = store.get(clip.mediaId);
  if (!m || !m.w) return null;
  const fi = m.fps ? time * m.fps : 0;
  const i0 = nearestFrame(m, Math.floor(fi));
  if (i0 < 0) return null;
  const i1 = m.frames[i0 + 1] ? i0 + 1 : i0;
  const f = i1 === i0 ? 0 : clamp(fi - i0, 0, 1);
  const e = matteCanvas(clip.id, m.w, m.h);
  const key = `p|${i0}|${i1}|${f.toFixed(2)}|${soft}|${cfg.edge || 0}`;
  if (e.key === key) return e.canvas;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * confidenceToAlpha(v / 255, cfg.edge || 0, soft));
  const a = m.frames[i0];
  const b = m.frames[i1];
  const g = e.canvas.getContext('2d');
  const img = g.createImageData(m.w, m.h);
  const d = img.data;
  for (let p = 0, q = 3; p < a.length; p++, q += 4) d[q] = lut[f ? Math.round(a[p] + (b[p] - a[p]) * f) : a[p]];
  g.putImageData(img, 0, 0);
  e.key = key;
  return e.canvas;
}
