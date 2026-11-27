// The lyric animations added in wave 1 (key-word emphasis, flash hit, wipe reveal, tracking, ghost echo, duet side),
// wave 2 (per-letter stagger, build then hold, cut-paper strips, the horizontal ticker) and the load-time cleaner for
// animation ids (the scatter and ash exits are in exits.js). Pure functions only (the renderer draws with them), so they are
// unit tested. Everything here is off unless a line or the lyric style asks for it, so old projects draw as before.
// These run in the One line at a time display only (the sheet, poster and tunnel displays draw their own way).
import { EXITS } from './exits.js';
import { noise } from './core.js';

/** Every entrance id the text animations know (renderer.js TEXT_ANIMATIONS; a test keeps the two the same). */
export const ENTRANCE_IDS = ['pop', 'fade', 'slide', 'rise', 'bounce', 'zoom', 'blur', 'spin', 'flip', 'typewriter', 'karaoke', 'words', 'wave', 'neon', 'glitch', 'beat', 'wipe', 'tracking', 'letters', 'buildhold', 'paper', 'none'];

/** Flash hit: when a line flashes white (or inverted) for 3 frames. Saved as style.hit. */
export const HITS = [
  ['', 'Off'],
  ['line', 'On each line start'],
  ['beat', 'On every beat'],
  ['div', 'On the pulse (Pulse every)'],
];
/** Ghost echo: a faint copy of the line. Saved as style.echo. */
export const ECHOES = [
  ['', 'Off'],
  ['behind', 'Bigger copy behind'],
  ['trail', 'Trailing copy'],
];
/** Duet side: where a line sits, so two voices can face each other. Saved as style.side. */
export const SIDES = [
  ['center', 'Centre'],
  ['left', 'Left'],
  ['right', 'Right'],
];
export const WIPE_DIRS = ['Left to right', 'Right to left', 'Top to bottom', 'Centre out'];
export const TRACK_DIRS = ['Wide to tight', 'Tight to wide'];
export const FLASH_LOOKS = ['White', 'Inverted'];

const FLASH_FRAMES = 3; // at 30 frames a second: 0.1 s, the same at any preview or export frame rate
const ids = (list) => list.map(([v]) => v);

/**
 * How strong the flash is at this moment, 0 (none) to amt.
 * life: seconds into the line. beatE: the lyric beat envelope with every beat (decay 9); divE: with the pulse
 * division (decay divDecay). Both come from lyricBeat (lyricfx.js), so the flash follows the same beat as the pulse.
 */
export function flashLevel(hit, { life, beatE = 0, divE = 0, divDecay = 9, amt = 1 }) {
  if (!hit || !(life >= 0)) return 0;
  let since;
  if (hit === 'line') since = life;
  else if (hit === 'beat') since = beatE > 0 ? -Math.log(beatE) / 9 : Infinity;
  else if (hit === 'div') since = divE > 0 ? -Math.log(divE) / divDecay : Infinity;
  else return 0;
  // the beat may have landed before the line began: only flash on hits inside the line
  if (since > life + 1e-9) return 0;
  return Math.floor(since * 30 + 1e-6) < FLASH_FRAMES ? amt : 0;
}

/**
 * The visible part of a text block during a wipe reveal, in the block's own coordinates.
 * box: { x, y, w, h } (the whole block); dir 0..3 (WIPE_DIRS); p: 0..1 eased progress. null once fully shown.
 */
export function wipeRect(dir, p, box) {
  if (p >= 1) return null;
  const q = Math.max(0, p);
  const { x, y, w, h } = box;
  switch (Math.round(dir)) {
    case 1:
      return { x: x + w * (1 - q), y, w: w * q, h };
    case 2:
      return { x, y, w, h: h * q };
    case 3:
      return { x: x + (w * (1 - q)) / 2, y, w: w * q, h };
    default:
      return { x, y, w: w * q, h };
  }
}

const outCubic = (p) => 1 - (1 - p) ** 3;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Tracking: the letter spacing (px) and the fade (0..1) at `life` seconds into a line of `dur` seconds.
 * dir 0: wide to tight, settling over about the first second. dir 1: tight to wide, opening up over the whole line.
 */
export function trackState(dir, amt, life, dur, px) {
  if (Math.round(dir) === 1) {
    const q = clamp01(life / Math.max(0.3, dur));
    return { sp: px * 0.3 * amt * q, alpha: clamp01(life / 0.25) };
  }
  const T = Math.min(1.4, Math.max(0.4, dur * 0.7));
  const q = clamp01(life / T);
  return { sp: px * 0.5 * amt * (1 - outCubic(q)), alpha: clamp01(life / (T * 0.6)) };
}

