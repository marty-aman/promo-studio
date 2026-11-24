// Turning timeline items off and on without deleting them. Pure: works on a project (or a draft) only.
//
// Clips (main Video track and video layers), texts, lyric lines and extra audio blocks carry `disabled: true`
// while off: they stay on the timeline with their place, keyframes and settings, and the preview, the export,
// captions files and the sound skip them. An item without the flag (every older save) is on.
// A clip turned off on the main Video track keeps its slot, so the clips after it don't move; the video shows
// black (the background colour) there. A layer, the song and the end card are one block on their own row, so
// turning them off is the same as their row's eye (layer.visible, layerVis.song, layerVis.endcard).
import { findClip } from './state.js';

/** The key that turns the selection off or on (documented in the shortcut list and the README). */
export const OFF_KEY = 'E';

export const isOn = (x) => !(x && x.disabled);
/** `list` without the items that are off (the same array when none is). */
export const onOnly = (list) => (list && list.some((x) => x && x.disabled) ? list.filter(isOn) : list || []);

const LISTS = { text: 'texts', lyric: 'lyrics', audio: 'audioTracks' };

/** The flagged item a selection points at, or null (layers, song and end card have no flag). */
function itemFor(p, sel) {
  if (!sel) return null;
  if (sel.type === 'clip') return findClip(p, sel.id).clip;
  const list = LISTS[sel.type] && p[LISTS[sel.type]];
  return (list && list.find((x) => x.id === sel.id)) || null;
}

/** Can this selection be turned off? */
export function canTurnOff(p, sel) {
  if (!sel) return false;
  if (sel.type === 'layer') return (p.layers || []).some((l) => l.id === sel.id);
  if (sel.type === 'song') return !!p.song;
  if (sel.type === 'endcard') return !!(p.endCard && p.endCard.enabled);
  return !!itemFor(p, sel);
}

/** Is the selected item off? */
export function isOff(p, sel) {
  if (!sel) return false;
  if (sel.type === 'layer') return ((p.layers || []).find((l) => l.id === sel.id) || {}).visible === false;
  if (sel.type === 'song' || sel.type === 'endcard') return !!(p.layerVis && p.layerVis[sel.type] === false);
  return !isOn(itemFor(p, sel));
}

/** Turn one item off (`off` true) or on, in the draft `d`. Returns false when there is nothing to change. */
export function setOff(d, sel, off) {
  if (!canTurnOff(d, sel)) return false;
  if (sel.type === 'layer') {
    d.layers.find((l) => l.id === sel.id).visible = !off;
  } else if (sel.type === 'song' || sel.type === 'endcard') {
    d.layerVis = { ...(d.layerVis || {}) };
    if (off) d.layerVis[sel.type] = false;
    else delete d.layerVis[sel.type];
  } else {
    const it = itemFor(d, sel);
    if (off) it.disabled = true;
    else delete it.disabled;
  }
  return true;
}

/**
 * Turn the selection (one or several items) off, or back on when every one of them is already off.
 * Returns { off, count } or { error } with a sentence for the user.
 */
export function toggleOff(d, sels) {
  const list = (sels || []).filter((s) => canTurnOff(d, s));
  if (!list.length) return { error: `Select a block on the timeline first, then press ${OFF_KEY} to turn it off or on.` };
  const off = list.some((s) => !isOff(d, s));
  for (const s of list) setOff(d, s, off);
  return { off, count: list.length };
}
