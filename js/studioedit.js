// Pure editing helpers for the Video Studio: split, duplicate, copy and paste of timeline items, platform
// safe areas and level maths. Every function works on a project (or a draft of one) and touches no browser API.
import { layoutClips, timelineToSong, wordTimings, savedWordTimes, splitClip, clamp, uid } from './core.js';
import { findClip } from './state.js';

const MIN = 0.05; // a piece shorter than this is not worth making
const copy = (x) => JSON.parse(JSON.stringify(x));
const r3 = (n) => +n.toFixed(3);

/** Keyframes (seconds from the item's start) cut at `local`: the first piece keeps the earlier ones, the second the later ones. */
export function splitKeys(keys, local) {
  if (!keys) return [undefined, undefined];
  const a = {};
  const b = {};
  for (const [path, list] of Object.entries(keys)) {
    const first = list.filter((k) => k.t < local - 1e-6);
    const second = list.filter((k) => k.t >= local - 1e-6).map((k) => ({ ...k, t: r3(Math.max(0, k.t - local)) }));
    if (first.length) a[path] = first;
    if (second.length) b[path] = second;
  }
  return [Object.keys(a).length ? a : undefined, Object.keys(b).length ? b : undefined];
}

const setKeys = (item, keys) => (keys ? (item.keys = keys) : delete item.keys);

/** What a selection points at: { kind, list, item } for text, lyric and audio items, or null. */
function listFor(d, sel) {
  const list = { text: d.texts, lyric: d.lyrics, audio: d.audioTracks }[sel.type];
  const item = list && list.find((x) => x.id === sel.id);
  return item ? { list, item } : null;
}

/**
 * Split the selected text, lyric line or extra audio track at timeline time `t`, in the draft `d`.
 * Returns { sel } (the second piece, selected afterwards) or { error } with a sentence for the user.
 */
export function splitItem(d, sel, t, makeId = uid) {
  if (!sel) return { error: 'Select a clip, text, lyric line or audio block first.' };
  if (sel.type === 'song') return { error: 'The song runs under the whole video, so it can’t be split. Add it as an extra audio track to cut it, or fade it in the Audio tab.' };
  if (sel.type === 'endcard') return { error: 'The end card can’t be split.' };
  if (sel.type === 'layer') return { error: 'A layer can’t be split. Split its clips, or duplicate the layer.' };
  const f = listFor(d, sel);
  if (!f) return { error: 'Nothing selected can be split.' };
  const { list, item } = f;
  const idx = list.indexOf(item);
  const what = { text: 'text', lyric: 'lyric line', audio: 'audio block' }[sel.type];
  if (sel.type === 'audio') {
    const local = t - item.start;
    if (local <= MIN || local >= item.duration - MIN) return { error: `Move the playhead inside the ${what} to split it.` };
    const b = { ...copy(item), id: makeId('aud'), start: r3(t), in: r3(item.in + local), duration: r3(item.duration - local), fadeIn: 0 };
    item.duration = r3(local);
    item.fadeOut = 0;
    list.splice(idx + 1, 0, b);
    return { sel: { type: 'audio', id: b.id } };
  }
  // lyric lines are timed on the song's clock; texts on the timeline's
  const at = sel.type === 'lyric' ? timelineToSong(t, d.song) : t;
  if (at <= item.start + MIN || at >= item.end - MIN) return { error: `Move the playhead inside the ${what} to split it.` };
  const local = at - item.start;
  const b = copy(item);
  b.id = makeId(sel.type === 'lyric' ? 'lyr' : 'txt');
  b.start = r3(at);
  const [ka, kb] = splitKeys(item.keys, local);
  setKeys(item, ka);
  setKeys(b, kb);
  delete item.exit; // the first piece carries on into the second, so only the last one leaves
  if (sel.type === 'lyric') {
    // the words are shared out by how far through the line the split falls
    const words = String(item.text).split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const frac = local / (item.end - item.start);
      const saved = savedWordTimes(item); // Auto-sync's word times: split where the words really are
      const timing = saved ? saved.map((w) => ({ start: (w.start - item.start) / (item.end - item.start), end: (w.end - item.start) / (item.end - item.start) })) : wordTimings(item.text);
      const k = clamp(timing.filter((w) => (w.start + w.end) / 2 < frac).length, 1, words.length - 1);
      const kept = saved ? item.words : null;
      item.text = words.slice(0, k).join(' ');
      b.text = words.slice(k).join(' ');
      if (kept) {
        item.words = kept.slice(0, k);
        b.words = kept.slice(k);
      }
    }
  }
  b.end = item.end;
  item.end = r3(at);
  list.splice(idx + 1, 0, b);
  return { sel: { type: sel.type, id: b.id } };
}

