// Find a moment: the pure part (no DOM, no model), so node tests cover it.
// A video is sampled about once a second; every sampled frame gets a CLIP picture vector (unit length) plus a
// sharpness and brightness number. A typed description becomes a CLIP text vector; the cosine between the two
// says how well a frame matches. This file ranks moments, maps them to clip in-points, scores a stretch for the
// Suggested cut (the `extraScore` hook in suggest.js) and picks a best frame. js/ai/searchindex.js does the
// sampling, the model calls and the IndexedDB cache.

export const CACHE_V = 1; // bump when the stored entry shape or the sampling changes
export const STEP = 1; // seconds between sampled frames
export const MAX_SAMPLES = 120; // a longer video is sampled this many times, spread evenly
export const HEAD_BYTES = 65536; // the fingerprint reads this much from each end of the file

/** Times (seconds into the file) to sample a video this long: every STEP s, at most MAX_SAMPLES, one for a very short clip. */
export function sampleTimes(duration, step = STEP, max = MAX_SAMPLES) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const s = Math.max(step, duration / max);
  const out = [];
  for (let t = s / 2; t < duration - 0.02 && out.length < max; t += s) out.push(+t.toFixed(3));
  return out.length ? out : [+(duration / 2).toFixed(3)];
}

/** FNV-1a (32 bit) over bytes, continuing from `h`. */
export function fnv1a(bytes, h = 0x811c9dc5) {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A cheap file identity: its size plus a hash of its first and last HEAD_BYTES. A file put back under the same
 * media id (Replace missing files) that is really the same file keeps its frames; a different file does not.
 */
export function fingerprint(size, head, tail) {
  const h = fnv1a(tail || [], fnv1a(head || []));
  return `${size}-${h.toString(16).padStart(8, '0')}`;
}

/** The cache key of a media id's frames: changes when the file, the model or the sampling changes. */
export const cacheKey = (mediaId, fp, model) => `${mediaId}|${fp}|${model}|v${CACHE_V}`;

/** A stored entry is usable for this key (and has its vectors). */
export const isFresh = (entry, key) => !!entry && entry.key === key && entry.vecs && entry.times && entry.vecs.length === entry.times.length * entry.dim;

/** Unit-length copy of a vector (a zero vector stays zero). */
export function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const k = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * k;
  return out;
}

/** Cosine of the query against every sampled frame of an entry (both unit length, so a dot product). */
export function frameScores(entry, q) {
  const n = entry.times.length;
  const d = entry.dim;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * d;
    for (let j = 0; j < d; j++) s += entry.vecs[o + j] * q[j];
    out[i] = s;
  }
  return out;
}

/** A light smoothing so one odd frame does not win over a moment that holds for a few seconds. */
export function smooth(s) {
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const a = i > 0 ? s[i - 1] : s[i];
    const b = i < s.length - 1 ? s[i + 1] : s[i];
    out[i] = 0.6 * s[i] + 0.2 * (a + b);
  }
  return out;
}

/**
 * The best moments for a query across entries: [{ mediaId, t, idx, score }] best first. Within one video a
 * moment closer than `gap` seconds to a better one is dropped, so the list shows different moments. Moments
 * below the average of all frames are dropped too (an empty list means nothing matched).
 */
export function rankMoments(entries, q, { top = 12, gap = 4 } = {}) {
  const all = [];
  const scored = entries.filter((e) => e && e.times && e.times.length).map((e) => [e, smooth(frameScores(e, q))]);
  // a moment that matches worse than the average frame is not a match at all: leave it out
  let sum = 0;
  let n = 0;
  for (const [, s] of scored) for (const x of s) (sum += x), n++;
  const floor = n ? sum / n : -Infinity;
  for (const [e, s] of scored) {
    const order = [...s.keys()].filter((i) => s[i] >= floor - 1e-9).sort((a, b) => s[b] - s[a]);
    const kept = [];
    for (const i of order) {
      if (kept.some((k) => Math.abs(e.times[k] - e.times[i]) < gap)) continue;
      kept.push(i);
      all.push({ mediaId: e.id, t: e.times[i], idx: i, score: s[i] });
      if (kept.length >= top) break;
    }
  }
  return all.sort((a, b) => b.score - a.score || a.t - b.t).slice(0, top);
}

/** 0..100 for showing a result next to the best one (the top result is 100). CLIP cosines sit in a narrow band. */
export function relativeMatch(score, best, floor) {
  if (!(best > floor)) return 100;
  return Math.max(0, Math.min(100, Math.round(((score - floor) / (best - floor)) * 100)));
}

