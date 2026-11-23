// Auto-reframe: keep the main person in the picture when a wide clip is cropped into a narrower
// format (16:9 footage in a 9:16 edit). The clip's frames are sampled and a person is found in each
// (a face with MediaPipe's BlazeFace, else a person box from EfficientDet-Lite0, else the centre of
// the selfie-segmenter mask). The path is steadied (a dead zone, then a One-Euro filter run forwards
// and backwards so it does not lag) and written as the clip's own zoom / panX / panY keyframes, so
// undo, the Keyframes panel and export work as for any keyframe. Everything runs in this browser:
// the models are vendored and no frame leaves the device.
//
// Coordinates: detections are boxes in 0..1 of the source picture. A "centre" c is the middle of
// the visible window, also in 0..1 of the source. panX / panY are the renderer's "pan inside"
// (-1..1 across the overflow, see drawFitted in renderer.js).
import { setKey, KEY_EPS } from './keyframes.js';

export const TIGHTNESS = [
  ['loose', 'Follow loosely'],
  ['close', 'Follow closely'],
];
export const WHICH = [
  ['largest', 'Largest person'],
  ['central', 'Most central person'],
];
export const SAMPLE_FPS = 5; // frames looked at per second of source
export const MAX_SAMPLES = 240;
export const MIN_COVERAGE = 0.1; // below this share of frames with a person, the clip is left alone

