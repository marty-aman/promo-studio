// A song's files: its stems, its music video and its raw footage. The files themselves live in the
// shared media library (IndexedDB); a song keeps references to them, so removing a file from a song
// never deletes it, and one clip can belong to several songs. Pure functions, unit tested.
import { mid } from './model.js';

export const STEM_ROLES = [
  ['drums', 'Drums'],
  ['bass', 'Bass'],
  ['guitar', 'Guitar'],
  ['vocals', 'Vocals'],
  ['keys', 'Keys / synth'],
  ['other', 'Other'],
];
export const stemRoleLabel = (k) => (STEM_ROLES.find(([v]) => v === k) || STEM_ROLES[5])[1];

/** Guess a stem's part from its file name ("Static Bloom - DRUMS.wav" → drums). */
export function guessStemRole(name) {
  const s = ` ${String(name || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ')} `;
  if (/ (drums?|kit|perc|percussion|kick|snare|overheads?|oh|toms?) /.test(s)) return 'drums';
  if (/ (bass|bs|sub) /.test(s)) return 'bass';
  if (/ (vox|vocals?|voice|vocal|lead vox|bvs?|backing|harmony|screams?) /.test(s)) return 'vocals';
  if (/ (keys?|synth|synths|piano|pad|pads|organ|strings) /.test(s)) return 'keys';
  if (/ (guitars?|gtr|gtrs|gt|rhythm|lead|riff) /.test(s)) return 'guitar';
  return 'other';
}

export const newFiles = () => ({ stems: [], video: null, footage: [] });

/** Fill in what an older or hand-edited save is missing; drop broken entries. */
export function normalizeFiles(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const ok = (x) => x && typeof x === 'object' && typeof x.mediaId === 'string';
  const role = (r) => (STEM_ROLES.some(([k]) => k === r) ? r : 'other');
  return {
    stems: (Array.isArray(f.stems) ? f.stems : []).filter(ok).map((s) => ({ id: typeof s.id === 'string' ? s.id : mid('stem'), mediaId: s.mediaId, role: role(s.role) })),
    video: ok(f.video) ? { mediaId: f.video.mediaId } : null,
    footage: (Array.isArray(f.footage) ? f.footage : []).filter(ok).map((c) => ({ id: typeof c.id === 'string' ? c.id : mid('clip'), mediaId: c.mediaId, note: String(c.note || '') })),
  };
}

/** Add stems (skipping files the song already has). `recs` = [{ id, name }]. Returns how many were added. */
export function addStems(song, recs) {
  song.files ||= newFiles();
  let n = 0;
  for (const r of recs) {
    if (song.files.stems.some((s) => s.mediaId === r.id) || r.id === song.audioId) continue;
    song.files.stems.push({ id: mid('stem'), mediaId: r.id, role: guessStemRole(r.name) });
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
  song.files.video = rec ? { mediaId: rec.id } : null;
  if (rec) song.files.footage = song.files.footage.filter((c) => c.mediaId !== rec.id);
}

/** How many files a song has: { stems, video, footage, total }. */
export function fileCounts(song) {
  const f = song.files || newFiles();
  const video = f.video ? 1 : 0;
  return { stems: f.stems.length, video, footage: f.footage.length, total: f.stems.length + video + f.footage.length };
}

/** Every media id a song points at (song file, stems, video, footage), without repeats. */
export function songMediaIds(song) {
  const f = song.files || newFiles();
  return [...new Set([song.audioId, ...f.stems.map((s) => s.mediaId), f.video?.mediaId, ...f.footage.map((c) => c.mediaId)].filter(Boolean))];
}

/**
 * What the Video Studio can pull in from the songs: songs with a music video or footage, newest
 * release first. `info(id)` gives { id, name, kind, duration, thumb } or null for a missing file.
 */
export function studioSongFiles(songs, info) {
  return songs
    .map((s) => {
      const f = s.files || newFiles();
      const video = f.video && info(f.video.mediaId);
      const footage = f.footage.map((c) => info(c.mediaId) && { ...info(c.mediaId), note: c.note }).filter(Boolean);
      const stems = f.stems.map((st) => info(st.mediaId) && { ...info(st.mediaId), role: st.role }).filter(Boolean);
      return { id: s.id, title: s.title, releaseDate: s.releaseDate || '', video: video || null, footage, stems };
    })
    .filter((s) => s.video || s.footage.length || s.stems.length)
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '') || a.title.localeCompare(b.title));
}
