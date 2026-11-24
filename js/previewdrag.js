// Drag to reposition on the Video Studio preview: what is under the pointer, where it sits, and moving it.
// Pure (no DOM): app.js passes a text measurer and wires the pointer and keys. Positions are fractions of the frame
// (0..1). Texts, lyric lines and graphics layers keep x/y in % of the frame; video clips keep posX/posY in -1..1
// (the picture's centre is at 0.5 + pos/2).
// shortcut: boxes ignore rotation, entrance motion and a picture's own aspect; upgrade if people miss small rotated items.
import { layoutClips, activeLyric, timelineToSong, clamp } from './core.js';
import { isVisible, findClip, overlayClipAt } from './state.js';
import { animate, isKeyed, setKey, propInfo, KEY_EPS } from './keyframes.js';
import { lineStyle } from './linestyle.js';
import { kfTarget } from './panel-kf.js';

/** A rough text measurer for tests and as a fallback: about half the font size per character. */
export const roughMeasure = (text, font, px) => String(text).length * px * 0.5;

function textBox(text, size, maxWFrac, cx, cy, W, H, measure, font) {
  const px = (W * size) / 100;
  const maxW = W * maxWFrac;
  let w = 0;
  let lines = 0;
  for (const part of [String(text || '').replace(/\s+/g, ' ').trim()]) {
    const pw = measure(part, font, px);
    lines += Math.max(1, Math.ceil(pw / maxW));
    w = Math.max(w, Math.min(pw, maxW));
  }
  return { cx, cy, w: (w + px * 0.8) / W, h: (Math.max(1, lines) * px * 1.12 + px * 0.5) / H };
}

/**
 * What can be dragged at timeline time t, top-most first: [{ sel: { type, id }, box: { cx, cy, w, h } }].
 * W, H: the frame size in pixels (only their ratio and the text sizes matter).
 */
export function draggablesAt(p, t, { W = 1080, H = 1920, measure = roughMeasure } = {}) {
  const out = [];
  const ecStart = p.endCard && p.endCard.enabled ? p.duration - p.endCard.duration : Infinity;
  if (t >= ecStart && isVisible(p, 'endcard')) return out; // the end card covers the frame
  const visEnd = ecStart === Infinity ? p.duration : ecStart;
  // lyrics are drawn over texts
  const s = p.lyricStyle || {};
  if (isVisible(p, 'lyrics') && (!s.display || s.display === 'line')) {
    const ts = timelineToSong(t, p.song);
    const l0 = activeLyric(p.lyrics || [], ts);
    if (l0) {
      const l = animate(l0, ts - l0.start);
      const ls = lineStyle(s, l, p.theme);
      const size = l.keys && l.keys.size ? l.size : ls.size || 9;
      const text = ls.uppercase ? String(l.text || '').toUpperCase() : l.text;
      const x = (l.x ?? ls.x ?? 50) / 100;
      const y = clamp(l.y ?? ls.y ?? 72, 5, 95) / 100;
      out.push({ sel: { type: 'lyric', id: l0.id }, box: textBox(text, size, (ls.maxWidth || 86) / 100, x, y, W, H, measure, ls.font) });
    }
  }
  if (isVisible(p, 'text')) {
    for (const tx0 of [...(p.texts || [])].reverse()) {
      if (t < tx0.start || t >= tx0.end) continue;
      const tx = animate(tx0, t - tx0.start);
      out.push({ sel: { type: 'text', id: tx0.id }, box: textBox(tx.text, tx.size || 9, 0.88, (tx.x ?? 50) / 100, (tx.y ?? 50) / 100, W, H, measure, tx.font) });
    }
  }
  const layers = (p.layers || []).filter((l) => l.visible !== false);
  for (const l0 of [...layers].reverse()) {
    if (l0.type === 'video') continue;
    if (t < (l0.start || 0) || t >= (l0.end ?? visEnd)) continue;
    const l = animate(l0, t - (l0.start || 0));
    const w = l.type === 'viz' ? (l.size ?? 70) / 100 : (l.width ?? 90) / 100;
    const h = l.type === 'viz' ? ((l.size ?? 70) / 100) * 0.7 * (W / H) : (l.height ?? 20) / 100;
    out.push({ sel: { type: 'layer', id: l0.id }, box: { cx: (l.x ?? 50) / 100, cy: (l.y ?? 50) / 100, w, h } });
  }
  const clipBox = (c0, local) => {
    const c = animate(c0, local);
    const z = c.zoom ?? 1;
    return { cx: 0.5 + (c.posX || 0) / 2, cy: 0.5 + (c.posY || 0) / 2, w: z, h: z };
  };
  for (const l of [...layers].reverse()) {
    if (l.type !== 'video') continue;
    const c = overlayClipAt(l, t);
    if (c) out.push({ sel: { type: 'clip', id: c.id }, box: clipBox(c, t - c.start) });
  }
  if (isVisible(p, 'video')) {
    const at = layoutClips(p.clips || []).find((x) => t >= x.start && t < x.end);
    if (at) out.push({ sel: { type: 'clip', id: at.clip.id }, box: clipBox(at.clip, t - at.start) });
  }
  return out;
}

