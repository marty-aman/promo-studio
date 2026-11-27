// The song normaliser, kept out of model.js so each build adds its own line to SONG_EXTRAS
// instead of editing one long expression. normalizeSong(s, d): `s` is the saved song, `d` a fresh
// newSong() to fill gaps from (model.js passes it, which avoids a circular import).
import { normalizeFiles, VIDEO_STATUSES } from './files.js';
import { normalizeSections } from './releases.js';
import { normalizeLyricTiming } from './lyrictiming.js';
import { normalizeWaveSource } from '../wavesource.js';

/** An array of plain objects that have a string id; anything else is dropped. Never throws. */
export const idList = (x) => (Array.isArray(x) ? x.filter((y) => y && typeof y === 'object' && typeof y.id === 'string') : []);

/**
 * Extra normalisers run after the core ones, in order. A build appends ONE line: `s => s` that
 * returns the song with its own field checked, e.g. `(s) => ({ ...s, split: normalizeSplit(s.split) })`.
 */
export const SONG_EXTRAS = [
  (s) => ({ ...s, waveSource: normalizeWaveSource(s.waveSource) }), // the word timing editor's waveform ('' = default)
];

export function normalizeSong(s, d) {
  const core = { ...d, ...s, lyrics: typeof s.lyrics === 'string' ? s.lyrics : '', lyricTiming: normalizeLyricTiming(s.lyricTiming), instrumental: s.instrumental === true, videoStatus: VIDEO_STATUSES.some(([k]) => k === s.videoStatus) ? s.videoStatus : '', sections: normalizeSections(s.sections), coverId: typeof s.coverId === 'string' ? s.coverId : null, releaseId: typeof s.releaseId === 'string' ? s.releaseId : '', track: +s.track || 0, sound: { ...d.sound, ...(s.sound || {}), moods: Array.isArray(s.sound?.moods) ? s.sound.moods : [] }, press: { ...d.press, ...(s.press || {}), edits: { ...(s.press?.edits || {}) } }, pitches: idList(s.pitches), files: normalizeFiles(s.files), links: { ...d.links, ...(s.links || {}) }, shoot: { ...d.shoot, ...(s.shoot || {}) }, release: Array.isArray(s.release) ? s.release : d.release };
  return SONG_EXTRAS.reduce((acc, fn) => fn(acc), core);
}
