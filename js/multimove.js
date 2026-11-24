// Several timeline blocks selected at once (Shift/Ctrl/Cmd-click, a marquee, Ctrl+A) and moved, nudged, deleted,
// copied or duplicated together. A group is a list of selections ({ type, id }, the same shape as ui.selection).
// Pure: every function works on a project (or a draft of one) and touches no browser API.
import { layoutClips, songToTimeline, timelineToSong, clamp } from './core.js';
import { findClip } from './state.js';
import { copyItem, pasteItem } from './studioedit.js';
import { markTimed } from './manager/lyrictiming.js';

const r3 = (n) => +n.toFixed(3);
const EPS = 1e-6;
/** Layer types drawn as one movable block on the timeline (video layers are rows of clips instead). */
const BLOCK_LAYERS = new Set(['tab', 'drums', 'midi', 'game', 'viz']);

export const keyOf = (sel) => `${sel.type}:${sel.id}`;
export const inGroup = (group, sel) => !!sel && (group || []).some((g) => g.type === sel.type && g.id === sel.id);

/** Add `sel` to the group, or take it out when it is already there. */
export function toggleIn(group, sel) {
  const g = group || [];
  return inGroup(g, sel) ? g.filter((x) => !(x.type === sel.type && x.id === sel.id)) : [...g, { type: sel.type, id: sel.id }];
}

/** Which timeline row a selection sits on (Ctrl+A first selects the whole row). */
export function rowOf(p, sel) {
  if (!sel) return null;
  if (sel.type === 'clip') {
    const f = findClip(p, sel.id);
    return f.clip ? (f.layer ? `vlayer:${f.layer.id}` : 'main') : null;
  }
  return { text: 'text', lyric: 'lyric', audio: 'audio', layer: 'layers' }[sel.type] || null;
}

/** Every block that can be part of a group, optionally only those on `row` (see rowOf). */
export function allItems(p, row = null) {
  const out = [];
  const add = (r, type, id) => (!row || row === r) && out.push({ type, id });
  for (const c of p.clips || []) add('main', 'clip', c.id);
  for (const L of p.layers || []) {
    if (L.type === 'video') for (const c of L.clips || []) add(`vlayer:${L.id}`, 'clip', c.id);
    else if (BLOCK_LAYERS.has(L.type)) add('layers', 'layer', L.id);
  }
  for (const t of p.texts || []) add('text', 'text', t.id);
  for (const l of p.lyrics || []) add('lyric', 'lyric', l.id);
  for (const a of p.audioTracks || []) add('audio', 'audio', a.id);
  return out;
}

/** Drop selections whose item is gone (after an undo or a delete elsewhere) and the ones that can't be grouped. */
export function liveGroup(p, group) {
  return (group || []).filter((g) => spans(p, [g]).length);
}

/**
 * Where each grouped item sits on the timeline: { sel, start, end, min, max, main, index }.
 * `min`/`max` are the earliest/latest start the item may move to (single drags use the same limits).
 */
export function spans(p, group) {
  const out = [];
  const visEnd = p.endCard && p.endCard.enabled ? p.duration - p.endCard.duration : p.duration;
  const laid = layoutClips(p.clips || []);
  for (const sel of group || []) {
    if (sel.type === 'clip') {
      const i = laid.findIndex((l) => l.clip.id === sel.id);
      if (i >= 0) {
        out.push({ sel, start: laid[i].start, end: laid[i].end, min: 0, max: Infinity, main: true, index: i });
        continue;
      }
      const f = findClip(p, sel.id);
      if (f.clip && f.layer) out.push({ sel, start: f.clip.start, end: f.clip.start + f.clip.duration, min: 0, max: Infinity });
    } else if (sel.type === 'text') {
      const t = (p.texts || []).find((x) => x.id === sel.id);
      if (t) out.push({ sel, start: t.start, end: t.end, min: 0, max: Infinity });
    } else if (sel.type === 'lyric') {
      const l = (p.lyrics || []).find((x) => x.id === sel.id);
      // lyric lines are on the song's clock and can't start before the song does
      if (l) out.push({ sel, start: songToTimeline(l.start, p.song), end: songToTimeline(l.end, p.song), min: songToTimeline(0, p.song), max: Infinity });
    } else if (sel.type === 'audio') {
      const a = (p.audioTracks || []).find((x) => x.id === sel.id);
      if (a) out.push({ sel, start: a.start, end: a.start + a.duration, min: 0, max: Infinity });
    } else if (sel.type === 'layer') {
      const L = (p.layers || []).find((x) => x.id === sel.id);
      if (!L || !BLOCK_LAYERS.has(L.type)) continue;
      if (L.type === 'viz') {
        const a = L.start || 0;
        const b = L.end ?? visEnd;
        out.push({ sel, start: a, end: b, min: 0, max: Math.max(0, p.duration - (b - a)) });
      } else {
        // a chart or stem lines up with the song and may start before the video does (a single drag allows that too)
        const a = songToTimeline(L.offset || 0, p.song);
        out.push({ sel, start: a, end: a, min: -Infinity, max: Infinity });
      }
    }
  }
  return out;
}

