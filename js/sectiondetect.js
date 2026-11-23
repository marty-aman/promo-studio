// Song sections from the audio, in the browser, with no model to download. The song is cut into 0.5 s frames;
// each frame gets a chroma vector (which notes sound: the chords) and a timbre vector (MFCC-like: the shape of the
// spectrum, so a distorted chorus differs from a clean verse) and a loudness. Every frame is compared with every
// other (a self-similarity matrix); a checkerboard kernel slid along its diagonal gives a novelty curve that peaks
// where the music changes, and the strongest peaks are the boundaries (snapped to lyric line starts or beats).
// Segments that sound alike are grouped; the most repeated, loudest group (or the one whose lyrics repeat) is the
// Chorus, and the rest are named by where they sit. Work is done in small async slices so the page keeps drawing,
// with progress and an AbortSignal. Pure apart from decodeMono (Web Audio); unit tested on synthetic songs.
import { fft } from './autosync.js';
import { energyEnvelope, detectBeats } from './core.js';

export const FRAME = 0.5; // seconds per feature frame
const WIN = 2048;
const HOP = 1024;
const BANDS = 20;
const CEPS = 12;
export const DETECT_RATE = 22050; // audio is decoded at this rate for the analysis

const tick = () => new Promise((r) => setTimeout(r, 0));
const cancelled = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });
const check = (signal) => {
  if (signal && signal.aborted) throw cancelled();
};

/** Decode an audio (or video) blob to mono at DETECT_RATE: { mono, sampleRate, duration }. Browser only. */
export async function decodeMono(blob) {
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('This browser can’t decode audio.');
  const ctx = new Ctx(1, 1, DETECT_RATE);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += ch[i] / audio.numberOfChannels;
  }
  return { mono, sampleRate: audio.sampleRate, duration: audio.duration };
}

/**
 * Per-frame features: { n, frame, chroma: [Float64Array(12)], timbre: [Float64Array(CEPS)], loud: Float64Array (dB) }.
 * onProgress(0..1) is called between slices; `signal` cancels.
 */
