// Photo Studio designs: a canvas size, a background and a stack of layers (images, text, shapes,
// gradients), each with position, size, rotation, opacity, blend mode, adjustments and a mask.
// A design can be a carousel: a wide canvas cut into equal slides on export. Pure functions.

let n = 0;
export const pid = (p = 'p') => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const str = (v, d = '', max = 2000) => (typeof v === 'string' ? v.slice(0, max) : d);

/** Canvas sizes: [id, label, width, height]. */
export const SIZES = [
  ['post', 'Instagram post (4:5)', 1080, 1350],
  ['square', 'Square post (1:1)', 1080, 1080],
  ['story', 'Story or Reel cover (9:16)', 1080, 1920],
  ['poster', 'Poster (18 × 24 in)', 1800, 2400],
  ['flyer', 'Flyer (8.5 × 11 in)', 1275, 1650],
  ['thumb', 'YouTube thumbnail (16:9)', 1280, 720],
  ['banner', 'Header / banner (3:1)', 1500, 500],
  ['cover', 'Album cover (3000 px)', 3000, 3000],
];
export const sizeById = (id) => SIZES.find((s) => s[0] === id) || SIZES[0];

export const BLENDS = [
  ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['hard-light', 'Hard light'],
  ['color-dodge', 'Colour dodge'], ['color-burn', 'Colour burn'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
  ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Colour'], ['luminosity', 'Luminosity'],
];

/**
 * Masks. Shapes are placed inside the layer's box (x, y, w, h from 0 to 1); fades go from opaque
 * to clear; "person" keeps the people in a photo; "clip" shows the layer only where the layer
 * below it is (text filled with a photo, a photo inside a shape).
 */
export const MASKS = [
  ['none', 'No mask'], ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['fadeDown', 'Fade out downwards'], ['fadeUp', 'Fade out upwards'],
  ['fadeLeft', 'Fade out to the left'], ['fadeRight', 'Fade out to the right'], ['radial', 'Soft spotlight'], ['person', 'Cut out the person'], ['clip', 'Clip to the layer below'],
];
export const SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['star', 'Star'], ['line', 'Line'], ['arrow', 'Arrow']];
export const LAYER_TYPES = ['image', 'text', 'shape', 'gradient'];

export const defaultAdjust = () => ({ brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 });
export const defaultMask = () => ({ type: 'none', invert: false, feather: 0.15, x: 0.1, y: 0.1, w: 0.8, h: 0.8 });

