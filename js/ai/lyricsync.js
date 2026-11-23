// Auto-sync lyrics: hear the song's vocals with an on-device speech model, then line the words it heard up
// with the lyrics you already have. The model only has to be roughly right: each lyric word that matches
// a heard word takes that word's time, the rest are spread between matched neighbours, and every line gets
// a confidence so the ones it was unsure about can be tap-synced by hand.
// Everything here is pure (fixed input, fixed output) except autoSyncLyrics(), which feeds the model.
import { ASR_TASK } from './runtime.js';

export const SR = 16000; // what Whisper hears: 16 kHz mono
export const MAX_CHUNK = 28; // seconds; Whisper takes 30 s at a time
export const MIN_CHUNK = 8;
export const LOW_CONFIDENCE = 0.5; // a line under this is flagged for tap-sync
const MAX_WORD = 1.2; // a word's length is capped (Whisper stretches word ends over pauses)
const GAP_FRAME = 0.05;

export const LANGUAGES = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'],
  ['nl', 'Dutch'], ['sv', 'Swedish'], ['fi', 'Finnish'], ['pl', 'Polish'], ['ja', 'Japanese'], ['ko', 'Korean'],
];

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------ chunking

/** Loudness (RMS) per 50 ms frame. */
export function frameRms(samples, sr = SR, frame = GAP_FRAME) {
  const n = Math.max(1, Math.round(sr * frame));
  const out = new Float32Array(Math.ceil(samples.length / n));
  for (let f = 0; f < out.length; f++) {
    let e = 0;
    const a = f * n;
    const b = Math.min(samples.length, a + n);
    for (let i = a; i < b; i++) e += samples[i] * samples[i];
    out[f] = Math.sqrt(e / Math.max(1, b - a));
  }
  return out;
}

/**
 * Cut the audio into pieces of at most `max` seconds, each cut at the quietest moment in its last part, so a
 * word is not split in two. Returns [{ start, end, silent }] in seconds; `silent` pieces are not sent to the
 * model (it makes words up out of silence).
 */
export function chunkAtGaps(samples, sr = SR, { max = MAX_CHUNK, min = MIN_CHUNK, silence = 0.003 } = {}) {
  const total = samples.length / sr;
  if (!(total > 0)) return [];
  const rms = frameRms(samples, sr);
  const per = (a, b) => {
    let peak = 0;
    for (let f = Math.floor(a / GAP_FRAME); f < Math.min(rms.length, Math.ceil(b / GAP_FRAME)); f++) peak = Math.max(peak, rms[f]);
    return peak;
  };
  const out = [];
  let at = 0;
  while (at < total - 1e-6) {
    let end = total;
    if (total - at > max) {
      // the quietest frame between min and max seconds on; a later one wins a tie (longer pieces, fewer calls)
      const f0 = Math.ceil((at + min) / GAP_FRAME);
      const f1 = Math.min(rms.length - 1, Math.floor((at + max) / GAP_FRAME));
      let lo = Infinity;
      for (let f = f0; f <= f1; f++) lo = Math.min(lo, rms[f]);
      // the longest quiet run (near the quietest level) wins; cut in its middle
      const thr = lo * 1.5 + 1e-4;
      let bestA = -1;
      let bestLen = 0;
      for (let f = f0; f <= f1; ) {
        if (rms[f] > thr) { f++; continue; }
        let g = f;
        while (g + 1 <= f1 && rms[g + 1] <= thr) g++;
        if (g - f + 1 >= bestLen) ((bestLen = g - f + 1), (bestA = f));
        f = g + 1;
      }
      end = bestA >= 0 ? clamp((bestA + bestLen / 2) * GAP_FRAME, at + min, at + max) : at + max;
    }
    out.push({ start: r3(at), end: r3(end), silent: per(at, end) < silence });
    at = end;
  }
  return out;
}

// ------------------------------------------------------------ what the model heard

/** Whisper's word output ({ chunks: [{ text, timestamp: [s, e] }] }) as [{ w, t, end }] in song time. */
export function heardWords(result, offset = 0) {
  const chunks = (result && (result.chunks || result)) || [];
  const out = [];
  for (const c of Array.isArray(chunks) ? chunks : []) {
    const ts = c && c.timestamp;
    const w = c && typeof c.text === 'string' ? c.text.trim() : '';
    if (!w || !Array.isArray(ts) || typeof ts[0] !== 'number' || !Number.isFinite(ts[0])) continue;
    const t = offset + ts[0];
    const e = typeof ts[1] === 'number' && Number.isFinite(ts[1]) && ts[1] > ts[0] ? offset + ts[1] : t + 0.3;
    out.push({ w, t: r3(t), end: r3(e) });
  }
  return out;
}

