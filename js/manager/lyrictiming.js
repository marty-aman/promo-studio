// A song's lyric timing: the timed lines from the Video Studio's Lyrics tab (tap-sync, LRCLIB, an .lrc file
// or times you set, or Auto-sync's `words` and `conf` (0..1 how sure a line is)), kept on the song so every edit of it starts in time. In seconds of the
// song: song.lyricTiming = { lines: [{ t, end?, text, words?: [{ w, t, end? }], conf? }], offset, source, savedAt, songLength?, lyricsKey? }.
// `end` is left out when the line simply runs to the next one. `lyricsKey` fingerprints the song's plain
// lyrics when the timing was saved, so an edit of the words afterwards can be noticed.
// The music video's sync point (song.files.video.offset) is a separate thing and isn't touched here.
// Pure functions so they can be unit tested.

import { parseLRC, toLRC, sortLyrics, uid } from '../core.js';
import { toSRT } from '../subtitles.js';

export const TIMING_SOURCES = ['tap', 'lrclib', 'file', 'manual', 'auto'];
export const MAX_TIMED_LINES = 600;
export const MAX_WORDS_PER_LINE = 40;
const MAX_TEXT = 300;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * A line's word times from a save or backup, checked: [{ w, t, end? }] in song time (like the line's `t`),
 * at most MAX_WORDS_PER_LINE, sorted, `t` clamped into [0, 36000), `end` kept only when it is after `t` and
 * within 10 s. Anything unusable gives undefined (the line then splits its time by word length).
 */
export function normalizeWords(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((k) => k && typeof k === 'object' && typeof k.w === 'string' && k.w.trim() && fin(k.t))
    .slice(0, MAX_WORDS_PER_LINE)
    .map((k) => {
      const t = Math.max(0, Math.min(35999, k.t));
      const w = { w: k.w.trim().slice(0, 40), t: r3(t) };
      if (fin(k.end) && k.end > t && k.end - t <= 10) w.end = r3(k.end);
      return w;
    })
    .sort((a, b) => a.t - b.t);
  return out.length ? out : undefined;
}

/** The song's plain lyrics, as a short fingerprint (blank lines and spacing ignored). */
export function lyricsKey(text) {
  const s = String(text || '').split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return s ? h.toString(16) : '';
}

/** A saved timing from a save or a backup, checked: bad lines dropped, numbers clamped. null when nothing usable. */
export function normalizeLyricTiming(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) return null;
  const lines = raw.lines
    .filter((l) => l && typeof l === 'object' && fin(l.t) && l.t >= 0 && l.t < 36000 && typeof l.text === 'string' && l.text.trim())
    .slice(0, MAX_TIMED_LINES)
    .map((l) => {
      const out = { t: r2(l.t), text: l.text.trim().slice(0, MAX_TEXT) };
      if (fin(l.end) && l.end > l.t && l.end - l.t <= 60) out.end = r2(l.end);
      const words = normalizeWords(l.words);
      if (words) out.words = words;
      if (fin(l.conf)) out.conf = r2(Math.max(0, Math.min(1, l.conf)));
      return out;
    })
    .sort((a, b) => a.t - b.t);
  if (!lines.length) return null;
  const out = {
    lines,
    offset: fin(raw.offset) ? Math.max(-600, Math.min(600, r2(raw.offset))) : 0,
    source: TIMING_SOURCES.includes(raw.source) ? raw.source : 'manual',
    savedAt: typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt)) ? raw.savedAt : '',
  };
  if (fin(raw.songLength) && raw.songLength > 0 && raw.songLength < 36000) out.songLength = r2(raw.songLength);
  if (typeof raw.lyricsKey === 'string' && /^[0-9a-f]{1,8}$/.test(raw.lyricsKey)) out.lyricsKey = raw.lyricsKey;
  return out;
}

/** How long a line lasts when it has no `end`: up to the next line (a hair before), at most 7 s; the last 4 s. */
const defaultEnd = (lines, i) => {
  const next = lines[i + 1];
  return next ? Math.min(next.t - 0.1, lines[i].t + 7) : lines[i].t + 4;
};

