// Which audio the word timing editor draws under the word blocks: the song file or one of the song's stems.
// The choice is saved on the song as `waveSource`: 'song', a stem's media id, or '' (not chosen: the default,
// which is the lead vocals stem, else the backing vocals stem, else the song). Pure functions, unit tested.
// Stems are taken to start at the song's 0:00 like the song file (the app keeps no stem offset).
import { groupStems, stemName } from './manager/files.js';

const stemsOf = (song) => (song && song.files && Array.isArray(song.files.stems) ? song.files.stems : []);

/** What a saved song carries: a string up to 80 characters, else '' (older saves: the default). */
export const normalizeWaveSource = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');

/** The default source: the first lead vocals stem (in the Files tab's order), else backing vocals, else 'song'. */
export function defaultWaveSource(song) {
  const groups = groupStems(stemsOf(song));
  for (const role of ['vocals', 'bvs']) {
    const g = groups.find((x) => x.role === role);
    if (g) return g.stems[0].mediaId;
  }
  return 'song';
}

/** The source to draw: the saved one when it is still the song or one of the song's stems, else the default. */
export function chosenWaveSource(song) {
  const v = normalizeWaveSource(song && song.waveSource);
  if (v === 'song' || (v && stemsOf(song).some((s) => s.mediaId === v))) return v;
  return defaultWaveSource(song);
}

/**
 * The choices for the "Waveform" select, grouped like the Files tab:
 * [{ label: '', options: [{ value: 'song', label: 'Song' }] }, { label: 'Lead vocals', options: [{ value: mediaId, label: name }] }, …].
 * `info(id)` is the media record or null (a missing file is still listed, so the note can say it is missing).
 */
export function waveChoices(song, info = () => null) {
  return [
    { label: '', options: [{ value: 'song', label: 'Song' }] },
    ...groupStems(stemsOf(song)).map((g) => ({
      label: g.label,
      options: g.stems.map((s) => ({ value: s.mediaId, label: stemName(s, (info(s.mediaId) || {}).name || '') })),
    })),
  ];
}

/**
 * What to draw: { value (the select's value), id (media id drawn, or null), label (under the track), note (or '') }.
 * `songId` is the song file to fall back to (the edit's own song file in the Video Studio).
 * A stem that is missing or has no waveform falls back to the song, with a short note.
 */
export function resolveWave(song, info = () => null, { songId = (song && song.audioId) || null } = {}) {
  const value = chosenWaveSource(song);
  const songRec = songId ? info(songId) : null;
  const fallback = { id: songRec && songRec.peaks ? songId : null, label: 'Song' };
  if (value === 'song') return { value, ...fallback, note: '' };
  const stem = stemsOf(song).find((s) => s.mediaId === value);
  const rec = info(value);
  const name = stemName(stem, (rec || {}).name || '');
  if (!rec) return { value, ...fallback, note: `The stem “${name}” is not in the media library any more, so the song’s waveform is shown.` };
  if (!rec.peaks) return { value, ...fallback, note: `The stem “${name}” has no waveform (it could not be read), so the song’s waveform is shown.` };
  return { value, id: value, label: name, note: '' };
}
