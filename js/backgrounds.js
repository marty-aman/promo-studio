// Backgrounds behind a cut-out (Remove background): animated scenes drawn on the canvas (so they're
// copyright free and export at any size), a gradient from your cover art's colours, a plain colour,
// the blurred original clip, or another clip / image from your media. Plus the ranking of suggestions.

export const SCENES = [
  ['smoke', 'Smoke', 'Coloured haze drifting behind you'],
  ['stage', 'Stage lights', 'Swinging beams that flash on the beat'],
  ['concrete', 'Concrete wall', 'Gritty wall under a spotlight'],
  ['neongrid', 'Neon grid', 'Synthwave sun and a grid rushing at you'],
  ['lasers', 'Lasers', 'Laser fans sweeping through haze'],
  ['starfield', 'Starfield', 'Stars streaking past, faster on the beat'],
  ['bokeh', 'Bokeh lights', 'Soft out-of-focus lights'],
];

export const BACKDROP_KINDS = ['scene', 'gradient', 'color', 'blur', 'media'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);

function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * Two vivid colours from RGBA pixels (e.g. a 32x32 copy of the cover art). Hues are bucketed and
 * weighted by saturation and brightness; the result is brightened so it glows on a dark scene.
 */
export function paletteFromPixels(data) {
  const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0 }));
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 128) continue;
    const [h, s, v] = rgbToHsv(data[p], data[p + 1], data[p + 2]);
    if (s < 0.25 || v < 0.2) continue;
    const w = s * v;
    const bin = bins[Math.floor(h / 30) % 12];
    // circular mean of hue inside the bin
    bin.w += w;
    bin.h += w * h;
  }
  const ranked = bins.map((b, i) => ({ i, w: b.w, h: b.w ? b.h / b.w : i * 30 + 15 })).sort((a, b) => b.w - a.w);
  const first = ranked[0].w > 0 ? ranked[0] : null;
  if (!first) return ['#ff2bd6', '#2b6bff'];
  // second colour: the strongest hue at least 60 degrees away, else a complementary shift
  const far = ranked.find((b) => b.w > 0 && Math.min(Math.abs(b.h - first.h), 360 - Math.abs(b.h - first.h)) >= 60);
  const h2 = far ? far.h : (first.h + 150) % 360;
  return [hsvToHex(first.h, 0.85, 1), hsvToHex(h2, 0.8, 0.95)];
}

/** Palette from an <img> (cover art). Browser only. */
export function coverPalette(img) {
  if (!img || !img.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 32, 32);
  try {
    return paletteFromPixels(g.getImageData(0, 0, 32, 32).data);
  } catch {
    return null;
  }
}

// which scenes suit which template (first = best)
const SCENE_FOR = {
  rock: ['concrete', 'smoke', 'stage', 'lasers'],
  hype: ['lasers', 'stage', 'concrete', 'smoke'],
  fullband: ['stage', 'smoke', 'lasers', 'concrete'],
  challenge: ['concrete', 'smoke', 'stage'],
  riff: ['smoke', 'concrete', 'stage'],
  poster: ['concrete', 'smoke', 'stage'],
  neon: ['neongrid', 'lasers', 'starfield'],
  tunnel: ['neongrid', 'starfield', 'lasers'],
  basscam: ['lasers', 'neongrid', 'smoke'],
  vhs: ['neongrid', 'starfield', 'smoke'],
  cinematic: ['bokeh', 'smoke', 'stage'],
  spotlight: ['bokeh', 'stage', 'smoke'],
  lyricvideo: ['bokeh', 'smoke', 'starfield'],
  golden: ['bokeh', 'smoke'],
  countdown: ['lasers', 'stage', 'neongrid'],
  minimal: [],
};
// alt-metal / emocore default when no template is set
const DEFAULT_SCENES = ['smoke', 'stage', 'concrete', 'neongrid', 'lasers'];

/**
 * Suggested backgrounds for a cut-out, best first.
 * ctx: { template, palette: [c1, c2], otherMedia: [{id, name, kind}] }
 * Returns [{ id, label, why, bg }] where bg is a clip.bgRemove.background value.
 */
