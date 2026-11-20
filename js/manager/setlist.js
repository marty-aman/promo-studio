// Setlist lengths: how long each song is and how long the set runs. A song's length is what you
// typed on its Overview ("3:45"), else the length of its song file. A setlist line can also carry
// its own length ("Static Bloom 3:40", "Talk / tune - 1:00") for a cover, a jam or a break.
import { parseTime, fmtTime } from './releases.js';

const key = (t) => String(t || '').toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

/** A song's length in seconds (0 when unknown). `durationOf(mediaId)` gives a file's length. */
export function songSeconds(song, durationOf = () => 0) {
  const typed = parseTime(song && song.length);
  if (typed) return typed;
  const d = song && song.audioId ? durationOf(song.audioId) : 0;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}

/** "Static Bloom 3:40" → { title: 'Static Bloom', seconds: 220 }; a line without a time keeps seconds null. */
export function splitLine(line) {
  const m = /^(.*?)[\s\-–—·|,]*\(?\[?(\d{1,2}:\d{2})\]?\)?\s*$/.exec(String(line).trim());
  if (m && m[1].trim()) return { title: m[1].trim(), seconds: parseTime(m[2]) };
  return { title: String(line).trim(), seconds: null };
}

/**
 * The setlist with times: each line's song (matched by title), its length, where it starts in
 * the set, and the totals. `gap` seconds are added between songs (count-ins, tuning, talking).
 */
export function setlistTimes(text, songs = [], durationOf = () => 0, { gap = 0 } = {}) {
  const lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  let at = 0;
  const rows = lines.map((line, i) => {
    const { title, seconds } = splitLine(line);
    const song = songs.find((s) => key(s.title) === key(title)) || null;
    const sec = seconds != null ? seconds : song ? songSeconds(song, durationOf) : 0;
    const row = { n: i + 1, line, title, song, seconds: sec, from: at, typed: seconds != null };
    at += sec + (i < lines.length - 1 ? gap : 0);
    return row;
  });
  const music = rows.reduce((a, r) => a + r.seconds, 0);
  return { rows, total: at, music, gaps: Math.max(0, rows.length - 1) * gap, missing: rows.filter((r) => !r.seconds).length, text: fmtTime(at) };
}

export { fmtTime };