const TUNING = {
  // dz: dead zone as a share of the visible window; minCutoff / beta: One-Euro (Hz, per unit/s)
  loose: { dz: 0.16, minCutoff: 0.25, beta: 0.6, margin: 0.04 },
  close: { dz: 0.07, minCutoff: 0.6, beta: 1.5, margin: 0.05 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// ------------------------------------------------------------ pure planning (unit tested)

/**
 * Times to look at for a clip: [{ src (seconds into the file), t (seconds from the clip's start) }].
 * Follows the clip's in-point and speed, so a 2x clip samples twice as much source per second.
 */
export function sampleTimes(clip, mediaDuration = Infinity, fps = SAMPLE_FPS, max = MAX_SAMPLES) {
  const speed = clip.speed || 1;
  const a = Math.max(0, clip.in || 0);
  const b = Math.min(mediaDuration, a + (clip.duration || 0) * speed);
  const span = Math.max(0, b - a);
  const n = Math.max(2, Math.min(max, Math.ceil(span * fps) + 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const src = a + (span * i) / (n - 1);
    out.push({ src: +src.toFixed(3), t: +((src - a) / speed).toFixed(3) });
  }
  // the last frame sits a hair before the end so a seek still lands on a picture
  if (Number.isFinite(mediaDuration)) out[n - 1].src = +Math.max(a, Math.min(out[n - 1].src, mediaDuration - 0.04)).toFixed(3);
  return out;
}

/**
 * The crop for a source of sw x sh drawn "cover" into a W x H frame at `zoom`:
 * visW / visH = the share of the source that is visible; overX / overY = overflow in frame px.
 */
export function cropGeometry(sw, sh, W, H, zoom = 1) {
  const s = Math.max(W / sw, H / sh) * Math.max(1, zoom);
  const dw = sw * s;
  const dh = sh * s;
  return { dw, dh, W, H, visW: Math.min(1, W / dw), visH: Math.min(1, H / dh), overX: dw - W, overY: dh - H };
}

/** A window centre (0..1 of the source) as the renderer's pan value, clamped so no edge shows. */
export function panFor(c, over, d) {
  if (over < 0.5) return 0;
  return +clamp(((1 - 2 * c) * d) / over, -1, 1).toFixed(4);
}
/** The inverse of panFor: the window centre that a pan value shows. */
export function centreFor(pan, over, d) {
  if (over < 0.5) return 0.5;
  return 0.5 - (pan * over) / (2 * d);
}

/** Keep a window centre where the window stays inside the picture. */
export const clampCentre = (c, vis) => (vis >= 1 ? 0.5 : clamp(c, vis / 2, 1 - vis / 2));

/**
 * Move the window centre c the least amount so [lo, hi] is inside the window with `margin`.
 * When the subject is bigger than the window, line up its start (preferStart, for heads) or its middle.
 */
export function keepInside(c, lo, hi, vis, margin = 0, preferStart = false) {
  const m = Math.min(margin, vis / 4);
  if (hi - lo > vis - 2 * m) return preferStart ? lo - m + vis / 2 : (lo + hi) / 2;
  return clamp(c, hi + m - vis / 2, lo - m + vis / 2);
}

/** A dead zone: the output only moves when the input leaves a band of ±dz around it. */
export function deadZone(xs, dz) {
  if (!xs.length) return [];
  let a = xs[0];
  return xs.map((x) => {
    if (x > a + dz) a = x - dz;
    else if (x < a - dz) a = x + dz;
    return a;
  });
}

/**
 * One-Euro filter (Casiez et al. 2012): heavy smoothing when slow, little lag when fast.
 * ts: times in seconds (increasing). Returns the filtered values.
 */
export function oneEuro(xs, ts, { minCutoff = 0.5, beta = 1, dCutoff = 1 } = {}) {
  if (!xs.length) return [];
  const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * Math.max(dt, 1e-4)));
  const out = [xs[0]];
  let xPrev = xs[0];
  let dxPrev = 0;
  for (let i = 1; i < xs.length; i++) {
    const dt = Math.abs(ts[i] - ts[i - 1]) || 1e-3;
    const dx = (xs[i] - xPrev) / dt;
    const edx = dxPrev + alpha(dCutoff, dt) * (dx - dxPrev);
    const a = alpha(minCutoff + beta * Math.abs(edx), dt);
    const x = xPrev + a * (xs[i] - xPrev);
    out.push(x);
    xPrev = x;
    dxPrev = edx;
  }
  return out;
}

/** One-Euro forwards, then backwards over that: no lag, since the whole clip is known. */
export function smoothPath(xs, ts, opts) {
  const f = oneEuro(xs, ts, opts);
  return oneEuro([...f].reverse(), [...ts].reverse(), opts).reverse();
}

const centre = (d) => [d.x + d.w / 2, d.y + d.h / 2];
const area = (d) => d.w * d.h;

/** The best detection by the chosen rule: 'largest' or 'central' (nearest the middle of the picture). */
export function pickBy(dets, which = 'largest') {
  if (!dets || !dets.length) return null;
  const score = (d) => {
    if (which === 'central') {
      const [x, y] = centre(d);
      return -Math.hypot(x - 0.5, y - 0.5);
    }
    return area(d);
  };
  return dets.reduce((best, d) => (score(d) > score(best) ? d : best));
}

/**
 * Follow one person through the samples. The first one is picked by `which`; after that the
 * detection nearest the last one is kept, so two people crossing do not swap. Lost for `patience`
 * samples in a row, the next pick is by `which` again. Returns one box (or null) per sample.
 */
export function pickTrack(samples, which = 'largest', { maxJump = 0.25, patience = 4 } = {}) {
  let prev = null;
  let misses = 0;
  return samples.map((s) => {
    const dets = (s.dets || []).filter((d) => d && d.w > 0 && d.h > 0);
    if (!prev) {
      const d = pickBy(dets, which);
      if (d) prev = d;
      return d || null;
    }
    const [px, py] = centre(prev);
    let best = null;
    let bestD = Infinity;
    for (const d of dets) {
      const [x, y] = centre(d);
      const dist = Math.hypot(x - px, y - py) + Math.abs(Math.sqrt(area(d)) - Math.sqrt(area(prev))) * 0.5;
      if (dist < bestD) (best = d), (bestD = dist);
    }
    if (best && bestD <= maxJump) {
      prev = best;
      misses = 0;
      return best;
    }
    misses += 1;
    if (misses >= patience) {
      prev = null;
      misses = 0;
      const d = pickBy(dets, which);
      if (d) prev = d;
      return d || null;
    }
    return null;
  });
}

/** Fill the gaps in a per-sample list of numbers (null = unknown) by straight lines; ends hold. */
export function fillGaps(xs) {
  const known = xs.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0);
  if (!known.length) return null;
  return xs.map((x, i) => {
    if (x != null) return x;
    const after = known.find((k) => k > i);
    const before = [...known].reverse().find((k) => k < i);
    if (before == null) return xs[after];
    if (after == null) return xs[before];
    return xs[before] + ((xs[after] - xs[before]) * (i - before)) / (after - before);
  });
}