export function suggestBackdrops({ template = null, palette = null, otherMedia = [] } = {}) {
  const [c1, c2] = palette && palette.length >= 2 ? palette : ['#ff2bd6', '#2b6bff'];
  const fromCover = !!(palette && palette.length >= 2);
  const out = [];
  const add = (id, label, why, bg) => {
    if (!out.some((o) => o.id === id)) out.push({ id, label, why, bg });
  };
  const preferred = template && SCENE_FOR[template] ? SCENE_FOR[template] : DEFAULT_SCENES;
  const why = template && SCENE_FOR[template] ? 'fits your template' : 'fits alt / heavy music';
  for (const s of preferred) add(`scene:${s}`, SCENES.find((x) => x[0] === s)[1], why, { kind: 'scene', scene: s, color: c1, color2: c2 });
  add('gradient', fromCover ? 'Cover colours' : 'Colour gradient', fromCover ? 'colours from your cover art' : 'a moving two-colour gradient', { kind: 'gradient', color: c1, color2: c2 });
  add('blur', 'Blurred original', 'keeps the real location, out of focus', { kind: 'blur' });
  for (const m of otherMedia.slice(0, 2)) add(`media:${m.id}`, m.name, 'another clip of yours behind you', { kind: 'media', mediaId: m.id });
  for (const [s, label] of SCENES) add(`scene:${s}`, label, 'animated scene', { kind: 'scene', scene: s, color: c1, color2: c2 });
  add('color', 'Solid colour', 'clean, poster-like', { kind: 'color', color: '#0d0d12' });
  return out;
}

/** Stock-footage searches that make good backgrounds, matched to the template. */
export function backdropSearches(template = null) {
  const base = ['concert lights', 'smoke background', 'crowd silhouette', 'stage lights', 'abstract dark'];
  if (['neon', 'tunnel', 'vhs', 'basscam'].includes(template)) return ['neon city night', 'synthwave', 'neon lights', ...base].slice(0, 6);
  if (['cinematic', 'golden', 'spotlight', 'lyricvideo'].includes(template)) return ['bokeh lights', 'sunset sky', 'rain window', ...base].slice(0, 6);
  return [...base, 'fire embers'].slice(0, 6);
}

// ------------------------------------------------------------ drawing