/** A CSS/canvas filter string for a layer's adjustments ('none' when untouched). */
export function filterCSS(a = defaultAdjust(), scale = 1) {
  const d = defaultAdjust();
  const parts = [];
  if (a.brightness !== d.brightness) parts.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== d.contrast) parts.push(`contrast(${a.contrast / 100})`);
  if (a.saturate !== d.saturate) parts.push(`saturate(${a.saturate / 100})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.grayscale) parts.push(`grayscale(${a.grayscale / 100})`);
  if (a.sepia) parts.push(`sepia(${a.sepia / 100})`);
  if (a.invert) parts.push(`invert(${a.invert / 100})`);
  if (a.blur) parts.push(`blur(${Math.round(a.blur * scale * 10) / 10}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Ready-made looks for the adjustment sliders. */
export const LOOKS = [
  ['none', 'Original', {}],
  ['noir', 'Noir', { grayscale: 100, contrast: 140, brightness: 95 }],
  ['grit', 'Grit', { contrast: 145, saturate: 45, brightness: 92 }],
  ['warm', 'Warm film', { sepia: 25, contrast: 95, saturate: 90, brightness: 104 }],
  ['neon', 'Neon', { saturate: 170, contrast: 115, hue: -12 }],
  ['fade', 'Faded', { contrast: 80, brightness: 110, saturate: 80 }],
  ['ice', 'Ice', { hue: 180, saturate: 70, contrast: 110 }],
  ['blood', 'Blood red', { sepia: 60, hue: -40, saturate: 220, contrast: 120 }],
];

const base = (type, doc, o = {}) => ({
  id: pid('ly'),
  type,
  name: o.name || { image: 'Photo', text: 'Text', shape: 'Shape', gradient: 'Gradient' }[type],
  x: 0,
  y: 0,
  w: doc.w,
  h: doc.h,
  rot: 0,
  opacity: 1,
  blend: 'source-over',
  visible: true,
  locked: false,
  flipX: false,
  flipY: false,
  adjust: defaultAdjust(),
  mask: defaultMask(),
  shadow: { on: false, color: '#000000', blur: 30, x: 0, y: 10 },
});

/** A new layer. Text and shapes start centred at a sensible size; images and gradients fill the canvas. */
export function newLayer(type, doc, o = {}) {
  const L = base(type, doc, o);
  if (type === 'image') Object.assign(L, { mediaId: null, fit: 'cover', focusX: 0.5, focusY: 0.5, zoom: 1 });
  if (type === 'text') {
    const w = Math.round(doc.w * 0.8);
    const size = Math.round(Math.min(doc.w, doc.h) * 0.09);
    Object.assign(L, { x: Math.round((doc.w - w) / 2), y: Math.round(doc.h * 0.4), w, h: Math.round(size * 1.3), text: 'Your text', font: 'Bebas Neue', size, weight: 400, color: '#ffffff', align: 'center', lineHeight: 1.05, letter: 0, upper: false, italic: false, stroke: { on: false, color: '#000000', width: 4 }, bg: { on: false, color: '#000000', pad: 0.3, radius: 0.2 } });
  }
  if (type === 'shape') {
    const s = Math.round(Math.min(doc.w, doc.h) * 0.4);
    Object.assign(L, { x: Math.round((doc.w - s) / 2), y: Math.round((doc.h - s) / 2), w: s, h: s, shape: 'rect', fill: '#ffd400', fillOn: true, stroke: '#ffffff', strokeW: 0, radius: 0 });
  }
  if (type === 'gradient') Object.assign(L, { kind: 'linear', from: '#000000', fromAlpha: 0, to: '#000000', toAlpha: 0.85, angle: 180, mid: 0.5 });
  return { ...L, ...o, id: L.id };
}

export function newDoc({ size = 'post', name = 'Untitled design', w = null, h = null, slides = 0 } = {}) {
  const [, , sw, sh] = sizeById(size);
  const k = Math.max(0, Math.min(10, slides | 0));
  return { id: pid('doc'), name, size, w: w || sw * (k > 1 ? k : 1), h: h || sh, slides: k > 1 ? k : 0, bg: '#111111', layers: [], updatedAt: '' };
}

/** Fill in anything an older or hand-edited design is missing, and drop what can't be drawn. */
export function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const d = { ...newDoc(), ...raw };
  d.id = str(raw.id) || pid('doc');
  d.name = str(raw.name, 'Untitled design', 120);
  d.w = clamp(Math.round(num(raw.w, 1080)), 16, 12000);
  d.h = clamp(Math.round(num(raw.h, 1350)), 16, 8000);
  d.slides = clamp(num(raw.slides, 0) | 0, 0, 10);
  if (d.slides === 1) d.slides = 0;
  d.bg = str(raw.bg, '#111111', 40);
  d.layers = (Array.isArray(raw.layers) ? raw.layers : [])
    .filter((L) => L && LAYER_TYPES.includes(L.type))
    .map((L) => {
      const def = newLayer(L.type, d);
      return { ...def, ...L, id: str(L.id) || pid('ly'), opacity: clamp(num(L.opacity, 1), 0, 1), adjust: { ...defaultAdjust(), ...(L.adjust || {}) }, mask: { ...defaultMask(), ...(L.mask || {}) }, shadow: { ...def.shadow, ...(L.shadow || {}) }, ...(L.type === 'text' ? { stroke: { ...def.stroke, ...(L.stroke || {}) }, bg: { ...def.bg, ...(L.bg || {}) }, text: str(L.text, '', 4000) } : {}) };
    });
  return d;
}

/** Where each slide of a carousel design sits: [{ x, w }]. A normal design is one slide. */
export function slices(doc) {
  const k = doc.slides > 1 ? doc.slides : 1;
  const w = doc.w / k;
  return Array.from({ length: k }, (_, i) => ({ x: Math.round(i * w), w: Math.round((i + 1) * w) - Math.round(i * w) }));
}
/** Slides that fit a wide image at the post height: its aspect against 4:5, between 2 and 10. */
export function slidesForImage(imgW, imgH, slideW = 1080, slideH = 1350) {
  if (!(imgW > 0 && imgH > 0)) return 3;
  return clamp(Math.round((imgW / imgH) * (slideH / slideW)), 2, 10);
}

/** A point in the design → the layer's own unrotated box coordinates. */
export function toLocal(L, px, py) {
  const cx = L.x + L.w / 2;
  const cy = L.y + L.h / 2;
  const a = (-L.rot * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + L.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + L.h / 2 };
}
/** The top-most visible, unlocked layer under a point, or null. */
export function hitTest(doc, px, py) {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i];
    if (!L.visible || L.locked) continue;
    const p = toLocal(L, px, py);
    if (p.x >= 0 && p.y >= 0 && p.x <= L.w && p.y <= L.h) return L;
  }
  return null;
}