/**
 * The edit's lyric lines ({ text, start, end } in song time) as a timing to save on the song.
 * null when there are no lines with text.
 */
export function timingFromLyrics(lyrics, { source = 'manual', songLength = 0, lyricsText = '', now = new Date() } = {}) {
  const sorted = sortLyrics((lyrics || []).filter((l) => l && String(l.text || '').trim() && fin(l.start)));
  const lines = sorted.slice(0, MAX_TIMED_LINES).map((l) => ({ t: r2(Math.max(0, l.start)), text: String(l.text).trim().slice(0, MAX_TEXT), end: fin(l.end) ? r2(l.end) : undefined, words: normalizeWords(l.words), conf: fin(l.conf) ? r2(Math.max(0, Math.min(1, l.conf))) : undefined }));
  if (!lines.length) return null;
  lines.forEach((l, i) => {
    if (l.end === undefined || l.end <= l.t || Math.abs(l.end - r2(defaultEnd(lines, i))) < 0.02) delete l.end;
    if (!l.words) delete l.words;
    if (l.conf === undefined) delete l.conf;
  });
  const out = { lines, offset: 0, source: TIMING_SOURCES.includes(source) ? source : 'manual', savedAt: now.toISOString() };
  if (songLength > 0) out.songLength = r2(songLength);
  const key = lyricsKey(lyricsText || lines.map((l) => l.text).join('\n'));
  if (key) out.lyricsKey = key;
  return out;
}

/** A saved timing as the edit's lyric lines ({ id, text, start, end }, song time, offset applied). */
export function lyricsFromTiming(timing, makeId = () => uid('lyr')) {
  const t = normalizeLyricTiming(timing);
  if (!t) return [];
  return t.lines.map((l, i) => {
    const start = Math.max(0, l.t + t.offset);
    const end = Math.max(start + 0.2, (l.end ?? defaultEnd(t.lines, i)) + t.offset);
    const out = { id: makeId(), text: l.text, start: +start.toFixed(3), end: +end.toFixed(3) };
    if (l.words) out.words = l.words.map((k) => ({ w: k.w, t: +(k.t + t.offset).toFixed(3), ...(k.end !== undefined ? { end: +(k.end + t.offset).toFixed(3) } : {}) }));
    if (l.conf !== undefined) out.conf = l.conf;
    return out;
  });
}

const sameWords = (a, b) => (!a && !b) || (!!a && !!b && a.length === b.length && a.every((k, i) => k.w === b[i].w && Math.abs(k.t - b[i].t) < 0.02));

/** Do two timings put the same words at the same times (within 0.02 s)? */
export function sameTiming(a, b) {
  const x = lyricsFromTiming(a, () => '');
  const y = lyricsFromTiming(b, () => '');
  return x.length === y.length && x.length > 0 && x.every((l, i) => l.text === y[i].text && Math.abs(l.start - y[i].start) < 0.02 && Math.abs(l.end - y[i].end) < 0.02 && sameWords(l.words, y[i].words));
}

/** Were the song's plain lyrics edited after the timing was saved? */
export const timingStale = (song) => !!(song && song.lyricTiming && song.lyricTiming.lyricsKey && lyricsKey(song.lyrics) && song.lyricTiming.lyricsKey !== lyricsKey(song.lyrics));

/**
 * What a new edit of this song should start with, best first: nothing for an instrumental, its saved
 * timing, its plain lyrics (2.5 s a line), else nothing (then LRCLIB may be asked). Saved timing always
 * beats a lookup. { kind: 'instrumental' | 'timed' | 'text' | 'none', stale }.
 */
export function songLyricsPlan(song) {
  if (!song) return { kind: 'none', stale: false };
  if (song.instrumental) return { kind: 'instrumental', stale: false };
  if (normalizeLyricTiming(song.lyricTiming)) return { kind: 'timed', stale: timingStale(song) };
  if (String(song.lyrics || '').trim()) return { kind: 'text', stale: false };
  return { kind: 'none', stale: false };
}

