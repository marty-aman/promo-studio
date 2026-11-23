// Touch maths for the Photo Studio: pinch zoom, keeping the point under the fingers still, the
// on-screen keyboard's height, dropping a layer after another, and the longest side of a preview.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The view scale after a pinch: the start scale times how much the fingers spread, kept between min and max. */
export function pinchScale({ scale0, d0, d1, min, max }) {
  if (!(d0 > 0) || !(d1 > 0)) return clamp(scale0, min, max);
  return clamp(scale0 * (d1 / d0), min, max);
}

/**
 * How far to scroll so the design point `anchor` (in design units) sits under the fingers' middle `mid`
 * (screen px) once the design is drawn at `scale` with its top-left corner at `box` (screen px).
 */
export function scrollDelta({ anchor, scale, box, mid: m }) {
  return { x: box.x + anchor.x * scale - m.x, y: box.y + anchor.y * scale - m.y };
}

/** Height of the on-screen keyboard from the layout and visual viewports; small differences are browser bars, not a keyboard. */
export function keyboardInset(innerHeight, vv) {
  if (!vv) return 0;
  const gap = Math.round(innerHeight - vv.height - (vv.offsetTop || 0));
  return gap > 120 ? gap : 0;
}

/** Move the layer `fromId` to just in front of `toId` (layers run back to front). Returns a new array; unchanged for an unknown id. */
export function dropAfter(layers, fromId, toId) {
  if (!fromId || fromId === toId) return layers;
  const a = layers.findIndex((x) => x.id === fromId);
  if (a < 0 || !layers.some((x) => x.id === toId)) return layers;
  const out = layers.slice();
  const [m] = out.splice(a, 1);
  out.splice(out.findIndex((x) => x.id === toId) + 1, 0, m);
  return out;
}

/** The size to draw a photo at while editing: the same shape, longest side at most `max` (null: use the photo as it is). */
export function previewSize(w, h, max = 2048) {
  const m = Math.max(w, h);
  if (!(m > max * 1.15)) return null;
  const k = max / m;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Whether two taps count as a double tap. */
export function isDoubleTap(prev, now, { ms = 400, px = 30 } = {}) {
  return !!prev && now.t - prev.t < ms && Math.hypot(now.x - prev.x, now.y - prev.y) < px;
}

/**
 * Finger-crop: how much to change a photo layer's focusX / focusY when the picture is dragged by (dx, dy)
 * design units along the layer's own axes. Matches fitImage() in model.js. Returns { fx, fy } to add, clamped by the caller.
 */
export function cropShift({ fit = 'cover', iw, ih, bw, bh, zoom = 1 }, dx, dy) {
  if (!(iw > 0 && ih > 0 && bw > 0 && bh > 0) || fit === 'stretch') return { fx: 0, fy: 0 };
  if (fit === 'contain') {
    const k = Math.min(bw / iw, bh / ih) * zoom;
    const sx = bw - iw * k;
    const sy = bh - ih * k;
    return { fx: Math.abs(sx) > 0.5 ? dx / sx : 0, fy: Math.abs(sy) > 0.5 ? dy / sy : 0 };
  }
  const k = Math.max(bw / iw, bh / ih) * Math.max(1, zoom);
  const sx = iw * k - bw;
  const sy = ih * k - bh;
  return { fx: sx > 0.5 ? -dx / sx : 0, fy: sy > 0.5 ? -dy / sy : 0 };
}
