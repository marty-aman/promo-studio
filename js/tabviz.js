// Fancy guitar / bass tab styles: fretboard highway, light-up neck and vibrating strings.
// All work for any string count (4- and 5-string bass, 6- and 7-string guitar).
// `tl` is a timeline from buildTabTimeline; `tabT` is tab time in seconds.
import { glowPass, frost } from './canvasfx.js';

export const TAB_STYLES = [
  ['tab', 'Scrolling tab', 'Classic tab lines with fret numbers'],
  ['highway', 'Fretboard highway', 'Notes fly down a lane per string to a strike line'],
  ['neck', 'Light-up neck', 'A real neck where fingered notes glow on the frets'],
  ['strings', 'Vibrating strings', 'Glass panel; strings shake when they are played'],
];

/** Placement that suits each style when you switch to it. */
export const TAB_PLACEMENT = {
  tab: { y: 30, width: 92, height: 16 },
  highway: { y: 58, width: 86, height: 52 },
  neck: { y: 40, width: 96, height: 26 },
  strings: { y: 30, width: 94, height: 20 },
};

// by string from the lowest: E A D G B e, then a 7th colour
const STRING_COLORS = ['#b26bff', '#4dff88', '#ff9f1c', '#3ee0ff', '#ffd23f', '#ff4d6d', '#ff7ad9'];

/** Colour for tab line `line` (0 = highest string). Bass E-A-D-G get the same colours as guitar E-A-D-G. */
export function stringColor(layer, strings, line) {
  const k = strings - 1 - line;
  return (layer.stringColors && layer.stringColors[k]) || STRING_COLORS[k % STRING_COLORS.length];
}