let concreteTex = null;
function concrete(W, H) {
  const w = Math.max(16, Math.round(W / 4));
  const h = Math.max(16, Math.round(H / 4));
  if (concreteTex && concreteTex.width === w && concreteTex.height === h) return concreteTex;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  // value noise at a few scales + grain
  const cell = (x, y, s, seed) => rnd(Math.floor(x / s) * 157.1 + Math.floor(y / s) * 311.7 + seed);
  const lerpN = (x, y, s, seed) => {
    const fx = fract(x / s);
    const fy = fract(y / s);
    const a = cell(x, y, s, seed);
    const b = cell(x + s, y, s, seed);
    const c2 = cell(x, y + s, s, seed);
    const e = cell(x + s, y + s, s, seed);
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + e) * u * v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = 0.5 * lerpN(x, y, 40, 1) + 0.3 * lerpN(x, y, 12, 2) + 0.2 * rnd(x * 7.3 + y * 91.1);
      const v = 70 + n * 70;
      const p = (y * w + x) * 4;
      d[p] = v;
      d[p + 1] = v * 0.98;
      d[p + 2] = v * 0.95;
      d[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // panel seams
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = Math.max(1, w * 0.004);
  for (let y = h / 3; y < h; y += h / 3) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  concreteTex = c;
  return c;
}

function vignette(ctx, W, H, a = 0.6) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const DRAW = {
  _gradient(ctx, W, H, t, beat, c1, c2) {
    const a = t * 0.25;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * W, H / 2 - Math.sin(a) * H, W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, 0.35 - 0.15 * beat);
  },
  smoke(ctx, W, H, t, beat, c1, c2) {
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const x = W * (0.5 + 0.45 * Math.sin(t * (0.07 + rnd(i) * 0.06) + i * 2.1));
      const y = H * (0.55 + 0.4 * Math.cos(t * (0.05 + rnd(i + 9) * 0.05) + i * 1.3));
      const r = Math.max(W, H) * (0.25 + 0.2 * rnd(i + 3));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(i % 2 ? c1 : c2, 0.16 + 0.06 * beat));
      g.addColorStop(1, rgba(i % 2 ? c1 : c2, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, W, H, 0.55);
  },
  stage(ctx, W, H, t, beat, c1, c2) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05040a');
    bg.addColorStop(1, '#120a18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x0 = W * ((i + 0.5) / n);
      const ang = Math.sin(t * 0.6 + i * 1.7) * 0.35;
      const len = H * 1.2;
      const spread = W * 0.12;
      const x1 = x0 + Math.sin(ang) * len;
      const y1 = Math.cos(ang) * len;
      const col = i % 2 ? c1 : c2;
      const g = ctx.createLinearGradient(x0, 0, x1, y1);
      g.addColorStop(0, rgba(col, 0.55 + 0.35 * beat));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - W * 0.01, -2);
      ctx.lineTo(x0 + W * 0.01, -2);
      ctx.lineTo(x1 + spread, y1);
      ctx.lineTo(x1 - spread, y1);
      ctx.closePath();
      ctx.fill();
    }
    const haze = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, H * 0.6);
    haze.addColorStop(0, rgba(c1, 0.25 + 0.15 * beat));
    haze.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, W, H, 0.5);
  },
  concrete(ctx, W, H, t, beat, c1) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(concrete(W, H), 0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(40,40,48,1)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + 0.1 * Math.sin(t * 13) * Math.sin(t * 7.1) + 0.15 * beat;
    const g = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.35, Math.max(W, H) * 0.6);
    g.addColorStop(0, rgba('#ffffff', 0.28 * flick));
    g.addColorStop(0.4, rgba(c1, 0.14 * flick));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, W, H, 0.7);
  },
  neongrid(ctx, W, H, t, beat, c1, c2) {
    const hz = H * 0.58;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#07021a');
    sky.addColorStop(1, rgba(c1, 0.55));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hz);
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, hz, W, H - hz);
    // sun with stripes
    const r = W * 0.28;
    const sun = ctx.createLinearGradient(0, hz - r * 2, 0, hz);
    sun.addColorStop(0, '#ffe36e');
    sun.addColorStop(1, c1);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, hz - r * 0.35, r, Math.PI, 0);
    ctx.lineTo(W / 2 + r, hz);
    ctx.lineTo(W / 2 - r, hz);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = sun;
    ctx.fillRect(W / 2 - r, hz - r * 1.4, r * 2, r * 1.4);
    ctx.fillStyle = '#07021a';
    for (let k = 0; k < 6; k++) {
      const y = hz - r * 0.1 - k * r * 0.14;
      ctx.fillRect(W / 2 - r, y, r * 2, r * (0.07 - k * 0.009));
    }
    ctx.restore();
    // grid
    ctx.strokeStyle = rgba(c2, 0.8 + 0.2 * beat);
    ctx.lineWidth = Math.max(1, W * 0.003);
    for (let k = 0; k < 14; k++) {
      const z = fract(k / 14 + t * 0.35);
      const y = hz + (H - hz) * z * z;
      ctx.globalAlpha = clamp(z * 2, 0, 1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let k = -10; k <= 10; k++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + k * W * 0.02, hz);
      ctx.lineTo(W / 2 + k * W * 0.22, H);
      ctx.stroke();
    }
    const glow = ctx.createLinearGradient(0, hz - H * 0.04, 0, hz + H * 0.04);
    glow.addColorStop(0, rgba(c2, 0));
    glow.addColorStop(0.5, rgba(c2, 0.6));
    glow.addColorStop(1, rgba(c2, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, hz - H * 0.04, W, H * 0.08);
  },
  lasers(ctx, W, H, t, beat, c1, c2) {
    ctx.fillStyle = '#04030a';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [ox, col, dir] of [[0.15, c1, 1], [0.85, c2, -1]]) {
      const x0 = W * ox;
      const y0 = H * 1.02;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + dir * (Math.sin(t * 0.8) * 0.5 + (i - 4) * 0.12);
        const x1 = x0 + Math.cos(a) * H * 1.4;
        const y1 = y0 + Math.sin(a) * H * 1.4;
        ctx.strokeStyle = rgba(col, 0.18 + 0.25 * beat);
        ctx.lineWidth = Math.max(2, W * 0.012);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.35 + 0.3 * beat);
        ctx.lineWidth = Math.max(1, W * 0.002);
        ctx.stroke();
      }
    }
    const haze = ctx.createLinearGradient(0, H * 0.5, 0, H);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, rgba(c1, 0.15));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  },
  starfield(ctx, W, H, t, beat, c1, c2) {
    ctx.fillStyle = '#02020a';
    ctx.fillRect(0, 0, W, H);
    const neb = ctx.createRadialGradient(W * 0.3, H * 0.35, 0, W * 0.3, H * 0.35, H * 0.6);
    neb.addColorStop(0, rgba(c1, 0.22));
    neb.addColorStop(1, rgba(c2, 0));
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);
    const speed = 0.25 + 0.25 * beat;
    for (let i = 0; i < 150; i++) {
      const z = fract(rnd(i) - t * speed * (0.6 + rnd(i + 5) * 0.8));
      const zz = Math.max(0.03, z);
      const sx = (rnd(i + 11) - 0.5) * W * 1.2;
      const sy = (rnd(i + 23) - 0.5) * H * 1.2;
      const x = W / 2 + sx / zz * 0.3;
      const y = H / 2 + sy / zz * 0.3;
      const zp = Math.max(0.03, zz + 0.05);
      const xp = W / 2 + sx / zp * 0.3;
      const yp = H / 2 + sy / zp * 0.3;
      ctx.strokeStyle = `rgba(255,255,255,${clamp(1.2 - zz, 0, 1)})`;
      ctx.lineWidth = Math.max(1, (1 - zz) * W * 0.004);
      ctx.beginPath();
      ctx.moveTo(xp, yp);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  },
  bokeh(ctx, W, H, t, beat, c1, c2) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0814');
    bg.addColorStop(1, '#1a0f1f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = W * fract(rnd(i) + t * 0.01 * (rnd(i + 2) - 0.5));
      const y = H * fract(rnd(i + 7) - t * 0.015 * (0.5 + rnd(i + 3)));
      const r = Math.min(W, H) * (0.04 + 0.1 * rnd(i + 13));
      const col = [c1, c2, '#ffd9a0'][i % 3];
      const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
      const a = 0.18 + 0.12 * rnd(i + 17) + 0.06 * beat;
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(0.85, rgba(col, a * 0.8));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, W, H, 0.45);
  },
};