/** Split a main-lane clip or an overlay clip under the playhead; same result shape as splitItem. */
export function splitClipAt(d, id, t, makeId = uid) {
  const f = findClip(d, id);
  if (!f.clip) return { error: 'That clip is gone.' };
  if (f.layer) {
    if (t <= f.clip.start + MIN || t >= f.clip.start + f.clip.duration - MIN) return { error: 'Move the playhead inside the clip to split it.' };
    const parts = splitClip(f.clip, t - f.clip.start, () => makeId('clip'));
    if (!parts) return { error: 'Too close to the clip edge to split.' };
    parts[1].start = r3(f.clip.start + parts[0].duration);
    const i = f.layer.clips.findIndex((c) => c.id === id);
    f.layer.clips.splice(i, 1, ...parts);
    return { sel: { type: 'clip', id: parts[1].id } };
  }
  const laid = layoutClips(d.clips).find((l) => l.clip.id === id);
  const parts = laid && splitClip(f.clip, t - laid.start, () => makeId('clip'));
  if (!parts) return { error: 'Move the playhead inside the clip to split it.' };
  d.clips.splice(laid.index, 1, ...parts);
  return { sel: { type: 'clip', id: parts[1].id } };
}

// ------------------------------------------------------------ duplicate, copy and paste

/** A deep copy of a clip with fresh ids (clips on a video layer are ids too). */
const freshClip = (c, makeId) => ({ ...copy(c), id: makeId('clip') });
const freshLayer = (L, makeId) => {
  const n = copy(L);
  n.id = makeId('lyr');
  n.name = /\(copy\)$/.test(n.name || '') ? n.name : `${n.name || 'Layer'} (copy)`;
  if (n.clips) n.clips = n.clips.map((c) => freshClip(c, makeId));
  return n;
};

/** What can be copied: the item, its kind and where it lives. Returns null for things that have no copy (song, end card). */
export function copyItem(p, sel) {
  if (!sel) return null;
  if (sel.type === 'clip') {
    const f = findClip(p, sel.id);
    return f.clip ? { type: 'clip', item: copy(f.clip), layerId: f.layer ? f.layer.id : null } : null;
  }
  if (sel.type === 'layer') {
    const L = (p.layers || []).find((l) => l.id === sel.id);
    return L ? { type: 'layer', item: copy(L) } : null;
  }
  const f = listFor(p, sel);
  return f ? { type: sel.type, item: copy(f.item) } : null;
}

/**
 * Put a copy (from copyItem) into the draft `d`. mode 'after' places it right after the original;
 * mode 'at' places it at timeline time `t`. Returns { sel } or { error }.
 */
