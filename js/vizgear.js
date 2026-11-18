// More realistic visualizers (listed with the others in vizreal.js):
//   tape        a reel-to-reel deck: reels spin, the tape flutters and the meters swing with the level
//   faders      a mixing-desk channel strip: faders ride each band, with LED meters
//   lightning   branching bolts strike on each hit and light up the frame
//   strings     six strings that blur and ring like a real plucked string, low strings on the low end
// Same rules as vizreal.js: only the analysis at past/current times is read, so preview = export.
// layer.classic (default true) keeps real-world colours; false uses the layer's colours.
import { glowPass } from './canvasfx.js';

export const GEAR_STYLES = [
  ['tape', 'Tape reels', 'A reel-to-reel deck, reels spinning and meters swinging'],
  ['faders', 'Mixing desk', 'Faders and LED meters riding each band'],
  ['lightning', 'Lightning', 'Branching bolts strike on every hit'],
  ['strings', 'Vibrating strings', 'Six strings that ring with the low, mid and high end'],
];

export const GEAR_PLACEMENT = {
  tape: { y: 76, size: 86, blend: 'source-over' },
  faders: { y: 76, size: 90, blend: 'source-over' },
  lightning: { y: 42, size: 100, blend: 'screen' },
  strings: { y: 50, size: 96, blend: 'source-over' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(',')},${a})`;
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

/** Band b (or the level when b < 0) averaged over the last `secs`, recent frames weighted more. */
export function bandAvg(feat, f, b, secs = 0.2) {
  const n = Math.max(1, Math.round(secs * feat.fps));
  let s = 0;
  let w = 0;
  for (let k = 0; k < n; k++) {
    const i = f - k;
    if (i < 0) break;
    const wk = 1 - k / n;
    s += (b < 0 ? feat.level[i] : feat.bands[i * feat.nbands + b] || 0) * wk;
    w += wk;
  }
  return w ? s / w : 0;
}
/** Mean of bands b0..b1 at frame f. */
export function bandsMean(feat, f, b0, b1, secs) {
  let s = 0;
  for (let b = b0; b <= b1; b++) s += bandAvg(feat, f, b, secs);
  return s / (b1 - b0 + 1);
}

/** How far round a reel has turned at time ts: tape moves at a steady speed, so a fuller reel turns slower. */
export function reelAngle(ts, speed, R, pack) {
  return (ts * speed * R) / Math.max(1e-6, pack);
}

// ---- reel-to-reel tape deck

function drawReel(ctx, x, y, R, pack, angle, metal, tape) {
  const tg = ctx.createRadialGradient(x, y, R * 0.2, x, y, pack);
  tg.addColorStop(0, mix(tape, '#000000', 0.3));
  tg.addColorStop(1, tape);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(x, y, pack, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let r = R * 0.3; r < pack; r += R * 0.045) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // the metal flange with three windows, turning
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const fg = ctx.createLinearGradient(-R, -R, R, R);
  fg.addColorStop(0, mix(metal, '#ffffff', 0.35));
  fg.addColorStop(0.5, metal);
  fg.addColorStop(1, mix(metal, '#000000', 0.45));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    ctx.moveTo(Math.cos(a - 0.62) * R * 0.86, Math.sin(a - 0.62) * R * 0.86);
    ctx.arc(0, 0, R * 0.86, a - 0.62, a + 0.62);
    ctx.arc(0, 0, R * 0.34, a + 0.5, a - 0.5, true);
    ctx.closePath();
  }
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, R * 0.02);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = mix(metal, '#000000', 0.25);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    ctx.fillRect(Math.cos(a) * R * 0.1 - R * 0.025, Math.sin(a) * R * 0.1 - R * 0.025, R * 0.05, R * 0.05);
  }
  ctx.restore();
  // a highlight that doesn't turn (the light is fixed)
  const hl = ctx.createLinearGradient(x - R, y - R, x + R * 0.2, y + R * 0.2);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
}

function ledColumn(ctx, G, x, y, w, h, v, segs, base) {
  ctx.fillStyle = '#0b0b0c';
  rrect(ctx, x, y, w, h, h * 0.08);
  ctx.fill();
  const lit = Math.round(clamp(v, 0, 1) * segs);
  for (let k = 0; k < segs; k++) {
    const col = k >= segs - 2 ? '#ff2b1d' : k >= segs - 4 ? '#ffd21a' : base;
    const yy = y + h - (k + 1) * (h / segs);
    const on = k < lit;
    ctx.fillStyle = on ? col : rgba(col, 0.09);
    ctx.fillRect(x + w * 0.2, yy + 1, w * 0.6, h / segs - 2);
    if (on) G.add((g) => ((g.fillStyle = col), g.fillRect(x, yy, w, h / segs)));
  }
}

function drawTape(ctx, W, H, layer, feat, ts, hp) {
  const { cx, cy, S, I } = hp;
  const classic = layer.classic !== false;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  const w = S;
  const hh = S * 0.6;
  const x0 = cx - w / 2;
  const y0 = cy - hh / 2;
  const light = layer.color2 || '#ffffff';
  const body = classic ? '#b9bcc0' : mix(light, '#000000', 0.78);
  const metal = classic ? '#c9ccd1' : mix(light, '#000000', 0.45);
  const tape = classic ? '#4a2c1a' : mix(layer.color, '#000000', 0.7);
  const lamp = classic ? '#ff3b1f' : layer.color;
  // deck body: brushed aluminium (or a dark themed panel)
  const bg = ctx.createLinearGradient(0, y0, 0, y0 + hh);
  bg.addColorStop(0, mix(body, '#ffffff', 0.18));
  bg.addColorStop(1, mix(body, '#000000', 0.35));
  ctx.fillStyle = bg;
  rrect(ctx, x0, y0, w, hh, w * 0.025);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 60; k++) {
    const yy = y0 + (hh * k) / 60;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x0 + w, yy);
    ctx.stroke();
  }
  // reels: the left one empties over the song and the right one fills
  const R = w * 0.205;
  const prog = clamp(feat.duration ? Math.max(0, ts) / feat.duration : 0, 0, 1);
  const rMin = R * 0.36;
  const packL = rMin + (R * 0.93 - rMin) * Math.sqrt(1 - prog * 0.85);
  const packR = rMin + (R * 0.93 - rMin) * Math.sqrt(0.15 + prog * 0.85);
  const lx = x0 + w * 0.26;
  const rx = x0 + w * 0.74;
  const ry = y0 + hh * 0.4;
  drawReel(ctx, lx, ry, R, packL, reelAngle(Math.max(0, ts), 3.2, R, packL), metal, tape);
  drawReel(ctx, rx, ry, R, packR, reelAngle(Math.max(0, ts), 3.2, R, packR), metal, tape);
  // tape path over the heads, fluttering a little with the level
  const lvl = live ? bandAvg(feat, f, -1, 0.12) : 0;
  const hy = y0 + hh * 0.8;
  const flutter = (rnd(Math.floor(ts * 40)) - 0.5) * hh * 0.006 * (0.3 + lvl * 2);
  ctx.strokeStyle = tape;
  ctx.lineWidth = Math.max(1.5, hh * 0.012);
  ctx.beginPath();
  ctx.moveTo(lx - packL * 0.2, ry + packL);
  ctx.lineTo(x0 + w * 0.36, hy + flutter);
  ctx.lineTo(x0 + w * 0.64, hy - flutter);
  ctx.lineTo(rx + packR * 0.2, ry + packR);
  ctx.stroke();
  for (const gx of [x0 + w * 0.36, x0 + w * 0.64]) {
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(gx, hy, hh * 0.028, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1b1c1e';
  rrect(ctx, cx - w * 0.09, hy - hh * 0.005, w * 0.18, hh * 0.08, hh * 0.015);
  ctx.fill();
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = mix(metal, '#000000', 0.2);
    rrect(ctx, cx - w * 0.07 + k * w * 0.05, hy - hh * 0.03, w * 0.04, hh * 0.045, hh * 0.01);
    ctx.fill();
  }
  // meters (left: everything, right: low end) and the play lamp
  const G = glowPass(ctx, x0, y0, w, hh, S * 0.02);
  const vals = live ? [bandAvg(feat, f, -1, 0.3) * (0.8 + I * 0.4), bandsMean(feat, f, 0, 2, 0.3) * (0.8 + I * 0.4)] : [0, 0];
  vals.forEach((v, m) => ledColumn(ctx, G, x0 + w * (m ? 0.86 : 0.06), y0 + hh * 0.74, w * 0.08, hh * 0.18, v, 10, classic ? '#3dff58' : layer.color));
  ctx.fillStyle = live ? lamp : mix(lamp, '#000000', 0.7);
  ctx.beginPath();
  ctx.arc(cx, y0 + hh * 0.94, hh * 0.018, 0, Math.PI * 2);
  ctx.fill();
  if (live) G.add((g) => ((g.fillStyle = lamp), g.beginPath(), g.arc(cx, y0 + hh * 0.94, hh * 0.04, 0, Math.PI * 2), g.fill()));
  G.flush(0.8);
  ctx.fillStyle = classic ? 'rgba(20,20,22,0.7)' : rgba(light, 0.6);
  ctx.font = `700 ${Math.round(hh * 0.035)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('PLAY', cx + hh * 0.04, y0 + hh * 0.94);
}