/** Letters of a word as the eye sees them (grapheme clusters when the browser can split them). */
let segmenter;
export function graphemes(s) {
  const str = String(s);
  if (segmenter === undefined) segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  return segmenter ? [...segmenter.segment(str)].map((x) => x.segment) : [...str];
}

/**
 * The ghost echo copy: how it sits against the line. kind 'behind' or 'trail'; amt, size, dist are the settings
 * (×1 = the designed look). Returns { scale, dx, dy, lag, alpha } (dx/dy in px, lag in seconds) or null.
 */
export function echoPass(kind, { amt = 1, size = 1, dist = 1 } = {}, px = 10) {
  const alpha = Math.min(0.9, 0.25 * amt);
  if (!(alpha > 0)) return null;
  if (kind === 'behind') return { scale: 1 + 0.25 * size, dx: 0, dy: 0, lag: 0.12 * dist, alpha };
  if (kind === 'trail') return { scale: 1 + 0.06 * size, dx: px * 0.14 * dist, dy: px * 0.08 * dist, lag: 0.08 * dist, alpha };
  return null;
}

/**
 * Where a line sits for its duet side: { cx, align, maxW } in px. side 'left' / 'right' narrows the line to at most
 * 60% of the frame and puts it against that edge; x (a keyframed position, px) wins over the side's place.
 * 'center' (or nothing) returns null: the line sits where the lyric style puts it.
 */
export function sidePlacement(side, W, maxW, x = null) {
  if (side !== 'left' && side !== 'right') return null;
  const w = Math.min(maxW, W * 0.6);
  const margin = W * 0.05;
  const cx = x != null ? x : side === 'left' ? margin + w / 2 : W - margin - w / 2;
  return { cx, align: side, maxW: w };
}

// ---- key-word emphasis: line.emph = { words: [{ i, w }], size?, color?, slam? }

const plain = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const lineWords = (text) => String(text || '').split(/\s+/).filter(Boolean);
export const EMPH_SIZE = 1.35;

/** Did the words change since the key words were picked? (like word timing, the pick then no longer counts) */
export function emphStale(line) {
  const e = line && line.emph;
  if (!e || !Array.isArray(e.words) || !e.words.length) return false;
  const words = lineWords(line.text);
  return e.words.some((k) => plain(words[k.i]) !== plain(k.w) || !plain(k.w));
}

/** The picked word indexes that still fit the line, as a Set, or null when there are none (or they are stale). */
export function emphIndexes(line) {
  const e = line && line.emph;
  if (!e || !Array.isArray(e.words) || !e.words.length || emphStale(line)) return null;
  return new Set(e.words.map((k) => k.i));
}

/** The emphasis after tapping word `i`: picked words toggle; a stale pick starts again from this word. */
export function toggleEmph(line, i) {
  const words = lineWords(line.text);
  if (!(i >= 0 && i < words.length)) return line.emph;
  const e = line.emph || {};
  const cur = emphStale(line) ? [] : (e.words || []).slice();
  const at = cur.findIndex((k) => k.i === i);
  if (at >= 0) cur.splice(at, 1);
  else cur.push({ i, w: words[i] });
  cur.sort((a, b) => a.i - b.i);
  const next = { ...e, words: cur };
  return cur.length || next.size || next.color || next.slam ? next : undefined;
}

/** What the renderer needs for emphasis: { set, size, color, slam } or null. */
export function emphOf(line, fallbackColor) {
  const set = emphIndexes(line);
  if (!set) return null;
  const e = line.emph;
  return { set, size: typeof e.size === 'number' ? e.size : EMPH_SIZE, color: e.color || fallbackColor, slam: !!e.slam };
}

/** A word's slam: how much bigger it is `since` seconds after it is sung (1 = at rest). */
export const slamScale = (since) => (since >= 0 && since < 0.18 ? 1 + 0.6 * (1 - outCubic(since / 0.18)) : 1);

const HEX = /^#[\da-f]{6}$/i;

/** A clean copy of a saved line.emph, or undefined when nothing usable is left. */
export function cleanEmph(e) {
  if (!e || typeof e !== 'object') return undefined;
  const words = Array.isArray(e.words)
    ? e.words.filter((k) => k && Number.isInteger(k.i) && k.i >= 0 && typeof k.w === 'string' && k.w).map((k) => ({ i: k.i, w: k.w }))
    : [];
  const out = { words };
  if (typeof e.size === 'number' && Number.isFinite(e.size)) out.size = Math.max(1, Math.min(2.5, e.size));
  if (typeof e.color === 'string' && HEX.test(e.color)) out.color = e.color;
  if (e.slam === true) out.slam = true;
  return words.length || out.size || out.color || out.slam ? out : undefined;
}