/**
 * Work out how far the group can move when asked to move `dt` seconds. Returns
 * { delta, insertAt?, mainIds? } or { delta: 0, error } with a sentence for the user.
 * Clips on the main Video track are one gapless sequence, so they move as a block into the nearest slot between
 * the other clips (like a single drag reorders a clip) and everything else in the group moves by the same amount,
 * which keeps the spacing between all of them.
 */
export function planMove(p, group, dt, { slot = 0 } = {}) {
  const sp = spans(p, group);
  if (!sp.length) return { delta: 0 };
  let lo = -Infinity;
  let hi = Infinity;
  for (const s of sp) {
    if (s.main) continue;
    lo = Math.max(lo, s.min - s.start);
    hi = Math.min(hi, s.max - s.start);
  }
  if (lo > hi) lo = hi = 0;
  const main = sp.filter((s) => s.main).sort((a, b) => a.index - b.index);
  if (!main.length) return { delta: clamp(dt, Math.min(0, lo), Math.max(0, hi)) };
  if (main[main.length - 1].index - main[0].index !== main.length - 1) {
    return { delta: 0, error: 'Clips on the Video track move together only when they sit next to each other. Select neighbouring clips, or move them one at a time.' };
  }
  const mainIds = main.map((s) => s.sel.id);
  const others = p.clips.filter((c) => !mainIds.includes(c.id));
  const from = main[0].start;
  let best = { k: main[0].index, delta: 0 };
  let t = 0;
  for (let k = 0; k <= others.length; k++) {
    const delta = t - from;
    const ok = delta >= lo - EPS && delta <= hi + EPS;
    // slot: ±1 asks for the next slot along (arrow keys), otherwise the slot nearest the asked-for move wins
    if (ok && (slot ? k === main[0].index + slot : Math.abs(delta - dt) < Math.abs(best.delta - dt) - EPS)) best = { k, delta };
    if (k < others.length) t += others[k].duration;
  }
  if (best.k === main[0].index) return { delta: 0 };
  return { delta: r3(best.delta), insertAt: best.k, mainIds };
}

/** Move every grouped item in the draft `d` by a plan from planMove (one store.update = one undo step). */
export function applyMove(d, group, plan) {
  const delta = plan.delta || 0;
  if (plan.mainIds && plan.insertAt != null) {
    const block = d.clips.filter((c) => plan.mainIds.includes(c.id));
    const rest = d.clips.filter((c) => !plan.mainIds.includes(c.id));
    d.clips = [...rest.slice(0, plan.insertAt), ...block, ...rest.slice(plan.insertAt)];
  }
  if (!delta) return d;
  const visEnd = d.endCard && d.endCard.enabled ? d.duration - d.endCard.duration : d.duration;
  // keyframes are stored in seconds from the item's own start, so they travel with it
  for (const sel of group) {
    if (sel.type === 'clip') {
      const f = findClip(d, sel.id);
      if (f.clip && f.layer) f.clip.start = r3(Math.max(0, f.clip.start + delta));
    } else if (sel.type === 'text') {
      const t = d.texts.find((x) => x.id === sel.id);
      if (!t) continue;
      const len = t.end - t.start;
      t.start = r3(Math.max(0, t.start + delta));
      t.end = r3(t.start + len);
    } else if (sel.type === 'lyric') {
      const l = d.lyrics.find((x) => x.id === sel.id);
      if (!l) continue;
      const len = l.end - l.start;
      l.start = r3(Math.max(0, timelineToSong(songToTimeline(l.start, d.song) + delta, d.song)));
      l.end = r3(l.start + len);
      d.lyricsTimed = markTimed(d.lyricsTimed, 'manual');
    } else if (sel.type === 'audio') {
      const a = d.audioTracks.find((x) => x.id === sel.id);
      if (a) a.start = r3(Math.max(0, a.start + delta));
    } else if (sel.type === 'layer') {
      const L = d.layers.find((x) => x.id === sel.id);
      if (!L || !BLOCK_LAYERS.has(L.type)) continue;
      if (L.type === 'viz') {
        const a0 = L.start || 0;
        const len = (L.end ?? visEnd) - a0;
        const a = clamp(a0 + delta, 0, Math.max(0, d.duration - len));
        L.start = r3(a);
        L.end = Math.abs(a + len - visEnd) < 0.01 ? null : r3(a + len);
      } else {
        L.offset = r3(timelineToSong(songToTimeline(L.offset || 0, d.song) + delta, d.song));
        L.userSync = true;
      }
    }
  }
  return d;
}

