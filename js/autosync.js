// Auto-sync: line a stem, a chart (Guitar Pro tab, drum chart, MIDI) or a stem visualizer up with the song
// by listening. Both sides become an "onset" curve (where new sounds start); the song's curve comes from its
// audio, a stem's from its audio, a chart's from its note times. Cross-correlating the curves (with an FFT,
// so every possible start is tried at once) gives the start where they line up best; for a chart, a few
// tempos around the file's and the song's detected BPM are tried too. Pure, unit tested.

export const RATE = 50; // curve samples per second for the search (refined at 100)

/** In-place radix-2 FFT of (re, im); `inv` for the inverse (unscaled). Length must be a power of two. */
export function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/**
 * Cross-correlation c[L] = Σ a[t]·b[t − L] for every lag L from −(b.length − 1) to a.length − 1.
 * Returns { values, lag0 } where values[i] is the lag i − lag0.
 */
export function xcorr(a, b) {
  const need = a.length + b.length - 1;
  let n = 1;
  while (n < need) n <<= 1;
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  ar.set(a);
  for (let i = 0; i < b.length; i++) br[i] = b[b.length - 1 - i]; // reversed: correlation as a convolution
  fft(ar, ai);
  fft(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    ai[i] = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r;
  }
  fft(ar, ai, true);
  const values = new Float64Array(need);
  for (let i = 0; i < need; i++) values[i] = ar[i] / n;
  return { values, lag0: b.length - 1 };
}

/** An energy envelope (at `rate` per second) to an onset curve at `to` per second: rises in loudness, local mean removed. */
export function onsetCurve(env, rate = 100, to = RATE) {
  if (!env || !env.length) return new Float64Array(0);
  const step = rate / to;
  const n = Math.floor(env.length / step);
  const lv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    for (let k = a; k < b && k < env.length; k++) m = Math.max(m, env[k]);
    lv[i] = Math.log1p(m * 1000);
  }
  const out = new Float64Array(n);
  for (let i = 1; i < n; i++) out[i] = Math.max(0, lv[i] - lv[i - 1]);
  return whiten(blur(out, 2), Math.round(to * 0.4));
}

/** A light blur (a few passes of [¼ ½ ¼]) so two curves a sample apart still line up. */
function blur(x, passes = 1) {
  let cur = x;
  for (let p = 0; p < passes; p++) {
    const out = new Float64Array(cur.length);
    for (let i = 0; i < cur.length; i++) out[i] = 0.5 * cur[i] + 0.25 * (cur[i - 1] || 0) + 0.25 * (cur[i + 1] || 0);
    cur = out;
  }
  return cur;
}

/** Note times (seconds, with optional weights) to an onset curve of `length` samples at `to` per second. */
export function hitCurve(times, { weights = null, to = RATE, length = 0 } = {}) {
  const end = length || Math.ceil((Math.max(0, ...times) + 1) * to);
  const out = new Float64Array(end);
  times.forEach((t, i) => {
    const x = t * to;
    const k = Math.round(x);
    const w = weights ? weights[i] : 1;
    for (let d = -2; d <= 2; d++) if (k + d >= 0 && k + d < end) out[k + d] += w * Math.exp(-((k + d - x) ** 2) / 1.2);
  });
  return whiten(out, Math.round(to * 0.4));
}

/** Remove the local mean (so loud passages don't win just for being loud) and scale to unit spread. */
function whiten(x, win) {
  const n = x.length;
  const out = new Float64Array(n);
  let sum = 0;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - win);
    const b = Math.min(n, i + win + 1);
    out[i] = Math.max(0, x[i] - (pre[b] - pre[a]) / (b - a));
    sum += out[i] * out[i];
  }
  const sd = Math.sqrt(sum / Math.max(1, n)) || 1;
  for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

/**
 * The best lag of `b` against `a` within [minLag, maxLag] (in samples): { lag, score, confidence }.
 * confidence compares the peak with the next best peak at least 0.15 s away (1 = no clear winner).
 */
function bestLag(a, b, { minLag = -Infinity, maxLag = Infinity, to = RATE } = {}) {
  const { values, lag0 } = xcorr(a, b);
  // normalise each lag by the energy where the two overlap, so a lag isn't preferred just because more of
  // the curves overlap there (a steady beat matches itself a little at every lag)
  const pa = new Float64Array(a.length + 1);
  const pb = new Float64Array(b.length + 1);
  for (let i = 0; i < a.length; i++) pa[i + 1] = pa[i] + a[i] * a[i];
  for (let i = 0; i < b.length; i++) pb[i + 1] = pb[i] + b[i] * b[i];
  const minOverlap = Math.min(4 * to, 0.5 * Math.min(a.length, b.length));
  const norm = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const L = i - lag0;
    const lo = Math.max(0, L);
    const hi = Math.min(a.length, b.length + L);
    if (hi - lo < minOverlap) continue;
    const ea = pa[hi] - pa[lo];
    const eb = pb[hi - L] - pb[lo - L];
    norm[i] = ea > 0 && eb > 0 ? values[i] / Math.sqrt(ea * eb) : 0;
  }
  let best = -Infinity;
  let at = 0;
  const lo = Math.max(0, lag0 + Math.ceil(minLag));
  const hi = Math.min(values.length - 1, lag0 + Math.floor(maxLag));
  for (let i = lo; i <= hi; i++) if (norm[i] > best) (best = norm[i]), (at = i);
  const gap = Math.round(to * 0.15);
  let second = -Infinity;
  for (let i = lo; i <= hi; i++) if (Math.abs(i - at) > gap && norm[i] > second) second = norm[i];
  return { lag: at - lag0, score: best, confidence: second > 0 ? best / second : best > 0 ? 9 : 1 };
}

