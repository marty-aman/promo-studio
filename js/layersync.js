// Auto-sync for layers: which sync a layer needs (a stem by its audio, a chart by its notes) and what to
// change on it. Used by each layer's "Auto-sync to the song" and by "Auto-sync every layer".
import { media, tabTimeline, drumTimeline } from './media.js';
import { midiNotesFor } from './midiviz.js';
import { gameChart } from './gamechart.js';
import { syncStem, syncChart, chartHits } from './autosync.js';
import { formatTime } from './core.js';

/** Can this layer be auto-synced, and from what: 'stem' | 'chart' | null. */
export function syncKind(p, L) {
  if (!L) return null;
  if (L.type === 'viz') return L.source && L.source !== 'song' && media.get(L.source) ? 'stem' : null;
  if (L.type === 'drums') return !L.mediaId ? null : L.source === 'audio' ? 'stem' : 'chart';
  if (L.type === 'game') return !L.mediaId ? null : L.source === 'stem' ? 'stem' : 'chart';
  if (L.type === 'tab' || L.type === 'midi') return L.mediaId ? 'chart' : null;
  return null;
}

function chartData(L) {
  const rec = media.get(L.mediaId);
  if (!rec) return null;
  if (L.type === 'tab') return tabTimeline(rec, L.track);
  if (L.type === 'midi') return rec.midi ? midiNotesFor(rec.midi, L.tracks) : null;
  if (L.type === 'game') return gameChart(L) || null;
  return drumTimeline(rec, L.track, L.drumMap);
}

/**
 * Work out the sync for one layer. Returns { patch, sure, text } to apply with Object.assign, or
 * { error } when it can't be done (no song, the audio isn't analysed, too few notes).
 */
export function syncLayer(p, L) {
  const song = p.song && media.get(p.song.mediaId);
  if (!song) return { error: 'Choose the song first (Audio tab).' };
  if (!song.envelope) return { error: 'The song is still being analysed. Try again in a moment.' };
  const kind = syncKind(p, L);
  if (!kind) return { error: 'This layer has nothing to sync yet: pick its file first.' };
  if (kind === 'stem') {
    const stem = media.get(L.type === 'viz' ? L.source : L.mediaId);
    if (!stem || !stem.envelope) return { error: 'Only audio stems can be synced by ear (this one is a video or still loading).' };
    const r = syncStem(song, stem);
    if (!r) return { error: 'The stem or the song is too short to compare.' };
    return { patch: { offset: r.offset, userSync: true }, sure: r.sure, text: `${L.name}: the stem starts at ${formatTime(Math.max(0, r.offset))} in the song${r.offset < 0 ? ` (${(-r.offset).toFixed(2)} s before it)` : ''}` };
  }
  const data = chartData(L);
  const hits = chartHits(data);
  if (hits.length < 4) return { error: 'The part has too few notes to line up by ear.' };
  const r = syncChart(song, hits, { tempo: data.tempo || 0, songBpm: p.beats ? p.beats.bpm : 0 });
  if (!r) return { error: 'The song is too short to compare.' };
  const bpm = data.tempo ? Math.round(data.tempo * r.tempoScale * 10) / 10 : 0;
  return {
    patch: { offset: r.offset, tempoScale: r.tempoScale, userSync: true },
    sure: r.sure,
    text: `${L.name}: starts at ${formatTime(Math.max(0, r.offset))}${bpm ? ` at ${bpm} BPM` : r.tempoScale !== 1 ? ` at ${Math.round(r.tempoScale * 1000) / 10}% speed` : ''}`,
  };
}

export const SURE_TEXT = { sure: 'a clear match', likely: 'a likely match: play it to check', unsure: 'no clear match: play it to check, and nudge or use “Put bar at the playhead” if it’s off' };