/**
 * Where a clip that shows a moment at `t` starts: a little before it (`lead` s) so the moment plays near the
 * start, and early enough that `len` seconds fit in the file. Returns { in, duration }.
 */
export function momentClip(t, fileDuration, len = 4, lead = 0.5) {
  const dur = Number.isFinite(fileDuration) && fileDuration > 0 ? fileDuration : t + len;
  const L = Math.max(0.1, Math.min(len, dur));
  const start = Math.max(0, Math.min(t - lead, dur - L));
  return { in: +start.toFixed(3), duration: +L.toFixed(3) };
}

/**
 * Where x sits between a video's worst (lo) and best (hi) match, 0..1 around 0.5. A video whose frames all match
 * about equally (spread under MIN_SPAN) stays near 0.5, so tiny differences are not blown up into a ranking.
 */
export const MIN_SPAN = 0.04;
export function spread(x, lo, hi) {
  if (!(hi >= lo)) return 0.5;
  return Math.max(0, Math.min(1, 0.5 + (x - (lo + hi) / 2) / Math.max(hi - lo, MIN_SPAN)));
}

/**
 * A scorer for one entry and one query: (from, to) seconds into the file -> 0..1, the best smoothed match
 * inside the stretch, scaled between the entry's worst and best frame (so it ranks stretches within a clip).
 * Returns null when the entry has no frames.
 */
export function rangeScorer(entry, q) {
  if (!entry || !entry.times || !entry.times.length) return null;
  const s = smooth(frameScores(entry, q));
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of s) (lo = Math.min(lo, x)), (hi = Math.max(hi, x));
  return (from, to) => {
    let best = -Infinity;
    let near = -1;
    let nearD = Infinity;
    for (let i = 0; i < entry.times.length; i++) {
      const t = entry.times[i];
      if (t >= from && t <= to) best = Math.max(best, s[i]);
      const d = Math.min(Math.abs(t - from), Math.abs(t - to));
      if (d < nearD) (nearD = d), (near = i);
    }
    if (best === -Infinity) best = s[near]; // a stretch shorter than the sample step: the nearest frame
    return spread(best, lo, hi);
  };
}

/**
 * The hook E1's applyTake reads (`extraScore(rec, from, to) -> 0..1`) for a query: entries by media id. Videos with
 * no frames yet give null, so the cut uses its other scores alone.
 */
export function extraScoreFor(entriesById, q) {
  const scorers = new Map();
  return (rec, from, to) => {
    if (!rec || !q) return null;
    if (!scorers.has(rec.id)) scorers.set(rec.id, rangeScorer(entriesById.get(rec.id), q));
    const f = scorers.get(rec.id);
    return f ? f(from, to) : null;
  };
}

/** Variance of the 4-neighbour Laplacian of a grey image (higher is sharper). */
// shortcut: the same measure as laplacianVariance in E1's js/framequality.js (PR #47); use that once it is merged.
export function sharpness(g, w, h) {
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      sum += v;
      sq += v * v;
      n++;
    }
  }
  return n ? sq / n - (sum / n) ** 2 : 0;
}

/** RGBA pixels -> { gray: Float32Array, mean } (Rec. 601 luma). */
export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  let m = 0;
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    m += g[i];
  }
  return { gray: g, mean: g.length ? m / g.length : 0 };
}

/**
 * The best frame of a video for a thumbnail: sharp, not too dark or blown out, and (with a query) matching it.
 * With a query the match counts 65% and sharpness 35%; without one, sharpness alone. Very dark or blown-out
 * frames lose up to 60%. Returns the frame index or -1.
 */
export function bestFrameIndex(entry, q = null) {
  const n = entry && entry.times ? entry.times.length : 0;
  if (!n) return -1;
  const sh = entry.sharp || [];
  const lu = entry.luma || [];
  let shHi = 0;
  for (let i = 0; i < n; i++) shHi = Math.max(shHi, sh[i] || 0);
  const text = q ? smooth(frameScores(entry, q)) : null;
  let tLo = Infinity;
  let tHi = -Infinity;
  if (text) for (const x of text) (tLo = Math.min(tLo, x)), (tHi = Math.max(tHi, x));
  let best = -1;
  let bestV = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = shHi > 0 ? (sh[i] || 0) / shHi : 0.5;
    const l = lu[i] == null ? 128 : lu[i];
    const exposure = l < 35 ? l / 35 : l > 225 ? Math.max(0, (255 - l) / 30) : 1;
    const m = text ? spread(text[i], tLo, tHi) : 0;
    const v = (text ? 0.35 * s + 0.65 * m : s) * (0.4 + 0.6 * exposure);
    if (v > bestV + 1e-9) (bestV = v), (best = i);
  }
  return best;
}