// ------------------------------------------------------------ alignment

export const normWord = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

/** Edit distance between two short strings. */
export function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for the same word, 0.6 for a near miss (a typo, a plural, a sung stretch), 0 otherwise. */
export function wordSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const len = Math.max(a.length, b.length);
  if (len >= 4 && editDistance(a, b) <= Math.max(1, Math.floor(len / 4))) return 0.6;
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.6;
  return 0;
}

const MAX_CELLS = 16_000_000;

/**
 * Needleman-Wunsch on normalised words. `lyric` and `heard` are arrays of strings (already normalised).
 * Returns match[i] = { j, sim } for each lyric word i (j = the heard word's index) or null when unmatched.
 */
export function alignSequences(lyric, heard) {
  const n = lyric.length;
  const m = heard.length;
  const match = new Array(n).fill(null);
  if (!n || !m || n * m > MAX_CELLS) return match;
  const GAP = -1;
  const W = m + 1;
  const score = new Float32Array((n + 1) * W);
  const dir = new Uint8Array((n + 1) * W); // 1 diagonal, 2 up (lyric word unmatched), 3 left (heard word extra)
  for (let i = 1; i <= n; i++) ((score[i * W] = i * GAP), (dir[i * W] = 2));
  for (let j = 1; j <= m; j++) ((score[j] = j * GAP), (dir[j] = 3));
  const sim = new Float32Array(n * m);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = wordSimilarity(lyric[i - 1], heard[j - 1]);
      sim[(i - 1) * m + (j - 1)] = s;
      const diag = score[(i - 1) * W + j - 1] + (s === 1 ? 2 : s > 0 ? 1 : -1.5);
      const up = score[(i - 1) * W + j] + GAP;
      const left = score[i * W + j - 1] + GAP;
      const best = Math.max(diag, up, left);
      score[i * W + j] = best;
      dir[i * W + j] = best === diag ? 1 : best === up ? 2 : 3;
    }
  }
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = dir[i * W + j];
    if (d === 1) {
      const s = sim[(i - 1) * m + (j - 1)];
      if (s > 0) match[i - 1] = { j: j - 1, sim: s };
      i--;
      j--;
    } else if (d === 2) i--;
    else j--;
  }
  return match;
}

/**
 * Time every lyric word. `lines` = the lyrics, one string per line; `heard` = [{ w, t, end }] from the model.
 * Matched words take the heard word's time; unmatched ones are spread between the nearest matched words by
 * their length (before the first and after the last at a steady 0.35 s a word). Returns
 *   { lines: [{ text, start, end, words: [{ w, t, end }], conf, flagged, matched }], stats } with times in
 * song time, or { lines: [], stats } when nothing matched (so the caller keeps the times it already had).
 * conf = how much of the line the model really heard (an exact word counts 1, a near miss 0.6).
 */
