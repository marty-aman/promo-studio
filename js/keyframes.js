// Keyframes: change a property gradually over time. Any item (clip, text, lyric line, layer) can hold
//   item.keys = { [path]: [{ t, v, e }] }
// where t is seconds from the item's own start, v the value and e the easing of the move to the next
// keyframe. path is a property name, or a dotted path into a nested object ('grade.exposure').
// Before the first keyframe the first value holds; after the last, the last. Pure, unit tested.

export const EASES = [
  ['smooth', 'Smooth'],
  ['linear', 'Linear'],
  ['in', 'Ease in (speeds up)'],
  ['out', 'Ease out (slows down)'],
  ['overshoot', 'Overshoot'],
  ['hold', 'Hold, then jump'],
];
const EASE_FN = {
  linear: (p) => p,
  smooth: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  in: (p) => p * p * p,
  out: (p) => 1 - (1 - p) ** 3,
  overshoot: (p) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
  },
  hold: () => 0,
};
export const easeFn = (name) => EASE_FN[name] || EASE_FN.smooth;

/** Two keyframes closer than this (seconds) are the same keyframe. */
export const KEY_EPS = 1 / 60;

/**
 * What can be keyframed on each kind of item: [path, label, min, max, step, default, format].
 * The inspector and the timeline read this, so a property is listed in one place only.
 */
export const KF_PROPS = {
  clip: [
    ['posX', 'Position X', -1, 1, 0.01, 0, (v) => `${Math.round(v * 50)}%`],
    ['posY', 'Position Y', -1, 1, 0.01, 0, (v) => `${Math.round(v * 50)}%`],
    ['zoom', 'Zoom', 0.2, 4, 0.01, 1, (v) => `${v.toFixed(2)}×`],
    ['panX', 'Pan inside X', -1, 1, 0.01, 0, (v) => v.toFixed(2)],
    ['panY', 'Pan inside Y', -1, 1, 0.01, 0, (v) => v.toFixed(2)],
    ['rotate', 'Rotate', -180, 180, 1, 0, (v) => `${Math.round(v)}°`],
    ['opacity', 'Opacity', 0, 1, 0.01, 1, (v) => `${Math.round(v * 100)}%`],
    ['blur', 'Blur', 0, 30, 0.5, 0, (v) => `${v.toFixed(1)} px`],
    ['grade.exposure', 'Exposure', 0.3, 2, 0.01, 1, (v) => `${v.toFixed(2)}×`],
    ['grade.contrast', 'Contrast', 0.3, 2, 0.01, 1, (v) => `${v.toFixed(2)}×`],
    ['grade.saturation', 'Saturation', 0, 2.5, 0.01, 1, (v) => `${Math.round(v * 100)}%`],
  ],
  text: [
    ['x', 'Position X', 0, 100, 0.5, 50, (v) => `${Math.round(v)}%`],
    ['y', 'Position Y', 0, 100, 0.5, 18, (v) => `${Math.round(v)}%`],
    ['size', 'Size', 1, 25, 0.1, 8, (v) => `${v.toFixed(1)}%`],
    ['rotate', 'Rotate', -180, 180, 1, 0, (v) => `${Math.round(v)}°`],
    ['opacity', 'Opacity', 0, 1, 0.01, 1, (v) => `${Math.round(v * 100)}%`],
  ],
  lyric: [
    ['x', 'Position X', 0, 100, 0.5, 50, (v) => `${Math.round(v)}%`],
    ['y', 'Position Y', 5, 95, 0.5, 72, (v) => `${Math.round(v)}%`],
    ['size', 'Size', 1, 25, 0.1, 7, (v) => `${v.toFixed(1)}%`],
    ['rotate', 'Rotate', -180, 180, 1, 0, (v) => `${Math.round(v)}°`],
    ['opacity', 'Opacity', 0, 1, 0.01, 1, (v) => `${Math.round(v * 100)}%`],
  ],
  layer: [
    ['x', 'Position X', 0, 100, 0.5, 50, (v) => `${Math.round(v)}%`],
    ['y', 'Position Y', 0, 100, 0.5, 50, (v) => `${Math.round(v)}%`],
    ['opacity', 'Opacity', 0, 1, 0.01, 1, (v) => `${Math.round(v * 100)}%`],
  ],
  viz: [
    ['x', 'Position X', 0, 100, 0.5, 50, (v) => `${Math.round(v)}%`],
    ['y', 'Position Y', 0, 100, 0.5, 50, (v) => `${Math.round(v)}%`],
    ['size', 'Size', 10, 150, 1, 70, (v) => `${Math.round(v)}%`],
    ['opacity', 'Opacity', 0, 1, 0.01, 1, (v) => `${Math.round(v * 100)}%`],
    ['intensity', 'Intensity', 0, 1.5, 0.01, 0.7, (v) => `${Math.round(v * 100)}%`],
  ],
};
export const propInfo = (kind, path) => (KF_PROPS[kind] || []).find((p) => p[0] === path) || null;