export async function frameFeatures(mono, sr, { frame = FRAME, onProgress = null, signal = null } = {}) {
  const half = WIN / 2;
  const hann = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
  const pc = new Int8Array(half).fill(-1);
  const band = new Int8Array(half).fill(-1);
  const lo = 60;
  const hi = Math.min(10000, sr * 0.47);
  for (let k = 1; k < half; k++) {
    const f = (k * sr) / WIN;
    if (f >= 55 && f <= 4200) pc[k] = (((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12);
    if (f >= lo && f < hi) band[k] = Math.min(BANDS - 1, Math.floor((Math.log(f / lo) / Math.log(hi / lo)) * BANDS));
  }
  const fpf = frame * sr;
  const n = Math.floor(mono.length / fpf);
  const chroma = Array.from({ length: n }, () => new Float64Array(12));
  const bands = Array.from({ length: n }, () => new Float64Array(BANDS));
  const cnt = new Float64Array(n);
  const re = new Float64Array(WIN);
  const im = new Float64Array(WIN);
  const total = Math.max(1, Math.floor((mono.length - WIN) / HOP) + 1);
  for (let s = 0, j = 0; s + WIN <= mono.length && n; s += HOP, j++) {
    const f = Math.min(n - 1, Math.floor((s + half) / fpf));
    for (let i = 0; i < WIN; i++) re[i] = mono[s + i] * hann[i];
    im.fill(0);
    fft(re, im);
    const C = chroma[f];
    const B = bands[f];
    for (let k = 1; k < half; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      if (pc[k] >= 0) C[pc[k]] += Math.sqrt(p);
      if (band[k] >= 0) B[band[k]] += p;
    }
    cnt[f]++;
    if (j % 300 === 299) {
      check(signal);
      if (onProgress) onProgress(j / total);
      await tick();
    }
  }
  const timbre = [];
  const loud = new Float64Array(n);
  for (let f = 0; f < n; f++) {
    const C = chroma[f];
    let m = 0;
    for (let k = 0; k < 12; k++) m = Math.max(m, C[k]);
    if (m > 0) for (let k = 0; k < 12; k++) C[k] /= m;
    const lb = new Float64Array(BANDS);
    for (let b = 0; b < BANDS; b++) lb[b] = Math.log(1e-10 + bands[f][b] / Math.max(1, cnt[f]));
    const T = new Float64Array(CEPS); // DCT-II of the log bands, skipping c0 (that's loudness)
    for (let c = 1; c <= CEPS; c++) {
      let s = 0;
      for (let b = 0; b < BANDS; b++) s += lb[b] * Math.cos((Math.PI * c * (b + 0.5)) / BANDS);
      T[c - 1] = s;
    }
    timbre.push(T);
    let e = 0;
    const a = Math.floor(f * fpf);
    const z = Math.min(mono.length, Math.floor((f + 1) * fpf));
    for (let i = a; i < z; i++) e += mono[i] * mono[i];
    loud[f] = 10 * Math.log10(e / Math.max(1, z - a) + 1e-12);
  }
  return { n, frame, chroma, timbre, loud };
}

/** Average each vector with its neighbours (±w frames) so single notes and drum hits don't dominate. */
function smooth(vecs, w = 1) {
  return vecs.map((_, i) => {
    const out = new Float64Array(vecs[i].length);
    let c = 0;
    for (let d = -w; d <= w; d++) {
      const v = vecs[i + d];
      if (!v) continue;
      for (let k = 0; k < out.length; k++) out[k] += v[k];
      c++;
    }
    for (let k = 0; k < out.length; k++) out[k] /= c;
    return out;
  });
}

/** Scale every dimension to zero mean, unit spread across the song. */
function zscore(vecs) {
  if (!vecs.length) return vecs;
  const D = vecs[0].length;
  const mu = new Float64Array(D);
  const sd = new Float64Array(D);
  for (const v of vecs) for (let k = 0; k < D; k++) mu[k] += v[k] / vecs.length;
  for (const v of vecs) for (let k = 0; k < D; k++) sd[k] += (v[k] - mu[k]) ** 2 / vecs.length;
  for (let k = 0; k < D; k++) sd[k] = Math.sqrt(sd[k]) || 1;
  return vecs.map((v) => v.map((x, k) => (x - mu[k]) / sd[k]));
}

const unit = (v) => {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map((x) => x / s);
};

/** Pairwise distances → similarities exp(−(d/median)²), as N rows of Float64Array. */
async function similarity(vecs, signal) {
  const N = vecs.length;
  const D = new Array(N);
  for (let i = 0; i < N; i++) D[i] = new Float64Array(N);
  const sample = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      let s = 0;
      const a = vecs[i];
      const b = vecs[j];
      for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
      D[i][j] = D[j][i] = Math.sqrt(s);
      if ((i * 31 + j) % 7 === 0) sample.push(D[i][j]);
    }
    if (i % 60 === 59) {
      check(signal);
      await tick();
    }
  }
  sample.sort((x, y) => x - y);
  const med = sample[Math.floor(sample.length / 2)] || 1;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) D[i][j] = Math.exp(-((D[i][j] / med) ** 2));
  return D;
}