// ---- wave 2: per-letter stagger (entrance 'letters')

export const LETTER_MODES = ['Rise', 'Drop', 'Fade'];
const LETTER_SECONDS = 0.3; // how long one letter takes to arrive

/** Seconds between one letter and the next: 0.05 s, squeezed so a long line still lands within 0.9 s (×amt). */
export const letterStep = (n, amt = 1) => Math.min(0.05, 0.9 / Math.max(1, n)) * amt;

/**
 * One letter `since` seconds after its own start (negative: not there yet, null). mode 0 rise, 1 drop, 2 fade.
 * Returns { alpha, dy, scale }, dy in ems (multiply by the font size; positive is down).
 */
export function letterPose(mode, since) {
  if (!(since >= 0)) return null;
  const e = outCubic(clamp01(since / LETTER_SECONDS));
  switch (Math.round(mode)) {
    case 1:
      return { alpha: clamp01(since / 0.1), dy: -(1 - e) * 0.8, scale: 1 };
    case 2:
      return { alpha: e, dy: 0, scale: 0.85 + 0.15 * e };
    default:
      return { alpha: clamp01(since / 0.15), dy: (1 - e) * 0.6, scale: 1 };
  }
}

// ---- build then hold (entrance 'buildhold')

/**
 * The key words a Build then hold line draws with: the picked key words (if any) plus the last word, in the
 * "Last word size" and the accent colour. n = how many words the line has. Same shape as emphOf's result.
 */
export function holdEmph(emph, n, size, color) {
  const set = new Set(emph ? emph.set : []);
  if (n > 0) set.add(n - 1);
  return { set, size, color: emph ? emph.color : color, slam: false };
}

/**
 * A word `since` seconds after it is sung (saved word times, else the even spread). Earlier words fade in with a
 * small rise; the last word slams in (slamScale) and then holds. Returns { alpha, dy (ems), slam (scale) }.
 */
export function buildHoldPose(since, last) {
  if (last) return { alpha: clamp01(since / 0.06), dy: 0, slam: slamScale(since) };
  return { alpha: clamp01(since / 0.12), dy: (1 - outCubic(clamp01(since / 0.25))) * 0.22, slam: 1 };
}

// ---- cut-paper strips (entrance 'paper')

/** Fonts a strip can take when "Mixed fonts" is on (all are in the app's preloaded list). */
export const PAPER_FONTS = ['Bebas Neue', 'Courier New', 'Impact', 'Playfair Display', 'Permanent Marker', 'Roboto Slab'];

/** A number that stays with a word (its text and place in the line), so its tilt, torn edge and font never change. */
export function paperSeed(text, idx) {
  let h = idx * 37;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i) * (i + 1);
  return h;
}
export const paperFont = (seed) => PAPER_FONTS[Math.floor(noise(seed * 0.91 + 4) * PAPER_FONTS.length) % PAPER_FONTS.length];
/** How much lighter or darker this strip's paper is than the base colour (-0.1..0.1). */
export const paperTone = (seed) => (noise(seed * 1.3 + 6) - 0.5) * 0.2;

/**
 * One strip: where it sits and how it moves. seed: paperSeed. tilt, jump: the settings (×1 = as designed).
 * beat: the lyric beat (0..1). since: seconds since this word's strip landed (the words land 0.07 s apart).
 * Returns { rot (radians), dy (ems, up is negative), scale, alpha }. A strip slaps down (from 1.35× and turned) and
 * then jumps a little on each beat, odd and even strips in opposite directions.
 */
export function paperPose({ seed, idx, tilt = 1, jump = 1, beat = 0, since = 1 }) {
  const side = idx % 2 ? 1 : -1;
  const e = outCubic(clamp01(since / 0.18));
  const base = (noise(seed * 0.37 + 1) - 0.5) * 0.2 * tilt;
  return {
    rot: base + side * -0.04 * jump * beat + (1 - e) * 0.3 * side,
    dy: -jump * beat * (0.1 + 0.06 * (idx % 2)),
    scale: 1.35 - 0.35 * e,
    alpha: clamp01(since / 0.06),
  };
}

/** The four corners of a strip of w × h px, each moved a little (a torn, cut edge). Same strip, same corners. */
export function paperCorners(seed, w, h, px) {
  const j = (k) => (noise(seed * 0.73 + k * 5.1) - 0.5) * 0.1 * px;
  return [
    [-w / 2 + j(1), -h / 2 + j(2)],
    [w / 2 + j(3), -h / 2 + j(4)],
    [w / 2 + j(5), h / 2 + j(6)],
    [-w / 2 + j(7), h / 2 + j(8)],
  ];
}

// ---- horizontal ticker (display 'ticker')

