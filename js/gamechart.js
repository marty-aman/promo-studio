// The chart a rhythm game layer plays, from its source: a Guitar Pro track, a MIDI track, or a stem (audio).
// Cached per file and settings; stems are analysed in the background like visualizers and drum stems.
import { media, tabTimeline, drumTimeline, drumHitsFromStem, vizFeatures } from './media.js';
import { detectOnsets } from './drums.js';
import { pitchedToGems, drumsToGems, stemToGems } from './rhythmgame.js';
import { DRUM_CHANNEL } from './midi.js';

const cache = new WeakMap();

/** Gems { gems, notes, duration, tempo } for layer `l`, null when it has no file, undefined while a stem is analysed. */
export function gameChart(l, { bpm = 0, onReady = null } = {}) {
  const rec = l && media.get(l.mediaId);
  if (!rec) return null;
  const drums = l.instrument === 'drums';
  const key = [l.source, l.track, l.drumMap, l.instrument, l.sensitivity, bpm].join('|');
  let per = cache.get(rec);
  if (!per) cache.set(rec, (per = new Map()));
  if (per.has(key)) return per.get(key);
  let out;
  if (l.source === 'stem') {
    if (drums) {
      const data = drumHitsFromStem(rec, l.sensitivity ?? 0.5, onReady);
      if (data === undefined) return undefined;
      out = data ? { ...drumsToGems(data.hits), tempo: bpm } : null;
    } else {
      const feat = vizFeatures(rec, onReady);
      if (feat === undefined) return undefined;
      out = feat ? { ...stemToGems(feat, detectOnsets, { sensitivity: l.sensitivity ?? 0.5 }), tempo: bpm } : null;
    }
  } else if (drums) {
    const tl = drumTimeline(rec, l.track, l.drumMap);
    out = tl ? { ...drumsToGems(tl.hits), tempo: tl.tempo } : null;
  } else if (rec.kind === 'midi' && rec.midi) {
    const m = rec.midi;
    const notes = m.notes.filter((n) => (l.track >= 0 ? n.track === l.track : n.ch !== DRUM_CHANNEL)).map((n) => ({ time: n.time, pitch: n.note, dur: n.dur }));
    out = { ...pitchedToGems(notes), tempo: m.tempo };
  } else {
    const tl = tabTimeline(rec, l.track);
    if (!tl) out = null;
    else {
      const notes = [];
      for (const ev of tl.events) for (const n of ev.notes) if (!n.tie && !n.dead) notes.push({ time: ev.time, pitch: (tl.tuningMidi[n.line] ?? 40) + n.fret, dur: ev.dur });
      out = { ...pitchedToGems(notes), tempo: tl.tempo };
    }
  }
  per.set(key, out);
  return out;
}