/** Foote novelty: a Gaussian-tapered checkerboard kernel (half-width L frames) along the diagonal; 0..1. */
export function novelty(S, L) {
  const N = S.length;
  const out = new Float64Array(N);
  const sig = L / 2;
  for (let i = 1; i < N; i++) {
    let s = 0;
    let wsum = 0;
    for (let a = -L; a < L; a++) {
      const ia = i + a;
      if (ia < 0 || ia >= N) continue;
      for (let b = -L; b < L; b++) {
        const ib = i + b;
        if (ib < 0 || ib >= N) continue;
        const g = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * sig * sig));
        s += (a < 0 === b < 0 ? 1 : -1) * g * S[ia][ib];
        wsum += g;
      }
    }
    out[i] = wsum ? Math.max(0, s / wsum) : 0;
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const normText = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Pick boundary frames from a novelty curve: local peaks, strongest first, at least minGap frames apart. */
export function pickPeaks(nov, { minGap = 12, maxCount = 40, edge = 4 } = {}) {
  const N = nov.length;
  const vals = [...nov];
  const thr = Math.max(0.12, median(vals) + 0.6 * Math.sqrt(mean(vals.map((x) => (x - mean(vals)) ** 2))));
  const w = Math.max(2, Math.floor(minGap / 2));
  const cands = [];
  for (let i = edge; i < N - edge; i++) {
    if (nov[i] < thr) continue;
    let top = true;
    for (let d = -w; d <= w && top; d++) if (d && nov[i + d] > nov[i]) top = false;
    if (top) cands.push(i);
  }
  cands.sort((a, b) => nov[b] - nov[a]);
  const picked = [];
  for (const i of cands) {
    if (picked.length >= maxCount) break;
    if (picked.every((p) => Math.abs(p - i) >= minGap)) picked.push(i);
  }
  return { peaks: picked.sort((a, b) => a - b), thr };
}

/** Move a boundary to the nearest lyric line start within 2 s, else the nearest beat within half a beat. */
export function snapBoundary(t, { lineStarts = [], beats = null } = {}) {
  let best = null;
  for (const s of lineStarts) if (Math.abs(s - t) <= 2 && (best == null || Math.abs(s - t) < Math.abs(best - t))) best = s;
  if (best != null) return { t: best, to: 'lyric' };
  if (beats && beats.beats && beats.beats.length) {
    let b = null;
    for (const x of beats.beats) if (b == null || Math.abs(x - t) < Math.abs(b - t)) b = x;
    if (b != null && Math.abs(b - t) <= (beats.period || 0.5) / 2 + 1e-6) return { t: b, to: 'beat' };
  }
  return { t, to: '' };
}

/** How alike two segments [a, b) of the matrix are: along the stretched diagonal (same order) and as blocks. */
function segSim(S, Sn, A, B) {
  const la = A[1] - A[0];
  const lb = B[1] - B[0];
  const need = Math.max(2, Math.floor(0.6 * Math.min(la, lb)));
  // slide B along A (no stretching: a repeat plays at the same tempo) and keep the best diagonal
  let best = 0;
  for (let d = -(lb - need); d <= la - need; d++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, -d); k < lb && d + k < la; k++) (s += S[A[0] + d + k][B[0] + k]), c++;
    if (c >= need) best = Math.max(best, s / c);
  }
  let blk = 0;
  let c = 0;
  for (let i = A[0]; i < A[1]; i += 2) for (let j = B[0]; j < B[1]; j += 2) (blk += Sn[i][j]), c++;
  return 0.6 * best + 0.4 * (c ? blk / c : 0);
}

/**
 * Where "the same part again" starts among pairwise segment similarities: the split of the sorted values with the
 * most between-group variance (Otsu), kept between 0.45 and 0.85. With too few pairs or no clear split, 0.65.
 */
export function splitPoint(vals) {
  const v = [...vals].sort((a, b) => a - b);
  if (v.length < 3) return 0.65;
  let best = -1;
  let at = 0;
  const tot = v.reduce((a, b) => a + b, 0);
  let left = 0;
  for (let k = 1; k < v.length; k++) {
    left += v[k - 1];
    const m1 = left / k;
    const m2 = (tot - left) / (v.length - k);
    const bv = k * (v.length - k) * (m1 - m2) ** 2;
    if (bv > best) (best = bv), (at = k);
  }
  const m1 = mean(v.slice(0, at));
  const m2 = mean(v.slice(at));
  if (m2 - m1 < 0.12) return 0.65;
  return Math.max(0.45, Math.min(0.85, (v[at - 1] + v[at]) / 2));
}