/** Ramer-Douglas-Peucker on [{t, v}]: the fewest points whose straight lines stay within tol. */
export function simplify(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let wd = 0;
    for (let i = a + 1; i < b; i++) {
      const f = (pts[i].t - pts[a].t) / Math.max(1e-9, pts[b].t - pts[a].t);
      const d = Math.abs(pts[i].v - (pts[a].v + (pts[b].v - pts[a].v) * f));
      if (d > wd) (wd = d), (worst = i);
    }
    if (worst > 0 && wd > tol) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Where the subject is for framing: x interval, y interval, and the point the window aims at.
 * Faces aim at the face; a person box or mask aims at the head (the top fifth of the box).
 */
function subjectOf(d) {
  const cx = d.x + d.w / 2;
  if (d.kind === 'face') return { cx, cy: d.y + d.h / 2, x0: d.x, x1: d.x + d.w, y0: d.y, y1: d.y + d.h, tall: d.h * 3 };
  const headY = d.y + d.h * 0.18;
  return { cx, cy: headY, x0: d.x, x1: d.x + d.w, y0: d.y, y1: d.y + Math.min(d.h, d.h * 0.45), tall: d.h };
}

/**
 * Plan a reframe from detections. Pure.
 * samples: [{ t, dets: [{x,y,w,h,kind}] }] (0..1 of the source); src: { w, h }; frame: { W, H }.
 * opts: { tight: 'loose'|'close', which: 'largest'|'central', flip }
 * Returns { found: false, coverage } or { found: true, coverage, zoom, panX: [{t,v}], panY: [{t,v}], kinds }.
 */
export function planReframe(samples, src, frame, { tight = 'loose', which = 'largest', flip = false } = {}) {
  const track = pickTrack(samples, which);
  const found = track.filter(Boolean).length;
  const coverage = samples.length ? found / samples.length : 0;
  if (!found || coverage < MIN_COVERAGE) return { found: false, coverage };
  const tune = TUNING[tight] || TUNING.loose;
  const subj = track.map((d) => (d ? subjectOf(flip ? { ...d, x: 1 - d.x - d.w } : d) : null));
  const ts = samples.map((s) => s.t);
  const g1 = cropGeometry(src.w, src.h, frame.W, frame.H, 1);
  // closely: zoom so the person (head and shoulders for a face) fills about 60% of the height
  let zoom = 1;
  if (tight === 'close') {
    const tall = median(subj.filter(Boolean).map((s) => s.tall));
    zoom = tall > 0 ? +clamp((0.6 * g1.visH) / tall, 1, 2.2).toFixed(2) : 1;
  }
  const g = cropGeometry(src.w, src.h, frame.W, frame.H, zoom);
  const axis = (key, lo, hi, vis, aimOffset, preferStart) => {
    const aim = fillGaps(subj.map((s) => (s ? s[key] + aimOffset : null)));
    const los = fillGaps(subj.map((s) => (s ? s[lo] : null)));
    const his = fillGaps(subj.map((s) => (s ? s[hi] : null)));
    const inside = (cs) => cs.map((c, i) => clampCentre(keepInside(c, los[i], his[i], vis, tune.margin * vis, preferStart), vis));
    let c = inside(deadZone(aim.map((v) => clampCentre(v, vis)), tune.dz * vis));
    c = inside(smoothPath(c, ts, tune));
    return c;
  };
  // the face sits a little above the middle of the window (headroom) when there is room to move
  const cx = axis('cx', 'x0', 'x1', g.visW, 0, false);
  const cy = axis('cy', 'y0', 'y1', g.visH, 0.1 * g.visH, true);
  const toKeys = (cs, over, d) => simplify(cs.map((c, i) => ({ t: ts[i], v: panFor(c, over, d) })), 0.004);
  return {
    found: true,
    coverage,
    zoom,
    panX: g.overX >= 0.5 ? toKeys(cx, g.overX, g.dw) : [],
    panY: g.overY >= 0.5 ? toKeys(cy, g.overY, g.dh) : [],
    kinds: [...new Set(track.filter(Boolean).map((d) => d.kind || 'face'))],
    centres: cx.map((x, i) => [x, cy[i]]),
  };
}

/**
 * Write a plan onto a clip (in place): its zoom / panX / panY keyframes are replaced, other
 * keyframes are kept. The clip is set to Fill (cover) and any Motion preset is switched off,
 * since both would move the picture away from the person.
 */
export function applyReframe(clip, plan) {
  clip.fit = 'cover';
  clip.kenBurns = null;
  clip.keys ||= {};
  for (const p of ['zoom', 'panX', 'panY']) delete clip.keys[p];
  clip.zoom = plan.zoom;
  if (plan.zoom !== 1) setKey(clip, 'zoom', 0, plan.zoom, 'linear');
  const write = (path, ks) => {
    if (!ks.length) return (clip[path] = 0);
    clip[path] = ks[0].v;
    if (ks.length === 1) return;
    let last = -Infinity;
    for (const k of ks) {
      if (k.t - last < KEY_EPS) continue;
      setKey(clip, path, k.t, k.v, 'linear');
      last = k.t;
    }
  };
  write('panX', plan.panX);
  write('panY', plan.panY);
  if (!Object.keys(clip.keys).length) delete clip.keys;
  return clip;
}

/** Turn MediaPipe detections (pixel boxes on a w x h canvas) into 0..1 boxes. */
export function normDetections(result, w, h, kind) {
  return ((result && result.detections) || [])
    .map((d) => d.boundingBox)
    .filter(Boolean)
    .map((b) => {
      const x = clamp(b.originX / w, 0, 1);
      const y = clamp(b.originY / h, 0, 1);
      return { x, y, w: clamp(b.width / w, 0, 1 - x), h: clamp(b.height / h, 0, 1 - y), kind };
    })
    .filter((d) => d.w > 0.005 && d.h > 0.005);
}

/** The person box of a segmenter confidence mask (Float32 0..1, w x h), or null when there is too little. */
export function maskBox(conf, w, h, thr = 0.5) {
  let n = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (conf[y * w + x] < thr) continue;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (n < w * h * 0.005) return null;
  return { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h, kind: 'mask' };
}

/** Is a frame narrower than a source (so reframing has something to do at 1x)? */
export const narrower = (frame, src) => frame.W / frame.H < src.w / src.h - 0.01;

// ------------------------------------------------------------ the person finders (browser)

let testDetectors = null;
const loaded = {}; // kind -> Promise<detector>

/** Tests only: stand-ins with MediaPipe's shapes. { face: {detect(canvas)}, person: {detect(canvas)}, mask: {segment(canvas)} } */
export function setDetectorsForTesting(d) {
  testDetectors = d;
  for (const k of Object.keys(loaded)) delete loaded[k];
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const MODELS = {
  face: ['FaceDetector', 'blaze_face_short_range.tflite', { minDetectionConfidence: 0.5 }],
  person: ['ObjectDetector', 'efficientdet_lite0.tflite', { scoreThreshold: 0.35, maxResults: 5, categoryAllowlist: ['person'] }],
  mask: ['ImageSegmenter', 'selfie_segmenter.tflite', { outputCategoryMask: false, outputConfidenceMasks: true }],
};

/** One MediaPipe task, loaded once (the same small loader as bgremove.js, GPU then CPU). */
function detector(kind) {
  if (testDetectors) return Promise.resolve(testDetectors[kind] || null);
  if (!loaded[kind]) {
    loaded[kind] = (async () => {
      if (!hasWebGL()) throw new Error('the person finder needs WebGL, which is off in this browser. Turn on hardware acceleration in the browser settings');
      const base = new URL('../vendor/mediapipe/', import.meta.url);
      const vision = await import(new URL('vision_bundle.mjs', base).href);
      const fileset = await vision.FilesetResolver.forVisionTasks(new URL('wasm', base).href);
      const [cls, file, extra] = MODELS[kind];
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: new URL(file, base).href, delegate }, runningMode: 'IMAGE', ...extra });
      try {
        return await vision[cls].createFromOptions(fileset, opts('GPU'));
      } catch {
        return await vision[cls].createFromOptions(fileset, opts('CPU'));
      }
    })();
    loaded[kind].catch(() => delete loaded[kind]);
  }
  return loaded[kind];
}