// ---- mixing desk channel strip

const CHANNELS = [['KICK', 0, 1], ['BASS', 1, 3], ['SNARE', 4, 6], ['GTR L', 6, 8], ['GTR R', 7, 9], ['VOX', 8, 10], ['KEYS', 10, 12], ['CYMB', 12, 15]];

function drawFaders(ctx, W, H, layer, feat, ts, hp) {
  const { cx, cy, S, I } = hp;
  const classic = layer.classic !== false;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  const n = feat.nbands;
  const chans = [...CHANNELS.map(([l, a, b]) => [l, Math.min(a, n - 1), Math.min(b, n - 1)]), ['MAIN', -1, -1]];
  const w = S;
  const hh = S * 0.62;
  const x0 = cx - w / 2;
  const y0 = cy - hh / 2;
  const light = layer.color2 || '#ffffff';
  const accent = classic ? '#ff4d2a' : layer.color;
  const dg = ctx.createLinearGradient(0, y0, 0, y0 + hh);
  dg.addColorStop(0, classic ? '#2f3237' : mix(light, '#000000', 0.82));
  dg.addColorStop(1, classic ? '#18191c' : mix(light, '#000000', 0.92));
  ctx.fillStyle = dg;
  rrect(ctx, x0, y0, w, hh, w * 0.02);
  ctx.fill();
  const cw = w / chans.length;
  const G = glowPass(ctx, x0, y0, w, hh, S * 0.015);
  const top = y0 + hh * 0.22;
  const bot = y0 + hh * 0.84;
  chans.forEach(([label, a, b], c) => {
    const x = x0 + c * cw;
    const main = a < 0;
    if (c) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y0 + hh * 0.04);
      ctx.lineTo(x, y0 + hh * 0.96);
      ctx.stroke();
    }
    // the fader rides the slow level, the meter shows the fast one
    const slow = !live ? 0 : main ? bandAvg(feat, f, -1, 0.3) : bandsMean(feat, f, a, b, 0.25);
    const fast = !live ? 0 : main ? feat.level[f] : bandsMean(feat, f, a, b, 0.06);
    const val = clamp(slow * (0.75 + I * 0.45), 0, 1);
    // pan knob
    const kx = x + cw / 2;
    const ky = y0 + hh * 0.1;
    const kr = cw * 0.2;
    const kg = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, 0, kx, ky, kr);
    kg.addColorStop(0, '#6a6d73');
    kg.addColorStop(1, '#1c1d20');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    ctx.fill();
    const pa = -Math.PI / 2 + (c - (chans.length - 1) / 2) * 0.18;
    ctx.strokeStyle = main ? accent : '#e8e8ea';
    ctx.lineWidth = Math.max(1, kr * 0.18);
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx + Math.cos(pa) * kr * 0.85, ky + Math.sin(pa) * kr * 0.85);
    ctx.stroke();
    // slot and scale
    const sx = x + cw * 0.36;
    ctx.fillStyle = '#050506';
    rrect(ctx, sx - cw * 0.03, top, cw * 0.06, bot - top, cw * 0.03);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let k = 0; k <= 8; k++) {
      const yy = top + ((bot - top) * k) / 8;
      ctx.beginPath();
      ctx.moveTo(sx - cw * 0.14, yy);
      ctx.lineTo(sx - cw * 0.08, yy);
      ctx.stroke();
    }
    // cap with its shadow
    const fy = bot - (bot - top) * val;
    const capW = cw * 0.34;
    const capH = hh * 0.055;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rrect(ctx, sx - capW / 2 + 2, fy - capH / 2 + 3, capW, capH, capH * 0.2);
    ctx.fill();
    const cg = ctx.createLinearGradient(0, fy - capH / 2, 0, fy + capH / 2);
    cg.addColorStop(0, main ? mix(accent, '#ffffff', 0.3) : '#d6d7da');
    cg.addColorStop(0.5, main ? accent : '#9a9ca1');
    cg.addColorStop(1, main ? mix(accent, '#000000', 0.4) : '#5c5e63');
    ctx.fillStyle = cg;
    rrect(ctx, sx - capW / 2, fy - capH / 2, capW, capH, capH * 0.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - capW / 2, fy - 0.5, capW, 1);
    ledColumn(ctx, G, x + cw * 0.6, top, cw * 0.22, bot - top, fast * (0.8 + I * 0.5), 12, classic ? '#39ff4d' : layer.color);
    // scribble strip
    ctx.fillStyle = classic ? '#e9e4d2' : rgba(light, 0.85);
    rrect(ctx, x + cw * 0.08, y0 + hh * 0.88, cw * 0.84, hh * 0.08, hh * 0.01);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = `800 ${Math.round(Math.min(hh * 0.04, cw * 0.17))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + cw / 2, y0 + hh * 0.92);
  });
  G.flush(0.8);
}

// ---- lightning

/** A jagged bolt from (x0,y0) to (x1,y1): midpoint displacement with a fixed seed (same every frame). */
export function boltPath(x0, y0, x1, y1, seed, rough, depth = 7) {
  let pts = [[x0, y0], [x1, y1]];
  let d = rough;
  for (let k = 0; k < depth; k++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const off = (rnd(seed * 31.7 + k * 7.1 + i * 1.3) - 0.5) * d;
      next.push([(ax + bx) / 2 + (-(by - ay) / len) * off, (ay + by) / 2 + ((bx - ax) / len) * off], pts[i + 1]);
    }
    pts = next;
    d *= 0.55;
  }
  return pts;
}

/** Brightness of a strike `age` seconds old: on, a dim flicker, on again, then a fade. */
export function strikeFlicker(age, life = 0.32) {
  if (age < 0 || age > life) return 0;
  if (age < 0.04) return 1;
  if (age < 0.07) return 0.35;
  if (age < 0.11) return 0.9;
  return Math.max(0, 1 - (age - 0.11) / (life - 0.11));
}

function drawLightning(ctx, W, H, layer, feat, ts, hp) {
  const { cx, cy, S, I } = hp;
  const classic = layer.classic !== false;
  const glow = classic ? '#8fb4ff' : layer.color;
  const core = classic ? '#ffffff' : layer.color2 || '#ffffff';
  if (ts < 0 || ts > feat.duration) return;
  const ons = hp.onsetsFor(feat, layer.sensitivity ?? 0.5);
  const LIFE = 0.32;
  const top = cy - S * 0.75;
  const ground = cy + S * 0.75;
  // glows go through one blurred quarter-size pass (shadowBlur on long paths is far too slow)
  const G = glowPass(ctx, cx - S * 0.75, top, S * 1.5, ground - top, S * 0.025);
  const path = (g, pts, width, color, alpha) => {
    g.globalAlpha = clamp(alpha, 0, 1);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.stroke();
  };
  const stroke = (pts, width, color, alpha, blur) => {
    if (blur) return G.add((g) => path(g, pts, width * 1.6, color, alpha));
    ctx.save();
    path(ctx, pts, width, color, alpha);
    ctx.restore();
  };
  let flash = 0;
  // walk back from the newest hit until they are too old
  let i = ons.length - 1;
  while (i >= 0 && ons[i].time > ts) i--;
  for (; i >= 0; i--) {
    const o = ons[i];
    const age = ts - o.time;
    if (age > LIFE) break;
    if (o.strength < 0.25 - I * 0.1) continue;
    const seed = i + 1;
    const a = strikeFlicker(age, LIFE) * (0.5 + o.strength * 0.5);
    flash = Math.max(flash, a * o.strength);
    const sx = cx + (rnd(seed * 3.3) - 0.5) * S * 0.7;
    const ex = sx + (rnd(seed * 5.9) - 0.5) * S * 0.5;
    const main = boltPath(sx, top, ex, ground, seed, S * 0.32);
    const wd = Math.max(2, S * 0.008);
    for (let b = 0; b < 2 + Math.round(o.strength * 4); b++) {
      const at = main[Math.floor((0.15 + rnd(seed * 11 + b) * 0.6) * (main.length - 1))];
      const dir = rnd(seed * 17 + b) < 0.5 ? -1 : 1;
      const len = S * (0.15 + rnd(seed * 23 + b) * 0.3);
      const br = boltPath(at[0], at[1], at[0] + dir * len * 0.7, at[1] + len * 0.8, seed * 13 + b, len * 0.45, 5);
      stroke(br, wd * 2.2, glow, a * 0.45, S * 0.03);
      stroke(br, wd * 0.6, core, a * 0.8, 0);
    }
    stroke(main, wd * 5, glow, a * 0.35, S * 0.06);
    stroke(main, wd * 2, glow, a * 0.8, S * 0.02);
    stroke(main, wd * 0.9, core, a, 0);
  }
  G.flush(1.8);
  // the whole sky lights up for a moment
  if (flash > 0.02) {
    const g = ctx.createRadialGradient(cx, top + S * 0.2, 0, cx, top + S * 0.2, S * 1.1);
    g.addColorStop(0, rgba(core, 0.35 * flash * I));
    g.addColorStop(0.5, rgba(glow, 0.16 * flash * I));
    g.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---- vibrating strings (looking down at a guitar body: low E at the bottom)

const STRING_BANDS = [[0, 1], [1, 3], [3, 5], [5, 8], [8, 11], [11, 15]];

function drawStrings(ctx, W, H, layer, feat, ts, hp) {
  const { cx, cy, S, I } = hp;
  const classic = layer.classic !== false;
  const f = clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
  const live = ts >= 0 && ts <= feat.duration;
  const n = feat.nbands;
  const w = S;
  const hh = S * 0.5;
  const x0 = cx - w / 2;
  const y0 = cy - hh / 2;
  const glow = classic ? '#ffd27a' : layer.color;
  const light = layer.color2 || '#ffffff';
  // glossy body with two humbuckers
  const wood = classic ? '#2a0f07' : mix(layer.color, '#000000', 0.8);
  const bg = ctx.createLinearGradient(0, y0, 0, y0 + hh);
  bg.addColorStop(0, wood);
  bg.addColorStop(0.5, mix(wood, '#000000', 0.5));
  bg.addColorStop(1, wood);
  ctx.fillStyle = bg;
  rrect(ctx, x0, y0, w, hh, hh * 0.08);
  ctx.fill();
  const gl = ctx.createLinearGradient(0, y0, 0, y0 + hh * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.12)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  rrect(ctx, x0, y0, w, hh * 0.5, hh * 0.08);
  ctx.fill();
  for (const px of [0.3, 0.62]) {
    const pw = w * 0.12;
    const pX = x0 + w * px;
    ctx.fillStyle = '#0d0d0e';
    rrect(ctx, pX, y0 + hh * 0.1, pw, hh * 0.8, pw * 0.12);
    ctx.fill();
    ctx.fillStyle = '#2a2b2e';
    for (let k = 0; k < 6; k++) {
      for (const col of [0.3, 0.7]) {
        ctx.beginPath();
        ctx.arc(pX + pw * col, y0 + hh * (0.18 + (k * 0.64) / 5), hh * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = '#9a9ca1';
  ctx.fillRect(x0 + w * 0.06, y0 + hh * 0.06, w * 0.012, hh * 0.88);
  ctx.fillRect(x0 + w * 0.93, y0 + hh * 0.06, w * 0.012, hh * 0.88);
  const xa = x0 + w * 0.066;
  const xb = x0 + w * 0.936;
  const G = glowPass(ctx, x0, y0, w, hh, S * 0.02);
  STRING_BANDS.forEach(([b0, b1], i) => {
    const y = y0 + hh * (0.14 + ((5 - i) * 0.72) / 5);
    const thick = Math.max(1, hh * (0.006 + i * 0.0035));
    const amp = live ? clamp(bandsMean(feat, f, Math.min(b0, n - 1), Math.min(b1, n - 1), 0.12) * (0.6 + I * 0.6), 0, 1) : 0;
    const A = amp * hh * 0.06;
    const k = 1 + (i % 3); // the harmonic that shows
    const omega = (28 + i * 9) * Math.PI;
    const env = (u) => Math.sin(Math.PI * u) * Math.abs(Math.sin(Math.PI * k * u)) ** 0.3;
    // the blur a camera sees on a ringing string...
    if (A > 0.4) {
      ctx.fillStyle = rgba(classic ? '#d9d2c3' : light, 0.18 + amp * 0.2);
      ctx.beginPath();
      for (let q = 0; q <= 48; q++) ctx.lineTo(xa + ((xb - xa) * q) / 48, y - A * env(q / 48) - thick);
      for (let q = 48; q >= 0; q--) ctx.lineTo(xa + ((xb - xa) * q) / 48, y + A * env(q / 48) + thick);
      ctx.closePath();
      ctx.fill();
      G.add((g) => {
        g.strokeStyle = glow;
        g.globalAlpha = amp * 0.7;
        g.lineWidth = thick * 3;
        g.beginPath();
        g.moveTo(xa, y);
        g.lineTo(xb, y);
        g.stroke();
      });
    }
    // ...and the string itself at this instant
    const metal = i >= 3 ? (classic ? '#c9a46a' : mix(light, glow, 0.3)) : '#e6e8ec';
    const sg = ctx.createLinearGradient(0, y - thick, 0, y + thick);
    sg.addColorStop(0, mix(metal, '#ffffff', 0.4));
    sg.addColorStop(0.5, metal);
    sg.addColorStop(1, mix(metal, '#000000', 0.5));
    ctx.strokeStyle = sg;
    ctx.lineWidth = thick;
    ctx.beginPath();
    for (let q = 0; q <= 60; q++) {
      const u = q / 60;
      const yy = y + A * Math.sin(Math.PI * u) * Math.sin(Math.PI * k * u) * Math.sin(omega * ts + i);
      if (q) ctx.lineTo(xa + (xb - xa) * u, yy);
      else ctx.moveTo(xa, yy);
    }
    ctx.stroke();
    if (i >= 3) {
      // winding texture on the wound strings
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([1, Math.max(2, thick * 0.7)]);
      ctx.beginPath();
      ctx.moveTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  G.flush(0.85);
}

export const GEAR_DRAW = { tape: drawTape, faders: drawFaders, lightning: drawLightning, strings: drawStrings };