/**
 * Name each segment. segs: [{ start, end, cluster, loud, lyricRepeat }] in time order. Mutates `label`.
 * Returns the chorus cluster (or -1).
 */
export function labelSegments(segs) {
  const count = {};
  for (const s of segs) count[s.cluster] = (count[s.cluster] || 0) + 1;
  const louds = segs.map((s) => s.loud);
  const mu = mean(louds);
  const sd = Math.sqrt(mean(louds.map((x) => (x - mu) ** 2))) || 1;
  const clusters = [...new Set(segs.map((s) => s.cluster))];
  const score = (c) => {
    const ms = segs.filter((s) => s.cluster === c);
    return (mean(ms.map((s) => s.loud)) - mu) / sd + 0.3 * (ms.length - 1) + 1.5 * mean(ms.map((s) => s.lyricRepeat || 0));
  };
  const repeated = clusters.filter((c) => count[c] >= 2);
  let chorus = -1;
  if (repeated.length) chorus = repeated.reduce((a, b) => (score(b) > score(a) ? b : a));
  else if (segs.length > 2) chorus = segs.slice(1).reduce((a, b) => (b.loud > a.loud ? b : a)).cluster;
  else if (segs.length) chorus = segs.reduce((a, b) => (b.loud > a.loud ? b : a)).cluster;
  const firstChorus = segs.findIndex((s) => s.cluster === chorus);
  // which repeated cluster comes before the choruses most: the verse
  const before = {};
  segs.forEach((s, i) => {
    const nx = segs[i + 1];
    if (nx && nx.cluster === chorus && s.cluster !== chorus) before[s.cluster] = (before[s.cluster] || 0) + 1;
  });
  segs.forEach((s, i) => {
    const last = i === segs.length - 1;
    if (s.cluster === chorus) s.label = 'Chorus';
    else if (i === 0 && count[s.cluster] === 1) s.label = 'Intro';
    else if (last && count[s.cluster] === 1 && segs.length > 2) s.label = 'Outro';
    else if (count[s.cluster] >= 2) {
      const allBefore = segs.every((x, k) => x.cluster !== s.cluster || (segs[k + 1] && segs[k + 1].cluster === chorus));
      const verseC = Object.keys(before).length ? +Object.entries(before).sort((a, b) => b[1] - a[1])[0][0] : null;
      s.label = allBefore && s.end - s.start < 14 && verseC !== s.cluster && repeated.length > 2 ? 'Pre-chorus' : 'Verse';
    } else s.label = firstChorus >= 0 && i > firstChorus ? 'Bridge' : 'Verse';
  });
  return chorus;
}

/**
 * Detect sections in mono audio. opts: { lines: [{ start, text }] timed lyrics (song seconds), beats (detectBeats
 * result), onProgress(0..1), signal }. Returns { sections: [{ label, start, end, conf }], confidence:
 * 'good'|'fair'|'rough', note, bpm, duration }.
 */