export function getPath(o, path) {
  let cur = o;
  for (const k of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}
/** A copy of o with path set to v, cloning only the objects along the path. */
export function withPath(o, path, v) {
  const [k, ...rest] = path.split('.');
  const copy = Array.isArray(o) ? [...o] : { ...(o || {}) };
  copy[k] = rest.length ? withPath(copy[k], rest.join('.'), v) : v;
  return copy;
}
/** Set path on o in place (creating objects along the way). */
export function setPath(o, path, v) {
  const ks = path.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) {
    if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  cur[ks[ks.length - 1]] = v;
}

const sorted = (keys) => [...(keys || [])].filter((k) => Number.isFinite(k.t) && Number.isFinite(k.v)).sort((a, b) => a.t - b.t);

/** The value at time t (seconds from the item's start). */
export function valueAt(keys, t) {
  const ks = sorted(keys);
  if (!ks.length) return undefined;
  if (t <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (t >= ks[i + 1].t) i += 1;
  const a = ks[i];
  const b = ks[i + 1];
  const p = (t - a.t) / Math.max(1e-9, b.t - a.t);
  return a.v + (b.v - a.v) * easeFn(a.e)(p);
}

export const isKeyed = (item, path) => !!(item && item.keys && item.keys[path] && item.keys[path].length);
export const keyAt = (item, path, t) => (isKeyed(item, path) ? item.keys[path].find((k) => Math.abs(k.t - t) < KEY_EPS) || null : null);

/** item with every keyframed property set to its value at t (the item itself when nothing is keyed). */
export function animate(item, t) {
  if (!item || !item.keys) return item;
  let out = item;
  for (const [path, ks] of Object.entries(item.keys)) {
    if (!ks || !ks.length) continue;
    const v = valueAt(ks, t);
    if (v !== undefined) out = withPath(out, path, v);
  }
  return out;
}

/** Add or update the keyframe for path at t (in place). New keyframes take the easing of their neighbour. */
export function setKey(item, path, t, v, e = null) {
  const tt = Math.max(0, +t.toFixed(3));
  item.keys ||= {};
  const ks = (item.keys[path] ||= []);
  const at = ks.find((k) => Math.abs(k.t - tt) < KEY_EPS);
  if (at) {
    at.v = v;
    if (e) at.e = e;
  } else {
    const prev = sorted(ks).filter((k) => k.t < tt).pop();
    ks.push({ t: tt, v, e: e || (prev && prev.e) || 'smooth' });
    ks.sort((a, b) => a.t - b.t);
  }
  return item;
}

/**
 * Remove the keyframe at t. When the last keyframe of a property goes, the property keeps the value it
 * had there, so removing animation never makes the item jump.
 */
export function removeKey(item, path, t) {
  if (!isKeyed(item, path)) return item;
  const ks = item.keys[path];
  const i = ks.findIndex((k) => Math.abs(k.t - t) < KEY_EPS);
  if (i < 0) return item;
  const [gone] = ks.splice(i, 1);
  if (!ks.length) {
    delete item.keys[path];
    setPath(item, path, gone.v);
    if (!Object.keys(item.keys).length) delete item.keys;
  }
  return item;
}

/** Move a keyframe from one time to another (dropping any it lands on). */
export function moveKey(item, path, from, to) {
  if (!isKeyed(item, path)) return item;
  const ks = item.keys[path];
  const k = ks.find((x) => Math.abs(x.t - from) < KEY_EPS);
  if (!k) return item;
  const tt = Math.max(0, +to.toFixed(3));
  item.keys[path] = ks.filter((x) => x === k || Math.abs(x.t - tt) >= KEY_EPS);
  k.t = tt;
  item.keys[path].sort((a, b) => a.t - b.t);
  return item;
}

/** Remove every keyframe from a property, keeping its value at time t. */
export function clearKeys(item, path, t = 0) {
  if (!isKeyed(item, path)) return item;
  const v = valueAt(item.keys[path], t);
  delete item.keys[path];
  setPath(item, path, v);
  if (!Object.keys(item.keys).length) delete item.keys;
  return item;
}

/** Every keyframe of an item as [{ path, t, v, e }], by time, for the timeline and the list. */
export function allKeys(item) {
  if (!item || !item.keys) return [];
  return Object.entries(item.keys).flatMap(([path, ks]) => sorted(ks).map((k) => ({ path, ...k }))).sort((a, b) => a.t - b.t || a.path.localeCompare(b.path));
}

/**
 * Snap a keyframe time (seconds from the item start) to the nearest beat when within `tol` seconds.
 * beats: song-time beat list; itemStartSong: the item's start in song time.
 */
export function snapToBeat(t, beats, itemStartSong, tol = 0.08) {
  if (!beats || !beats.length) return t;
  const abs = itemStartSong + t;
  let best = null;
  for (const b of beats) if (best == null || Math.abs(b - abs) < Math.abs(best - abs)) best = b;
  return best != null && Math.abs(best - abs) <= tol ? +(best - itemStartSong).toFixed(3) : t;
}