/** Width of each line of the band and the gap between lines → where each line begins, and the whole length. */
export function tickerLayout(widths, gap) {
  const cum = [0];
  widths.forEach((w, i) => cum.push(cum[i] + w + gap));
  return { cum, total: cum[cum.length - 1] - gap };
}

/**
 * How far the band has crawled (px) when it has moved k lines. One line per step: line j's left edge is at the right
 * edge of the frame when k = j and has finished entering one step later (the lines are of different lengths, so the
 * crawl speeds up and slows down with them, which is what "one line per bar" means). After the last line it carries on
 * at the last line's pace.
 */
export function tickerOffset(k, widths, gap) {
  const n = widths.length;
  if (!n || !(k > 0)) return 0;
  const { cum } = tickerLayout(widths, gap);
  const j = Math.floor(k);
  if (j >= n) return cum[n] + (k - n) * (widths[n - 1] + gap);
  return cum[j] + (k - j) * (widths[j] + gap);
}

/** The bar (seconds) and the first beat (song time) of a tempo grid; null grid = 120 BPM from 0. */
export function tickerBar(grid) {
  const beats = grid && grid.beats;
  const beat = grid && grid.period > 0 ? grid.period : beats && beats.length > 1 ? beats[1] - beats[0] : 0.5;
  const first = grid && Number.isFinite(grid.first) ? grid.first : beats && beats.length ? beats[0] : 0;
  return { bar: Math.max(0.2, beat * 4), first };
}
/**
 * The ticker's clock for "locked to the tempo": how many lines have crawled at song time ts, one per bar (×speed),
 * counted from the bar at or before the first line. t0 is that bar's time.
 */
export function tickerLines(ts, firstStart, grid, speed = 1) {
  const { bar, first } = tickerBar(grid);
  const t0 = first + Math.floor((firstStart - first) / bar) * bar;
  return { k: ((ts - t0) / bar) * speed, t0 };
}
/** By hand: the crawl in px after `since` seconds, at `speed` (×1 = a quarter of the frame's width a second). */
export const tickerHandOffset = (since, W, speed = 1) => Math.max(0, since) * W * 0.25 * speed;

// ---- load-time cleaner

const ENTRANCES = new Set(ENTRANCE_IDS);
const EXIT_IDS = new Set(['', ...EXITS.map(([v]) => v)]);
const HIT_IDS = new Set(ids(HITS));
const ECHO_IDS = new Set(ids(ECHOES));
const SIDE_IDS = new Set(ids(SIDES));

/** One style (lyric style, a line's look, a text layer): unknown ids become safe ones, unknown new fields go. */
function cleanStyle(st, { lyric = true } = {}) {
  if (!st || typeof st !== 'object') return st;
  let out = st;
  const fix = (k, v) => {
    if (out === st) out = { ...st };
    if (v === undefined) delete out[k];
    else out[k] = v;
  };
  // an entrance this app does not know (a newer app's) draws as a fade, and the Entrance list shows Fade
  if (typeof st.animation === 'string' && !ENTRANCES.has(st.animation)) fix('animation', 'fade');
  else if (st.animation != null && typeof st.animation !== 'string') fix('animation', 'fade');
  if (st.outAnimation != null && !EXIT_IDS.has(st.outAnimation)) fix('outAnimation', '');
  if (lyric) {
    if ('hit' in st && !HIT_IDS.has(st.hit)) fix('hit', undefined);
    if ('echo' in st && !ECHO_IDS.has(st.echo)) fix('echo', undefined);
    if ('side' in st && !SIDE_IDS.has(st.side)) fix('side', undefined);
  }
  return out;
}

/**
 * Saved animation ids made safe on load (normalizeProject): an unknown entrance becomes 'fade', an unknown exit ''
 * (the quick fade), unknown flash/echo/side values are dropped, and a line's key-word pick is cleaned.
 * Returns { lyricStyle, lyrics, texts }; known values pass through untouched (same objects).
 */
export function cleanLyricAnimations({ lyricStyle, lyrics, texts }) {
  const out = { lyricStyle: cleanStyle(lyricStyle) };
  out.lyrics = Array.isArray(lyrics)
    ? lyrics.map((l) => {
        if (!l || typeof l !== 'object') return l;
        let x = l;
        if (l.style && typeof l.style === 'object') {
          const s = cleanStyle(l.style);
          if (s !== l.style) x = { ...x, style: s };
        }
        if ('emph' in l) {
          const e = cleanEmph(l.emph);
          if (x === l) x = { ...l };
          if (e) x.emph = e;
          else delete x.emph;
        }
        return x;
      })
    : lyrics;
  out.texts = Array.isArray(texts) ? texts.map((t) => cleanStyle(t, { lyric: false })) : texts;
  return out;
}