/** Refine a lag (seconds) at 100 per second within ±0.1 s by direct correlation. */
function refine(aEnv, bCurveAt, approx, rate = 100) {
  let best = -Infinity;
  let at = approx;
  for (let d = -0.1; d <= 0.1 + 1e-9; d += 1 / rate) {
    const lag = approx + d;
    let s = 0;
    for (const [t, w] of bCurveAt) {
      const k = Math.round((t + lag) * rate);
      if (k >= 1 && k < aEnv.length) s += w * aEnv[k];
    }
    if (s > best) (best = s), (at = lag);
  }
  return at;
}

const label = (c) => (c >= 1.25 ? 'sure' : c >= 1.08 ? 'likely' : 'unsure');

/**
 * Where a stem starts in the song: { offset (song seconds where the stem's 0:00 plays), confidence, sure }.
 * `song` and `stem` are audio records with an energy envelope (media.js: envelope, envRate).
 */
export function syncStem(song, stem, { maxShift = 120 } = {}) {
  const a = onsetCurve(song.envelope, song.envRate || 100);
  const b = onsetCurve(stem.envelope, stem.envRate || 100);
  if (a.length < RATE * 2 || b.length < RATE * 2) return null;
  const r = bestLag(a, b, { minLag: -maxShift * RATE, maxLag: maxShift * RATE });
  // refine against the stem's own onsets at full rate
  const fine = onsetCurve(song.envelope, song.envRate || 100, 100);
  const bFine = onsetCurve(stem.envelope, stem.envRate || 100, 100);
  const pts = [];
  for (let i = 0; i < bFine.length; i++) if (bFine[i] > 1.5) pts.push([i / 100, bFine[i]]);
  const offset = pts.length ? refine(fine, pts, r.lag / RATE) : r.lag / RATE;
  return { offset: +offset.toFixed(3), confidence: +r.confidence.toFixed(2), sure: label(r.confidence) };
}

/**
 * Where a chart starts in the song, and at what tempo: { offset, tempoScale, confidence, sure }.
 * hits: [{ time, weight? }] in the chart's own seconds. tempo: the file's BPM; songBpm: the song's detected
 * BPM (optional). Chart time h plays at song time offset + h / tempoScale (as the layers draw it).
 */
export function syncChart(song, hits, { tempo = 0, songBpm = 0, scales = null } = {}) {
  const a = onsetCurve(song.envelope, song.envRate || 100);
  if (a.length < RATE * 2 || hits.length < 4) return null;
  const times = hits.map((x) => x.time);
  const weights = hits.map((x) => x.weight ?? 1);
  let cands = scales || [1];
  if (!scales && tempo && songBpm) {
    const ratio = [songBpm, songBpm * 2, songBpm / 2].map((b) => b / tempo).reduce((x, y) => (Math.abs(Math.log(y)) < Math.abs(Math.log(x)) ? y : x));
    if (Math.abs(ratio - 1) > 0.002 && ratio > 0.6 && ratio < 1.6) cands = [1, ratio];
  }
  // up to 3% either side of each, for files whose tempo is a touch off the recording
  if (!scales) cands = [...new Set(cands.flatMap((s) => [-0.03, -0.025, -0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03].map((d) => +(s * (1 + d)).toFixed(4))))];
  const songLen = a.length / RATE;
  let best = null;
  for (const s of cands) {
    const b = hitCurve(times.map((t) => t / s), { weights });
    const r = bestLag(a, b, { minLag: -(b.length / RATE) * RATE, maxLag: songLen * RATE });
    if (!best || r.score > best.score) best = { ...r, scale: s };
  }
  const fine = onsetCurve(song.envelope, song.envRate || 100, 100);
  const offset = refine(fine, times.map((t, i) => [t / best.scale, weights[i]]), best.lag / RATE);
  return { offset: +offset.toFixed(3), tempoScale: +best.scale.toFixed(4), confidence: +best.confidence.toFixed(2), sure: label(best.confidence) };
}

/** Hits to sync from a drum chart (kick and snare count most) or a tab timeline (every note onset). */
export function chartHits(data) {
  if (!data) return [];
  if (data.hits) return data.hits.map((x) => ({ time: x.time, weight: (x.lane === 'kick' || x.lane === 'snare' ? 1 : 0.6) * (x.vel ?? 1) }));
  if (data.gems) {
    // rhythm game gems: one onset per moment (chords count once), kicks a little less
    const out = [];
    for (const g of data.gems) if (!out.length || g.time - out[out.length - 1].time > 0.02) out.push({ time: g.time, weight: g.lane < 0 ? 0.8 : 1 });
    return out;
  }
  if (data.events) return data.events.filter((e) => e.notes && e.notes.length).map((e) => ({ time: e.time, weight: 1 }));
  if (data.notes) {
    // MIDI notes: one onset per moment (chords count once)
    const out = [];
    for (const n of data.notes) if (!out.length || n.time - out[out.length - 1].time > 0.02) out.push({ time: n.time, weight: Math.min(1, (n.vel || 100) / 100) });
    return out;
  }
  return [];
}