/**
 * The people in one frame (canvas), as 0..1 boxes: faces first; when there are none, person
 * boxes; when that model cannot load, the selfie mask. `use` remembers which finders work.
 */
async function findPeople(canvas, use) {
  const w = canvas.width;
  const h = canvas.height;
  if (use.face !== false) {
    try {
      const f = await detector('face');
      if (f) {
        const faces = normDetections(f.detect(canvas), w, h, 'face');
        if (faces.length) return faces;
      } else use.face = false;
    } catch (e) {
      use.face = false;
      use.error = e;
    }
  }
  if (use.person !== false) {
    try {
      const p = await detector('person');
      if (p) return normDetections(p.detect(canvas), w, h, 'person');
      use.person = false;
    } catch (e) {
      use.person = false;
      use.error = e;
    }
  }
  if (use.mask !== false) {
    try {
      const m = await detector('mask');
      if (!m) return (use.mask = false), [];
      const res = m.segment(canvas);
      try {
        const conf = res.confidenceMasks[0].getAsFloat32Array();
        const box = maskBox(conf, w, h);
        return box ? [box] : [];
      } finally {
        res.close && res.close();
      }
    } catch (e) {
      use.mask = false;
      use.error = e;
    }
  }
  if (use.face === false && use.person === false && use.mask === false) throw use.error || new Error('no person finder could load');
  return [];
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

// ------------------------------------------------------------ jobs (one at a time) and their status

export const ANALYSE_LONG = 640; // long side of the frames the finders look at, px
const jobs = new Map(); // clip id -> { status, done, total, message }
const listeners = new Set();
let current = null; // { cancelled }

export function onReframeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());
export const reframeStatus = (clipId) => jobs.get(clipId) || { status: 'idle' };
export const reframeBusy = () => !!current;
/** The status of a "Reframe every clip" run, under the key '*'. */
export const BATCH = '*';