/** Move a layer up (+1, towards the front) or down (−1). Returns true when it moved. */
export function moveLayer(doc, id, dir) {
  const i = doc.layers.findIndex((L) => L.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.layers.length) return false;
  [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
  return true;
}
export function duplicateLayer(doc, id) {
  const i = doc.layers.findIndex((L) => L.id === id);
  if (i < 0) return null;
  const c = { ...structuredClone(doc.layers[i]), id: pid('ly'), name: `${doc.layers[i].name} copy`, x: doc.layers[i].x + 30, y: doc.layers[i].y + 30 };
  doc.layers.splice(i + 1, 0, c);
  return c;
}

/** Resize a layer's box from a handle ('n','s','e','w','ne',…) by dx, dy in its own axes. */
export function resizeBox(box, handle, dx, dy, { keepAspect = false, min = 8 } = {}) {
  let { x, y, w, h } = box;
  const ar = box.w / box.h || 1;
  if (handle.includes('e')) w = box.w + dx;
  if (handle.includes('w')) (w = box.w - dx), (x = box.x + dx);
  if (handle.includes('s')) h = box.h + dy;
  if (handle.includes('n')) (h = box.h - dy), (y = box.y + dy);
  if (keepAspect && handle.length === 2) {
    // follow whichever side moved more, in proportion
    if (Math.abs(w / box.w - 1) >= Math.abs(h / box.h - 1)) {
      const nh = w / ar;
      if (handle.includes('n')) y -= nh - h;
      h = nh;
    } else {
      const nw = h * ar;
      if (handle.includes('w')) x -= nw - w;
      w = nw;
    }
  }
  if (w < min) {
    if (handle.includes('w')) x -= min - w;
    w = min;
  }
  if (h < min) {
    if (handle.includes('n')) y -= min - h;
    h = min;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Where an image goes inside a box for a fit mode: the source crop { sx, sy, sw, sh } and destination { dx, dy, dw, dh }. */
export function fitImage(iw, ih, bw, bh, { fit = 'cover', focusX = 0.5, focusY = 0.5, zoom = 1 } = {}) {
  if (fit === 'stretch') return { sx: 0, sy: 0, sw: iw, sh: ih, dx: 0, dy: 0, dw: bw, dh: bh };
  if (fit === 'contain') {
    const k = Math.min(bw / iw, bh / ih) * zoom;
    const dw = iw * k;
    const dh = ih * k;
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: (bw - dw) * focusX, dy: (bh - dh) * focusY, dw, dh };
  }
  const k = Math.max(bw / iw, bh / ih) * Math.max(1, zoom);
  const sw = bw / k;
  const sh = bh / k;
  return { sx: (iw - sw) * clamp(focusX, 0, 1), sy: (ih - sh) * clamp(focusY, 0, 1), sw, sh, dx: 0, dy: 0, dw: bw, dh: bh };
}

/** Words → lines that fit `maxW`, measured by `measure(text)` (explicit line breaks kept). */
export function wrapText(text, maxW, measure) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      if (measure(`${line} ${w}`) <= maxW) line += ` ${w}`;
      else (out.push(line), (line = w));
    }
    out.push(line);
  }
  return out;
}

/** Points of a star or triangle in a w × h box. */
export function shapePoints(shape, w, h) {
  if (shape === 'triangle') return [[w / 2, 0], [w, h], [0, h]];
  if (shape === 'star') {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.4 : 1;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2]);
    }
    return pts;
  }
  if (shape === 'arrow') return [[0, h * 0.35], [w * 0.62, h * 0.35], [w * 0.62, 0], [w, h / 2], [w * 0.62, h], [w * 0.62, h * 0.65], [0, h * 0.65]];
  return [];
}

/** Every media item a design uses (for loading and for warnings when one was removed). */
export const docMedia = (doc) => [...new Set(doc.layers.filter((L) => L.type === 'image' && L.mediaId).map((L) => L.mediaId))];

// ---------------------------------------------------------------- saved designs
export const PHOTO_KEY = 'pvm.photo.v1';
export function loadDesigns(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(PHOTO_KEY)) || {};
    const docs = (Array.isArray(raw.docs) ? raw.docs : []).map(normalizeDoc).filter(Boolean);
    return { current: docs.some((d) => d.id === raw.current) ? raw.current : docs[0]?.id || null, docs };
  } catch {
    return { current: null, docs: [] };
  }
}
export function saveDesigns(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(PHOTO_KEY, JSON.stringify({ current: state.current, docs: state.docs }));
    return true;
  } catch {
    return false;
  }
}
