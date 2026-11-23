// Draw a Photo Studio design on a canvas: each layer is drawn on its own canvas, masked, then
// put on the design with its opacity, blend mode and shadow. The same code draws the preview
// (scaled down) and the export (full size, or one carousel slide at a time).
import { filterCSS, fitImage, wrapText, shapePoints, slices } from './model.js';

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** "#rrggbb" + alpha → rgba(). */
export function rgba(hex, a = 1) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || '').trim());
  if (!m) return hex || 'transparent';
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

export const fontOf = (L, scale = 1) => `${L.italic ? 'italic ' : ''}${L.weight || 400} ${Math.max(1, L.size * scale)}px "${L.font}", sans-serif`;

/** The lines a text layer draws, and the height they take (in design pixels). */
export function layoutText(L, ctx = mk(4, 4).getContext('2d')) {
  ctx.font = fontOf(L);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${L.letter || 0}px`;
  const text = L.upper ? String(L.text).toUpperCase() : String(L.text);
  const lines = wrapText(text, L.w, (s) => ctx.measureText(s).width);
  const lh = L.size * (L.lineHeight || 1.1);
  return { lines, lh, height: Math.ceil(lines.length * lh + L.size * 0.15) };
}

function drawText(c, L) {
  const { lines, lh } = layoutText(L, c);
  c.font = fontOf(L);
  if ('letterSpacing' in c) c.letterSpacing = `${L.letter || 0}px`;
  c.textBaseline = 'alphabetic';
  c.textAlign = L.align === 'left' ? 'left' : L.align === 'right' ? 'right' : 'center';
  const x = L.align === 'left' ? 0 : L.align === 'right' ? L.w : L.w / 2;
  if (L.bg && L.bg.on) {
    const pad = L.size * (L.bg.pad || 0.3);
    c.fillStyle = L.bg.color;
    for (const [i, line] of lines.entries()) {
      if (!line) continue;
      const w = c.measureText(line).width;
      const lx = L.align === 'left' ? 0 : L.align === 'right' ? L.w - w : (L.w - w) / 2;
      c.beginPath();
      c.roundRect(lx - pad, i * lh + lh * 0.08 - pad * 0.35, w + pad * 2, lh + pad * 0.5, L.size * (L.bg.radius || 0));
      c.fill();
    }
  }
  for (const [i, line] of lines.entries()) {
    const y = i * lh + L.size * 0.92;
    if (L.stroke && L.stroke.on && L.stroke.width > 0) {
      c.lineJoin = 'round';
      c.lineWidth = L.stroke.width * 2;
      c.strokeStyle = L.stroke.color;
      c.strokeText(line, x, y);
    }
    c.fillStyle = L.color;
    c.fillText(line, x, y);
  }
}

function linearPoints(w, h, angle) {
  // CSS-style: 180deg = top to bottom
  const a = ((angle - 90) * Math.PI) / 180;
  const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const dx = (Math.cos(a) * len) / 2;
  const dy = (Math.sin(a) * len) / 2;
  return [w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy];
}

function drawShape(c, L) {
  c.beginPath();
  if (L.shape === 'ellipse') c.ellipse(L.w / 2, L.h / 2, L.w / 2, L.h / 2, 0, 0, Math.PI * 2);
  else if (L.shape === 'line') {
    c.moveTo(0, L.h / 2);
    c.lineTo(L.w, L.h / 2);
    c.lineWidth = Math.max(1, L.strokeW || L.h);
    c.strokeStyle = L.fillOn ? L.fill : L.stroke;
    c.lineCap = 'round';
    c.stroke();
    return;
  } else if (['triangle', 'star', 'arrow'].includes(L.shape)) {
    const pts = shapePoints(L.shape, L.w, L.h);
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  } else c.roundRect(0, 0, L.w, L.h, Math.min(L.w, L.h) * (L.radius || 0) * 0.5);
  if (L.fillOn !== false) {
    c.fillStyle = L.fill;
    c.fill();
  }
  if (L.strokeW > 0) {
    c.lineWidth = L.strokeW;
    c.strokeStyle = L.stroke;
    c.lineJoin = 'round';
    c.stroke();
  }
}

function drawGradient(c, L) {
  const g = L.kind === 'radial' ? c.createRadialGradient(L.w / 2, L.h / 2, 0, L.w / 2, L.h / 2, Math.hypot(L.w, L.h) / 2) : c.createLinearGradient(...linearPoints(L.w, L.h, L.angle || 180));
  g.addColorStop(0, rgba(L.from, L.fromAlpha ?? 1));
  g.addColorStop(Math.min(0.98, Math.max(0.02, L.mid ?? 0.5)), rgba(L.from === L.to ? L.from : L.to, ((L.fromAlpha ?? 1) + (L.toAlpha ?? 1)) / 2));
  g.addColorStop(1, rgba(L.to, L.toAlpha ?? 1));
  c.fillStyle = g;
  c.fillRect(0, 0, L.w, L.h);
}

function drawImage(c, L, img, preview) {
  const iw = img && (img.naturalWidth || img.videoWidth || img.width);
  const ih = img && (img.naturalHeight || img.videoHeight || img.height);
  if (!iw || !ih) {
    if (!preview) return;
    c.fillStyle = '#3a3e4c';
    c.fillRect(0, 0, L.w, L.h);
    c.fillStyle = '#9a9daa';
    c.font = `600 ${Math.max(14, Math.min(L.w, L.h) * 0.06)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText(L.mediaId ? 'Photo missing' : 'Pick a photo', L.w / 2, L.h / 2);
    return;
  }
  const f = fitImage(iw, ih, L.w, L.h, L);
  c.drawImage(img, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
}

/** Move a canvas context into a layer's box: centre, rotate, flip. */
function enterBox(c, L, scale) {
  c.translate((L.x + L.w / 2) * scale, (L.y + L.h / 2) * scale);
  c.rotate((L.rot * Math.PI) / 180);
  c.scale(scale * (L.flipX ? -1 : 1), scale * (L.flipY ? -1 : 1));
  c.translate(-L.w / 2, -L.h / 2);
}

function applyMask(c, L, scale, opt, below, img) {
  const M = L.mask;
  if (!M || M.type === 'none') return;
  if (M.type === 'clip') {
    c.save();
    c.globalCompositeOperation = M.invert ? 'destination-out' : 'destination-in';
    if (below) c.drawImage(below, 0, 0);
    else if (!M.invert) c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
    return;
  }
  const m = mk(c.canvas.width, c.canvas.height);
  const g = m.getContext('2d');
  g.save();
  if (opt.offsetX) g.translate(-opt.offsetX * scale, 0);
  enterBox(g, { ...L, flipX: false, flipY: false }, scale);
  const feather = Math.max(0, Math.min(1, M.feather ?? 0.15));
  if (M.type === 'person') {
    const matte = L.type === 'image' && opt.getMatte ? opt.getMatte(L.mediaId) : null;
    if (matte && img) {
      const f = fitImage(img.naturalWidth || img.width, img.naturalHeight || img.height, L.w, L.h, L);
      const kx = matte.width / (img.naturalWidth || img.width);
      const ky = matte.height / (img.naturalHeight || img.height);
      if (L.flipX || L.flipY) {
        g.translate(L.flipX ? L.w : 0, L.flipY ? L.h : 0);
        g.scale(L.flipX ? -1 : 1, L.flipY ? -1 : 1);
      }
      g.drawImage(matte, f.sx * kx, f.sy * ky, f.sw * kx, f.sh * ky, f.dx, f.dy, f.dw, f.dh);
    } else {
      g.fillStyle = '#fff'; // matte not ready yet: show the whole photo
      g.fillRect(0, 0, L.w, L.h);
    }
  } else if (M.type === 'rect' || M.type === 'ellipse') {
    const blur = feather * Math.min(L.w * M.w, L.h * M.h) * 0.25 * scale;
    if (blur > 0.5) g.filter = `blur(${blur}px)`;
    g.fillStyle = '#fff';
    g.beginPath();
    if (M.type === 'ellipse') g.ellipse(L.w * (M.x + M.w / 2), L.h * (M.y + M.h / 2), (L.w * M.w) / 2, (L.h * M.h) / 2, 0, 0, Math.PI * 2);
    else g.rect(L.w * M.x, L.h * M.y, L.w * M.w, L.h * M.h);
    g.fill();
  } else if (M.type === 'radial') {
    const r = Math.hypot(L.w, L.h) / 2;
    const gr = g.createRadialGradient(L.w * (M.x + M.w / 2), L.h * (M.y + M.h / 2), r * (1 - Math.max(0.05, feather)) * 0.5, L.w * (M.x + M.w / 2), L.h * (M.y + M.h / 2), r * 0.75);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, L.w, L.h);
  } else {
    // fades: opaque until (1 - feather) of the way, then clear
    const dir = { fadeDown: [0, 0, 0, L.h], fadeUp: [0, L.h, 0, 0], fadeRight: [0, 0, L.w, 0], fadeLeft: [L.w, 0, 0, 0] }[M.type];
    if (dir) {
      const gr = g.createLinearGradient(...dir);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(Math.max(0, 1 - Math.max(0.05, feather) - 0.0001), '#fff');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, L.w, L.h);
    }
  }
  g.restore();
  c.save();
  c.globalCompositeOperation = M.invert ? 'destination-out' : 'destination-in';
  c.drawImage(m, 0, 0);
  c.restore();
}

