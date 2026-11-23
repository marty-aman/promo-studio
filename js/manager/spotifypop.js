// Spotify popularity, typed in by hand. Spotify's Web API stopped returning `popularity` to
// Development Mode apps in February 2026, so the app cannot read it; you look it up elsewhere
// (SubmitHub, Chartmetric, an artist tool) and type it here. Kept on the song as
// `song.spotifyPop`: [{ id, date: 'YYYY-MM-DD', score: 0–100 }], oldest first, one per date.
// Pure logic, unit tested without a page.
import { SONG_EXTRAS } from './songnorm.js';
import { mid, parseDate, isoDate, daysBetween } from './model.js';

/** After this many days the latest score counts as old and the page asks you to check again. */
export const SPOTIFY_STALE_DAYS = 14;
const MAX_ENTRIES = 500;

/** A real calendar date in 'YYYY-MM-DD' (2026-02-30 is not). */
export const realDate = (s) => {
  const d = parseDate(s);
  return !!d && isoDate(d) === s;
};

/** A score as a whole number 0–100, or null when it isn't one ('' , 101, 4.5, 'abc'). */
export function cleanScore(v) {
  const s = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = +s;
  return n <= 100 ? n : null;
}

/** Why an entry can't be saved, or '' when it can. A date after `today` is refused too. */
export function entryError(score, date, today = '') {
  if (cleanScore(score) === null) return 'The score is a whole number from 0 to 100.';
  if (!realDate(date)) return 'Pick the date you checked it.';
  if (today && date > today) return 'That date is in the future.';
  return '';
}

/** The list from a save, checked: bad entries dropped, one per date (the later one wins), oldest first. */
export function normalizeSpotifyPop(raw) {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map();
  for (const e of raw) {
    if (!e || typeof e !== 'object' || !realDate(e.date)) continue;
    const score = cleanScore(e.score);
    if (score === null) continue;
    byDate.set(e.date, { id: typeof e.id === 'string' && e.id ? e.id : mid('sp'), date: e.date, score });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_ENTRIES);
}

SONG_EXTRAS.push((s) => ({ ...s, spotifyPop: normalizeSpotifyPop(s.spotifyPop) }));

/**
 * Add a score (or replace the one on the same date). Returns '' or the error, and changes nothing on an error.
 * Works on a song made this session that has no list yet.
 */
export function addScore(song, score, date, today = '') {
  const err = entryError(score, date, today);
  if (err) return err;
  const list = normalizeSpotifyPop(song.spotifyPop).filter((e) => e.date !== date);
  list.push({ id: mid('sp'), date, score: cleanScore(score) });
  song.spotifyPop = normalizeSpotifyPop(list);
  return '';
}

/** Change one entry's score and/or date. Returns '' or the error; a date taken by another entry is refused. */
export function editScore(song, id, { score, date } = {}, today = '') {
  const list = normalizeSpotifyPop(song.spotifyPop);
  const e = list.find((x) => x.id === id);
  if (!e) return 'That entry is gone.';
  const next = { score: score === undefined ? e.score : score, date: date === undefined ? e.date : date };
  const err = entryError(next.score, next.date, today);
  if (err) return err;
  if (list.some((x) => x.id !== id && x.date === next.date)) return 'There is already a score for that date.';
  e.score = cleanScore(next.score);
  e.date = next.date;
  song.spotifyPop = normalizeSpotifyPop(list);
  return '';
}

export function deleteScore(song, id) {
  song.spotifyPop = normalizeSpotifyPop(song.spotifyPop).filter((e) => e.id !== id);
}

/**
 * What the pages show: { latest, previous, change, days, stale, points } where `change` is latest − previous
 * (null with one entry), `days` how long ago the latest was checked and `stale` whether that's over 14 days.
 * With no entries `latest` is null.
 */
export function scoreSummary(song, today) {
  const points = normalizeSpotifyPop(song && song.spotifyPop);
  const latest = points[points.length - 1] || null;
  const previous = points[points.length - 2] || null;
  const days = latest && today ? daysBetween(latest.date, today) : null;
  return { latest, previous, change: latest && previous ? latest.score - previous.score : null, days, stale: days !== null && days > SPOTIFY_STALE_DAYS, points };
}

/** "checked today", "checked yesterday", "checked 20 days ago". */
export const checkedLabel = (days) => (days === null ? '' : days <= 0 ? 'checked today' : days === 1 ? 'checked yesterday' : `checked ${days} days ago`);

/** "+3", "−2" (a real minus) or "no change"; '' with nothing to compare. */
export const changeLabel = (c) => (c === null ? '' : c > 0 ? `+${c}` : c < 0 ? `−${-c}` : 'no change');

/** The score range a trend is drawn over: the scores' own range, at least 10 points wide, inside 0–100. */
export function trendRange(points) {
  const v = points.map((p) => p.score);
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, Math.min(90, mid - 5));
    hi = lo + 10;
  }
  return [lo, hi];
}

/**
 * The SVG path of a trend line over the scores, scaled to their range (trendRange) and spaced by date
 * (so a gap of weeks looks like one). '' with fewer than 2 points.
 */
export function trendPath(points, w = 90, hh = 24) {
  if (!points || points.length < 2) return '';
  const t0 = parseDate(points[0].date).getTime();
  const span = parseDate(points[points.length - 1].date).getTime() - t0 || 1;
  const [lo, hi] = trendRange(points);
  return points
    .map((p, i) => {
      const x = ((parseDate(p.date).getTime() - t0) / span) * w;
      const y = hh - 1 - ((p.score - lo) / (hi - lo)) * (hh - 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
