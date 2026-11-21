// Pure, DOM-free logic: timing math, lyrics, audio analysis helpers.
// Everything here is unit-tested in test/core.test.js.

export const ASPECTS = {
  '9:16': { w: 1080, h: 1920, label: '9:16 · Reels / TikTok / Shorts' },
  '4:5': { w: 1080, h: 1350, label: '4:5 · Instagram feed' },
  '1:1': { w: 1080, h: 1080, label: '1:1 · Square' },
  '16:9': { w: 1920, h: 1080, label: '16:9 · YouTube' },
  // Spotify takes Canvas files 720–1080 px tall, so a full-HD vertical (1920 tall) would be refused
  canvas: { w: 608, h: 1080, label: '9:16 · Spotify Canvas (1080 tall)' },
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Format seconds as m:ss.cc */
export function formatTime(sec, withCentis = true) {
  const s = Math.max(0, sec || 0);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  if (!withCentis) return `${m}:${String(Math.floor(rest)).padStart(2, '0')}`;
  const whole = Math.floor(rest);
  const cs = Math.floor((rest - whole) * 100 + 1e-6);
  return `${m}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Parse "m:ss.cc", "ss.cc" or "m:ss" into seconds. Returns NaN when invalid. */
export function parseTime(str) {
  const t = String(str).trim();
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return NaN;
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2]);
}

// ---------------------------------------------------------------- video clips

/** Video clips sit on one sequential lane. Returns clips with computed start/end. */
export function layoutClips(clips) {
  let t = 0;
  return clips.map((c, index) => {
    const start = t;
    t += c.duration;
    return { clip: c, index, start, end: t };
  });
}

export function videoLaneDuration(clips) {
  return clips.reduce((s, c) => s + c.duration, 0);
}

/** Which clip is on screen at timeline time t, and where in its source. */
export function clipAt(clips, t) {
  const laid = layoutClips(clips);
  for (const l of laid) {
    if (t >= l.start && t < l.end) {
      const local = t - l.start;
      return { ...l, local, sourceTime: l.clip.in + local * (l.clip.speed || 1) };
    }
  }
  return null;
}

/** Longest a clip may run given its source length, in-point and speed. */
export function maxClipDuration(clip, sourceDuration) {
  if (clip.kind === 'image' || !isFinite(sourceDuration)) return 600;
  return Math.max(0.1, (sourceDuration - clip.in) / (clip.speed || 1));
}

/** Split a clip at local time `local` (seconds into the clip). Returns [a, b] or null. */
export function splitClip(clip, local, makeId = () => uid('clip')) {
  if (local <= 0.05 || local >= clip.duration - 0.05) return null;
  const speed = clip.speed || 1;
  const a = { ...clip, duration: local, transition: { ...(clip.transition || {}) } };
  const b = {
    ...clip,
    id: makeId(),
    in: clip.in + local * speed,
    duration: clip.duration - local,
    transition: { type: 'none', duration: 0.4 },
  };
  if (clip.kenBurns) {
    // keep the motion continuous across the cut
    const k = clip.kenBurns;
    const f = local / clip.duration;
    const mid = {
      zoom: k.fromZoom + (k.toZoom - k.fromZoom) * f,
      x: k.fromX + (k.toX - k.fromX) * f,
      y: k.fromY + (k.toY - k.fromY) * f,
    };
    a.kenBurns = { ...k, toZoom: mid.zoom, toX: mid.x, toY: mid.y };
    b.kenBurns = { ...k, fromZoom: mid.zoom, fromX: mid.x, fromY: mid.y };
  }
  return [a, b];
}

// ---------------------------------------------------------------- gain / fades

/** Linear fade envelope for an item spanning [start, end] at time t. */
export function fadeGain(t, start, end, fadeIn = 0, fadeOut = 0) {
  if (t < start || t > end) return 0;
  let g = 1;
  if (fadeIn > 0 && t < start + fadeIn) g = Math.min(g, (t - start) / fadeIn);
  if (fadeOut > 0 && t > end - fadeOut) g = Math.min(g, (end - t) / fadeOut);
  return clamp(g, 0, 1);
}

// ---------------------------------------------------------------- lyrics
// Lyric times are stored in SONG time, so moving the song's start point
// (the "hook" section) keeps the lyrics in sync automatically.

export const songToTimeline = (songTime, song) => songTime - (song ? song.offset : 0);
export const timelineToSong = (t, song) => t + (song ? song.offset : 0);

/** Lines active at song time ts; the most recently started one wins. */
export function activeLyric(lyrics, ts) {
  let best = null;
  for (const l of lyrics) {
    if (ts >= l.start && ts < l.end && (!best || l.start >= best.start)) best = l;
  }
  return best;
}

export function sortLyrics(lyrics) {
  return [...lyrics].sort((a, b) => a.start - b.start);
}

/** Split text into lines -> lyric objects with default spacing (used before syncing). */
export function linesFromText(text, startAt = 0, perLine = 2.5, makeId = () => uid('lyr')) {
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line, i) => ({
      id: makeId(),
      text: line,
      start: +(startAt + i * perLine).toFixed(3),
      end: +(startAt + (i + 1) * perLine - 0.1).toFixed(3),
    }));
}

/**
 * Character-weighted word timing for karaoke/word reveal.
 * Returns [{word, start, end}] as fractions 0..1 of the line duration.
 */
export function wordTimings(text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((word, i) => {
    const start = acc / total;
    acc += weights[i];
    return { word, start, end: acc / total };
  });
}

/** Parse LRC ("[mm:ss.xx] line"). Supports multiple stamps per line and [offset:]. */
export function parseLRC(text, makeId = () => uid('lyr')) {
  const entries = [];
  let offsetMs = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const off = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) {
      offsetMs = parseInt(off[1], 10);
      continue;
    }
    const stamps = [];
    let rest = raw;
    let m;
    const re = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]/;
    while ((m = re.exec(rest))) {
      stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
      rest = rest.slice(m[0].length);
    }
    const line = rest.replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
    for (const s of stamps) entries.push({ start: s, text: line });
  }
  entries.sort((a, b) => a.start - b.start);
  // LRC offset: positive value shifts lyrics earlier.
  const shift = -offsetMs / 1000;
  const out = [];
  entries.forEach((e, i) => {
    if (!e.text) return; // blank stamped lines just end the previous line
    const next = entries[i + 1];
    const start = Math.max(0, e.start + shift);
    const end = next ? Math.max(start + 0.2, next.start + shift) : start + 4;
    out.push({ id: makeId(), text: e.text, start: +start.toFixed(3), end: +Math.min(end, start + 10).toFixed(3) });
  });
  return out;
}

const lrcStamp = (s) => {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `[${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}]`;
};

/** Serialize to LRC, inserting a blank stamp where a line ends before the next one starts. */
export function toLRC(lyrics, meta = {}) {
  const lines = [];
  if (meta.title) lines.push(`[ti:${meta.title}]`);
  if (meta.artist) lines.push(`[ar:${meta.artist}]`);
  const sorted = sortLyrics(lyrics);
  sorted.forEach((l, i) => {
    lines.push(`${lrcStamp(l.start)}${l.text}`);
    const next = sorted[i + 1];
    if (!next || next.start - l.end > 0.05) lines.push(lrcStamp(l.end));
  });
  return lines.join('\n') + '\n';
}

/** Shift every lyric by delta seconds (never below 0). */
export function shiftLyrics(lyrics, delta) {
  return lyrics.map((l) => {
    const d = Math.max(delta, -l.start);
    return { ...l, start: +(l.start + d).toFixed(3), end: +(l.end + d).toFixed(3) };
  });
}

/**
 * Tap-sync step. `cursor` is the index of the line that the next tap starts.
 * A tap starts line[cursor] at ts and ends the previous line at ts if it was still open.
 */
export function tapStart(lyrics, cursor, ts) {
  const out = lyrics.map((l) => ({ ...l }));
  if (cursor >= out.length) return { lyrics: out, cursor };
  const prev = out[cursor - 1];
  if (prev && prev.end > ts) prev.end = Math.max(prev.start + 0.1, ts);
  const cur = out[cursor];
  const nextStart = out[cursor + 1] ? out[cursor + 1].start : Infinity;
  cur.start = ts;
  cur.end = Math.max(ts + 0.3, Math.min(ts + 4, nextStart > ts ? nextStart : ts + 4));
  cur.open = true;
  if (prev) delete prev.open;
  return { lyrics: out, cursor: cursor + 1 };
}

/** Tap-sync "end line now": closes the most recently started line at ts. */
export function tapEnd(lyrics, cursor, ts) {
  const out = lyrics.map((l) => ({ ...l }));
  const cur = out[cursor - 1];
  if (cur && ts > cur.start) {
    cur.end = ts;
    delete cur.open;
  }
  return { lyrics: out, cursor };
}

// ---------------------------------------------------------------- snapping

export function snap(value, candidates, threshold) {
  let best = value;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- audio analysis

/** Min/max peaks for a waveform: `bins` pairs from Float32 samples. */
export function computePeaks(samples, bins) {
  const out = new Float32Array(bins * 2);
  const per = samples.length / bins;
  for (let b = 0; b < bins; b++) {
    let lo = 0;
    let hi = 0;
    const s0 = Math.floor(b * per);
    const s1 = Math.min(samples.length, Math.floor((b + 1) * per));
    const step = Math.max(1, Math.floor((s1 - s0) / 200));
    for (let i = s0; i < s1; i += step) {
      const v = samples[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[b * 2] = lo;
    out[b * 2 + 1] = hi;
  }
  return out;
}

/** RMS energy envelope at `rate` frames per second. */
export function energyEnvelope(samples, sampleRate, rate = 100) {
  const hop = Math.max(1, Math.round(sampleRate / rate));
  const n = Math.floor(samples.length / hop);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const o = f * hop;
    for (let i = 0; i < hop; i++) {
      const v = samples[o + i];
      sum += v * v;
    }
    env[f] = Math.sqrt(sum / hop);
  }
  return env;
}

/**
 * Pick the loudest window of `windowSec` (the likely chorus/hook).
 * Returns the start in seconds, snapped to a whole second.
 */
export function findHook(env, rate, windowSec, totalSec) {
  const w = Math.max(1, Math.round(windowSec * rate));
  if (env.length <= w) return 0;
  let sum = 0;
  for (let i = 0; i < w; i++) sum += env[i];
  let best = sum;
  let bestAt = 0;
  for (let i = w; i < env.length; i++) {
    sum += env[i] - env[i - w];
    if (sum > best) {
      best = sum;
      bestAt = i - w + 1;
    }
  }
  const start = Math.floor(bestAt / rate);
  return clamp(start, 0, Math.max(0, (totalSec ?? env.length / rate) - windowSec));
}

/**
 * Tempo + beat grid from an energy envelope.
 * Onset strength = positive energy flux; tempo = autocorrelation peak in 70..180 BPM;
 * phase = offset with the highest summed onset strength along the grid.
 */
export function detectBeats(env, rate) {
  const n = env.length;
  if (n < rate * 4) return null;
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, env[i] - env[i - 1]);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= n;
  for (let i = 0; i < n; i++) onset[i] = Math.max(0, onset[i] - mean);

  const minLag = Math.floor((60 / 180) * rate);
  const maxLag = Math.ceil((60 / 70) * rate);
  const acf = (lag) => {
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    return s / (n - lag);
  };
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    // mild preference for tempos near 120 to avoid octave errors
    const bpm = (60 * rate) / lag;
    const s = acf(lag) * (1 - 0.15 * Math.abs(Math.log2(bpm / 120)));
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return null;
  // Refine to a fractional lag: parabolic peak, then the best grid fit near it.
  const a = acf(bestLag - 1);
  const b = acf(bestLag);
  const c = acf(bestLag + 1);
  const denom = a - 2 * b + c;
  let lagF = bestLag + (denom < 0 ? clamp((0.5 * (a - c)) / denom, -0.5, 0.5) : 0);
  const gridScore = (L, p) => {
    let s = 0;
    for (let k = 0; p + k * L < n; k++) {
      const i = Math.round(p + k * L);
      s += Math.max(onset[i] || 0, 0.5 * (onset[i - 1] || 0), 0.5 * (onset[i + 1] || 0));
    }
    return s;
  };
  const bestPhaseFor = (L) => {
    let best = -Infinity;
    let at = 0;
    for (let p = 0; p < L; p++) {
      const s = gridScore(L, p);
      if (s > best) {
        best = s;
        at = p;
      }
    }
    return { score: best, phase: at };
  };
  let fit = bestPhaseFor(lagF);
  for (let d = -0.4; d <= 0.4001; d += 0.05) {
    const L = bestLag + d;
    const f = bestPhaseFor(L);
    if (f.score > fit.score + 1e-9) {
      fit = f;
      lagF = L;
    }
  }
  const period = lagF / rate;
  const beats = [];
  for (let t = fit.phase / rate; t < n / rate; t += period) beats.push(+t.toFixed(3));
  return { bpm: Math.round((60 / period) * 10) / 10, period, beats };
}

/**
 * Build a beat-cut sequence: repeatedly cycle through `media`, cutting every
 * `beatsPerCut` beats from timeline 0 until `duration` is filled.
 * `beats` are timeline times. Returns [{mediaId, duration}].
 */
export function beatCutPlan(media, beats, beatsPerCut, duration) {
  if (!media.length) return [];
  const cuts = [0];
  const grid = beats.filter((b) => b > 0.05 && b < duration);
  for (let i = beatsPerCut - 1; i < grid.length; i += beatsPerCut) cuts.push(grid[i]);
  if (cuts[cuts.length - 1] < duration) cuts.push(duration);
  const plan = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const d = cuts[i + 1] - cuts[i];
    if (d < 0.05) continue;
    plan.push({ mediaId: media[i % media.length], duration: +d.toFixed(3) });
  }
  return plan;
}

// ---------------------------------------------------------------- misc

/** Deterministic 0..1 noise for frame-stable random effects (same frame = same jitter). */
export function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Beat envelope at song time ts: 1 right on a beat, decaying towards 0 until the next one.
 * Falls back to a 120 BPM grid when no beats were detected.
 */
export function beatEnvelope(beats, ts, decay = 9) {
  let last;
  if (beats && beats.length) {
    let lo = 0;
    let hi = beats.length - 1;
    if (ts < beats[0]) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid] <= ts) lo = mid;
      else hi = mid - 1;
    }
    last = beats[lo];
  } else {
    if (ts < 0) return 0;
    last = Math.floor(ts / 0.5) * 0.5;
  }
  return Math.exp(-(ts - last) * decay);
}

/** End-card call to action, with {date} and {countdown} tokens. */
export function ctaText(template, releaseDate, now = new Date()) {
  let s = String(template || '');
  if (releaseDate) {
    const d = new Date(`${releaseDate}T00:00:00`);
    if (!isNaN(d)) {
      const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const days = Math.round((d - today) / 86400000);
      const countdown =
        days > 1 ? `OUT IN ${days} DAYS` : days === 1 ? 'OUT TOMORROW' : days === 0 ? 'OUT TODAY' : 'OUT NOW';
      s = s.replace(/\{date\}/gi, date).replace(/\{countdown\}/gi, countdown);
    }
  }
  return s.replace(/\{date\}|\{countdown\}/gi, '').trim();
}

/** Ease functions used by text animations. */
export const ease = {
  outCubic: (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3),
  outBack: (x) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const t = clamp(x, 0, 1);
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOut: (x) => {
    const t = clamp(x, 0, 1);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  },
};