/**
 * Put a timing on the song. Lyrics left blank on the song are filled in from the timed lines, so the
 * words stay in one place; otherwise the song's own lyrics are kept and fingerprinted.
 */
export function setSongTiming(song, timing) {
  const t = normalizeLyricTiming(timing);
  if (!t) return null;
  if (!String(song.lyrics || '').trim()) song.lyrics = t.lines.map((l) => l.text).join('\n');
  const key = lyricsKey(song.lyrics);
  if (key) t.lyricsKey = key;
  song.lyricTiming = t;
  return t;
}

/** "Keep this timing": accept the song's edited lyrics as the ones the timing belongs to. */
export function keepTiming(song) {
  if (song && song.lyricTiming) song.lyricTiming.lyricsKey = lyricsKey(song.lyrics) || song.lyricTiming.lyricsKey;
}

/**
 * Re-time with the song's new words: its lyric lines, each keeping the old line's time at the same
 * position, the rest 2.5 s apart after the last one.
 */
export function retimeLines(song, makeId = () => uid('lyr')) {
  const old = lyricsFromTiming(song.lyricTiming, makeId);
  const words = String(song.lyrics || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let at = old.length ? old[old.length - 1].end + 0.1 : 0.5;
  return words.map((text, i) => {
    if (old[i]) return { ...old[i], text };
    const l = { id: makeId(), text, start: +at.toFixed(3), end: +(at + 2.4).toFixed(3) };
    at += 2.5;
    return l;
  });
}

/**
 * Should an edit's timed lyrics be saved on its song by themselves? 'save' when the song has none, or has
 * the one this edit started from; 'same' when nothing changed; 'conflict' when the song holds a different
 * timing (then only "Replace" overwrites it).
 */
export function autoSaveDecision(song, timing, basedOn = '') {
  if (!song || !timing) return 'none';
  const saved = normalizeLyricTiming(song.lyricTiming);
  if (!saved) return 'save';
  if (sameTiming(saved, timing)) return 'same';
  if (basedOn && saved.savedAt === basedOn) return 'save';
  return 'conflict';
}

/**
 * The edit's note that its lyrics are timed (project.lyricsTimed): how they were last timed ('tap',
 * 'lrclib', 'file', 'manual' or 'song' when loaded from the song), the saved timing it started from, and a
 * counter that goes up with each timing change (that's what starts the automatic save).
 */
export const markTimed = (prev, by, basedOn) => ({ by, basedOn: basedOn ?? ((prev && prev.basedOn) || ''), rev: ((prev && prev.rev) || 0) + 1 });
/** The source to save for the edit's note. */
export const timingSourceOf = (lt, saved) => (lt && TIMING_SOURCES.includes(lt.by) ? lt.by : (saved && saved.source) || 'manual');

/** "Timed (24 lines, saved Nov 23)" */
export function timingSummary(timing, locale) {
  const t = normalizeLyricTiming(timing);
  if (!t) return 'Not timed yet';
  const d = t.savedAt ? new Date(t.savedAt) : null;
  const when = d ? d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '';
  return `Timed (${t.lines.length} line${t.lines.length === 1 ? '' : 's'}${when ? `, saved ${when}` : ''})`;
}

export const SOURCE_LABELS = { tap: 'tap-synced', lrclib: 'from LRCLIB', file: 'from an .lrc file', manual: 'set by hand', auto: 'auto-synced' };

/** The timing as an .lrc file. */
export const timingToLRC = (timing, meta = {}) => toLRC(lyricsFromTiming(timing, () => ''), meta);
/** The timing as an .srt file (song time). */
export const timingToSRT = (timing) => toSRT(lyricsFromTiming(timing, () => '').map((l) => ({ start: l.start, end: l.end, text: l.text })));

/** An .lrc file's text as a timing (source 'file'). null when it has no time stamps. */
export function timingFromLRC(text, opts = {}) {
  const lines = parseLRC(text, () => '');
  return lines.length ? timingFromLyrics(lines, { ...opts, source: 'file' }) : null;
}