const inside = (b, fx, fy) => Math.abs(fx - b.cx) <= b.w / 2 && Math.abs(fy - b.cy) <= b.h / 2;
const same = (a, b) => !!(a && b && a.type === b.type && a.id === b.id);

/** The item under (fx, fy) (fractions of the frame); the selected item wins where items overlap. */
export function hitTest(p, t, fx, fy, opts = {}) {
  const all = draggablesAt(p, t, opts).filter((d) => inside(d.box, fx, fy));
  return (all.find((d) => same(d.sel, opts.selected)) || all[0] || null)?.sel || null;
}

/** The on-screen box of an item at t (fractions of the frame), or null when it isn't showing. */
export const boxOf = (p, t, sel, opts = {}) => (draggablesAt(p, t, opts).find((d) => same(d.sel, sel)) || {}).box || null;

/** Can this selection be moved on the preview? */
export function movable(p, sel) {
  if (!sel) return false;
  if (sel.type === 'layer') {
    const L = (p.layers || []).find((l) => l.id === sel.id);
    return !!L && L.type !== 'video';
  }
  if (sel.type === 'clip') return !!findClip(p, sel.id).clip;
  return sel.type === 'text' || sel.type === 'lyric';
}

/** [x path, y path, units per whole frame] for a kind of item. */
const pathsFor = (kind) => (kind === 'clip' ? ['posX', 'posY', 2] : ['x', 'y', 100]);

/** The item's position at t, in its own units: { x, y }. */
export function positionAt(p, sel, t) {
  const tg = kfTarget(p, sel);
  if (!tg) return null;
  const it = animate(tg.item, clamp(t - tg.start, 0, tg.dur));
  if (tg.kind === 'clip') return { x: it.posX || 0, y: it.posY || 0 };
  if (tg.kind === 'lyric') {
    const s = p.lyricStyle || {};
    return { x: it.x ?? s.x ?? 50, y: it.y ?? s.y ?? 72 };
  }
  return { x: it.x ?? 50, y: it.y ?? 50 };
}

/**
 * Move the selection in a draft to `from` + (dfx, dfy) (fractions of the frame), at timeline time t.
 * axes: which of x and y this drag has touched (an untouched axis is left alone, so a keyframed one gets no new key).
 * A keyframed position gets a keyframe at the playhead instead (only while the playhead is over the item).
 */
export function moveBy(d, sel, t, from, dfx, dfy, axes = { x: dfx !== 0, y: dfy !== 0 }) {
  const tg = kfTarget(d, sel);
  const it = tg && tg.find(d);
  if (!it || !from) return false;
  const [px, py, unit] = pathsFor(tg.kind);
  const local = t - tg.start;
  const insideItem = local >= -KEY_EPS && local <= tg.dur + KEY_EPS;
  const put = (path, v) => {
    const info = propInfo(tg.kind, path);
    const val = +clamp(v, info ? info[2] : -Infinity, info ? info[3] : Infinity).toFixed(tg.kind === 'clip' ? 4 : 2);
    if (isKeyed(it, path)) {
      if (insideItem) setKey(it, path, clamp(local, 0, tg.dur), val);
    } else it[path] = val;
  };
  if (axes.x) put(px, from.x + dfx * unit);
  if (axes.y) put(py, from.y + dfy * unit);
  return true;
}

/** Shift keeps the bigger of the two moves. */
export const constrain = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? [dx, 0] : [0, dy]);
