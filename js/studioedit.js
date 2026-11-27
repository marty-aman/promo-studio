// Pure editing helpers for the Video Studio: split, duplicate, copy and paste of timeline items, platform
// safe areas and level maths. Every function works on a project (or a draft of one) and touches no browser API.
import { layoutClips, timelineToSong, wordTimings, savedWordTimes, splitClip, clamp, uid } from './core.js';
import { findClip } from './state.js';
import { valueAt } from './keyframes.js';

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

/**
 * Like splitKeys, but both pieces also get a keyframe at the cut holding the value there, so a property
 * that was moving keeps the same value on each side of the cut instead of jumping to the next keyframe.
 * shortcut: a move with a curved easing is re-eased over each half (exact for Linear and Hold); exact
 * curves need a "part of an ease" keyframe type, worth it only if someone notices the bend.
 */
export function splitKeysAt(keys, local) {
  if (!keys) return [undefined, undefined];
  const a = {};
  const b = {};
  for (const [path, list] of Object.entries(keys)) {
    const v = valueAt(list, local);
    const first = list.filter((k) => k.t < local - 1e-6);
    const second = list.filter((k) => k.t >= local - 1e-6).map((k) => ({ ...k, t: r3(Math.max(0, k.t - local)) }));
    if (v === undefined) {
      if (first.length) a[path] = first;
      if (second.length) b[path] = second;
      continue;
    }
    const before = first[first.length - 1];
    a[path] = [...first, { t: r3(local), v, ...(before && before.e ? { e: before.e } : {}) }];
    b[path] = second.length && second[0].t < 1e-6 ? second : [{ t: 0, v, ...(before && before.e ? { e: before.e } : {}) }, ...second];
  }
  return [Object.keys(a).length ? a : undefined, Object.keys(b).length ? b : undefined];
}

// Layers that draw a chart, notes or a visualizer over a time window (start .. end, null = until the end card).
const TIMED_LAYERS = new Set(['tab', 'drums', 'viz', 'midi', 'game']);
const visEndOf = (d) => (d.endCard && d.endCard.enabled ? d.duration - d.endCard.duration : d.duration);

/**
 * Split a chart or visualizer layer at timeline time `t`: the first piece shows until t, the second from t.
 * Both keep every setting, so they stay on the same theme and in sync: the chart, notes and audio follow the
 * song through `offset` (song time of the file's first beat), which is not tied to when the layer shows,
 * so the second piece carries on exactly where the first stopped. The pieces share `chain`, which the
 * renderer uses (seamView) to draw them as one layer at the cut: no fade between them.
 */
function splitLayer(d, L, t, makeId) {
  if (L.type === 'video') return { error: 'A video layer holds clips: select a clip on it and split that clip instead.' };
  if (!TIMED_LAYERS.has(L.type)) return { error: 'This layer can’t be split.' };
  const start = L.start || 0;
  const end = L.end ?? visEndOf(d);
  if (t <= start + MIN || t >= end - MIN) return { error: `Move the playhead inside the layer’s time (${start.toFixed(1)}s to ${end.toFixed(1)}s) to split it.` };
  const local = t - start;
  const b = copy(L);
  b.id = makeId('lyr');
  L.chain ||= L.id;
  b.chain = L.chain;
  const parts = (d.layers || []).filter((x) => x.chain === L.chain).length + 1;
  b.name = `${String(L.name || 'Layer').replace(/ \(part \d+\)$/, '')} (part ${parts})`;
  b.start = r3(t);
  L.end = r3(t);
  const [ka, kb] = splitKeysAt(L.keys, local);
  setKeys(L, ka);
  setKeys(b, kb);
  delete L.exit; // the first piece carries on into the second: only the last piece leaves
  delete b.enter; // and only the first one arrives
  if (b.playAudio) b.playAudio = false; // the stem plays once, from the first piece (it plays for the whole video)
  d.layers.splice(d.layers.indexOf(L) + 1, 0, b);
  return { sel: { type: 'layer', id: b.id } };
}

/**
 * The layer as the renderer should draw it: a piece of a split layer is drawn as if it started where its
 * chain started and (when the next piece follows on) never ended, so the built-in fades and running
 * counters (the drum combo) match the unsplit layer. Its own start/end still decide when it shows.
 * `layers` are the visible layers; a hidden piece breaks the chain, so the pieces around it fade as usual.
 */
export function seamView(L, layers, visEnd) {
  if (!L || !L.chain) return L;
  const same = layers.filter((x) => x !== L && x.chain === L.chain && x.type === L.type);
  if (!same.length) return L;
  const endOf = (x) => x.end ?? visEnd;
  let from = L.start || 0;
  for (let guard = 0, prev; guard < 64 && (prev = same.find((x) => Math.abs(endOf(x) - from) < 1e-3 && (x.start || 0) < from)); guard++) from = prev.start || 0;
  const joinsNext = same.some((x) => Math.abs((x.start || 0) - endOf(L)) < 1e-3);
  if (from === (L.start || 0) && !joinsNext) return L;
  return { ...L, start: from, end: joinsNext ? Infinity : L.end };
}

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
  if (sel.type === 'layer') {
    const L = (d.layers || []).find((x) => x.id === sel.id);
    return L ? splitLayer(d, L, t, makeId) : { error: 'That layer is gone.' };
  }
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

