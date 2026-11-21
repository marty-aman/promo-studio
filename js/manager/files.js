// A song's files: its Guitar Pro tabs, its stems, its music video and its raw footage. The files themselves live in the
// shared media library (IndexedDB); a song keeps references to them, so removing a file from a song
// never deletes it, and one clip can belong to several songs. Pure functions, unit tested.
import { mid } from './model.js';

/** Stem parts, in the order they're grouped (the usual mix-sheet order). */
export const STEM_ROLES = [
  ['drums', 'Drums'],
  ['perc', 'Percussion'],
  ['bass', 'Bass'],
  ['guitar', 'Guitar'],
  ['keys', 'Keys / synth'],
  ['vocals', 'Lead vocals'],
  ['bvs', 'Backing vocals'],
  ['fx', 'FX / samples'],
  ['click', 'Click / guide'],
  ['other', 'Other'],
];
export const stemRoleLabel = (k) => (STEM_ROLES.find(([v]) => v === k) || STEM_ROLES[STEM_ROLES.length - 1])[1];

/** A stem's name: the one you gave it, else its file name without the extension. */
export const stemName = (stem, fileName = '') => (stem && stem.name && stem.name.trim()) || String(fileName || '').replace(/\.[a-z0-9]+$/i, '') || 'Stem';

/**
 * Stems grouped by part, in STEM_ROLES order, keeping each group's own order:
 * [{ role, label, stems: [...] }] (empty groups left out).
 */
export function groupStems(stems) {
  return STEM_ROLES.map(([role, label]) => ({ role, label, stems: (stems || []).filter((s) => s.role === role) })).filter((g) => g.stems.length);
}

/** Move a stem up or down within its part's group. Returns true when it moved. */
export function moveStem(song, id, dir) {
  const list = song.files.stems;
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  const role = list[i].role;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].role !== role) j += dir;
  if (j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  return true;
}

/** The music video's progress, from the idea to out. */
export const VIDEO_STATUSES = [['idea', 'Idea'], ['planned', 'Planned'], ['shot', 'Shot'], ['editing', 'Editing'], ['done', 'Complete'], ['released', 'Released']];
export const videoStatusLabel = (k) => (VIDEO_STATUSES.find(([v]) => v === k) || ['', 'Not started'])[1];
/** Done means complete or out. */
export const videoDone = (song) => ['done', 'released'].includes(song && song.videoStatus);

/** Guess a stem's part from its file name ("Static Bloom - DRUMS.wav" → drums). */
export function guessStemRole(name) {
  const s = ` ${String(name || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ')} `;
  if (/ (click|guide|metronome|cue|count ?in) /.test(s)) return 'click';
  if (/ (perc|percussion|shaker|tamb|tambourine|claps?|congas?|bongos?) /.test(s)) return 'perc';
  if (/ (drums?|kit|kick|snare|overheads?|oh|toms?|rooms?) /.test(s)) return 'drums';
  if (/ (bass|bs|sub) /.test(s)) return 'bass';
  if (/ (bvs?|backing|backings|harmony|harmonies|bgv|choir|gang) /.test(s)) return 'bvs';
  if (/ (vox|vocals?|voice|lead vox|screams?|lead vocal) /.test(s)) return 'vocals';
  if (/ (fx|sfx|samples?|risers?|impacts?|ambience|amb|noise) /.test(s)) return 'fx';
  if (/ (keys?|synth|synths|piano|pad|pads|organ|strings) /.test(s)) return 'keys';
  if (/ (guitars?|gtr|gtrs|gt|rhythm|lead|riff) /.test(s)) return 'guitar';
  return 'other';
}

export const newFiles = () => ({ tabs: [], stems: [], video: null, footage: [] });

/** Fill in what an older or hand-edited save is missing; drop broken entries. */
export function normalizeFiles(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const ok = (x) => x && typeof x === 'object' && typeof x.mediaId === 'string';
  const role = (r) => (STEM_ROLES.some(([k]) => k === r) ? r : 'other');
  return {
    tabs: (Array.isArray(f.tabs) ? f.tabs : []).filter(ok).map((t) => ({ id: typeof t.id === 'string' ? t.id : mid('tab'), mediaId: t.mediaId })),
    stems: (Array.isArray(f.stems) ? f.stems : []).filter(ok).map((s) => ({ id: typeof s.id === 'string' ? s.id : mid('stem'), mediaId: s.mediaId, role: role(s.role), name: typeof s.name === 'string' ? s.name.slice(0, 80) : '' })),
    // offset: where the song's 0:00 is in the music video (seconds), for cutting song sections out of it
    video: ok(f.video) ? { mediaId: f.video.mediaId, offset: Number.isFinite(+f.video.offset) ? +f.video.offset : 0 } : null,
    footage: (Array.isArray(f.footage) ? f.footage : []).filter(ok).map((c) => ({ id: typeof c.id === 'string' ? c.id : mid('clip'), mediaId: c.mediaId, note: String(c.note || '') })),
  };
}

