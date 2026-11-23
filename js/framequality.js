// Frame quality for video clips, with no model and no network: how sharp, steady and well exposed each
// stretch of a clip is. Sampled frames are shrunk to a small grey picture and measured:
//   sharpness  = variance of the Laplacian (blur kills it),
//   shake      = how much the picture's global shift changes between three close frames (a pan moves steadily,
//                a handheld shake changes direction), found by block matching,
//   exposure   = mean brightness and the share of clipped white pixels.
// The pure maths below runs in node tests; `analyseVideo` / `qualityOf` do the sampling in the browser,
// one clip at a time, in the background (it only awaits seeks, so the editor stays responsive).

export const FRAME_W = 96; // sampled frames are shrunk to this width
const SHIFT_R = 6; // block matching looks this many pixels either way
const BURST_GAP = 0.07; // seconds between the three frames of a shake measurement
const MAX_SAMPLES = 90;
const MIN_STEP = 0.75;

// Thresholds (percent of frame width for shifts)
export const T = { blur: 20, blurRel: 0.3, shake: 2.2, dark: 40, bright: 215, over: 0.35, darkSkip: 25 };

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------- pure maths

/** RGBA bytes -> grey (0..255) floats. */
export function toGray(rgba, w, hgt) {
  const g = new Float32Array(w * hgt);
  for (let i = 0; i < g.length; i++) g[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  return g;
}

/** Variance of the 4-neighbour Laplacian over the interior of a grey picture. Sharp detail makes it large; blur makes it small. */
export function laplacianVariance(g, w, hgt) {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < hgt - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const m = sum / n;
  return sum2 / n - m * m;
}

/** { sharp, luma (mean 0..255), over (share of pixels >= 250) } for one grey picture. */
export function frameStats(g, w, hgt) {
  let s = 0;
  let over = 0;
  for (let i = 0; i < g.length; i++) {
    s += g[i];
    if (g[i] >= 250) over++;
  }
  return { sharp: laplacianVariance(g, w, hgt), luma: g.length ? s / g.length : 0, over: g.length ? over / g.length : 0 };
}

/**
 * The global shift between two grey pictures: the (dx, dy) in [-r, r] that lines `b` up with `a` best (mean
 * absolute difference over the middle of the picture). Ties go to the smaller shift, so flat pictures read as still.
 */
export function shiftBetween(a, b, w, hgt, r = SHIFT_R) {
  let best = { dx: 0, dy: 0, mad: Infinity };
  const x0 = r;
  const x1 = w - r;
  const y0 = r;
  const y1 = hgt - r;
  const cnt = (x1 - x0) * (y1 - y0);
  if (cnt <= 0) return { dx: 0, dy: 0, mad: 0 };
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      let sad = 0;
      for (let y = y0; y < y1; y++) {
        const ia = y * w;
        const ib = (y + dy) * w + dx;
        for (let x = x0; x < x1; x++) sad += Math.abs(a[ia + x] - b[ib + x]);
      }
      const cost = sad / cnt + 0.05 * (Math.abs(dx) + Math.abs(dy));
      if (cost < best.mad - 1e-9) best = { dx, dy, mad: cost };
    }
  }
  return best;
}

/**
 * Motion over three close frames: `mag` = how far the picture moves (percent of width, mean of the two steps),
 * `jerk` = how much that step changes between the two (percent of width). A steady pan has motion but no jerk.
 */
export function burstMotion(f0, f1, f2, w, hgt) {
  const s1 = shiftBetween(f0, f1, w, hgt);
  const s2 = shiftBetween(f1, f2, w, hgt);
  const m1 = Math.hypot(s1.dx, s1.dy);
  const m2 = Math.hypot(s2.dx, s2.dy);
  return { mag: ((m1 + m2) / 2 / w) * 100, jerk: (Math.hypot(s2.dx - s1.dx, s2.dy - s1.dy) / w) * 100 };
}

