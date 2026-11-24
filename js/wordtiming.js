// Word timing inside a lyric line: the times each word of a line starts and ends (line.words =
// [{ w, t, end }], song time), as the word-by-word and karaoke looks show them. The editor
// (panel-wordtiming.js) moves them; these pure functions keep them sane:
//  - words stay in order and never overlap, each at least MIN_WORD long
//  - they stay inside the line, give or take SLACK seconds (what savedWordTimes() still accepts)
//  - a line you timed by hand is marked line.wordsBy = 'hand', and the Auto-sync words it had are kept in
//    line.wordsAuto, so "Reset to auto-sync" can bring them back and a later Auto-sync asks before replacing it
// A line without word times (or whose words no longer match its text) starts from the same spread the
// renderer uses when there are none (wordTimings(): longer words get more time).
import { wordTimings, savedWordTimes } from './core.js';

export const MIN_WORD = 0.04;
export const SLACK = 0.45;
const r3 = (v) => Math.round(v * 1000) / 1000;
const plain = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const textWords = (text) => String(text || '').split(/\s+/).filter(Boolean);

/** The window a line's words may sit in: { lo, hi } in song time. */
export const wordWindow = (line) => ({ lo: Math.max(0, line.start - SLACK), hi: line.end + SLACK });

/** The line's words spread over it by length (what plays when a line has no word times). */
export function spreadWords(line) {
  const d = Math.max(0.05, line.end - line.start);
  return wordTimings(line.text).map((x) => ({ w: x.word, t: r3(line.start + x.start * d), end: r3(line.start + x.end * d) }));
}

/** Does the line carry word times that no longer fit its text or its place (edited words, moved line)? */
export const wordsStale = (line) => !!(line && Array.isArray(line.words) && line.words.length && !savedWordTimes(line));

/**
 * The words to edit for a line: its saved times when they fit, else an even spread.
 * { words: [{ w, t, end }], from: 'saved' | 'spread', stale, hand }
 */
export function editableWords(line) {
  const saved = savedWordTimes(line);
  const hand = line.wordsBy === 'hand';
  if (saved) return { words: saved.map((x) => ({ w: x.word, t: r3(x.start), end: r3(x.end) })), from: 'saved', stale: false, hand };
  return { words: spreadWords(line), from: 'spread', stale: wordsStale(line), hand };
}

/** Put the words in order, inside the window, each at least MIN_WORD long and none overlapping. */
export function constrainWords(words, win) {
  const out = words.map((k) => ({ w: k.w, t: +k.t, end: +k.end }));
  const n = out.length;
  if (!n) return out;
  const room = win.hi - win.lo;
  const min = Math.min(MIN_WORD, room / n);
  let at = win.lo;
  for (let i = 0; i < n; i++) {
    const k = out[i];
    const latest = win.hi - min * (n - i); // leave room for the words after it
    k.t = Math.min(Math.max(k.t, at), latest);
    if (!(k.end >= k.t + min)) k.end = k.t + min;
    k.end = Math.min(k.end, win.hi - min * (n - i - 1));
    at = k.end;
  }
  return out.map((k) => ({ w: k.w, t: r3(k.t), end: r3(k.end) }));
}

const joined = (a, b) => a && b && Math.abs(a.end - b.t) < 0.006;

/**
 * Move one edge of word i to `value` ('start' or 'end'). Touching neighbours move with it (the boundary
 * between two words that meet is shared); otherwise it stops at the neighbour.
 */
export function moveEdge(words, i, edge, value, win) {
  const out = words.map((k) => ({ ...k }));
  const k = out[i];
  if (!k) return out;
  const prev = out[i - 1];
  const next = out[i + 1];
  if (edge === 'start') {
    const lo = prev ? (joined(prev, k) ? prev.t + MIN_WORD : prev.end) : win.lo;
    k.t = Math.min(Math.max(value, lo), k.end - MIN_WORD);
    if (prev && joined(prev, words[i])) prev.end = k.t;
  } else {
    const hi = next ? (joined(k, next) ? next.end - MIN_WORD : next.t) : win.hi;
    k.end = Math.max(Math.min(value, hi), k.t + MIN_WORD);
    if (next && joined(words[i], next)) next.t = k.end;
  }
  return constrainWords(out, win);
}

/** Move word i by `delta` seconds, keeping its length; it stops at its neighbours and the window. */
export function moveWord(words, i, delta, win) {
  const out = words.map((k) => ({ ...k }));
  const k = out[i];
  if (!k) return out;
  const lo = i > 0 ? out[i - 1].end : win.lo;
  const hi = i + 1 < out.length ? out[i + 1].t : win.hi;
  const d = Math.min(Math.max(delta, lo - k.t), hi - k.end);
  k.t += d;
  k.end += d;
  return constrainWords(out, win);
}