/** One layer drawn and masked on its own canvas the size of the output. */
export function renderLayer(L, W, H, scale, opt = {}, below = null) {
  const c = mk(W, H).getContext('2d');
  const img = L.type === 'image' && L.mediaId && opt.getImage ? opt.getImage(L.mediaId) : null;
  c.save();
  if (opt.offsetX) c.translate(-opt.offsetX * scale, 0);
  enterBox(c, L, scale);
  const f = filterCSS(L.adjust, scale);
  if (f !== 'none') c.filter = f;
  if (L.type === 'image') drawImage(c, L, img, opt.preview);
  else if (L.type === 'text') drawText(c, L);
  else if (L.type === 'shape') drawShape(c, L);
  else if (L.type === 'gradient') drawGradient(c, L);
  c.restore();
  applyMask(c, L, scale, opt, below, img);
  return c.canvas;
}

/**
 * Draw the design. `opt`: { scale, getImage(id), getMatte(id), preview, offsetX, hide }
 * (offsetX draws the part of the design from there, for carousel slides).
 */
export function drawDoc(ctx, doc, opt = {}) {
  const scale = opt.scale || 1;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = doc.bg || '#000000';
  ctx.fillRect(0, 0, W, H);
  let below = null;
  const keep = opt.cache ? new Set() : null;
  for (const L of doc.layers) {
    if (!L.visible || (opt.hide && opt.hide === L.id)) {
      below = null;
      continue;
    }
    let lc;
    if (opt.cache) {
      // preview only: a layer that did not change since the last frame is not drawn again
      const sig = layerSig(L, W, H, scale, opt, below);
      const hit = opt.cache.get(L.id);
      if (hit && hit.sig === sig) lc = hit.canvas;
      else {
        lc = renderLayer(L, W, H, scale, opt, below);
        opt.cache.set(L.id, { sig, canvas: lc });
      }
      keep.add(L.id);
    } else lc = renderLayer(L, W, H, scale, opt, below);
    ctx.save();
    ctx.globalAlpha = L.opacity;
    ctx.globalCompositeOperation = L.blend || 'source-over';
    if (L.shadow && L.shadow.on) {
      ctx.shadowColor = L.shadow.color;
      ctx.shadowBlur = L.shadow.blur * scale;
      ctx.shadowOffsetX = L.shadow.x * scale;
      ctx.shadowOffsetY = L.shadow.y * scale;
    }
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
    below = lc;
  }
  if (keep) for (const id of [...opt.cache.keys()]) if (!keep.has(id)) opt.cache.delete(id);
  ctx.restore();
}