/** Remove every grouped item from the draft `d` (the same rules as deleting one). */
export function deleteGroup(d, group) {
  const ids = (type) => new Set(group.filter((g) => g.type === type).map((g) => g.id));
  const clips = ids('clip');
  const layers = ids('layer');
  const texts = ids('text');
  const lyrics = ids('lyric');
  const audio = ids('audio');
  d.clips = d.clips.filter((c) => !clips.has(c.id));
  d.layers = d.layers.filter((l) => !layers.has(l.id));
  d.layers.forEach((l) => l.type === 'video' && (l.clips = l.clips.filter((c) => !clips.has(c.id))));
  d.texts = d.texts.filter((c) => !texts.has(c.id));
  d.lyrics = d.lyrics.filter((c) => !lyrics.has(c.id));
  d.audioTracks = d.audioTracks.filter((c) => !audio.has(c.id));
  return d;
}

/** Copy a group: { group: [{ copy (from copyItem), rel (seconds after the group's first item), main }] }, or null. */
export function copyGroup(p, group) {
  const sp = spans(p, group);
  if (!sp.length) return null;
  const first = Math.min(...sp.map((s) => s.start));
  const items = sp
    .map((s) => ({ copy: copyItem(p, s.sel), rel: s.start - first, main: !!s.main, index: s.index ?? -1 }))
    .filter((x) => x.copy);
  const mains = items.filter((x) => x.main).sort((a, b) => a.index - b.index);
  const rest = items.filter((x) => !x.main);
  return items.length ? { group: [...mains, ...rest] } : null;
}

/**
 * Paste a copied group into the draft `d` with its first item at timeline time `t`, keeping the spacing.
 * Main-track clips go in as one run at the slot nearest `t`. Returns { group: [sel...] } or { error }.
 */
export function pasteGroup(d, clip, t, makeId) {
  if (!clip || !clip.group) return { error: 'Nothing copied yet. Select something and press Ctrl+C.' };
  const out = [];
  let prevMain = null;
  for (const it of clip.group) {
    let r;
    if (it.main && prevMain) {
      // right after the previous pasted main clip, so the run stays together and in order
      r = pasteItem(d, { ...it.copy, item: { ...it.copy.item, id: prevMain } }, { mode: 'after' }, makeId);
    } else {
      r = pasteItem(d, it.copy, { mode: 'at', t: t + it.rel }, makeId);
    }
    if (r.error) return r;
    if (it.main) prevMain = r.sel.id;
    out.push(r.sel);
  }
  return { group: out };
}

/** Duplicate a group: a copy placed right after the group's end, with the same spacing. */
export function duplicateGroup(d, group, makeId) {
  const sp = spans(d, group);
  if (!sp.length) return { error: 'Select clips, texts, lyric lines, audio blocks or layers to duplicate.' };
  const c = copyGroup(d, group);
  const first = Math.min(...sp.map((s) => s.start));
  const end = Math.max(...sp.map((s) => s.end));
  // the run of main clips goes right after the block it was copied from
  const mains = sp.filter((s) => s.main);
  const at = mains.length ? Math.max(end, ...mains.map((s) => s.end)) : end;
  return pasteGroup(d, c, Math.max(first, at), makeId);
}