/** Add stems (skipping files the song already has). `recs` = [{ id, name }]. Returns how many were added. */
export function addStems(song, recs) {
  song.files ||= newFiles();
  let n = 0;
  for (const r of recs) {
    if (song.files.stems.some((s) => s.mediaId === r.id) || r.id === song.audioId) continue;
    song.files.stems.push({ id: mid('stem'), mediaId: r.id, role: guessStemRole(r.name), name: '' });
    n++;
  }
  return n;
}
/** Add Guitar Pro / MusicXML files (skipping repeats). Returns how many were added. */
export function addTabs(song, recs) {
  song.files ||= newFiles();
  song.files.tabs ||= [];
  let n = 0;
  for (const r of recs) {
    if (song.files.tabs.some((t) => t.mediaId === r.id)) continue;
    song.files.tabs.push({ id: mid('tab'), mediaId: r.id });
    n++;
  }
  return n;
}
export function addFootage(song, recs) {
  song.files ||= newFiles();
  let n = 0;
  for (const r of recs) {
    if (song.files.footage.some((c) => c.mediaId === r.id) || song.files.video?.mediaId === r.id) continue;
    song.files.footage.push({ id: mid('clip'), mediaId: r.id, note: '' });
    n++;
  }
  return n;
}
export function setVideo(song, rec) {
  song.files ||= newFiles();
  song.files.video = rec ? { mediaId: rec.id, offset: 0 } : null;
  if (rec) song.files.footage = song.files.footage.filter((c) => c.mediaId !== rec.id);
}

/** How many files a song has: { stems, video, footage, total }. */
export function fileCounts(song) {
  const f = { ...newFiles(), ...(song.files || {}) };
  const video = f.video ? 1 : 0;
  return { tabs: f.tabs.length, stems: f.stems.length, video, footage: f.footage.length, total: f.tabs.length + f.stems.length + video + f.footage.length };
}

/** Every media id a song points at (song file, stems, video, footage), without repeats. */
export function songMediaIds(song) {
  const f = { ...newFiles(), ...(song.files || {}) };
  return [...new Set([song.audioId, ...f.tabs.map((t) => t.mediaId), ...f.stems.map((s) => s.mediaId), f.video?.mediaId, ...f.footage.map((c) => c.mediaId)].filter(Boolean))];
}

/**
 * What the Video Studio can pull in from the songs: songs with a music video or footage, newest
 * release first. `info(id)` gives { id, name, kind, duration, thumb } or null for a missing file.
 */
export function studioSongFiles(songs, info) {
  return songs
    .map((s) => {
      const f = { ...newFiles(), ...(s.files || {}) };
      const video = f.video && info(f.video.mediaId);
      const tabs = f.tabs.map((t) => info(t.mediaId)).filter(Boolean);
      const footage = f.footage.map((c) => info(c.mediaId) && { ...info(c.mediaId), note: c.note }).filter(Boolean);
      const stems = groupStems(f.stems).flatMap((g) => g.stems).map((st) => info(st.mediaId) && { ...info(st.mediaId), role: st.role, label: stemName(st, info(st.mediaId).name) }).filter(Boolean);
      return { id: s.id, title: s.title, releaseDate: s.releaseDate || '', video: video || null, footage, stems, tabs };
    })
    .filter((s) => s.video || s.footage.length || s.stems.length || s.tabs.length)
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '') || a.title.localeCompare(b.title));
}

/**
 * What the Video Studio offers for the song in the edit: your songs that have a song file, and the
 * current song (the edit's Manager song, else the one using the edit's song file) with its stems (grouped
 * by part, drums first) and Guitar Pro tabs. `info(id)` is the media record or null (only files still in
 * the library are listed); `findSong(songs, rec)` matches a song file to a song by file or title.
 * Returns { song, songs: [{ id, title, mediaId }], stems: [{ mediaId, role, label }], tabs: [mediaId] }.
 */
export function studioSongContext(m, { songId = '', audioId = '', info = () => null, findSong = () => null } = {}) {
  const all = (m && m.songs) || [];
  const rec = audioId ? info(audioId) : null;
  const song = (songId && all.find((s) => s.id === songId)) || (rec && findSong(all, rec)) || null;
  const songs = all.filter((s) => s.audioId && info(s.audioId)).map((s) => ({ id: s.id, title: s.title, mediaId: s.audioId }));
  const f = song && song.files ? song.files : null;
  const stems = f
    ? groupStems(f.stems).flatMap((g) => g.stems).filter((st) => info(st.mediaId)).map((st) => ({ mediaId: st.mediaId, role: st.role, label: `${stemRoleLabel(st.role)}: ${stemName(st, info(st.mediaId).name)}` }))
    : [];
  const tabs = f ? (f.tabs || []).map((t) => t.mediaId).filter((id) => info(id)) : [];
  return { song, songs, stems, tabs };
}
