// Tempo for the effects that follow the beat (pulse, shake, flash, strobe, beat cuts, drum and game beat lines...).
//
// The project's tempo is `project.beats` = { bpm, period, beats: [song seconds], first?, source? }:
//   - no `source`: found by Audio → Detect BPM ("detected")
//   - source 'song': typed on the song's page in Songs & releases ("from song")
//   - source 'set': set by you (number box, Tap tempo, ×2, ÷2)
// With no beats at all, effects run on the old 120 BPM grid ("default").
// One effect can carry its own `tempo` = { bpm, first } (a clip, the Look, a layer) that wins over the project's.
// Pure functions only, so they are unit tested.

export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const DEFAULT_BPM = 120;

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A usable BPM: a number from 20 to 300 (decimals allowed, rounded to 0.01). Junk gives `fallback`. */
export function clampBpm(v, fallback = DEFAULT_BPM) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : +v;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(Math.max(MIN_BPM, Math.min(MAX_BPM, n)) * 100) / 100;
}

export const doubleBpm = (bpm) => clampBpm(bpm * 2);
export const halfBpm = (bpm) => clampBpm(bpm / 2);

/** Gaps longer than this start a new tap session. */
export const TAP_RESET_MS = 2500;
const TAP_KEEP = 8;

/**
 * Tap tempo. `taps` = times of the taps in ms (oldest first). Only the taps since the last long pause count
 * (the last 8 at most); the BPM is 60000 / the average gap, rounded to 0.1. null until there are two taps.
 */
export function tapTempo(taps) {
  const list = [];
  for (const t of taps) {
    if (list.length && t - list[list.length - 1] > TAP_RESET_MS) list.length = 0;
    list.push(t);
  }
  const used = list.slice(-TAP_KEEP);
  if (used.length < 2) return null;
  const avg = (used[used.length - 1] - used[0]) / (used.length - 1);
  if (!(avg > 0)) return null;
  return clampBpm(r1(60000 / avg));
}

/** Seconds from the origin `first` to each beat: every 60/bpm seconds, folded back so the grid starts in [0, period). */
export function beatTimes(bpm, first = 0, length = 0) {
  const period = 60 / clampBpm(bpm);
  const f = Number.isFinite(+first) ? +first : 0;
  const start = f - Math.floor(f / period + 1e-9) * period;
  const out = [];
  for (let k = 0; start + k * period < length + 1e-9; k++) out.push(r3(start + k * period));
  return out;
}

/** Time of beat number `n` (0 = the first beat at `first`) at `bpm`. */
export const beatTime = (bpm, first, n) => (+first || 0) + (n * 60) / clampBpm(bpm);

/** A beat grid in the shape of detectBeats' result, plus `first` (where you put the first beat) and `source`. */
export function gridFromBpm(bpm, first, length, source = 'set') {
  const b = clampBpm(bpm);
  const f = r3(Math.max(0, +first || 0));
  return { bpm: b, period: 60 / b, beats: beatTimes(b, f, length), first: f, source };
}

/** Where the first beat of a grid is: the origin you set, else the first detected beat, else 0. */
export const gridFirst = (g) => (g && Number.isFinite(g.first) ? g.first : g && g.beats && g.beats.length ? g.beats[0] : 0);

/** How far the grid has to reach: the song's length (when known) or the edit's length plus where the song starts. */
export function gridLength(project, songSeconds = 0) {
  const need = (project.duration || 0) + ((project.song && project.song.offset) || 0) + 5;
  return Math.max(songSeconds || 0, need);
}

/** The song's saved BPM (Songs & releases → the song → BPM) as a usable number, or 0. */
export function songBpmOf(song) {
  const n = song ? parseFloat(String(song.bpm || '').replace(',', '.')) : 0;
  return Number.isFinite(n) && n >= MIN_BPM && n <= MAX_BPM ? n : 0;
}

/** Which of "song" | "set" | "detected" | "default" the project's tempo is. */
export function tempoSource(beats) {
  if (!beats) return 'default';
  return beats.source === 'song' || beats.source === 'set' ? beats.source : 'detected';
}

export const SOURCE_LABEL = { file: 'from the file', song: 'from song', set: 'set by you', detected: 'detected', default: 'default', effect: 'set for this effect' };

const cache = new Map();
/**
 * The beat grid `host` (a clip, the look or a layer) follows: its own `tempo` when it has one, else the
 * project's `beats` (which can be null). Own grids are cached by value, so a frame never rebuilds one.
 */
export function gridOf(project, host) {
  const t = host && host.tempo;
  if (!t || !(t.bpm > 0)) return project.beats || null;
  const len = Math.ceil(gridLength(project));
  const key = `${clampBpm(t.bpm)}|${+t.first || 0}|${len}`;
  let g = cache.get(key);
  if (!g) {
    if (cache.size > 40) cache.clear();
    g = gridFromBpm(t.bpm, t.first, len, 'effect');
    cache.set(key, g);
  }
  return g;
}

/** Beat times in song seconds for `host`, for beatEnvelope (undefined when it has none: the 120 BPM default). */
export const beatsOf = (project, host) => {
  const g = gridOf(project, host);
  return g ? g.beats : undefined;
};