// ------------------------------------------------------------ moving clips between video layers

/** The video layers, bottom to top (the order the preview stacks them: later layers draw over earlier ones). */
export const videoLayers = (p) => (p.layers || []).filter((L) => L.type === 'video');

const overlaps = (a0, a1, b0, b1) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;

/**
 * Plan moving the overlay clips `ids` up (+) or down (-) by `rows` video layers, and later by `delta` seconds.
 * Rows past the top or the bottom video layer become new video layers there. Clips on the main Video track are
 * left out (they are one gapless sequence with no start of their own). A clip may not land on a stretch of another
 * layer that already has a clip: then the whole move is refused with { error }, nothing is overwritten.
 * Returns { moves: [{ id, from, to }] (indexes into the bottom-to-top list with the new layers), newBelow, newAbove,
 * delta } or { error }. A move of no rows gives { moves: [] }.
 */
export function planLayerMove(p, ids, rows, delta = 0) {
  const V = videoLayers(p);
  const moved = [];
  for (const id of ids) {
    const i = V.findIndex((L) => L.clips.some((c) => c.id === id));
    if (i >= 0) moved.push({ id, i, clip: V[i].clips.find((c) => c.id === id) });
  }
  if (!rows || !moved.length) return { moves: [], newBelow: 0, newAbove: 0, delta };
  const newBelow = Math.max(0, ...moved.map((m) => -(m.i + rows)));
  const newAbove = Math.max(0, ...moved.map((m) => m.i + rows - (V.length - 1)));
  const moving = new Set(moved.map((m) => m.id));
  for (const m of moved) {
    const L = V[m.i + rows];
    if (!L) continue; // a new layer: empty
    const a = Math.max(0, m.clip.start + delta);
    const b = a + m.clip.duration;
    const hit = L.clips.find((c) => !moving.has(c.id) && overlaps(a, b, c.start, c.start + c.duration));
    if (hit) return { error: `${L.name || 'That layer'} already has a clip from ${hit.start.toFixed(1)}s to ${(hit.start + hit.duration).toFixed(1)}s there. Move the clip to a free stretch, or pick another layer.` };
  }
  return { moves: moved.map((m) => ({ id: m.id, from: m.i + newBelow, to: m.i + rows + newBelow })), newBelow, newAbove, delta };
}

/**
 * Plan moving overlay clips to the layer `target` (a layer id, 'new' for a new layer on top of the video layers, or
 * 'below' for a new one under them), counted from the layer of `ids[0]`. Same result as planLayerMove.
 */
export function planMoveTo(p, ids, target, delta = 0) {
  const V = videoLayers(p);
  const own = V.findIndex((L) => L.clips.some((c) => c.id === ids[0]));
  if (own < 0) return { error: 'Only clips on a video layer can be moved to another layer.' };
  const to = target === 'new' ? V.length : target === 'below' ? -1 : V.findIndex((L) => L.id === target);
  if (to < 0 && target !== 'below') return { error: 'That layer is gone.' };
  return planLayerMove(p, ids, to - own, delta);
}

/**
 * Carry out a plan from planLayerMove in the draft `d` (one store.update = one undo step). Each clip keeps every
 * setting (keyframes, effects, on/off, sound sync); `delta` moves it in time too. A layer left empty is kept.
 * Returns { layers: [ids of the layers the clips went to], made: [ids of new layers] }.
 */
export function applyLayerMove(d, plan, makeId = uid) {
  if (!plan || plan.error || !plan.moves || !plan.moves.length) return { layers: [], made: [] };
  const V = videoLayers(d);
  let n = V.length;
  const fresh = () => ({ id: makeId('lyr'), type: 'video', name: `Video layer ${++n}`, visible: true, opacity: 1, blend: 'source-over', clips: [] });
  const below = Array.from({ length: plan.newBelow }, fresh);
  const above = Array.from({ length: plan.newAbove }, fresh);
  // the new layers sit right under the bottom video layer and right over the top one
  d.layers.splice(d.layers.indexOf(V[0]), 0, ...below);
  d.layers.splice(d.layers.indexOf(V[V.length - 1]) + 1, 0, ...above);
  const E = [...below, ...V, ...above];
  const taken = plan.moves.map((m) => {
    const src = E[m.from];
    const i = src.clips.findIndex((c) => c.id === m.id);
    return i < 0 ? null : { m, c: src.clips.splice(i, 1)[0] };
  });
  const to = new Set();
  for (const t of taken) {
    if (!t) continue;
    t.c.start = r3(Math.max(0, t.c.start + (plan.delta || 0)));
    E[t.m.to].clips.push(t.c);
    to.add(E[t.m.to].id);
  }
  return { layers: [...to], made: [...below, ...above].map((L) => L.id) };
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