// Scenes are soft, so they're drawn on a smaller canvas and scaled up (smoke at 1/4 size is 16x cheaper).
const SCENE_SCALE = { smoke: 0.25, stage: 0.4, concrete: 0.5, neongrid: 0.5, lasers: 0.5, starfield: 0.5, bokeh: 0.33, _gradient: 0.25 };
let sceneBuf = null;

/**
 * Draw a scene / gradient / colour background over the whole frame. Returns false for kinds the
 * renderer draws itself ('blur' and 'media').
 */
export function drawBackdrop(ctx, W, H, bg, t = 0, beat = 0) {
  if (!bg) return false;
  const c1 = bg.color || '#ff2bd6';
  const c2 = bg.color2 || '#2b6bff';
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  let drawn = true;
  const sceneId = bg.kind === 'scene' && DRAW[bg.scene] ? bg.scene : bg.kind === 'gradient' ? '_gradient' : null;
  if (sceneId) {
    const k = W * H > 300 * 300 ? SCENE_SCALE[sceneId] || 0.5 : 1;
    if (k < 1 && typeof document !== 'undefined') {
      const w = Math.max(16, Math.round(W * k));
      const h = Math.max(16, Math.round(H * k));
      sceneBuf ||= document.createElement('canvas');
      if (sceneBuf.width !== w || sceneBuf.height !== h) {
        sceneBuf.width = w;
        sceneBuf.height = h;
      }
      const g = sceneBuf.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      DRAW[sceneId](g, w, h, t, beat, c1, c2);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sceneBuf, 0, 0, W, H);
    } else DRAW[sceneId](ctx, W, H, t, beat, c1, c2);
  } else if (bg.kind === 'color') {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, W, H);
  } else drawn = false;
  ctx.restore();
  return drawn;
}