/** CLIP was trained on captions: "crowd jumping" reads better to it as "a photo of crowd jumping". */
export function promptFor(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!t) return '';
  return /^(a|an|the)\s+(photo|picture|video|frame|shot)\b/i.test(t) ? t : `a photo of ${t}`;
}

/** Keep the newest `keep` entries (by `at`): the ids to delete from the cache. */
export function evictIds(metas, keep) {
  return metas
    .slice()
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(keep)
    .map((m) => m.id);
}

// ---------------------------------------------------------------- photos (Manager → Photos: smart search)
// A photo gets one picture vector (from a small decoded preview), cached per media id like a video's frames.

export const PHOTO_V = 1; // bump when the photo entry shape or the preview size changes
// Photos embedded per step; the page gets a breath between steps. The model call blocks the page while it runs
// (WASM, one thread: about 0.1 s a photo, measured), so steps stay small.
export const PHOTO_BATCH = 1;

/** The cache key of a photo's vector: changes when the file, the model or the photo version changes. */
export const photoCacheKey = (mediaId, fp, model) => `${mediaId}|${fp}|${model}|p${PHOTO_V}`;

/** A stored photo entry is usable for this key. */
export const isFreshPhoto = (entry, key) => !!entry && entry.key === key && !!entry.vec && entry.vec.length > 0 && entry.vec.length === entry.dim;

/** Split a list into runs of `size` (the last one may be shorter). */
export function batches(list, size = PHOTO_BATCH) {
  const n = Math.max(1, Math.floor(size) || 1);
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Dot product of two unit vectors (their cosine); 0 when the lengths differ. */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Where to cut weak visual matches. CLIP cosines sit in a narrow band and every photo gets some score, so a
 * photo only counts when it stands out from the rest: at least `z` standard deviations above the mean of the
 * photos searched. When nothing stands out (best − mean under `minLift`) nothing is kept: the words describe
 * none of the photos. Returns { cut, best, mean } (cut = Infinity keeps nothing).
 */
export const VISUAL_Z = 1;
export const VISUAL_MIN_LIFT = 0.015;
export function visualCut(scores, { z = VISUAL_Z, minLift = VISUAL_MIN_LIFT } = {}) {
  const xs = [...scores].filter(Number.isFinite);
  if (!xs.length) return { cut: Infinity, best: 0, mean: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const best = Math.max(...xs);
  if (best - mean < minLift) return { cut: Infinity, best, mean };
  return { cut: Math.min(best, mean + z * sd), best, mean };
}

/**
 * Mix text and visual matches. `text`: the photos the caption/tag/name search found, in its own order (it stays
 * first and unchanged). `pool`: the photos visual results may come from (same folder scope and filters).
 * `scoreOf(photo)` gives the cosine or null when the photo has no vector yet. Visual matches are pool photos not
 * already found by text, at or above the cut, best first.
 * Returns { items: [{ photo, visual: null | { score, pct } }], nText, nVisual, cut, best }.
 */
export function mixMatches(text, pool, scoreOf, opts = {}) {
  const onText = new Set(text);
  const scored = [];
  for (const p of pool) {
    const s = scoreOf(p);
    if (s != null && Number.isFinite(s)) scored.push([p, s]);
  }
  const { cut, best } = visualCut(scored.map((x) => x[1]), opts);
  const vis = scored.filter(([p, s]) => !onText.has(p) && s >= cut - 1e-9).sort((a, b) => b[1] - a[1]);
  const floor = cut - 0.01;
  const top = vis.length ? vis[0][1] : best; // the bar is relative to the best picture match shown
  return {
    items: [...text.map((photo) => ({ photo, visual: null })), ...vis.map(([photo, score]) => ({ photo, visual: { score, pct: relativeMatch(score, top, floor) } }))],
    nText: text.length,
    nVisual: vis.length,
    cut,
    best,
  };
}

/** The photos still to look at: those with a file, not done and not failed, in the order given. */
export const photosToIndex = (recs, isDone) => recs.filter((r) => hasFile(r) && !isDone(r));
/** A library record whose file can be read: open (it has its blob) or stored but not opened yet (loaded === false). */
export const hasFile = (r) => !!r && (!!r.blob || r.loaded === false);