/** Ask the running job to stop after the frame it is on. */
export function cancelReframe() {
  if (current) current.cancelled = true;
}

/**
 * Find the person through one clip and plan its reframe (does not change the project).
 * Resolves { plan, src } or { plan: { found: false } }; throws on a model or video error.
 */
async function analyse(clip, rec, frame, opts, job, onFrame) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = rec.url;
  try {
    await new Promise((res, rej) => {
      if (v.readyState >= 2) return res();
      v.addEventListener('loadeddata', res, { once: true });
      v.addEventListener('error', () => rej(new Error('could not read this video')), { once: true });
    });
    const src = { w: v.videoWidth, h: v.videoHeight };
    const k = ANALYSE_LONG / Math.max(src.w, src.h, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(src.w * Math.min(1, k)));
    canvas.height = Math.max(1, Math.round(src.h * Math.min(1, k)));
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const times = sampleTimes(clip, v.duration || rec.duration || Infinity);
    const use = {};
    const samples = [];
    for (const s of times) {
      if (job.cancelled) return null;
      await seekTo(v, s.src);
      g.drawImage(v, 0, 0, canvas.width, canvas.height);
      samples.push({ t: s.t, dets: await findPeople(canvas, use) });
      onFrame(samples.length, times.length);
    }
    return { plan: planReframe(samples, src, frame, { ...opts, flip: !!clip.flip }), src, samples };
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

/** The edit that a plan was made for: if the clip changed meanwhile, the plan is stale. */
const shape = (c) => `${c.in || 0}|${c.speed || 1}|${c.duration}|${c.mediaId}|${!!c.flip}`;

/**
 * Reframe clips: find the person in each, then write every plan in ONE undo step.
 * items: [{ clip, rec }]; frame: { W, H }; opts: { tight, which }.
 * findClipIn(draft, id) -> the clip in a store draft. Resolves a summary { done, none, failed, cancelled, changed }.
 */
export async function reframeClips(store, findClipIn, items, frame, opts, key) {
  if (current) throw new Error('a reframe is already running');
  const job = { cancelled: false };
  current = job;
  const sum = { done: 0, none: 0, failed: 0, changed: 0, cancelled: false, error: null, total: items.length };
  const plans = [];
  const set = (st) => {
    jobs.set(key, { ...st, at: Date.now() });
    emit();
  };
  try {
    for (let i = 0; i < items.length; i++) {
      const { clip, rec } = items[i];
      const label = items.length > 1 ? `Clip ${i + 1} of ${items.length}: ` : '';
      set({ status: 'running', done: 0, total: 0, message: `${label}loading the person finder…` });
      let res;
      try {
        res = await analyse(clip, rec, frame, opts, job, (d, t) => set({ status: 'running', done: d, total: t, message: `${label}finding the person… ${d} of ${t} frames` }));
      } catch (e) {
        sum.failed++;
        sum.error = e.message || String(e);
        if (/WebGL|finder could load/.test(sum.error)) break;
        continue;
      }
      if (!res) break; // cancelled
      if (res.plan.found) plans.push({ id: clip.id, shape: shape(clip), plan: res.plan });
      else sum.none++;
    }
    sum.cancelled = job.cancelled;
    if (plans.length) {
      store.update((d) => {
        for (const p of plans) {
          const c = findClipIn(d, p.id);
          if (!c || shape(c) !== p.shape) {
            sum.changed++;
            continue;
          }
          applyReframe(c, p.plan);
          sum.done++;
        }
      });
    }
    set({ status: sum.done ? 'done' : sum.cancelled ? 'cancelled' : sum.failed && !sum.none ? 'error' : 'none', message: describeSummary(sum), summary: sum });
    return sum;
  } finally {
    current = null;
    emit();
  }
}

/** What happened, in a sentence for the status line. */
export function describeSummary(s) {
  const parts = [];
  const one = s.total === 1;
  if (s.done) parts.push(one ? 'Reframed: the crop now follows the person. Undo puts it back.' : `Reframed ${s.done} of ${s.total} clips. Undo puts them back.`);
  if (s.none) parts.push(one ? 'No person found in this clip, so it was left as it was.' : `${s.none} clip${s.none === 1 ? ' had' : 's had'} no person and ${s.none === 1 ? 'was' : 'were'} left alone.`);
  if (s.changed) parts.push(`${s.changed} clip${s.changed === 1 ? '' : 's'} changed while reframing and ${s.changed === 1 ? 'was' : 'were'} skipped.`);
  if (s.failed) parts.push(`Could not reframe${one ? '' : ` ${s.failed} clip${s.failed === 1 ? '' : 's'}`}: ${s.error}.`);
  if (s.cancelled) parts.push(s.done ? 'Stopped: the rest were left alone.' : 'Stopped. Nothing was changed.');
  return parts.join(' ');
}