export async function detectSections(mono, sr, { lines = [], beats = null, onProgress = null, signal = null } = {}) {
  const duration = mono.length / sr;
  const prog = (x) => onProgress && onProgress(Math.max(0, Math.min(1, x)));
  if (duration < 20) return { sections: [], confidence: 'rough', note: 'The song is too short to split into sections.', bpm: 0, duration };
  const F = await frameFeatures(mono, sr, { onProgress: (x) => prog(x * 0.6), signal });
  check(signal);
  if (!beats) beats = detectBeats(energyEnvelope(mono, sr, 100), 100);
  prog(0.62);
  await tick();
  const tz = zscore(F.timbre);
  // w: frames either side averaged first. Grouping compares lightly smoothed frames (the order of chords matters);
  // the novelty curve uses ~4.5 s averages, so a chord progression cycling inside a part reads as one texture.
  const matrix = async (w) => {
    const Sc = await similarity(smooth(F.chroma, w).map(unit), signal);
    const St = await similarity(smooth(tz, w), signal);
    return Sc.map((row, i) => row.map((x, j) => 0.5 * x + 0.5 * St[i][j]));
  };
  const S = await matrix(1);
  prog(0.72);
  const Sn = await matrix(4);
  prog(0.82);
  const N = F.n;
  const L = Math.max(4, Math.round(5 / F.frame)); // 5 s either side
  const nov = novelty(Sn, L);
  // a change in loudness counts too (a quiet verse into a loud chorus)
  const loudN = new Float64Array(N);
  for (let i = L; i < N - L; i++) {
    let a = 0;
    let b = 0;
    for (let k = 1; k <= L; k++) (a += F.loud[i - k]), (b += F.loud[i + k - 1]);
    loudN[i] = Math.abs(a - b) / L;
  }
  const nMax = Math.max(1e-9, ...nov);
  const lMax = Math.max(3, ...loudN); // under 3 dB of change counts for little
  const lineStarts = (lines || []).filter((l) => Number.isFinite(l.start)).map((l) => l.start).sort((a, b) => a - b);
  const combined = new Float64Array(N);
  for (let i = 0; i < N; i++) combined[i] = 0.75 * (nov[i] / nMax) + 0.25 * (loudN[i] / lMax);
  // a lyric line after a gap of 2.5 s or more often starts a section
  lineStarts.forEach((t, k) => {
    if (k && t - lineStarts[k - 1] < 2.5) return;
    const f = Math.round(t / F.frame);
    for (let d = -2; d <= 2; d++) if (combined[f + d] !== undefined) combined[f + d] += 0.15 * Math.exp(-(d * d) / 2);
  });
  const cMax = Math.max(1e-9, ...combined);
  for (let i = 0; i < N; i++) combined[i] /= cMax;
  check(signal);
  await tick();
  const minGap = Math.round(6 / F.frame);
  const { peaks, thr } = pickPeaks(combined, { minGap, maxCount: Math.floor(duration / 7), edge: Math.round(3 / F.frame) });
  // (a short-kernel refinement was tried and dropped: chord changes inside a part pulled boundaries ~2 s early)
  const snapped = [];
  const strength = [];
  const times = [0];
  for (const p of peaks) {
    const s = snapBoundary(p * F.frame, { lineStarts, beats });
    if (s.t - times[times.length - 1] >= 4 && duration - s.t >= 6) (times.push(+s.t.toFixed(2)), snapped.push(s.to), strength.push(combined[p]));
  }
  times.push(+duration.toFixed(2));
  // segments, their loudness and lyric repetition
  const segs = [];
  for (let k = 0; k < times.length - 1; k++) {
    const a = Math.round(times[k] / F.frame);
    const b = Math.max(a + 1, Math.min(N, Math.round(times[k + 1] / F.frame)));
    const txt = (lines || []).filter((l) => l.start >= times[k] - 0.05 && l.start < times[k + 1] - 0.05).map((l) => normText(l.text)).filter(Boolean);
    segs.push({ start: times[k], end: times[k + 1], fr: [a, b], loud: mean([...F.loud.slice(a, b)]), txt, conf: k ? strength[k - 1] ?? 0.3 : 1 });
  }
  segs.forEach((s, i) => {
    if (!s.txt.length) return (s.lyricRepeat = 0);
    const other = new Set(segs.filter((x, j) => j !== i).flatMap((x) => x.txt));
    s.lyricRepeat = s.txt.filter((t) => other.has(t)).length / s.txt.length;
  });
  // group segments that sound alike: join the most similar earlier group when close enough
  const M = segs.map((a, i) => segs.map((b, j) => (j < i ? segSim(S, Sn, b.fr, a.fr) : 0)));
  const cross = M.flatMap((row, i) => row.slice(0, i));
  // a part in between (a bridge on the chorus chords) can clear the split: also stay near the best repeat
  const joinAt = Math.max(splitPoint(cross), 0.8 * Math.max(0, ...cross));
  segs.forEach((s, i) => {
    let best = -1;
    let bestSim = 0;
    for (let j = 0; j < i; j++) if (M[i][j] > bestSim) (bestSim = M[i][j]), (best = j);
    // lyrics that repeat word for word are the same part even when the band plays it harder
    const lyr = s.txt.length >= 2 && segs.slice(0, i).findIndex((x) => x.txt.length && s.txt.filter((t) => x.txt.includes(t)).length / s.txt.length >= 0.6);
    s.cluster = bestSim >= joinAt ? segs[best].cluster : lyr !== false && lyr >= 0 ? segs[lyr].cluster : i;
    s.joinSim = bestSim;
  });
  const chorusC = labelSegments(segs);
  // neighbours with the same name and group are one section
  const merged = [];
  for (const s of segs) {
    const p = merged[merged.length - 1];
    if (p && p.cluster === s.cluster && p.label === s.label) p.end = s.end;
    else merged.push({ ...s });
  }
  prog(1);
  const chorusN = merged.filter((s) => s.cluster === chorusC).length;
  const within = mean(segs.filter((s) => s.cluster !== segs.indexOf(s)).map((s) => s.joinSim));
  const peakAvg = strength.length ? mean(strength) : 0;
  const confidence = chorusN >= 2 && within >= joinAt + 0.08 && peakAvg >= 0.45 ? 'good' : chorusN >= 2 ? 'fair' : 'rough';
  const snapNote = snapped.filter((x) => x === 'lyric').length ? ` ${snapped.filter((x) => x === 'lyric').length} boundar${snapped.filter((x) => x === 'lyric').length === 1 ? 'y was' : 'ies were'} moved to the start of a lyric line.` : '';
  const note =
    (confidence === 'good'
      ? 'The sections stand out clearly and the chorus repeats.'
      : confidence === 'fair'
        ? 'The chorus seems to repeat, but some boundaries were hard to hear.'
        : 'No clear repeat was found, so the labels are guesses.') +
    ` Found from the sound alone: on dense or heavily distorted mixes (metal especially) a boundary can be a few seconds off and verse and chorus can swap. Check them before you accept.${snapNote}`;
  return {
    sections: merged.map((s) => ({ label: s.label, start: +s.start.toFixed(2), end: +s.end.toFixed(2), conf: +Math.min(1, s.conf).toFixed(2) })),
    confidence,
    note,
    bpm: beats ? beats.bpm : 0,
    duration,
    threshold: +thr.toFixed(3),
    groups: segs.map((s, i) => ({ start: s.start, cluster: s.cluster, sim: +s.joinSim.toFixed(2), loud: +s.loud.toFixed(1), row: M[i].slice(0, i).map((x) => +x.toFixed(2)) })),
    joinAt: +joinAt.toFixed(2),
  };
}

/**
 * The detected sections as a proposal next to the ones you typed: each gets `clash` (the label of your section it
 * overlaps by half or more, or that starts within 3 s of it) so accepting never replaces yours.
 */
export function proposalAgainst(existing, detected, duration = 0) {
  const spans = [...(existing || [])].filter((s) => Number.isFinite(s.start)).sort((a, b) => a.start - b.start);
  const ends = spans.map((s, i) => (Number.isFinite(s.end) && s.end > s.start ? s.end : spans[i + 1] ? spans[i + 1].start : duration || s.start + 15));
  return detected.map((d) => {
    let clash = '';
    spans.forEach((s, i) => {
      const ov = Math.min(d.end, ends[i]) - Math.max(d.start, s.start);
      if (!clash && (Math.abs(s.start - d.start) < 3 || ov >= 0.5 * (d.end - d.start))) clash = s.label;
    });
    return { ...d, clash };
  });
}