function rgba(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(0,0,0,${a})`;
}

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

function box(W, H, layer) {
  const bw = (W * layer.width) / 100;
  const bh = (H * layer.height) / 100;
  return { bw, bh, bx: (W * layer.x) / 100 - bw / 2, by: (H * layer.y) / 100 - bh / 2 };
}

function first(events, t) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);

function label(n) {
  let s = n.dead ? 'x' : String(n.fret);
  if (n.harmonic) s = `<${s}>`;
  return s;
}
const markOf = (n) => (n.hammer ? 'h' : n.slide ? '/' : n.bend ? '↗' : n.vibrato ? '~' : '');

/** How strongly an event is sounding at tabT: 1 while held, decaying after release; 0 before it plays. */
function energy(ev, tabT, release = 0.25) {
  if (tabT < ev.time) return 0;
  const hold = Math.max(ev.dur, 0.12);
  const age = tabT - ev.time;
  if (age < hold) return 1 - 0.35 * (age / hold);
  return Math.max(0, 0.65 * (1 - (age - hold) / release));
}

/** The chord now sounding (the latest strum, if it was a chord, within 2.5 s) and the next one within 3 s. */
export function chordsAround(tl, tabT) {
  const ev = tl.events;
  const i0 = first(ev, tabT + 1e-6);
  const last = ev[i0 - 1];
  // single notes after a chord clear its name, so a lead line doesn't keep showing the last chord
  const now = last && last.chord && tabT - last.time <= 2.5 ? { name: last.chord, time: last.time } : null;
  let next = null;
  for (let i = i0; i < ev.length && i < i0 + 64; i++) {
    if (ev[i].time - tabT > 3) break;
    if (ev[i].chord && (!now || ev[i].chord !== now.name)) {
      next = { name: ev[i].chord, time: ev[i].time };
      break;
    }
  }
  return { now, next };
}

function fitFont(ctx, text, weight, family, size, maxW) {
  let fs = size;
  ctx.font = `${weight} ${Math.round(fs)}px ${family}`;
  while (fs > 6 && ctx.measureText(text).width > maxW) {
    fs *= 0.9;
    ctx.font = `${weight} ${Math.round(fs)}px ${family}`;
  }
  return fs;
}

const DISPLAY = '"Bebas Neue", Impact, sans-serif';

// ------------------------------------------------------------ A: fretboard highway

function drawHighway(ctx, W, H, layer, tl, tabT) {
  const { bw, bh, bx, by } = box(W, H, layer);
  const n = tl.strings;
  const unit = Math.min(bw, bh);
  const G = glowPass(ctx, bx, by, bw, bh, unit * 0.03);
  const horizon = by + bh * 0.13;
  const strike = by + bh * 0.84;
  const cx = bx + bw / 2;
  const topW = bw * 0.2;
  const botW = bw * 0.94;
  const win = layer.window || 2.5;
  const persp = (p) => Math.pow(Math.max(0, Math.min(1, p)), 1.8);
  const yAt = (p) => horizon + (strike - horizon) * persp(p);
  const wAt = (y) => topW + (botW - topW) * ((y - horizon) / (strike - horizon));
  const xAt = (frac, y) => cx - wAt(y) / 2 + wAt(y) * frac;
  const pOf = (time) => 1 - (time - tabT) / win;
  const colOf = (line) => n - 1 - line; // low string on the left
  const bgA = layer.bgOpacity ?? 0.6;

  ctx.save();
  rrect(ctx, bx, by, bw, bh, unit * 0.06);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, rgba('#07040f', bgA));
  bg.addColorStop(1, rgba('#1a0d2e', bgA));
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);

  // road
  ctx.beginPath();
  ctx.moveTo(xAt(0, horizon), horizon);
  ctx.lineTo(xAt(1, horizon), horizon);
  ctx.lineTo(xAt(1, strike), strike);
  ctx.lineTo(xAt(0, strike), strike);
  ctx.closePath();
  ctx.fillStyle = 'rgba(12,8,28,0.6)';
  ctx.fill();

  // bar lines and beats move with the music
  ctx.lineWidth = Math.max(1, unit * 0.003);
  for (const b of tl.bars) {
    if (b.time + b.duration < tabT - 0.2 || b.time > tabT + win) continue;
    for (let q = 0; q < 4; q++) {
      const time = b.time + (b.duration * q) / 4;
      const y = yAt(pOf(time));
      if (y < horizon || y > strike) continue;
      ctx.strokeStyle = q === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(170,140,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(xAt(0, y), y);
      ctx.lineTo(xAt(1, y), y);
      ctx.stroke();
    }
  }

  // string rails between lanes, coloured by string
  for (let line = 0; line < n; line++) {
    const c = colOf(line);
    const col = stringColor(layer, n, line);
    const f = (c + 0.5) / n;
    const g = ctx.createLinearGradient(0, horizon, 0, strike);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(1, rgba(col, 0.55));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, unit * 0.004);
    ctx.beginPath();
    ctx.moveTo(xAt(f, horizon), horizon);
    ctx.lineTo(xAt(f, strike), strike);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,170,255,0.45)';
  ctx.lineWidth = Math.max(1.5, unit * 0.006);
  for (const f of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(xAt(f, horizon), horizon);
    ctx.lineTo(xAt(f, strike), strike);
    ctx.stroke();
  }

  // notes, far to near
  const vis = [];
  for (let i = first(tl.events, tabT - 3); i < tl.events.length; i++) {
    const ev = tl.events[i];
    if (ev.time > tabT + win) break;
    if (ev.time + Math.max(ev.dur, 0) < tabT - 0.05 && ev.time < tabT - 0.05) continue;
    vis.push(ev);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = vis.length - 1; k >= 0; k--) {
    const ev = vis[k];
    const head = Math.max(ev.time, tabT); // a held note's head sits on the strike line
    const y = yAt(pOf(head));
    const sc = (y - horizon) / (strike - horizon);
    const laneW = wAt(y) / n;
    // sustain tails
    if (ev.dur > 0.3) {
      const yEnd = yAt(pOf(ev.time + ev.dur));
      if (yEnd < y) {
        for (const nt of ev.notes) {
          const f = (colOf(nt.line) + 0.5) / n;
          const col = stringColor(layer, n, nt.line);
          ctx.fillStyle = rgba(col, 0.35);
          const w0 = laneW * 0.22;
          const w1 = (wAt(yEnd) / n) * 0.22;
          ctx.beginPath();
          ctx.moveTo(xAt(f, y) - w0, y);
          ctx.lineTo(xAt(f, yEnd) - w1, yEnd);
          ctx.lineTo(xAt(f, yEnd) + w1, yEnd);
          ctx.lineTo(xAt(f, y) + w0, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    if (ev.time < tabT - 0.05) continue; // only the tail is left
    // chord frame joining the notes of one strum
    if (ev.notes.length > 1) {
      const cols = ev.notes.map((nt) => colOf(nt.line));
      const x0 = xAt(Math.min(...cols) / n, y);
      const x1 = xAt((Math.max(...cols) + 1) / n, y);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rrect(ctx, x0, y - laneW * 0.36, x1 - x0, laneW * 0.72, laneW * 0.2);
      ctx.fill();
    }
    for (const nt of ev.notes) {
      const col = stringColor(layer, n, nt.line);
      const x = xAt((colOf(nt.line) + 0.5) / n, y);
      const w = laneW * 0.8;
      const h = laneW * 0.52;
      const gg = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      gg.addColorStop(0, '#ffffff');
      gg.addColorStop(0.4, col);
      gg.addColorStop(1, rgba(col, 0.8));
      ctx.fillStyle = gg;
      rrect(ctx, x - w / 2, y - h / 2, w, h, h * 0.35);
      ctx.fill();
      G.add((g) => {
        g.globalAlpha = 0.35 + 0.65 * sc;
        g.fillStyle = col;
        rrect(g, x - w * 0.62, y - h * 0.75, w * 1.24, h * 1.5, h * 0.5);
        g.fill();
      });
      const txt = label(nt);
      fitFont(ctx, txt, 900, DISPLAY, h * 0.92, w * 0.9);
      ctx.fillStyle = nt.ghost ? 'rgba(10,6,20,0.6)' : '#0a0614';
      ctx.fillText(txt, x, y + h * 0.04);
      if (layer.showMarks !== false) {
        const mk = markOf(nt);
        if (mk && sc > 0.25) {
          ctx.font = `800 ${Math.round(h * 0.6)}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(mk, x + w * 0.62, y - h * 0.62);
        }
      }
    }
    if (ev.palmMute && layer.showMarks !== false && sc > 0.25) {
      const xs = ev.notes.map((nt) => xAt((colOf(nt.line) + 0.5) / n, y));
      ctx.font = `800 ${Math.round(laneW * 0.32)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('PM', Math.min(...xs) - laneW * 0.62, y);
    }
  }

  // strike targets, flashes and sparks
  const laneB = botW / n;
  const held = new Map(); // line -> {e, ev}
  const iFrom = first(tl.events, tabT - 4);
  for (let i = first(tl.events, tabT + 1e-6) - 1; i >= iFrom; i--) {
    const ev = tl.events[i];
    const e = energy(ev, tabT);
    if (e <= 0) continue;
    for (const nt of ev.notes) if (!held.has(nt.line)) held.set(nt.line, { e, ev });
  }
  for (let line = 0; line < n; line++) {
    const col = stringColor(layer, n, line);
    const x = xAt((colOf(line) + 0.5) / n, strike);
    const r = laneB * 0.36;
    const h = held.get(line);
    const e = h ? h.e : 0;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath();
    ctx.ellipse(x, strike, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (e > 0) {
      ctx.fillStyle = rgba(col, 0.55 * e);
      ctx.fill();
    }
    G.add((g) => {
      g.strokeStyle = col;
      g.fillStyle = col;
      g.globalAlpha = 0.35 + 0.65 * e;
      g.lineWidth = r * 0.35;
      g.beginPath();
      g.ellipse(x, strike, r, r * 0.42, 0, 0, Math.PI * 2);
      g.stroke();
      if (e > 0) {
        g.globalAlpha = e;
        g.fill();
      }
    });
    if (h) {
      const age = tabT - h.ev.time;
      if (age < 0.4) {
        const k = age / 0.4;
        for (let s = 0; s < 8; s++) {
          const seed = Math.round(h.ev.time * 1000) + line * 31 + s;
          const a = -Math.PI * (0.15 + 0.7 * rnd(seed));
          const sp = r * (1 + 2 * rnd(seed + 7));
          ctx.fillStyle = rgba(s % 3 ? col : '#ffffff', 1 - k);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * sp * k, strike + Math.sin(a) * sp * k + r * k * k, Math.max(1, r * 0.08), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (layer.showTuning !== false) {
      ctx.fillStyle = rgba(col, 0.9);
      fitFont(ctx, tl.tuning[line], 800, 'Inter, system-ui, sans-serif', Math.min(unit * 0.05, r * 0.8), r * 1.6);
      ctx.fillText(tl.tuning[line], x, strike + r * 0.95);
    }
  }
  G.flush(0.85);

  // horizon haze
  const fg = ctx.createLinearGradient(0, horizon, 0, horizon + (strike - horizon) * 0.22);
  fg.addColorStop(0, rgba('#07040f', Math.min(1, bgA + 0.3)));
  fg.addColorStop(1, rgba('#07040f', 0));
  ctx.fillStyle = fg;
  ctx.fillRect(bx, horizon - 2, bw, (strike - horizon) * 0.22 + 2);

  // chord name on top
  if (layer.showChords !== false) {
    const { now, next } = chordsAround(tl, tabT);
    if (now) {
      const pulse = Math.max(0, 1 - (tabT - now.time) / 0.25);
      const fs = fitFont(ctx, now.name, 900, DISPLAY, bh * 0.085 * (1 + 0.12 * pulse), bw * 0.4);
      const tw = ctx.measureText(now.name).width;
      const py = by + bh * 0.065;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      rrect(ctx, cx - tw / 2 - fs * 0.5, py - fs * 0.62, tw + fs, fs * 1.24, fs * 0.62);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(now.name, cx, py + fs * 0.04);
    }
    if (next) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      fitFont(ctx, `→ ${next.name}`, 800, DISPLAY, bh * 0.05, bw * 0.25);
      ctx.textAlign = 'left';
      ctx.fillText(`→ ${next.name}`, cx + bw * 0.16, by + bh * 0.067);
      ctx.textAlign = 'center';
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,160,255,0.35)';
  ctx.lineWidth = Math.max(1, unit * 0.004);
  rrect(ctx, bx, by, bw, bh, unit * 0.06);
  ctx.stroke();
}

// ------------------------------------------------------------ B: light-up neck

const fretPos = (f) => 1 - Math.pow(2, -f / 12);
const winCache = new WeakMap();

/** Fret window [lo, hi] for each bar: the frets used in that bar and the next. */
function barWindows(tl) {
  let wins = winCache.get(tl);
  if (wins) return wins;
  const byBar = tl.bars.map(() => ({ min: Infinity, max: -Infinity }));
  let bi = 0;
  for (const ev of tl.events) {
    while (bi < tl.bars.length - 1 && ev.time >= tl.bars[bi].time + tl.bars[bi].duration - 1e-6) bi++;
    for (const nt of ev.notes) {
      if (nt.dead || nt.fret <= 0) continue;
      byBar[bi].min = Math.min(byBar[bi].min, nt.fret);
      byBar[bi].max = Math.max(byBar[bi].max, nt.fret);
    }
  }
  wins = byBar.map((_, i) => {
    const a = byBar[i];
    const b = byBar[i + 1] || a;
    const mn = Math.min(a.min, b.min);
    const mx = Math.max(a.max, b.max);
    if (!Number.isFinite(mn)) return { lo: 0, hi: 5 };
    let lo = Math.max(0, mn - 1);
    if (lo <= 2) lo = 0;
    const hi = Math.min(lo + 15, Math.max(lo + 5, mx + 1));
    return { lo, hi };
  });
  winCache.set(tl, wins);
  return wins;
}

/** The neck's visible fret range at tabT, sliding smoothly into the next bar's range. */
export function neckWindow(tl, tabT) {
  const wins = barWindows(tl);
  if (!wins.length) return { lo: 0, hi: 5 };
  let bi = tl.bars.findIndex((b) => tabT >= b.time && tabT < b.time + b.duration);
  if (bi < 0) bi = tabT < (tl.bars[0] ? tl.bars[0].time : 0) ? 0 : wins.length - 1;
  const a = wins[bi];
  const b = wins[Math.min(wins.length - 1, bi + 1)];
  const bar = tl.bars[bi];
  const k = bar ? Math.max(0, Math.min(1, (tabT - (bar.time + bar.duration - 0.35)) / 0.35)) : 0;
  const s = k * k * (3 - 2 * k);
  return { lo: a.lo + (b.lo - a.lo) * s, hi: a.hi + (b.hi - a.hi) * s };
}

function drawNeck(ctx, W, H, layer, tl, tabT) {
  const { bw, bh, bx, by } = box(W, H, layer);
  const n = tl.strings;
  const unit = Math.min(bw, bh);
  const G = glowPass(ctx, bx, by, bw, bh, unit * 0.06);
  const showStrip = layer.showStrip !== false;
  const showChords = layer.showChords !== false;
  const bgA = layer.bgOpacity ?? 0.45;
  if (bgA > 0) {
    ctx.fillStyle = rgba(layer.bg || '#000000', bgA);
    rrect(ctx, bx, by, bw, bh, unit * 0.08);
    ctx.fill();
  }
  const openW = bw * 0.085;
  const nx0 = bx + bw * 0.02 + openW;
  const nx1 = bx + bw * 0.985;
  const ny0 = by + bh * (showChords ? 0.26 : 0.06);
  const ny1 = by + bh * (showStrip ? 0.74 : 0.9);
  const gap = (ny1 - ny0) / n;
  const sy = (line) => ny0 + gap * (line + 0.5);
  const { lo, hi } = neckWindow(tl, tabT);
  const span = fretPos(hi) - fretPos(lo);
  const xF = (f) => nx0 + ((fretPos(f) - fretPos(lo)) / span) * (nx1 - nx0);
  const cellX = (f) => (f <= 0 ? nx0 - openW * 0.32 : (xF(Math.max(lo, f - 1)) + xF(Math.min(hi, f))) / 2);

  // wood
  const wood = ctx.createLinearGradient(0, ny0, 0, ny1);
  wood.addColorStop(0, '#2a1a10');
  wood.addColorStop(0.5, '#3d2616');
  wood.addColorStop(1, '#24160d');
  ctx.fillStyle = wood;
  rrect(ctx, nx0, ny0 - gap * 0.15, nx1 - nx0, ny1 - ny0 + gap * 0.3, gap * 0.2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.rect(nx0 - 2, by, nx1 - nx0 + 4, bh);
  ctx.clip();
  // inlays
  const inlay = [3, 5, 7, 9, 15, 17, 19, 21];
  ctx.fillStyle = 'rgba(233,220,196,0.4)';
  for (let f = Math.ceil(lo + 0.01); f <= Math.floor(hi); f++) {
    const x = (xF(f - 1) + xF(f)) / 2;
    const r = Math.min(gap * 0.28, (xF(f) - xF(f - 1)) * 0.18);
    if (inlay.includes(f)) {
      ctx.beginPath();
      ctx.arc(x, (ny0 + ny1) / 2, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (f === 12 || f === 24) {
      for (const yy of [ny0 + (ny1 - ny0) * 0.27, ny0 + (ny1 - ny0) * 0.73]) {
        ctx.beginPath();
        ctx.arc(x, yy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // frets
  ctx.strokeStyle = '#c9c4ba';
  for (let f = Math.ceil(lo); f <= Math.floor(hi); f++) {
    const x = xF(f);
    ctx.lineWidth = f === 0 ? Math.max(3, gap * 0.35) : Math.max(1.5, gap * 0.09);
    ctx.strokeStyle = f === 0 ? '#ece2cf' : '#c9c4ba';
    ctx.beginPath();
    ctx.moveTo(x, ny0 - gap * 0.15);
    ctx.lineTo(x, ny1 + gap * 0.15);
    ctx.stroke();
  }
  ctx.restore();
  // fret numbers under the neck for the marked frets
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${Math.round(Math.max(7, gap * 0.45))}px Inter, system-ui, sans-serif`;
  for (let f = Math.max(1, Math.ceil(lo + 0.01)); f <= Math.floor(hi); f++) {
    if (inlay.includes(f) || f === 12 || f === 24 || f === Math.ceil(lo + 0.01)) ctx.fillText(String(f), (xF(f - 1) + xF(f)) / 2, ny1 + gap * 0.25);
  }

  // which notes are sounding / coming
  const sounding = []; // {nt, e, ev}
  const i0 = first(tl.events, tabT + 1e-6);
  for (let i = i0 - 1; i >= 0 && tabT - tl.events[i].time < 4; i--) {
    const ev = tl.events[i];
    const e = energy(ev, tabT);
    if (e > 0) for (const nt of ev.notes) if (!sounding.some((s) => s.nt.line === nt.line)) sounding.push({ nt, e, ev });
  }
  const lineE = new Map(sounding.map((s) => [s.nt.line, s]));

  // strings (they ring when played)
  for (let line = 0; line < n; line++) {
    const y = sy(line);
    const k = n - 1 - line;
    const s = lineE.get(line);
    const e = s ? s.e : 0;
    const col = stringColor(layer, n, line);
    ctx.lineWidth = Math.max(1, gap * (0.05 + 0.035 * k));
    ctx.strokeStyle = e > 0 ? rgba(col, 0.55 + 0.45 * e) : 'rgba(220,214,204,0.85)';
    ctx.beginPath();
    const x0 = nx0 - openW * 0.1;
    if (e > 0.02) {
      const amp = gap * 0.16 * e;
      const fr = 3 + k * 0.6;
      for (let j = 0; j <= 48; j++) {
        const u = j / 48;
        const x = x0 + (nx1 - x0) * u;
        const yy = y + Math.sin(u * Math.PI) * amp * Math.sin(u * Math.PI * fr * 2 + tabT * 60);
        if (j) ctx.lineTo(x, yy);
        else ctx.moveTo(x, yy);
      }
    } else {
      ctx.moveTo(x0, y);
      ctx.lineTo(nx1, y);
    }
    ctx.stroke();
    if (layer.showTuning !== false) {
      ctx.fillStyle = rgba(col, 0.95);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(Math.max(7, gap * 0.6))}px Inter, system-ui, sans-serif`;
      ctx.fillText(tl.tuning[line], nx0 - openW * 0.75, y);
    }
  }

  // ghost of the next notes
  let shownNext = 0;
  for (let i = i0; i < tl.events.length && shownNext < 2; i++) {
    const ev = tl.events[i];
    const ahead = ev.time - tabT;
    if (ahead > 1) break;
    shownNext++;
    const a = 0.25 + 0.6 * (1 - ahead);
    for (const nt of ev.notes) {
      if (nt.dead || nt.fret > hi + 0.5 || (nt.fret > 0 && nt.fret < lo + 0.5)) continue;
      const col = stringColor(layer, n, nt.line);
      const x = cellX(nt.fret);
      const r = gap * 0.4;
      ctx.setLineDash([r * 0.35, r * 0.3]);
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath();
      ctx.arc(x, sy(nt.line), r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(col, a);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(r * 0.95)}px Inter, system-ui, sans-serif`;
      ctx.fillText(String(nt.fret), x, sy(nt.line));
    }
  }

  // lit notes
  for (const { nt, e, ev } of sounding) {
    if (nt.dead) continue;
    const col = stringColor(layer, n, nt.line);
    const y = sy(nt.line);
    const punch = Math.exp(-(tabT - ev.time) * 12);
    const r = gap * 0.44 * (1 + 0.18 * punch);
    if (nt.fret > 0 && (nt.fret > hi + 0.5 || nt.fret < lo + 0.5)) continue;
    const x = cellX(nt.fret);
    if (nt.fret === 0) {
      ctx.strokeStyle = rgba(col, 0.5 + 0.5 * e);
      ctx.lineWidth = Math.max(2, r * 0.25);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, col);
      g.addColorStop(1, rgba(col, 0.85));
      ctx.globalAlpha *= 0.4 + 0.6 * e;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120a06';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(r * 1.05)}px ${DISPLAY}`;
      ctx.fillText(label(nt), x, y + r * 0.05);
      ctx.globalAlpha /= 0.4 + 0.6 * e;
    }
    G.add((g) => {
      g.fillStyle = col;
      g.globalAlpha = e;
      g.beginPath();
      g.arc(x, y, r * 1.5, 0, Math.PI * 2);
      g.fill();
    });
  }
  G.flush(0.9);

  // chord name above
  if (showChords) {
    const { now, next } = chordsAround(tl, tabT);
    ctx.textBaseline = 'middle';
    if (now) {
      const pulse = Math.max(0, 1 - (tabT - now.time) / 0.25);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      fitFont(ctx, now.name, 900, DISPLAY, bh * 0.18 * (1 + 0.08 * pulse), bw * 0.5);
      ctx.fillText(now.name, bx + bw / 2, by + bh * 0.13);
    }
    if (next) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'right';
      fitFont(ctx, `next ${next.name}`, 800, DISPLAY, bh * 0.08, bw * 0.3);
      ctx.fillText(`next ${next.name}`, bx + bw * 0.97, by + bh * 0.13);
    }
  }

  // mini scrolling tab of what's coming
  if (showStrip) {
    const s0 = by + bh * 0.84;
    const sh = bh * 0.15;
    const sx0 = bx + bw * 0.04;
    const sx1 = bx + bw * 0.96;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rrect(ctx, sx0, s0, sx1 - sx0, sh, sh * 0.3);
    ctx.fill();
    const lg = sh / (n + 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let line = 0; line < n; line++) {
      ctx.beginPath();
      ctx.moveTo(sx0 + sh * 0.3, s0 + lg * (line + 1));
      ctx.lineTo(sx1 - sh * 0.3, s0 + lg * (line + 1));
      ctx.stroke();
    }
    const winS = 3;
    const px = sx0 + (sx1 - sx0) * 0.08;
    const pps = (sx1 - px) / winS;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx0, s0, sx1 - sx0, sh);
    ctx.clip();
    ctx.font = `800 ${Math.round(Math.max(6, lg * 0.95))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = first(tl.events, tabT - 0.4); i < tl.events.length; i++) {
      const ev = tl.events[i];
      if (ev.time > tabT + winS) break;
      const x = px + (ev.time - tabT) * pps;
      for (const nt of ev.notes) {
        ctx.fillStyle = ev.time <= tabT ? 'rgba(255,255,255,0.35)' : stringColor(layer, n, nt.line);
        ctx.fillText(label(nt), x, s0 + lg * (nt.line + 1));
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1, s0 + sh * 0.1, 2, sh * 0.8);
  }
}

// ------------------------------------------------------------ C: vibrating strings

function drawStrings(ctx, W, H, layer, tl, tabT) {
  const { bw, bh, bx, by } = box(W, H, layer);
  const n = tl.strings;
  const unit = Math.min(bw, bh);
  const radius = unit * 0.14;
  const G = glowPass(ctx, bx, by, bw, bh, unit * 0.05);
  const bgA = layer.bgOpacity ?? 0.5;
  ctx.save();
  rrect(ctx, bx, by, bw, bh, radius);
  ctx.clip();
  frost(ctx, bx, by, bw, bh, Math.max(2, Math.round(unit * 0.08)));
  const sheen = ctx.createLinearGradient(bx, by, bx, by + bh);
  sheen.addColorStop(0, `rgba(255,255,255,${0.16 + bgA * 0.1})`);
  sheen.addColorStop(1, `rgba(255,255,255,${0.04 + bgA * 0.05})`);
  ctx.fillStyle = sheen;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = rgba(layer.bg || '#000000', bgA * 0.5);
  ctx.fillRect(bx, by, bw, bh);

  const showChords = layer.showChords !== false;
  const labelW = layer.showTuning !== false ? bw * 0.06 : 0;
  const left = bx + bw * 0.03 + labelW;
  const right = bx + bw * 0.97;
  const top = by + bh * (showChords ? 0.22 : 0.12);
  const bottom = by + bh * 0.9;
  const gap = (bottom - top) / n;
  const sy = (line) => top + gap * (line + 0.5);
  const win = layer.window || 2.5;
  const playX = left + ((right - left) * (layer.playhead ?? 22)) / 100;
  const pps = (right - left) / win;
  const xOf = (time) => playX + (time - tabT) * pps;

  // bar lines
  for (const b of tl.bars) {
    const x = xOf(b.time);
    if (x < left || x > right) continue;
    const near = Math.max(0, 1 - Math.abs(x - playX) / (pps * 0.15));
    ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.35 * near})`;
    ctx.fillRect(x, top, Math.max(1, unit * 0.006), bottom - top);
  }

  // how hard each string is ringing
  const ring = new Map();
  const i0 = first(tl.events, tabT + 1e-6);
  for (let i = i0 - 1; i >= 0 && tabT - tl.events[i].time < 3; i--) {
    const ev = tl.events[i];
    const e = energy(ev, tabT, 0.6);
    if (e > 0) for (const nt of ev.notes) if (!ring.has(nt.line)) ring.set(nt.line, e);
  }
  for (let line = 0; line < n; line++) {
    const y = sy(line);
    const k = n - 1 - line;
    const e = ring.get(line) || 0;
    const col = stringColor(layer, n, line);
    const lw = Math.max(1, gap * (0.05 + 0.03 * k));
    const path = (c) => {
      c.beginPath();
      if (e > 0.02) {
        const amp = gap * 0.22 * e;
        const fr = 2.5 + (n - k) * 0.7;
        for (let j = 0; j <= 64; j++) {
          const u = j / 64;
          const x = left + (right - left) * u;
          const yy = y + Math.sin(u * Math.PI) * amp * Math.sin(u * Math.PI * fr * 2 - tabT * 55);
          if (j) c.lineTo(x, yy);
          else c.moveTo(x, yy);
        }
      } else {
        c.moveTo(left, y);
        c.lineTo(right, y);
      }
    };
    ctx.strokeStyle = e > 0.02 ? rgba(col, 0.6 + 0.4 * e) : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = lw;
    path(ctx);
    ctx.stroke();
    if (e > 0.05) {
      G.add((g) => {
        g.strokeStyle = col;
        g.globalAlpha = e;
        g.lineWidth = lw * 3;
        path(g);
        g.stroke();
      });
    }
    if (labelW) {
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(Math.min(gap * 0.62, labelW * 0.6))}px Inter, system-ui, sans-serif`;
      ctx.fillText(tl.tuning[line], bx + bw * 0.03 + labelW / 2, y);
    }
  }

  // notes slide in to the hit line
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, by, right - left, bh);
  ctx.clip();
  for (let i = first(tl.events, tabT - (playX - left) / pps - 0.3); i < tl.events.length; i++) {
    const ev = tl.events[i];
    const x = xOf(ev.time);
    if (x > right + gap) break;
    const passed = ev.time < tabT;
    const inFade = Math.min(1, (right - x) / ((right - left) * 0.18));
    const alpha = Math.max(0, inFade) * (passed ? Math.max(0.12, 1 - (tabT - ev.time) / 0.6) : 1);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    if (ev.notes.length > 1) {
      const ls = ev.notes.map((nt) => nt.line);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      rrect(ctx, x - gap * 0.08, sy(Math.min(...ls)), gap * 0.16, sy(Math.max(...ls)) - sy(Math.min(...ls)), gap * 0.08);
      ctx.fill();
    }
    for (const nt of ev.notes) {
      const col = stringColor(layer, n, nt.line);
      const y = sy(nt.line);
      const hh = gap * 0.78;
      const w = Math.max(hh * 1.25, Math.min(pps * ev.dur, pps * 0.8));
      // trail behind the note
      const tg = ctx.createLinearGradient(x, 0, x + w * 2, 0);
      tg.addColorStop(0, rgba(col, 0.4));
      tg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = tg;
      rrect(ctx, x, y - hh * 0.25, w * 2, hh * 0.5, hh * 0.25);
      ctx.fill();
      const cg = ctx.createLinearGradient(0, y - hh / 2, 0, y + hh / 2);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.45, col);
      cg.addColorStop(1, rgba(col, 0.8));
      ctx.fillStyle = cg;
      rrect(ctx, x - hh * 0.62, y - hh / 2, w, hh, hh / 2);
      ctx.fill();
      ctx.fillStyle = '#0b0716';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitFont(ctx, label(nt), 900, DISPLAY, hh * 0.92, hh * 1.2);
      ctx.fillText(label(nt), x, y + hh * 0.04);
      if (layer.showMarks !== false && markOf(nt)) {
        ctx.font = `800 ${Math.round(hh * 0.55)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(markOf(nt), x + hh * 0.75, y - hh * 0.55);
      }
      if (x > left && x < right) {
        const a = alpha;
        G.add((g) => {
          g.globalAlpha = a * 0.7;
          g.fillStyle = col;
          rrect(g, x - hh * 0.62, y - hh / 2, w, hh, hh / 2);
          g.fill();
        });
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // hit line
  const hit = (c, lw) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(playX, top - gap * 0.2);
    c.lineTo(playX, bottom + gap * 0.05);
    c.stroke();
  };
  hit(ctx, Math.max(1.5, unit * 0.012));
  G.add((g) => {
    g.globalAlpha = 0.7;
    hit(g, unit * 0.03);
  });
  G.flush(0.65);

  if (showChords) {
    const { now, next } = chordsAround(tl, tabT);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const y = by + bh * 0.11;
    let x = left;
    if (now) {
      const fs = fitFont(ctx, now.name, 900, DISPLAY, bh * 0.13, bw * 0.3);
      const tw = ctx.measureText(now.name).width;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      rrect(ctx, x - fs * 0.3, y - fs * 0.55, tw + fs * 0.6, fs * 1.1, fs * 0.55);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(now.name, x, y + fs * 0.04);
      x += tw + fs;
    }
    if (next) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      fitFont(ctx, `→ ${next.name}`, 800, DISPLAY, bh * 0.09, bw * 0.25);
      ctx.fillText(`→ ${next.name}`, x, y);
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, unit * 0.008);
  rrect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
  ctx.stroke();
}

export const TAB_FANCY = { highway: drawHighway, neck: drawNeck, strings: drawStrings };