/** A sample: { t, sharp, luma, over, mag, jerk }. Shared by the sampler and the tests. */
export function makeSample(t, stats, motion) {
  const r = (x, d) => +x.toFixed(d);
  return { t: r(t, 2), sharp: r(stats.sharp, 1), luma: Math.round(stats.luma), over: r(stats.over, 2), mag: r(motion.mag, 2), jerk: r(motion.jerk, 2) };
}

/** The 90th percentile of the sharpness values: what "sharp" looks like in this clip. */
export function sharpRef(samples) {
  const v = samples.map((s) => s.sharp).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : 0;
}

/** Wrap samples as the stored result. */
export function buildQuality(samples, duration, step) {
  return { v: 1, duration, step, ref: sharpRef(samples), samples };
}

/** Which problems one sample has: any of 'blurry', 'shaky', 'dark', 'bright'. */
export function flagsOf(s, ref = 0) {
  const f = [];
  if (s.luma < T.dark) f.push('dark');
  else if (s.luma > T.bright || s.over > T.over) f.push('bright');
  const blank = s.luma < T.darkSkip; // a black frame has no detail; call it dark, not blurry
  if (!blank && (s.sharp < T.blur || (ref >= 80 && s.sharp < ref * T.blurRel))) f.push('blurry');
  if (s.jerk > T.shake) f.push('shaky');
  return f;
}

/** 0..1 for one sample: sharp, steady and well exposed, with a little credit for some motion. */
export function sampleScore(s, ref = 0) {
  const sharpC = clamp(s.sharp / Math.max(40, ref * 0.7));
  const steadyC = 1 - clamp(s.jerk / 4);
  let expC = 1;
  if (s.luma < T.dark) expC = clamp(s.luma / T.dark, 0.05);
  else if (s.luma > T.bright) expC = clamp((255 - s.luma) / (255 - T.bright), 0.2);
  if (s.over > T.over) expC = Math.min(expC, 0.5);
  const motionC = clamp(s.mag / 1.5);
  return clamp(sharpC * steadyC * expC * (0.85 + 0.15 * motionC));
}

const inRange = (q, from, to) => {
  const half = (q.step || MIN_STEP) / 2;
  const hit = q.samples.filter((s) => s.t >= from - half && s.t < to + half && s.t + half > from);
  if (hit.length) return hit;
  // a range shorter than a sample step: the nearest sample stands for it
  let near = null;
  for (const s of q.samples) if (!near || Math.abs(s.t - (from + to) / 2) < Math.abs(near.t - (from + to) / 2)) near = s;
  return near ? [near] : [];
};

/**
 * How good the stretch [from, to] (seconds into the file) is: { score 0..1, weak (share of samples with a flag), flags }.
 * `extra(from, to)` may add a 0..1 score of its own (for example a text-search match); it counts for a third.
 */
export function scoreRange(q, from, to, extra = null) {
  if (!q || !q.samples || !q.samples.length) return { score: 0.5, weak: 0, flags: [] };
  const hit = inRange(q, from, to);
  if (!hit.length) return { score: 0.5, weak: 0, flags: [] };
  let sum = 0;
  let weak = 0;
  const flags = new Set();
  for (const s of hit) {
    sum += sampleScore(s, q.ref);
    const f = flagsOf(s, q.ref);
    if (f.length) weak++;
    f.forEach((x) => flags.add(x));
  }
  let score = (sum / hit.length) * (1 - 0.5 * (weak / hit.length));
  if (extra) {
    const e = extra(from, to);
    if (Number.isFinite(e)) score = score * (2 / 3) + clamp(e) / 3;
  }
  return { score, weak: weak / hit.length, flags: [...flags] };
}

