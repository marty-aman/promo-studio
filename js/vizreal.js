// Realistic visualizers: things that look like real gear or real fire, driven by the same analysis as
// the other visualizers (level, 16 bands, waveform, onsets). Everything reads only the analysis at
// past/current times, so the preview and the export are identical.
//   vu          two analog VU meters with needle ballistics
//   eq          rack-mount LED spectrum analyser with falling peak caps
//   scope       CRT oscilloscope with phosphor afterglow
//   speaker     a woofer whose cone pumps with the low end
//   fire        flames that roar with the level
//   spectrogram studio-style scrolling spectrogram
// layer.classic (default true) keeps real-world colours (cream VU face, green-yellow-red LEDs,
// green phosphor, orange fire); false uses the layer's colours (themes turn it off).
import { glowPass } from './canvasfx.js';
import { GEAR_STYLES, GEAR_PLACEMENT, GEAR_DRAW } from './vizgear.js';

export const REAL_STYLES = [
  ['vu', 'VU meters', 'Two analog meters with swinging needles'],
  ['eq', 'LED spectrum rack', 'Hardware analyser with LED bars and peak caps'],
  ['scope', 'CRT oscilloscope', 'Glowing phosphor trace of the real waveform'],
  ['speaker', 'Speaker cone', 'A woofer that pumps with the low end'],
  ['fire', 'Fire', 'Flames that roar with the music'],
  ['spectrogram', 'Spectrogram', 'Studio-style scrolling frequency picture'],
  ...GEAR_STYLES, // tape reels, mixing desk, lightning, vibrating strings (vizgear.js)
];

