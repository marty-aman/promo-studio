// Lyrics for the song in the edit: your own from the Manager's song, or timed lyrics from LRCLIB
// (lrclib.net, a free, open lyrics database with line timings; no key needed). Parsing and matching are
// pure and unit tested; fetching takes `fetchFn`.

export const LRCLIB = 'https://lrclib.net/api';
const key = (t) => String(t || '').toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * A song title from a file name: "03 - Arc Flash - Static Bloom (Final Mix).wav" → { title: 'Static Bloom',
 * artist: 'Arc Flash' }. The artist is only set when the name has "Artist - Title".
 */
export function titleFromFile(name) {
  let s = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ');
  s = s.replace(/\s*[([{](official|final|master|mix|mixed|mastered|demo|radio|edit|clean|explicit|lyric|audio|v\d|version|cover|live|acoustic)[^)\]}]*[)\]}]/gi, '').trim();
  s = s.replace(/^\d{1,3}\s*[-.)]\s*/, '').replace(/\s+(final|master(ed)?|mix|v\d+|bounce|demo)$/i, '').trim();
  const parts = s.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: '', title: s };
}

/** The Manager song for a song file: the one using that file, else the one whose title matches the file name. */
export function findSong(songs, rec) {
  if (!rec) return null;
  const byFile = (songs || []).find((s) => s.audioId === rec.id);
  if (byFile) return byFile;
  const { title } = titleFromFile(rec.name);
  const k = key(title);
  if (!k) return null;
  return (songs || []).find((s) => key(s.title) === k) || (songs || []).find((s) => key(s.title).length >= 4 && key(rec.name).includes(key(s.title))) || null;
}

/** "[00:12.34] line" (several tags per line allowed, word timings dropped) → [{ time, text }] sorted. */
export function parseLRC(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!tags.length) continue;
    const line = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
    for (const t of tags) out.push({ time: +t[1] * 60 + parseFloat(t[2].replace(':', '.')), text: line });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Timed lines to lyric lines: each ends just before the next starts (at most 7 s); blank lines are gaps. */
export function lrcToLines(entries, { makeId = (i) => `lyr${i}` } = {}) {
  const lines = [];
  entries.forEach((e, i) => {
    if (!e.text) return;
    const next = entries.slice(i + 1).find((x) => x.time > e.time);
    const end = next ? Math.min(next.time - 0.1, e.time + 7) : e.time + 4;
    lines.push({ id: makeId(lines.length), text: e.text, start: +e.time.toFixed(3), end: +Math.max(e.time + 0.3, end).toFixed(3) });
  });
  return lines;
}

export const lrclibGetURL = ({ artist, title, album = '', duration = 0 }) => `${LRCLIB}/get?${new URLSearchParams({ artist_name: artist, track_name: title, ...(album ? { album_name: album } : {}), ...(duration ? { duration: String(Math.round(duration)) } : {}) })}`;
export const lrclibSearchURL = ({ artist, title }) => `${LRCLIB}/search?${new URLSearchParams({ track_name: title, ...(artist ? { artist_name: artist } : {}) })}`;

/** The best search result: the same title (and artist when given), closest in length, timed lyrics first. */
export function pickResult(list, { artist = '', title, duration = 0 }) {
  const rows = (Array.isArray(list) ? list : []).filter((r) => r && key(r.trackName || r.name) === key(title) && (!artist || key(r.artistName) === key(artist)) && !r.instrumental);
  const off = (r) => (duration && r.duration ? Math.abs(r.duration - duration) : 0);
  const near = rows.filter((r) => !duration || !r.duration || off(r) <= 8);
  near.sort((a, b) => (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0) || off(a) - off(b));
  return near[0] || null;
}

/**
 * Look the song up on LRCLIB. Returns { lines (timed, or null), plain (text or ''), match: { artist, title,
 * duration }, timed } or null when it isn't there. `duration` (seconds) helps pick the right version.
 */
export async function fetchLyrics({ artist = '', title, duration = 0 }, { fetchFn = fetch } = {}) {
  if (!title) return null;
  const read = async (url) => {
    const r = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`LRCLIB answered ${r.status}.`);
    return r.json();
  };
  let hit = null;
  if (artist) {
    const got = await read(lrclibGetURL({ artist, title, duration }));
    if (got && !got.instrumental && (!duration || !got.duration || Math.abs(got.duration - duration) <= 8)) hit = got;
  }
  if (!hit && artist) hit = pickResult(await read(lrclibSearchURL({ artist, title })), { artist, title, duration });
  // without an artist, a title alone matches other people's songs too: only trust one the same length
  if (!hit && !artist && duration) {
    const r = pickResult(await read(lrclibSearchURL({ title })), { title, duration });
    if (r && r.duration && Math.abs(r.duration - duration) <= 3) hit = r;
  }
  if (!hit) return null;
  const timed = hit.syncedLyrics ? lrcToLines(parseLRC(hit.syncedLyrics)) : null;
  return { lines: timed && timed.length ? timed : null, plain: String(hit.plainLyrics || ''), timed: !!(timed && timed.length), match: { artist: hit.artistName || '', title: hit.trackName || hit.name || title, duration: hit.duration || 0 } };
}