/** Runs of weak samples: [{ from, to, flags }] in seconds into the file. */
export function weakStretches(q) {
  const out = [];
  if (!q || !q.samples) return out;
  const half = (q.step || MIN_STEP) / 2;
  let cur = null;
  for (const s of q.samples) {
    const f = flagsOf(s, q.ref);
    if (!f.length) {
      cur = null;
      continue;
    }
    const from = Math.max(0, s.t - half);
    const to = Math.min(q.duration || Infinity, s.t + half);
    if (cur && from <= cur.to + 1e-6 && f.join() === cur.flags.join()) {
      cur.to = to; // the same problem continues
    } else {
      cur = { from, to, flags: [...f] };
      out.push(cur);
    }
  }
  return out;
}

/** The clip as a whole: { flags: ['Blurry', ...] for problems in a third of it or more, weak: share of samples with a flag, score }. */
export function summarize(q) {
  if (!q || !q.samples || !q.samples.length) return { flags: [], weak: 0, score: 0.5 };
  const n = q.samples.length;
  const count = { blurry: 0, shaky: 0, dark: 0, bright: 0 };
  let weak = 0;
  let sum = 0;
  for (const s of q.samples) {
    const f = flagsOf(s, q.ref);
    f.forEach((x) => count[x]++);
    if (f.length) weak++;
    sum += sampleScore(s, q.ref);
  }
  const names = { blurry: 'Blurry', shaky: 'Shaky', dark: 'Dark', bright: 'Overexposed' };
  return { flags: Object.keys(count).filter((k) => count[k] / n >= 1 / 3).map((k) => names[k]), weak: weak / n, score: sum / n };
}

/** A take is skipped by the automatic cut when over three quarters of it has a problem (a clip with one good stretch is still worth cutting from). */
export const isWeakTake = (q) => !!q && summarize(q).weak > 0.75;

/**
 * Where to start a `len` seconds cut in a clip so it lands on the best stretch. `used` lists [from, to] ranges
 * the cut already uses (so a clip used twice shows different moments). `extra(from, to)` is the hook for another
 * score (see scoreRange). Without quality data, or no room to choose, it falls back to the first free spot.
 */
export function bestStart(q, len, duration, used = [], extra = null) {
  const room = Math.max(0, duration - len);
  const lastEnd = used.length ? Math.max(...used.map((u) => u[1])) : 0;
  const fallback = lastEnd <= room ? lastEnd : 0;
  if (!q || !q.samples || !q.samples.length || room <= 0.01) return room <= 0.01 ? 0 : fallback;
  const step = Math.max(0.25, room / 200);
  let best = null;
  for (let s = 0; s <= room + 1e-9; s += step) {
    const r = scoreRange(q, s, s + len, extra);
    let overlap = 0;
    for (const u of used) overlap += Math.max(0, Math.min(u[1], s + len) - Math.max(u[0], s));
    const frac = len > 0 ? overlap / len : 0;
    const total = r.score * (1 - 0.8 * Math.min(1, frac));
    if (!best || total > best.total + 1e-9) best = { s, total };
  }
  return +best.s.toFixed(3);
}

// ---------------------------------------------------------------- browser sampling

const KEY = 'pvm.frameQuality.v1';
const KEEP = 40;
const waiters = new Map();
let chain = Promise.resolve();

const readStore = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
function cacheGet(rec) {
  const e = readStore()[rec.id];
  const size = rec.blob ? rec.blob.size : 0;
  return e && e.size === size && e.q && e.q.v === 1 ? e.q : null;
}
function cachePut(rec, q) {
  try {
    const all = readStore();
    delete all[rec.id];
    all[rec.id] = { size: rec.blob ? rec.blob.size : 0, q };
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full: the result is only kept for this visit */
  }
}