/** Placement and blend that suit each style when you switch to it. */
export const REAL_PLACEMENT = {
  vu: { y: 80, size: 84, blend: 'source-over' },
  eq: { y: 80, size: 88, blend: 'source-over' },
  scope: { y: 78, size: 82, blend: 'source-over' },
  speaker: { y: 52, size: 72, blend: 'source-over' },
  fire: { y: 100, size: 100, blend: 'source-over' },
  spectrogram: { y: 82, size: 92, blend: 'source-over' },
  ...GEAR_PLACEMENT,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
const rgba = (hex, a) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const mix = (a, b, k) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
function rrect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- analysis helpers (pure, exported for tests)

/** VU ballistics: the level averaged over the last 300 ms (a real VU needle's integration time). */
export function vuValue(levels, fps, f) {
  const n = Math.max(1, Math.round(0.3 * fps));
  let s = 0;
  let w = 0;
  for (let k = 0; k < n; k++) {
    const i = f - k;
    if (i < 0) break;
    const wk = 1 - k / n; // recent frames count more, so it rises quickly and falls back smoothly
    s += levels[i] * wk;
    w += wk;
  }
  return w ? s / w : 0;
}

/** LED peak hold: the highest recent value, falling at `fall` per second after a short hold. */
export function peakHold(values, fps, f, { hold = 0.35, fall = 1.4 } = {}) {
  let best = 0;
  const span = Math.round((hold + 1.2) * fps);
  for (let k = 0; k <= span; k++) {
    const i = f - k;
    if (i < 0) break;
    const age = k / fps;
    const v = values(i) - Math.max(0, age - hold) * fall;
    if (v > best) best = v;
  }
  return best;
}

/** Low-end energy (first 3 bands) at frame f. */
const lowAt = (feat, f) => {
  if (f < 0 || f >= feat.frames) return 0;
  const b = feat.bands;
  const n = feat.nbands;
  return (b[f * n] + b[f * n + 1] + b[f * n + 2]) / 3;
};

let bufs = {};
function buf(name, w, h) {
  const c = (bufs[name] ||= document.createElement('canvas'));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.clearRect(0, 0, w, h);
  return [c, g];
}

// ---- VU meters

function drawVU(ctx, W, H, layer, feat, ts, h) {
  const { cx, cy, S, I } = h;
  const classic = layer.classic !== false;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  // left meter: the whole level; right: the low end (kick and bass)
  const lowSeries = new Float32Array(Math.round(0.3 * feat.fps) + 1).map((_, k) => lowAt(feat, f - (Math.round(0.3 * feat.fps) - k)));
  const vals = live ? [vuValue(feat.level, feat.fps, f) * (0.75 + I * 0.4), vuValue(lowSeries, feat.fps, lowSeries.length - 1) * (0.7 + I * 0.4)] : [0, 0];
  const mw = S * 0.48;
  const mh = mw * 0.62;
  const face = classic ? '#f1e3b8' : mix(layer.color2 || '#ffffff', '#000000', 0.82);
  const ink = classic ? '#1b1712' : layer.color2 || '#ffffff';
  const red = classic ? '#c0241b' : layer.color;
  const G = glowPass(ctx, cx - S / 2, cy - mh / 2, S, mh, S * 0.03);
  ['VU', 'LOW'].forEach((label, m) => {
    const x = cx - S / 2 + m * (S - mw);
    const y = cy - mh / 2;
    // housing
    const hg = ctx.createLinearGradient(0, y, 0, y + mh);
    hg.addColorStop(0, '#3a3a3e');
    hg.addColorStop(1, '#141416');
    ctx.fillStyle = hg;
    rrect(ctx, x, y, mw, mh, mw * 0.05);
    ctx.fill();
    // face with backlight
    const px = x + mw * 0.05;
    const py = y + mh * 0.07;
    const pw = mw * 0.9;
    const ph = mh * 0.86;
    const fg = ctx.createRadialGradient(px + pw / 2, py + ph * 0.95, ph * 0.1, px + pw / 2, py + ph * 0.6, pw * 0.8);
    fg.addColorStop(0, classic ? '#fff4cf' : mix(face, layer.color || '#ff0000', 0.15));
    fg.addColorStop(1, face);
    ctx.fillStyle = fg;
    rrect(ctx, px, py, pw, ph, mw * 0.03);
    ctx.fill();
    // scale: -20 .. +3 VU on an arc
    const pivX = px + pw / 2;
    const pivY = py + ph * 1.05;
    const R = ph * 0.82;
    const a0 = -Math.PI / 2 - 0.85;
    const a1 = -Math.PI / 2 + 0.85;
    const dbs = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3];
    const pos = (db) => (Math.pow(10, db / 20) - 0.1) / (Math.pow(10, 3 / 20) - 0.1); // log scale like a real VU
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, mw * 0.006);
    ctx.beginPath();
    ctx.arc(pivX, pivY, R, a0, a0 + (a1 - a0) * pos(0));
    ctx.stroke();
    ctx.strokeStyle = red;
    ctx.lineWidth = Math.max(2, mw * 0.018);
    ctx.beginPath();
    ctx.arc(pivX, pivY, R + mw * 0.008, a0 + (a1 - a0) * pos(0), a1);
    ctx.stroke();
    ctx.font = `700 ${Math.round(mw * 0.04)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const db of dbs) {
      const a = a0 + (a1 - a0) * pos(db);
      const major = [-20, -10, -5, 0, 3].includes(db);
      ctx.strokeStyle = db > 0 ? red : ink;
      ctx.lineWidth = Math.max(1, mw * (major ? 0.008 : 0.005));
      ctx.beginPath();
      ctx.moveTo(pivX + Math.cos(a) * R, pivY + Math.sin(a) * R);
      ctx.lineTo(pivX + Math.cos(a) * (R + mw * (major ? 0.05 : 0.03)), pivY + Math.sin(a) * (R + mw * (major ? 0.05 : 0.03)));
      ctx.stroke();
      if (major || db === -7 || db === -3) {
        ctx.fillStyle = db > 0 ? red : ink;
        ctx.fillText(String(Math.abs(db)), pivX + Math.cos(a) * (R + mw * 0.09), pivY + Math.sin(a) * (R + mw * 0.09));
      }
    }
    ctx.fillStyle = ink;
    ctx.font = `800 ${Math.round(mw * 0.07)}px Georgia, serif`;
    ctx.fillText(label, pivX, py + ph * 0.62);
    // needle (with a little jitter like a real one)
    const v = clamp(vals[m] + (rnd(Math.floor(ts * 60) + m * 9) - 0.5) * 0.01, 0, 1.08);
    const a = a0 + (a1 - a0) * v;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1.5, mw * 0.008);
    ctx.beginPath();
    ctx.moveTo(pivX + mw * 0.012, pivY + mw * 0.01);
    ctx.lineTo(pivX + Math.cos(a) * R * 1.05 + mw * 0.012, pivY + Math.sin(a) * R * 1.05 + mw * 0.01);
    ctx.stroke();
    ctx.strokeStyle = classic ? '#111111' : layer.color;
    ctx.lineWidth = Math.max(1.2, mw * 0.007);
    ctx.beginPath();
    ctx.moveTo(pivX, pivY);
    ctx.lineTo(pivX + Math.cos(a) * R * 1.05, pivY + Math.sin(a) * R * 1.05);
    ctx.stroke();
    ctx.restore();
    // peak LED
    const peak = vals[m] > pos(1);
    const lx = px + pw * 0.88;
    const ly = py + ph * 0.18;
    ctx.fillStyle = peak ? '#ff2a1a' : '#4a1410';
    ctx.beginPath();
    ctx.arc(lx, ly, mw * 0.02, 0, Math.PI * 2);
    ctx.fill();
    if (peak) G.add((g) => ((g.fillStyle = '#ff2a1a'), g.beginPath(), g.arc(lx, ly, mw * 0.05, 0, Math.PI * 2), g.fill()));
    // glass
    const gl = ctx.createLinearGradient(px, py, px + pw * 0.6, py + ph);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    rrect(ctx, px, py, pw, ph, mw * 0.03);
    ctx.fill();
    // screws
    for (const [sx, sy] of [[x + mw * 0.025, y + mh * 0.035], [x + mw * 0.975, y + mh * 0.035], [x + mw * 0.025, y + mh * 0.965], [x + mw * 0.975, y + mh * 0.965]]) {
      ctx.fillStyle = '#8a8a90';
      ctx.beginPath();
      ctx.arc(sx, sy, mw * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  G.flush(0.9);
}

// ---- LED spectrum rack

function drawEQ(ctx, W, H, layer, feat, ts, h) {
  const { cx, cy, S, I } = h;
  const classic = layer.classic !== false;
  const n = feat.nbands;
  const w = S;
  const hh = S * 0.42;
  const x0 = cx - w / 2;
  const y0 = cy - hh / 2;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  // brushed-metal rack panel with ears
  const pg = ctx.createLinearGradient(0, y0, 0, y0 + hh);
  pg.addColorStop(0, '#4a4c50');
  pg.addColorStop(0.5, '#2c2e31');
  pg.addColorStop(1, '#1d1e20');
  ctx.fillStyle = pg;
  rrect(ctx, x0, y0, w, hh, w * 0.01);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    const yy = y0 + (hh * k) / 40;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x0 + w, yy);
    ctx.stroke();
  }
  for (const ex of [x0 + w * 0.025, x0 + w * 0.975]) {
    for (const ey of [y0 + hh * 0.15, y0 + hh * 0.85]) {
      ctx.fillStyle = '#111';
      rrect(ctx, ex - w * 0.008, ey - hh * 0.04, w * 0.016, hh * 0.08, w * 0.008);
      ctx.fill();
    }
  }
  // display window
  const dx = x0 + w * 0.06;
  const dy = y0 + hh * 0.1;
  const dw = w * 0.88;
  const dh = hh * 0.74;
  ctx.fillStyle = '#050607';
  rrect(ctx, dx, dy, dw, dh, w * 0.006);
  ctx.fill();
  const segs = 14;
  const gap = dw * 0.008;
  const cw = (dw - gap * (n + 1)) / n;
  const sh = (dh - gap * (segs + 1)) / segs;
  const colorFor = (k) => {
    const r = k / (segs - 1);
    if (classic) return r > 0.85 ? '#ff2b1d' : r > 0.62 ? '#ffd21a' : '#39ff4d';
    return r > 0.85 ? layer.color2 || '#ffffff' : mix(mix(layer.color, '#000000', 0.35), layer.color, r / 0.85);
  };
  const G = glowPass(ctx, dx, dy, dw, dh, S * 0.02);
  for (let b = 0; b < n; b++) {
    const bandVal = (i) => (i < 0 ? 0 : feat.bands[i * n + b] || 0);
    const v = live ? clamp(Math.max(bandVal(f), bandVal(f - 1) * 0.8, bandVal(f - 2) * 0.6) * (0.65 + I * 0.5), 0, 1) : 0;
    const pk = live ? clamp(peakHold(bandVal, feat.fps, f) * (0.65 + I * 0.5), 0, 1) : 0;
    const lit = Math.round(v * segs);
    const pseg = Math.min(segs - 1, Math.max(lit, Math.round(pk * segs) - 1));
    const x = dx + gap + b * (cw + gap);
    for (let k = 0; k < segs; k++) {
      const y = dy + dh - gap - (k + 1) * (sh + gap) + gap;
      const on = k < lit;
      const isPeak = k === pseg && pk > 0.05;
      const col = colorFor(k);
      ctx.fillStyle = on || isPeak ? col : rgba(col, 0.09);
      ctx.fillRect(x, y, cw, sh);
      if (on || isPeak) G.add((g) => ((g.fillStyle = col), (g.globalAlpha = isPeak && !on ? 0.8 : 0.6), g.fillRect(x - cw * 0.1, y - sh * 0.2, cw * 1.2, sh * 1.4)));
    }
  }
  G.flush(0.85);
  // glass reflection
  const gl = ctx.createLinearGradient(0, dy, 0, dy + dh);
  gl.addColorStop(0, 'rgba(255,255,255,0.12)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(dx, dy, dw, dh);
  // labels
  ctx.fillStyle = 'rgba(230,230,235,0.75)';
  ctx.font = `700 ${Math.round(hh * 0.055)}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('SPECTRUM ANALYZER', dx, y0 + hh * 0.92);
  ctx.textAlign = 'right';
  ctx.fillText('63  250  1K  4K  16K', dx + dw, y0 + hh * 0.92);
}

// ---- CRT oscilloscope

function drawScope(ctx, W, H, layer, feat, ts, h) {
  const { cx, cy, S, I } = h;
  const classic = layer.classic !== false;
  const trace = classic ? '#5dff8a' : layer.color;
  const core = classic ? '#e6ffe9' : layer.color2 || '#ffffff';
  const w = S;
  const hh = S * 0.64;
  const x0 = cx - w / 2;
  const y0 = cy - hh / 2;
  // bezel
  const bz = ctx.createLinearGradient(0, y0, 0, y0 + hh);
  bz.addColorStop(0, '#3b3d40');
  bz.addColorStop(1, '#17181a');
  ctx.fillStyle = bz;
  rrect(ctx, x0, y0, w, hh, w * 0.04);
  ctx.fill();
  const sx = x0 + w * 0.06;
  const sy = y0 + hh * 0.09;
  const sw = w * 0.88;
  const shh = hh * 0.82;
  ctx.save();
  rrect(ctx, sx, sy, sw, shh, w * 0.05);
  ctx.clip();
  const scr = ctx.createRadialGradient(sx + sw / 2, sy + shh / 2, 0, sx + sw / 2, sy + shh / 2, sw * 0.7);
  scr.addColorStop(0, classic ? '#07170c' : mix(trace, '#000000', 0.9));
  scr.addColorStop(1, '#010302');
  ctx.fillStyle = scr;
  ctx.fillRect(sx, sy, sw, shh);
  // graticule 10x8
  ctx.strokeStyle = rgba(trace, 0.13);
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + (sw * i) / 10, sy);
    ctx.lineTo(sx + (sw * i) / 10, sy + shh);
    ctx.stroke();
  }
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(sx, sy + (shh * i) / 8);
    ctx.lineTo(sx + sw, sy + (shh * i) / 8);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(trace, 0.22);
  ctx.beginPath();
  ctx.moveTo(sx, sy + shh / 2);
  ctx.lineTo(sx + sw, sy + shh / 2);
  ctx.moveTo(sx + sw / 2, sy);
  ctx.lineTo(sx + sw / 2, sy + shh);
  ctx.stroke();
  // trace with phosphor persistence: this frame and a few fading previous ones
  const G = glowPass(ctx, sx, sy, sw, shh, S * 0.025);
  const span = 0.04;
  const npts = 220;
  const amp = shh * 0.42 * (0.6 + I * 0.6);
  const path = (c, at) => {
    // trigger: start at a rising zero crossing so the trace stands still like a real scope
    let c0 = Math.floor((at - span) * feat.waveRate);
    for (let k = 0; k < feat.waveRate * 0.01; k++) {
      const i = c0 + k;
      if (feat.wave[i] <= 0 && feat.wave[i + 1] > 0) {
        c0 = i;
        break;
      }
    }
    c.beginPath();
    for (let i = 0; i < npts; i++) {
      const k = c0 + Math.floor((i / npts) * span * feat.waveRate);
      const v = k >= 0 && k < feat.wave.length ? feat.wave[k] : 0;
      const x = sx + (sw * i) / (npts - 1);
      const y = sy + shh / 2 - clamp(v * 2.4, -1, 1) * amp;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
  };
  for (let k = 3; k >= 0; k--) {
    const at = ts - k / 30;
    ctx.strokeStyle = rgba(trace, k ? 0.16 * (4 - k) / 3 : 0.95);
    ctx.lineWidth = Math.max(1.5, S * (k ? 0.006 : 0.004));
    path(ctx, at);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(core, 0.8);
  ctx.lineWidth = Math.max(1, S * 0.0015);
  path(ctx, ts);
  ctx.stroke();
  G.add((g) => {
    g.strokeStyle = trace;
    g.lineWidth = S * 0.012;
    path(g, ts);
    g.stroke();
  });
  G.flush(0.95);
  // scanlines and curved-glass shine
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = sy; yy < sy + shh; yy += Math.max(2, Math.round(S / 220))) ctx.fillRect(sx, yy, sw, 1);
  const shine = ctx.createRadialGradient(sx + sw * 0.3, sy + shh * 0.15, 0, sx + sw * 0.3, sy + shh * 0.15, sw * 0.6);
  shine.addColorStop(0, 'rgba(255,255,255,0.10)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(sx, sy, sw, shh);
  const vig = ctx.createRadialGradient(sx + sw / 2, sy + shh / 2, sw * 0.3, sx + sw / 2, sy + shh / 2, sw * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(sx, sy, sw, shh);
  ctx.restore();
  // knobs
  for (let i = 0; i < 3; i++) {
    const kx = x0 + w * (0.25 + i * 0.25);
    const ky = y0 + hh * 0.955;
    ctx.fillStyle = '#0c0c0d';
    ctx.beginPath();
    ctx.arc(kx, ky, hh * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- speaker cone

function drawSpeaker(ctx, W, H, layer, feat, ts, h) {
  const { cx, cy, S, I, onsetsFor } = h;
  const classic = layer.classic !== false;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  let low = live ? Math.max(lowAt(feat, f), lowAt(feat, f - 1) * 0.75) : 0;
  // kicks punch the cone out, then it springs back
  const ons = live ? onsetsFor(feat, layer.sensitivity ?? 0.5) : [];
  for (let i = ons.length - 1; i >= 0 && ons[i].time > ts - 0.25; i--) {
    if (ons[i].time <= ts) low = Math.max(low, ons[i].strength * Math.exp(-(ts - ons[i].time) * 14) * 1.2);
  }
  const ex = clamp(low * (0.5 + I * 0.6), 0, 1.2); // excursion
  const R = S * 0.45;
  // basket / frame
  const fr = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.2, cx, cy, R * 1.05);
  fr.addColorStop(0, '#4a4a4f');
  fr.addColorStop(1, '#141416');
  ctx.fillStyle = fr;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.fillStyle = '#9a9aa2';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93, R * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  // rubber surround (a torus)
  const Rs = R * 0.86;
  const sur = ctx.createRadialGradient(cx - R * 0.08 * (1 - ex * 0.3), cy - R * 0.1, Rs * 0.7, cx, cy, Rs);
  sur.addColorStop(0, '#0d0d0f');
  sur.addColorStop(0.55, `rgba(70,70,76,${0.9 + ex * 0.1})`);
  sur.addColorStop(1, '#0a0a0b');
  ctx.fillStyle = sur;
  ctx.beginPath();
  ctx.arc(cx, cy, Rs, 0, Math.PI * 2);
  ctx.fill();
  // cone: moves toward the camera (bigger, lighter) with the excursion
  const s = 1 + ex * 0.06;
  const Rc = R * 0.72 * s;
  const coneTint = classic ? '#2a2a2e' : mix(layer.color, '#000000', 0.7);
  const cone = ctx.createRadialGradient(cx - Rc * 0.25, cy - Rc * 0.3, Rc * 0.05, cx, cy, Rc);
  cone.addColorStop(0, mix(coneTint, '#ffffff', 0.18 + ex * 0.15));
  cone.addColorStop(0.7, coneTint);
  cone.addColorStop(1, mix(coneTint, '#000000', 0.5));
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.arc(cx, cy, Rc, 0, Math.PI * 2);
  ctx.fill();
  // paper ridges
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = Math.max(1, R * 0.006);
  for (let k = 1; k < 6; k++) {
    ctx.beginPath();
    ctx.arc(cx, cy, Rc * (0.3 + k * 0.12), 0, Math.PI * 2);
    ctx.stroke();
  }
  // dust cap
  const Rd = R * 0.24 * (1 + ex * 0.08);
  const cap = ctx.createRadialGradient(cx - Rd * 0.35, cy - Rd * 0.4, Rd * 0.1, cx, cy, Rd);
  cap.addColorStop(0, classic ? '#77777e' : mix(layer.color2 || '#ffffff', '#000000', 0.4));
  cap.addColorStop(1, '#101012');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(cx, cy, Rd, 0, Math.PI * 2);
  ctx.fill();
  // a soft halo on big hits (air moving)
  if (ex > 0.5) {
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * (1.05 + ex * 0.15));
    halo.addColorStop(0, rgba(classic ? '#ffffff' : layer.color, 0));
    halo.addColorStop(0.5, rgba(classic ? '#ffffff' : layer.color, 0.12 * (ex - 0.5)));
    halo.addColorStop(1, rgba(classic ? '#ffffff' : layer.color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- fire
//
// Done the way real fire simulations are: flame tongues paint a heat field (white, added together),
// a rising noise breaks it into ragged licks, then a black-body palette turns heat into colour
// (transparent -> dark red -> orange -> yellow -> white-hot). Drawn at quarter size and scaled up.

const fireLUTs = {};
function fireLUT(stops) {
  const key = JSON.stringify(stops);
  if (fireLUTs[key]) return fireLUTs[key];
  const lut = new Uint8ClampedArray(256 * 4);
  const rgb = stops.map(([t, hex, a]) => [t, ...hexRgb(hex), a * 255]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < rgb.length - 2 && t > rgb[j + 1][0]) j++;
    const A = rgb[j];
    const B = rgb[j + 1];
    const k = clamp((t - A[0]) / Math.max(1e-6, B[0] - A[0]), 0, 1);
    for (let ch = 0; ch < 4; ch++) lut[i * 4 + ch] = A[ch + 1] + (B[ch + 1] - A[ch + 1]) * k;
  }
  return (fireLUTs[key] = lut);
}

// a smooth tiling noise texture, made once
let fireNoise = null;
const FN = 64;
function noiseTex() {
  if (fireNoise) return fireNoise;
  const raw = new Float32Array(FN * FN).map((_, i) => rnd(i * 1.37 + 5));
  const out = new Float32Array(FN * FN);
  for (let y = 0; y < FN; y++)
    for (let x = 0; x < FN; x++) {
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += raw[((y + dy + FN) % FN) * FN + ((x + dx + FN) % FN)];
      out[y * FN + x] = sum / 25;
    }
  // stretch to 0..1
  let lo = 1;
  let hi = 0;
  for (const v of out) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
  return (fireNoise = out);
}
function noiseAt(tex, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = (yy, xx) => tex[(((yy % FN) + FN) % FN) * FN + (((xx % FN) + FN) % FN)];
  const a = i(y0, x0) + (i(y0, x0 + 1) - i(y0, x0)) * fx;
  const b = i(y0 + 1, x0) + (i(y0 + 1, x0 + 1) - i(y0 + 1, x0)) * fx;
  return a + (b - a) * fy;
}

function drawFire(ctx, W, H, layer, feat, ts, h) {
  const { cx, cy, S, I } = h;
  const classic = layer.classic !== false;
  const hot = layer.color2 || '#ffffff';
  const stops = classic
    ? [[0, '#000000', 0], [0.1, '#300000', 0], [0.24, '#6e0800', 0.45], [0.4, '#c42200', 0.85], [0.58, '#ff6a00', 1], [0.78, '#ffb22a', 1], [0.92, '#ffe39a', 1], [1, '#fff8e6', 1]]
    : [[0, '#000000', 0], [0.1, mix(layer.color, '#000000', 0.85), 0], [0.24, mix(layer.color, '#000000', 0.6), 0.45], [0.42, layer.color, 0.85], [0.7, mix(layer.color, hot, 0.45), 1], [0.9, mix(layer.color, hot, 0.8), 1], [1, hot, 1]];
  const lut = fireLUT(stops);
  const ember1 = classic ? '#ffa000' : mix(layer.color, hot, 0.4);
  const ember2 = classic ? '#fff1b0' : hot;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  const n = feat.nbands;
  const lv = live ? feat.level[f] : 0;
  const band = (i) => (live ? Math.max(feat.bands[f * n + i] || 0, (feat.bands[Math.max(0, f - 1) * n + i] || 0) * 0.8) : 0);
  const k = 0.25;
  const bw = Math.max(32, Math.round(S * k));
  const bh = Math.max(32, Math.round(S * 0.8 * k));
  const tex = noiseTex();
  const sc = FN / bw;

  // how tall the flame is in each column: bass in the middle, highs at the sides, plus slow wander
  const colH = new Float32Array(bw);
  for (let x = 0; x < bw; x++) {
    const u = x / (bw - 1);
    const bf = Math.abs(u - 0.5) * 2 * (n - 1) * 0.7;
    const b0 = Math.floor(bf);
    const v = band(b0) + (band(Math.min(n - 1, b0 + 1)) - band(b0)) * (bf - b0);
    const drive = clamp(v * 0.6 + lv * 0.5, 0, 1.15) * (0.6 + I * 0.5);
    const wander = noiseAt(tex, u * 9, ts * 1.6) * 0.65 + noiseAt(tex, u * 23 + 31, ts * 3.1) * 0.35;
    const edge = 1 - Math.pow(Math.abs(u - 0.5) * 2, 2.5) * 0.75;
    colH[x] = Math.max(0.05, (0.2 + 0.75 * drive) * (0.45 + 0.75 * wander) * edge);
  }

  const [c, g] = buf('fire', bw, bh);
  const img = g.createImageData(bw, bh);
  const px = img.data;
  const rise = ts * 34;
  const rise2 = ts * 57;
  for (let y = 0; y < bh; y++) {
    const up = 1 - y / bh; // 0 at the base, 1 at the top
    for (let x = 0; x < bw; x++) {
      // licks sway more the higher they get
      const sway = (noiseAt(tex, x * sc * 1.4, (y * sc + rise) * 0.9) - 0.5) * bw * 0.09 * (0.2 + up);
      const xw = clamp(Math.round(x + sway), 0, bw - 1);
      const hgt = colH[xw];
      let heat = 1 - up / hgt; // 1 at the base, 0 at the tip
      if (heat <= -0.25) continue;
      const turb = 0.6 * noiseAt(tex, xw * sc * 3, (y * sc + rise) * 1.7) + 0.4 * noiseAt(tex, xw * sc * 6.5 + 11, (y * sc + rise2) * 3.2);
      heat = heat * 0.92 + (turb - 0.5) * (0.35 + up * 0.5);
      if (heat <= 0) continue;
      const q = clamp(Math.round(Math.pow(Math.min(1, heat), 1.15) * 255), 0, 255) * 4;
      const o = (y * bw + x) * 4;
      px[o] = lut[q];
      px[o + 1] = lut[q + 1];
      px[o + 2] = lut[q + 2];
      px[o + 3] = lut[q + 3];
    }
  }
  g.putImageData(img, 0, 0);

  // embers rising out of it
  g.globalCompositeOperation = 'lighter';
  for (let e = 0; e < 26; e++) {
    const life = 1.6 + rnd(e) * 1.2;
    const age = fract(ts / life + rnd(e * 7));
    const x = bw * (0.15 + 0.7 * rnd(e * 3)) + Math.sin(ts * 2 + e) * bw * 0.03;
    const y = bh * (1 - (0.25 + age * 0.85));
    g.fillStyle = rgba(e % 3 ? ember1 : ember2, (1 - age) * (0.5 + lv * 0.5));
    g.fillRect(x, y, 1, 1);
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, cx - S / 2, cy - S * 0.8, S, S * 0.8);
  ctx.restore();
}

// ---- spectrogram

function drawSpectrogram(ctx, W, H, layer, feat, ts, h) {
  const { cx, cy, S, I } = h;
  const classic = layer.classic !== false;
  const n = feat.nbands;
  const w = S;
  const hh = S * 0.38;
  const x0 = cx - w / 2;
  const y0 = cy - hh / 2;
  const secs = 6;
  const cols = 120;
  // a heat palette (black -> purple -> red -> orange -> yellow -> white) or the layer's colours
  const stops = classic ? ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'] : ['#000000', mix(layer.color, '#000000', 0.7), layer.color, mix(layer.color, layer.color2 || '#ffffff', 0.5), layer.color2 || '#ffffff'];
  const heat = (v) => {
    const x = clamp(v, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
  };
  ctx.fillStyle = '#050506';
  rrect(ctx, x0, y0, w, hh, w * 0.01);
  ctx.fill();
  const iw = w * 0.92;
  const ih = hh * 0.8;
  const ix = x0 + w * 0.06;
  const iy = y0 + hh * 0.06;
  const cw = iw / cols;
  const rh = ih / n;
  for (let c = 0; c < cols; c++) {
    const at = ts - secs + (secs * (c + 1)) / cols;
    const fi = Math.floor(at * feat.fps);
    if (fi < 0 || fi >= feat.frames || at > feat.duration) continue;
    for (let b = 0; b < n; b++) {
      const v = (feat.bands[fi * n + b] || 0) * (0.55 + I * 0.5);
      ctx.fillStyle = heat(v);
      ctx.fillRect(ix + c * cw, iy + ih - (b + 1) * rh, cw + 0.6, rh + 0.6);
    }
  }
  // now-line and axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(ix + iw - Math.max(1, w * 0.002), iy, Math.max(1, w * 0.002), ih);
  ctx.font = `600 ${Math.round(hh * 0.06)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(220,220,230,0.7)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ['16k', '4k', '1k', '250', '63'].forEach((l, i) => ctx.fillText(l, ix - w * 0.008, iy + (ih * (i + 0.5)) / 5));
  ctx.textAlign = 'left';
  ctx.fillText(`−${secs}s`, ix, iy + ih + hh * 0.07);
  ctx.textAlign = 'right';
  ctx.fillText('now', ix + iw, iy + ih + hh * 0.07);
}

export const REAL_DRAW = { vu: drawVU, eq: drawEQ, scope: drawScope, speaker: drawSpeaker, fire: drawFire, spectrogram: drawSpectrogram, ...GEAR_DRAW };