export function pasteItem(d, clip, { mode = 'at', t = 0 } = {}, makeId = uid) {
  if (!clip) return { error: 'Nothing copied yet. Select something and press Ctrl+C.' };
  const { type, item } = clip;
  const room = (len) => Math.max(0, d.duration - len);
  if (type === 'clip') {
    const c = freshClip(item, makeId);
    if (clip.layerId) {
      const L = d.layers.find((x) => x.id === clip.layerId) || d.layers.find((x) => x.type === 'video');
      if (!L) return { error: 'There is no video layer to paste this clip into.' };
      c.start = r3(mode === 'after' ? item.start + item.duration : t);
      L.clips.push(c);
      return { sel: { type: 'clip', id: c.id } };
    }
    // the main lane is one sequence: after the original, or before the first clip that ends past the playhead's middle
    let at = d.clips.length;
    if (mode === 'after') {
      const i = d.clips.findIndex((x) => x.id === item.id);
      if (i >= 0) at = i + 1;
    } else {
      const laid = layoutClips(d.clips);
      at = laid.filter((l) => (l.start + l.end) / 2 < t).length;
    }
    d.clips.splice(at, 0, c);
    return { sel: { type: 'clip', id: c.id } };
  }
  if (type === 'layer') {
    const L = freshLayer(item, makeId);
    const i = mode === 'after' ? d.layers.findIndex((x) => x.id === item.id) : -1;
    d.layers.splice(i >= 0 ? i + 1 : d.layers.length, 0, L);
    return { sel: { type: 'layer', id: L.id } };
  }
  if (type === 'audio') {
    const c = { ...copy(item), id: makeId('aud') };
    c.start = r3(clamp(mode === 'after' ? item.start + item.duration : t, 0, room(c.duration)));
    d.audioTracks.push(c);
    return { sel: { type: 'audio', id: c.id } };
  }
  if (type === 'text' || type === 'lyric') {
    const c = { ...copy(item), id: makeId(type === 'text' ? 'txt' : 'lyr') };
    const len = item.end - item.start;
    if (type === 'text') {
      c.start = r3(clamp(mode === 'after' ? item.end : t, 0, room(len)));
      c.end = r3(c.start + len);
      d.texts.push(c);
    } else {
      // lyric lines are on the song's clock
      const startSong = mode === 'after' ? item.end : timelineToSong(t, d.song);
      c.start = r3(Math.max(0, startSong));
      c.end = r3(c.start + len);
      d.lyrics.push(c);
      d.lyrics.sort((a, b) => a.start - b.start);
    }
    return { sel: { type, id: c.id } };
  }
  return { error: 'That can’t be pasted.' };
}

/** Duplicate the selection right after itself. */
export function duplicateItem(d, sel, makeId = uid) {
  if (sel && (sel.type === 'song' || sel.type === 'endcard')) return { error: sel.type === 'song' ? 'The song is one item. Add it again as an extra audio track if you need a second copy.' : 'There is one end card.' };
  const c = copyItem(d, sel);
  if (!c) return { error: 'Select a clip, text, lyric line, audio block or layer to duplicate.' };
  return pasteItem(d, c, { mode: 'after' }, makeId);
}

// ------------------------------------------------------------ safe areas

/** Rectangles [x0, y0, x1, y1] (fractions of the frame) that each app keeps clear of its own buttons and captions. */
export const SAFE_AREAS = {
  tiktok: [0.04, 0.11, 0.83, 0.79],
  reels: [0.04, 0.1, 0.85, 0.79],
  shorts: [0.04, 0.1, 0.84, 0.77],
};
export const SAFE_CHOICES = [
  ['off', 'Off'],
  ['all', 'All apps (the smallest common area)'],
  ['tiktok', 'TikTok'],
  ['reels', 'Instagram Reels'],
  ['shorts', 'YouTube Shorts'],
];

/**
 * The safe rectangle for a choice and format. 9:16 uses the app areas; other formats get a plain 5% margin
 * (nothing hides behind buttons there, but edges get cropped on some screens). null when off.
 */
export function safeRect(choice, aspect) {
  if (!choice || choice === 'off') return null;
  if (aspect !== '9:16' && aspect !== 'canvas') return [0.05, 0.05, 0.95, 0.95];
  if (choice === 'all') {
    const all = Object.values(SAFE_AREAS);
    return [Math.max(...all.map((r) => r[0])), Math.max(...all.map((r) => r[1])), Math.min(...all.map((r) => r[2])), Math.min(...all.map((r) => r[3]))];
  }
  return SAFE_AREAS[choice] || null;
}

// ------------------------------------------------------------ levels

/** Highest absolute sample in an array (0 for none). */
export function peakOf(samples) {
  let m = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] < 0 ? -samples[i] : samples[i];
    if (v > m) m = v;
  }
  return m;
}
/** 0..1 amplitude to dBFS (-Infinity for silence). */
export const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
/** Where a level sits on a meter that runs from -48 dB (0) to 0 dB (1). */
export const meterFill = (v) => clamp((toDb(v) + 48) / 48, 0, 1);
/** Hold a peak for a moment and let it fall: the next displayed value from the old one and the new reading. */
export const meterHold = (shown, reading, dt, fall = 1.2) => Math.max(reading, shown - fall * dt);