export function alignLyrics(lines, heard, { duration = Infinity, low = LOW_CONFIDENCE } = {}) {
  const words = [];
  lines.forEach((text, li) => {
    for (const w of String(text).split(/\s+/).filter(Boolean)) words.push({ w, li, n: normWord(w) });
  });
  const stats = { words: words.length, heard: heard.length, matched: 0, exact: 0 };
  // a word with no letters in it ("—", "&") can't be heard: it just follows its neighbour
  const idx = words.map((x, i) => i).filter((i) => words[i].n);
  const match = alignSequences(idx.map((i) => words[i].n), heard.map((x) => normWord(x.w)));
  const anchor = new Array(words.length).fill(null);
  idx.forEach((wi, k) => {
    const mt = match[k];
    if (mt) anchor[wi] = { t: heard[mt.j].t, end: heard[mt.j].end, sim: mt.sim };
  });
  stats.matched = anchor.filter(Boolean).length;
  stats.exact = anchor.filter((a) => a && a.sim === 1).length;
  if (!stats.matched) return { lines: [], stats };

  // keep the anchors in order (the model's chunks are in order, but a stray repeat must not run backwards)
  let run = -Infinity;
  anchor.forEach((a, i) => {
    if (!a) return;
    if (a.t < run) anchor[i] = null;
    else run = a.t;
  });

  const t = new Array(words.length);
  const e = new Array(words.length);
  const weight = (w) => Math.max(1, w.n.length) + 1;
  const known = words.map((_, i) => i).filter((i) => anchor[i]);
  known.forEach((i) => ((t[i] = anchor[i].t), (e[i] = Math.min(anchor[i].end, anchor[i].t + MAX_WORD))));
  // between two anchors
  for (let k = 0; k + 1 < known.length; k++) {
    const a = known[k];
    const b = known[k + 1];
    if (b - a < 2) continue;
    const from = e[a] < t[b] ? e[a] : t[a] + (t[b] - t[a]) * 0.5;
    const span = Math.max(0.05 * (b - a - 1), t[b] - from);
    const mid = words.slice(a + 1, b);
    const total = mid.reduce((s, w) => s + weight(w), 0);
    let at = from;
    mid.forEach((w, q) => {
      const len = (span * weight(w)) / total;
      t[a + 1 + q] = r3(at);
      e[a + 1 + q] = r3(Math.min(at + len, at + MAX_WORD));
      at += len;
    });
  }
  // before the first anchor and after the last
  const STEP = 0.35;
  for (let i = known[0] - 1, k = 1; i >= 0; i--, k++) ((t[i] = r3(Math.max(0, t[known[0]] - k * STEP))), (e[i] = r3(t[i] + STEP * 0.9)));
  const last = known[known.length - 1];
  for (let i = last + 1, k = 0; i < words.length; i++, k++) {
    const from = Math.max(e[last], t[last]) + k * STEP;
    t[i] = r3(Math.min(from, Math.max(0, duration - 0.1)));
    e[i] = r3(Math.min(t[i] + STEP * 0.9, duration));
  }
  // never backwards, never beyond the audio
  let prev = 0;
  for (let i = 0; i < words.length; i++) {
    t[i] = r3(clamp(Math.max(t[i], prev), 0, Math.max(0, duration - 0.05)));
    e[i] = r3(Math.max(t[i] + 0.04, Math.min(e[i], t[i] + MAX_WORD)));
    prev = t[i];
  }

  const out = [];
  lines.forEach((text, li) => {
    const own = words.map((w, i) => i).filter((i) => words[i].li === li);
    if (!own.length) return;
    const hearable = own.filter((i) => words[i].n);
    const got = hearable.reduce((s, i) => s + (anchor[i] ? anchor[i].sim : 0), 0);
    const conf = hearable.length ? r3(got / hearable.length) : 0;
    const ws = own.map((i, q) => ({ w: words[i].w, t: t[i], end: r3(Math.min(e[i], own[q + 1] !== undefined ? Math.max(t[own[q + 1]], t[i] + 0.04) : e[i])) }));
    out.push({ text: String(text).trim(), start: ws[0].t, end: ws[ws.length - 1].end, words: ws, conf, flagged: conf < low, matched: hearable.filter((i) => anchor[i]).length });
  });
  // a line ends before the next one starts
  out.forEach((l, i) => {
    const next = out[i + 1];
    if (next && l.end > next.start - 0.05) l.end = r3(Math.max(l.start + 0.2, next.start - 0.05));
    for (const w of l.words) if (w.end > l.end + 0.01) w.end = r3(Math.max(w.t + 0.04, l.end));
  });
  return { lines: out, stats };
}

// ------------------------------------------------------------ the whole run

const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

/**
 * Run the model over `samples` (16 kHz mono) and line the result up with `lyricLines` (strings).
 * `pipe(audio, options)` is the loaded ASR pipeline. `language` is always passed (a model guessing the language
 * from a scream guesses wrong). onProgress(fraction, text). signal: an AbortSignal to cancel between chunks.
 * Resolves { lines, stats, chunks, heard }.
 */
export async function autoSyncLyrics({ samples, sr = SR, lyricLines, pipe, language = 'en', onProgress, signal }) {
  const lines = lyricLines.map((s) => String(s).trim()).filter(Boolean);
  const chunks = chunkAtGaps(samples, sr);
  const heard = [];
  const work = chunks.filter((c) => !c.silent);
  let done = 0;
  for (const c of work) {
    if (signal && signal.aborted) throw abortError();
    onProgress && onProgress(done / Math.max(1, work.length), `Listening… ${done + 1} of ${work.length}`);
    const audio = samples.slice(Math.floor(c.start * sr), Math.ceil(c.end * sr));
    const res = await pipe(audio, { return_timestamps: 'word', language, task: 'transcribe' });
    heard.push(...heardWords(res, c.start));
    done++;
  }
  if (signal && signal.aborted) throw abortError();
  onProgress && onProgress(1, 'Matching the words to your lyrics…');
  const aligned = alignLyrics(lines, heard, { duration: samples.length / sr });
  return { ...aligned, chunks, heard, task: ASR_TASK };
}