// Identity numbers for the objects a layer is drawn from (a photo element, a person matte, the layer drawn below it),
// so a cached layer is redrawn when its photo, matte or clip source is a different object than last time.
const ids = new WeakMap();
let nextId = 1;
const idOf = (o) => {
  if (!o) return 0;
  if (!ids.has(o)) ids.set(o, nextId++);
  return ids.get(o);
};
/** Everything a layer's picture depends on, as a string. `opt.epoch` changes when fonts or files arrive. */
export function layerSig(L, W, H, scale, opt, below) {
  const img = L.type === 'image' && L.mediaId && opt.getImage ? opt.getImage(L.mediaId) : null;
  const matte = L.type === 'image' && L.mask && L.mask.type === 'person' && opt.getMatte ? opt.getMatte(L.mediaId) : null;
  const clip = L.mask && L.mask.type === 'clip' ? idOf(below) : 0;
  return `${JSON.stringify(L)}|${W}x${H}@${scale}|${opt.offsetX || 0}|${opt.preview ? 1 : 0}|${opt.epoch || 0}|${idOf(img)}|${idOf(matte)}|${clip}`;
}

/** The whole design at full size (or `scale`), as a canvas. */
export function renderDoc(doc, opt = {}) {
  const scale = opt.scale || 1;
  const c = mk(doc.w * scale, doc.h * scale);
  drawDoc(c.getContext('2d'), doc, { ...opt, scale });
  return c;
}

/** Each carousel slide (or the one design) as its own full-size canvas. */
export function renderSlides(doc, opt = {}) {
  const k = opt.scale || 1; // 2 or 3 for a print-size export
  return slices(doc).map((s) => {
    const c = mk(s.w * k, doc.h * k);
    drawDoc(c.getContext('2d'), doc, { ...opt, scale: k, offsetX: s.x });
    return c;
  });
}

export const canvasBlob = (c, type = 'image/png', quality = 0.92) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image.'))), type, quality));