/**
 * Tap to time: taps[j] is when word j starts; the tap after the last word (if any) ends it. A word's end is
 * the next word's start. Words not tapped keep their times, shifted to follow the last tapped one.
 */
export function applyTaps(words, taps, win) {
  const out = words.map((k) => ({ ...k }));
  const n = out.length;
  taps.slice(0, n).forEach((t, j) => (out[j].t = t));
  for (let j = 0; j < Math.min(n, taps.length); j++) {
    const nextStart = j + 1 < taps.length ? taps[j + 1] : null;
    if (nextStart !== null) out[j].end = nextStart;
    else if (j === n - 1) out[j].end = Math.max(out[j].end, out[j].t + MIN_WORD);
    else out[j].end = Math.max(out[j].t + MIN_WORD, Math.min(out[j].t + (words[j].end - words[j].t), win.hi));
  }
  // words after the last tap keep their lengths, one after another
  for (let j = taps.length; j < n; j++) {
    const len = words[j].end - words[j].t;
    out[j].t = Math.max(out[j].t, out[j - 1] ? out[j - 1].end : win.lo);
    out[j].end = out[j].t + len;
  }
  return constrainWords(out, win);
}

/**
 * Save hand-set word times on a line (mutates it). The words it had from Auto-sync, if any, are kept in
 * wordsAuto the first time, so "Reset to auto-sync" can bring them back.
 */
export function setHandWords(line, words) {
  if (line.wordsBy !== 'hand' && Array.isArray(line.words) && line.words.length && savedWordTimes(line)) line.wordsAuto = line.words.map((k) => ({ ...k }));
  line.words = words.map((k) => ({ w: k.w, t: r3(k.t), end: r3(k.end) }));
  line.wordsBy = 'hand';
  return line;
}

/** "Reset to auto-sync" / "Clear": back to the Auto-sync words if the line had some, else no word times. */
export function clearHandWords(line) {
  if (Array.isArray(line.wordsAuto) && line.wordsAuto.length) line.words = line.wordsAuto;
  else delete line.words;
  delete line.wordsAuto;
  delete line.wordsBy;
  return line;
}

/** Lines with words timed by hand, and lines whose word times are out of date. */
export const handTimedCount = (lines) => (lines || []).filter((l) => l && l.wordsBy === 'hand' && Array.isArray(l.words) && l.words.length).length;
export const staleWordCount = (lines) => (lines || []).filter(wordsStale).length;

/**
 * Auto-sync results over lines that may have hand-set words. `old` and `fresh` are the same lines in the
 * same order (fresh = { start, end, words, conf }). With keepHand, a hand-timed line whose words still match
 * keeps them (Auto-sync's go into wordsAuto, its line times widen to hold them); otherwise Auto-sync wins.
 * Returns the merged line objects (old fields kept).
 */
export function mergeAutoWords(old, fresh, { keepHand = true } = {}) {
  return old.map((l, i) => {
    const f = fresh[i];
    if (!f) return l;
    const next = { ...l, start: f.start, end: f.end, words: f.words, conf: f.conf };
    delete next.wordsBy;
    delete next.wordsAuto;
    if (keepHand && isHandLine(f.text !== undefined ? { ...l, text: f.text } : l)) {
      next.words = l.words;
      next.wordsBy = 'hand';
      if (f.words) next.wordsAuto = f.words;
      next.start = Math.min(f.start, l.words[0].t);
      next.end = Math.max(f.end, l.words[l.words.length - 1].end ?? l.words[l.words.length - 1].t);
    }
    if (next.words === undefined) delete next.words;
    if (next.conf === undefined) delete next.conf;
    return next;
  });
}

/** How many of `old`'s hand-timed lines an Auto-sync result (`fresh`, same order) would replace. */
export const handLinesHit = (old, fresh) => old.filter((l, i) => fresh[i] && isHandLine(fresh[i].text !== undefined ? { ...l, text: fresh[i].text } : l)).length;

/** A line with hand-set words that still match its text. */
export function isHandLine(l) {
  if (!l || l.wordsBy !== 'hand' || !Array.isArray(l.words) || !l.words.length) return false;
  const tw = textWords(l.text);
  return tw.length === l.words.length && tw.every((w, i) => plain(w) === plain(l.words[i].w));
}

/** The word playing at song time `t` (index), or -1. */
export const wordAt = (words, t) => words.findIndex((k) => t >= k.t && t < k.end);