const once = (el, ok, ms) =>
  new Promise((resolve) => {
    const done = (v) => {
      clearTimeout(t);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
      resolve(v);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    const t = setTimeout(() => done(false), ms);
    el.addEventListener(ok, onOk);
    el.addEventListener('error', onErr);
  });

/** Times to sample for a clip this long: about every 0.75 s, at most 90, a single one for a very short clip. */
export function sampleTimes(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const step = Math.max(MIN_STEP, duration / MAX_SAMPLES);
  const last = Math.max(0, duration - 3 * BURST_GAP - 0.05);
  const out = [];
  for (let t = Math.min(step / 2, last); t <= last + 1e-9; t += step) out.push(+t.toFixed(3));
  return out.length ? out : [0];
}

async function analyseVideo(rec) {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  v.src = rec.url;
  try {
    if (v.readyState < 1 && !(await once(v, 'loadedmetadata', 8000))) return null;
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : rec.duration;
    if (!dur || !v.videoWidth) return null;
    const w = FRAME_W;
    const hh = Math.max(16, Math.round((w * v.videoHeight) / v.videoWidth));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = hh;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const grab = async (t) => {
      v.currentTime = Math.min(t, Math.max(0, dur - 0.01));
      if (!(await once(v, 'seeked', 3000))) return null;
      // 'seeked' can fire before the new picture is ready to draw: wait for it to be presented (or a short while)
      await new Promise((r) => {
        const to = setTimeout(r, 250);
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => (clearTimeout(to), r()));
        else setTimeout(() => (clearTimeout(to), r()), 60);
      });
      g.drawImage(v, 0, 0, w, hh);
      return toGray(g.getImageData(0, 0, w, hh).data, w, hh);
    };
    const times = sampleTimes(dur);
    const step = Math.max(MIN_STEP, dur / MAX_SAMPLES);
    const samples = [];
    const t0 = performance.now();
    for (const t of times) {
      if (performance.now() - t0 > 60000) break; // a very slow decode: keep what we have
      const f0 = await grab(t);
      const f1 = f0 && (await grab(t + BURST_GAP));
      const f2 = f1 && (await grab(t + 2 * BURST_GAP));
      if (!f2) continue;
      samples.push(makeSample(t, frameStats(f0, w, hh), burstMotion(f0, f1, f2, w, hh)));
      await new Promise((r) => setTimeout(r, 0)); // let the editor breathe between samples
    }
    return samples.length ? buildQuality(samples, dur, step) : null;
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

/**
 * The quality analysis of a video, computed once in the background, one clip at a time.
 * Returns the result when it is ready, `undefined` while it is being worked out (onReady is called when it lands),
 * and `null` for something that is not a video or could not be read.
 */
export function qualityOf(rec, onReady) {
  if (!rec || rec.kind !== 'video') return null;
  if (rec.quality !== undefined && !rec.qualityLoading) return rec.quality;
  if (onReady) (waiters.get(rec.id) || waiters.set(rec.id, new Set()).get(rec.id)).add(onReady);
  if (rec.qualityLoading) return undefined;
  const cached = cacheGet(rec);
  if (cached) {
    rec.quality = cached;
    return cached;
  }
  rec.qualityLoading = true;
  chain = chain.then(() =>
    analyseVideo(rec)
      .catch((e) => {
        console.warn('frame quality failed', rec.name, e);
        return null;
      })
      .then((q) => {
        rec.quality = q;
        rec.qualityLoading = false;
        if (q) cachePut(rec, q);
        const fns = waiters.get(rec.id);
        waiters.delete(rec.id);
        if (fns) fns.forEach((fn) => fn());
        window.dispatchEvent(new CustomEvent('pvm-quality', { detail: { id: rec.id } }));
      }),
  );
  return undefined;
}

/** Start the analysis of every video in `recs` (a no-op for photos and finished ones). */
export function analyseAll(recs, onReady) {
  for (const r of recs || []) qualityOf(r, onReady);
}

/** Resolve when every video in `recs` has been analysed (or `ms` has passed). For callers that cannot wait on a refresh. */
export function ensureQuality(recs, ms = 20000) {
  const jobs = (recs || []).filter((r) => r && r.kind === 'video' && qualityOf(r) === undefined).map((r) => new Promise((res) => qualityOf(r, res)));
  return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, ms))]);
}

const HIDE_KEY = 'pvm.hideWeakTakes';
/** Is the "Hide weak takes" filter on? Kept in this browser. */
export const hideWeak = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};
