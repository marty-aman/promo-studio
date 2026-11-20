// Releases (singles, EPs and albums), cover art, and the sections of a song (intro, verse,
// chorus…) with their timestamps. Pure functions, unit tested.
import { mid } from './model.js';

export const RELEASE_TYPES = [['single', 'Single'], ['ep', 'EP'], ['album', 'Album'], ['deluxe', 'Deluxe / reissue'], ['live', 'Live album'], ['comp', 'Compilation']];
export const releaseTypeLabel = (k) => (RELEASE_TYPES.find(([v]) => v === k) || ['', 'Release'])[1];

export const newRelease = (type = 'ep', title = '') => ({ id: mid('rel'), type, title: title || (type === 'album' ? 'New album' : type === 'ep' ? 'New EP' : 'New single'), releaseDate: '', coverId: null, label: '', upc: '', notes: '' });

export function normalizeReleases(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => r && typeof r === 'object' && typeof r.id === 'string')
    .map((r) => ({ ...newRelease(), ...r, type: RELEASE_TYPES.some(([k]) => k === r.type) ? r.type : 'ep', title: String(r.title || 'Untitled'), coverId: typeof r.coverId === 'string' ? r.coverId : null }));
}

/** The songs on a release, in track order (songs without a number go last, by title). */
export function tracklist(songs, releaseId) {
  return songs
    .filter((s) => s.releaseId === releaseId)
    .sort((a, b) => (a.track || 999) - (b.track || 999) || a.title.localeCompare(b.title));
}

/** Number a release's tracks 1, 2, 3… in their current order. */
export function renumber(songs, releaseId) {
  tracklist(songs, releaseId).forEach((s, i) => (s.track = i + 1));
}

/** Put a song on a release as the last track (or take it off with releaseId = ''). */
export function setRelease(m, songId, releaseId) {
  const s = m.songs.find((x) => x.id === songId);
  if (!s) return;
  const from = s.releaseId;
  s.releaseId = releaseId || '';
  s.track = releaseId ? tracklist(m.songs, releaseId).filter((x) => x.id !== songId).length + 1 : 0;
  if (from && from !== releaseId) renumber(m.songs, from);
  if (releaseId) renumber(m.songs, releaseId);
}

/** Move a track up (−1) or down (+1). */
export function moveTrack(m, songId, dir) {
  const s = m.songs.find((x) => x.id === songId);
  if (!s || !s.releaseId) return false;
  const list = tracklist(m.songs, s.releaseId);
  const i = list.findIndex((x) => x.id === songId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => (x.track = k + 1));
  return true;
}

/** Delete a release: its songs stay, as singles. */
export function deleteRelease(m, id) {
  for (const s of m.songs) if (s.releaseId === id) (s.releaseId = ''), (s.track = 0);
  m.releases = (m.releases || []).filter((r) => r.id !== id);
}

/** The cover a song shows: its own, else its EP's or album's. */
export function coverOf(song, releases = []) {
  if (song && song.coverId) return song.coverId;
  const r = song && song.releaseId && releases.find((x) => x.id === song.releaseId);
  return (r && r.coverId) || null;
}

// ---------------------------------------------------------------- song sections
export const SECTION_NAMES = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Post-chorus', 'Hook', 'Bridge', 'Breakdown', 'Solo', 'Drop', 'Interlude', 'Outro'];

/** "1:05", "65", "1:02:03", "0:45.5" → seconds (null when unreadable). */
export function parseTime(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3];
}
/** Seconds → "1:05" (or "1:02:03"). */
export function fmtTime(t) {
  if (t == null || !Number.isFinite(t)) return '';
  const s = Math.round(t);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

export const newSection = (label = 'Verse', start = 0, end = null) => ({ id: mid('sec'), label, start, end });

/**
 * Sections from pasted text, one per line, in any of the usual shapes:
 *   0:00 Intro · Intro 0:00 · 0:42 - Chorus · 0:42-1:10 Chorus · Chorus (0:42 – 1:10) · [1:10] Bridge
 * Unlabelled lines are numbered. Returns [{ label, start, end }] in time order.
 */
export function parseSections(text) {
  const T = '(\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\.\\d+)?)';
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const times = [...line.matchAll(new RegExp(T, 'g'))].map((m) => parseTime(m[1]));
    if (!times.length) continue;
    const label = line.replace(new RegExp(T, 'g'), ' ').replace(/[[\](){}]/g, ' ').replace(/^[\s\-–—:|•·.,]+|[\s\-–—:|•·.,]+$/g, '').replace(/\s*[-–—]\s*$/, '').replace(/\s+/g, ' ').trim();
    out.push({ label: label || `Part ${out.length + 1}`, start: times[0], end: times.length > 1 && times[1] > times[0] ? times[1] : null });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Fill each section's end: its own, else the next section's start, else the song's length. */
export function sectionSpans(sections, duration = 0) {
  const list = [...(sections || [])].filter((s) => Number.isFinite(s.start)).sort((a, b) => a.start - b.start);
  return list.map((s, i) => {
    const next = list[i + 1];
    const end = Number.isFinite(s.end) && s.end > s.start ? s.end : next ? next.start : duration > s.start ? duration : null;
    return { ...s, end, length: end != null ? +(end - s.start).toFixed(2) : null };
  });
}

/** Repeated names get numbers: Verse, Chorus, Verse → Verse 1, Chorus, Verse 2. */
export function numberRepeats(sections) {
  const count = {};
  for (const s of sections) count[s.label] = (count[s.label] || 0) + 1;
  const seen = {};
  return sections.map((s) => {
    if (count[s.label] < 2 || /\d$/.test(s.label)) return s;
    seen[s.label] = (seen[s.label] || 0) + 1;
    return { ...s, label: `${s.label} ${seen[s.label]}` };
  });
}

export function normalizeSections(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((s) => s && typeof s === 'object' && Number.isFinite(+s.start))
    .map((s) => ({ id: typeof s.id === 'string' ? s.id : mid('sec'), label: String(s.label || 'Section').slice(0, 60), start: Math.max(0, +s.start), end: Number.isFinite(+s.end) && s.end !== null && s.end !== '' ? +s.end : null }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Where a section sits on the video edit's timeline, given the edit's song offset (song time at
 * timeline 0): { from, to } in timeline seconds, clipped to the edit, or null when it isn't in it.
 */
export function sectionOnTimeline(sec, songOffset = 0, duration = Infinity) {
  if (sec.end == null) return null;
  const from = sec.start - songOffset;
  const to = sec.end - songOffset;
  if (to <= 0 || from >= duration) return null;
  return { from: Math.max(0, +from.toFixed(3)), to: Math.min(duration, +to.toFixed(3)) };
}

export const sectionSlug = (s, i) => `${String(i + 1).padStart(2, '0')}-${String(s.label || 'section').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'}`;
