// Cover songs the band plays live: not releases, so they're not on the Songs & releases list as songs,
// but they have a length so setlists can time them. Each artist keeps its own list. Pure, unit tested.
import { mid } from './model.js';
import { parseTime, fmtTime } from './releases.js';

const key = (t) => String(t || '').toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

/** { id, title, artist (who wrote or recorded it), length ("3:45"), key, notes } */
export const newCover = (title = 'New cover', length = '') => ({ id: mid('cover'), title, artist: '', length, key: '', notes: '' });

/** A typed length tidied to m:ss, or kept as typed when it isn't a time (so the page can say so). */
export const tidyLength = (v) => {
  const s = String(v || '').trim();
  const t = parseTime(s);
  return t ? fmtTime(t) : s;
};

export function normalizeCovers(raw) {
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return (Array.isArray(raw) ? raw : [])
    .filter((c) => c && typeof c === 'object' && typeof c.title === 'string' && c.title.trim())
    .map((c) => ({ id: typeof c.id === 'string' ? c.id : mid('cover'), title: c.title.trim().slice(0, 120), artist: str(c.artist, 120), length: str(c.length, 12), key: str(c.key, 40), notes: str(c.notes, 400) }));
}

/** The cover with this title (matched like the setlist matches songs), or null. */
export const findCover = (covers, title) => (covers || []).find((c) => key(c.title) === key(title)) || null;

/**
 * Add a cover from a setlist line (or update its length when it's already a cover).
 * Returns the cover, or null when the title is blank or is one of your own songs.
 */
export function addCover(m, title, length = '', { artist = '' } = {}) {
  const t = String(title || '').trim();
  if (!t || (m.songs || []).some((s) => key(s.title) === key(t))) return null;
  m.covers ||= [];
  const have = findCover(m.covers, t);
  if (have) {
    if (length) have.length = tidyLength(length);
    if (artist && !have.artist) have.artist = artist;
    return have;
  }
  const c = { ...newCover(t, tidyLength(length)), artist };
  m.covers.push(c);
  return c;
}

/** What a setlist can be timed from: your songs, then your covers (marked `cover`). */
export const setlistSongs = (m) => [...(m.songs || []), ...(m.covers || []).map((c) => ({ id: c.id, title: c.title, length: c.length, audioId: null, cover: true, artist: c.artist, key: c.key || '' }))];
