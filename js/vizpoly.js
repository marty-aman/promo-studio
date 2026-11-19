// Polyrhythm and polymeter visualizers, locked to the song's tempo.
//  - Polygons: nested shapes (3, 4, 5… sides). A dot runs round each one once per cycle and lights
//    a corner on every hit, so a triangle hits 3 times while a square hits 4 in the same span.
//  - Arcs: a fan of half-circles over a line; each ball swings across its arc, hitting the line,
//    and every arc is one hit faster than the one inside it, so they drift apart and line up again.
//  - Polymeter: step-sequencer rows of different lengths (4, 5, 7…) stepping on the same pulse.
// Timing comes from the song's detected beats (Audio → Detect BPM) or a tempo you set. The audio
// level adds glow. Pure timing helpers are exported for the tests.

export const POLY_STYLES = [
  ['polygons', 'Polyrhythm shapes', 'Nested shapes; a dot lights each corner it hits (3 against 4 against 5…)'],
  ['arcs', 'Polyrhythm arcs', 'Balls swing on nested arcs, each one hit faster, drifting in and out of sync'],
  ['polymeter', 'Polymeter grid', 'Step rows of different lengths on one pulse, so the downbeats drift'],
];
export const POLY_PLACEMENT = {
  polygons: { y: 48, size: 70, blend: 'source-over' },
  arcs: { y: 62, size: 88, blend: 'source-over' },
  polymeter: { y: 76, size: 90, blend: 'source-over' },
};
export const POLY_DEFAULTS = { polygons: '3, 4, 5, 6', arcs: '1-12', polymeter: '4, 5, 7' };
export const isPoly = (style) => !!POLY_PLACEMENT[style];

/**
 * Counts from text: "3, 4, 5", "3:4", "2-9" (a range). Kept to 1..32, at most 12 voices, no
 * repeats, in the order given.
 */
export function parseRatios(text, fallback = [3, 4]) {
  const out = [];
  for (const part of String(text || '').split(/[,;:\s]+/)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    const nums = range ? Array.from({ length: Math.min(32, Math.abs(+range[2] - +range[1]) + 1) }, (_, i) => +range[1] + (+range[2] >= +range[1] ? i : -i)) : /^\d+$/.test(part) ? [+part] : [];
    for (const n of nums) if (n >= 1 && n <= 32 && !out.includes(n)) out.push(n);
  }
  return (out.length ? out : fallback).slice(0, 12);
}

/**
 * Where we are in the cycle at song time ts: { phase 0..1, cycle (s), t0, beat (s), index }.
 * A cycle is `bars` bars of `beatsPerBar` beats. The tempo is the song's beats when there are any
 * and `followSong` is on, otherwise `bpm`. `t0` is the first beat (the song's downbeat).
 */
export function polyTiming({ beats = null, bpm = 120, bars = 1, beatsPerBar = 4, followSong = true } = {}, ts) {
  const useSong = followSong && beats && beats.period > 0;
  const beat = useSong ? beats.period : 60 / Math.max(20, Math.min(300, bpm || 120));
  const t0 = useSong && beats.beats && beats.beats.length ? beats.beats[0] : 0;
  const cycle = beat * beatsPerBar * Math.max(0.25, bars);
  const x = (ts - t0) / cycle;
  const index = Math.floor(x);
  return { phase: x - index, cycle, t0, beat, index, bpm: Math.round((60 / beat) * 10) / 10, fromSong: !!useSong };
}

/** Seconds since voice `n` last hit (n hits per cycle, the first on the downbeat). */
export function sinceHit(n, phase, cycle) {
  const k = Math.floor(phase * n + 1e-9);
  return (phase - k / n) * cycle;
}
/** Which hit (0..n-1) voice `n` is on. */
export const hitIndex = (n, phase) => Math.floor(phase * n + 1e-9) % n;
/** How many voices hit together right now (within `win` seconds), for the "all line up" flash. */
export function together(counts, phase, cycle, win = 0.06) {
  return counts.filter((n) => sinceHit(n, phase, cycle) < win).length;
}

// ------------------------------------------------------------ drawing

const fract = (x) => x - Math.floor(x);
function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(',')},${a})`;
/** Colour for voice i of n: from color to color2, or a rainbow. */
function voiceColor(layer, i, n) {
  if (layer.polyRainbow !== false) return `hsl(${Math.round((i / Math.max(1, n)) * 300 + 190) % 360},90%,62%)`;
  const [a, b] = [hexRgb(layer.color), hexRgb(layer.color2)];
  const k = n > 1 ? i / (n - 1) : 0;
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
}
const flash = (age, len = 0.35) => (age < 0 ? 0 : Math.max(0, 1 - age / len)) ** 2;
const withAlpha = (col, a) => (col.startsWith('hsl(') ? col.replace('hsl(', 'hsla(').replace(')', `,${a})`) : col.startsWith('rgb(') ? col.replace('rgb(', 'rgba(').replace(')', `,${a})`) : rgba(col, a));

function glowDot(ctx, x, y, r, col, e) {
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = r * (2 + 6 * e);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + 0.6 * e), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.5 + 0.5 * e);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function label(ctx, text, x, y, size, col) {
  ctx.font = `700 ${Math.round(size)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col;
  ctx.fillText(text, x, y);
}

/** Nested regular polygons; a dot travels each perimeter once per cycle. */
function drawPolygons(ctx, layer, T, g) {
  const { cx, cy, S, lvl, I } = g;
  const counts = parseRatios(layer.ratios || POLY_DEFAULTS.polygons).map((n) => Math.max(2, n));
  const R = S / 2;
  const nV = counts.length;
  const all = together(counts, T.phase, T.cycle);
  if (all === nV && nV > 1) {
    const e = flash(Math.min(...counts.map((n) => sinceHit(n, T.phase, T.cycle))), 0.5);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
    gr.addColorStop(0, `rgba(255,255,255,${0.18 * e})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
  }
  counts.forEach((n, i) => {
    const r = R * (0.28 + (0.72 * (i + 1)) / nV);
    const col = voiceColor(layer, i, nV);
    const age = sinceHit(n, T.phase, T.cycle);
    const e = flash(age);
    const hit = hitIndex(n, T.phase);
    const corner = (k) => {
      const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    // the shape
    ctx.strokeStyle = withAlpha(col, 0.35 + 0.4 * e + 0.2 * lvl * I);
    ctx.lineWidth = Math.max(1.5, S * (0.004 + 0.004 * e));
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const [x, y] = corner(k % n);
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    // corners, the one just hit lit up
    for (let k = 0; k < n; k++) {
      const [x, y] = corner(k);
      const on = k === hit ? e : 0;
      ctx.fillStyle = withAlpha(col, 0.45 + 0.55 * on);
      ctx.beginPath();
      ctx.arc(x, y, S * (0.006 + 0.014 * on), 0, Math.PI * 2);
      ctx.fill();
      if (on > 0.05) {
        ctx.strokeStyle = withAlpha(col, 0.7 * on);
        ctx.lineWidth = Math.max(1, S * 0.003);
        ctx.beginPath();
        ctx.arc(x, y, S * (0.02 + 0.05 * (1 - on)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // the travelling dot
    const pos = T.phase * n;
    const k = Math.floor(pos);
    const f = pos - k;
    const [x0, y0] = corner(k % n);
    const [x1, y1] = corner((k + 1) % n);
    glowDot(ctx, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, S * 0.012, col, e);
    if (layer.showLabels !== false) label(ctx, String(n), cx, cy - r + S * 0.045, S * 0.032, withAlpha(col, 0.85));
  });
}

/** Nested half-circle arcs over a line; ball i crosses its arc (counts[i]) times per cycle. */
function drawArcs(ctx, layer, T, g) {
  const { cx, cy, S, lvl, I } = g;
  const counts = parseRatios(layer.ratios || POLY_DEFAULTS.arcs);
  const nV = counts.length;
  const R = S / 2;
  // the line
  ctx.strokeStyle = withAlpha('#ffffff', 0.5);
  ctx.lineWidth = Math.max(1.5, S * 0.004);
  ctx.beginPath();
  ctx.moveTo(cx - R * 1.04, cy);
  ctx.lineTo(cx + R * 1.04, cy);
  ctx.stroke();
  counts.forEach((n, i) => {
    const r = R * (0.12 + (0.88 * (i + 1)) / nV);
    const col = voiceColor(layer, i, nV);
    const age = sinceHit(n, T.phase, T.cycle);
    const e = flash(age, 0.4);
    ctx.strokeStyle = withAlpha(col, 0.3 + 0.5 * e + 0.2 * lvl * I);
    ctx.lineWidth = Math.max(1.5, S * (0.003 + 0.004 * e));
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.stroke();
    // the two ends light up when the ball lands
    const side = hitIndex(n, T.phase) % 2; // 0: landed on the right, 1: on the left
    for (const s of [-1, 1]) {
      const on = (s === 1) === (side === 0) ? e : 0;
      ctx.fillStyle = withAlpha(col, 0.35 + 0.65 * on);
      ctx.beginPath();
      ctx.arc(cx + s * r, cy, S * (0.007 + 0.012 * on), 0, Math.PI * 2);
      ctx.fill();
    }
    // the ball: swings left → right → left, n crossings per cycle
    const u = fract(T.phase * n * 0.5) * 2; // 0..2 over two crossings
    const a = u <= 1 ? Math.PI + u * Math.PI : Math.PI * 2 - (u - 1) * Math.PI;
    glowDot(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, S * 0.011, col, e);
  });
}

/** Rows of steps with different lengths stepping on one pulse. */
function drawPolymeter(ctx, layer, T, g) {
  const { cx, cy, S, lvl, I } = g;
  const counts = parseRatios(layer.ratios || POLY_DEFAULTS.polymeter);
  const nV = counts.length;
  const per = Math.max(1, Math.min(8, layer.pulse || 2)); // steps per beat
  const step = T.beat / per;
  const tIn = (T.phase * T.cycle + T.index * T.cycle) / step; // steps since the downbeat
  const s = Math.floor(tIn);
  const since = (tIn - s) * step;
  const maxN = Math.max(...counts);
  const W = S;
  const gutter = layer.showLabels !== false ? W * 0.08 : 0; // room for the row numbers
  const colW = (W - gutter) / maxN;
  const cell = Math.min(colW, (S * 0.5) / nV) * 0.84;
  const rowH = cell * 1.3;
  const top = cy - (rowH * nV) / 2;
  const left = cx - W / 2 + gutter;
  counts.forEach((n, i) => {
    const col = voiceColor(layer, i, nV);
    const cur = ((s % n) + n) % n;
    const y = top + i * rowH;
    const down = cur === 0 ? flash(since, 0.45) : 0;
    if (layer.showLabels !== false) label(ctx, String(n), left - gutter / 2, y + cell / 2, Math.min(cell * 0.5, gutter * 0.7), withAlpha(col, 0.9));
    for (let k = 0; k < n; k++) {
      const x = left + k * colW + (colW - cell) / 2;
      const on = k === cur;
      const e = on ? flash(since, step * 0.9) : 0;
      ctx.fillStyle = on ? withAlpha(col, 0.55 + 0.45 * e + 0.15 * lvl * I) : k === 0 ? withAlpha(col, 0.28) : withAlpha('#ffffff', 0.1);
      const rr = cell * 0.18;
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + cell, y, x + cell, y + cell, rr);
      ctx.arcTo(x + cell, y + cell, x, y + cell, rr);
      ctx.arcTo(x, y + cell, x, y, rr);
      ctx.arcTo(x, y, x + cell, y, rr);
      ctx.closePath();
      ctx.fill();
      if (on) {
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = cell * (0.4 + 0.8 * e);
        ctx.strokeStyle = withAlpha('#ffffff', 0.4 + 0.5 * e);
        ctx.lineWidth = Math.max(1, cell * 0.06);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (down > 0.02) {
      ctx.strokeStyle = withAlpha(col, 0.8 * down);
      ctx.lineWidth = Math.max(1, cell * 0.08);
      ctx.strokeRect(left + (colW - cell) / 2 - 4, y - 4, colW * (n - 1) + cell + 8, cell + 8);
    }
  });
  // when every row is back on its first step together
  if (counts.every((n) => ((s % n) + n) % n === 0)) {
    const e = flash(since, 0.6);
    ctx.fillStyle = `rgba(255,255,255,${0.1 * e})`;
    ctx.fillRect(left - gutter, top - cell * 0.3, W, rowH * nV + cell * 0.3);
  }
}

const DRAW = { polygons: drawPolygons, arcs: drawArcs, polymeter: drawPolymeter };

/** Draw a polyrhythm style. `beats` is the project's beat grid ({ period, beats }) or null. */
export function drawPoly(ctx, layer, ts, beats, g) {
  const T = polyTiming({ beats, bpm: layer.bpm, bars: layer.bars ?? (layer.style === 'arcs' ? 4 : 1), beatsPerBar: layer.beatsPerBar || 4, followSong: layer.followSong !== false }, ts);
  DRAW[layer.style](ctx, layer, T, g);
}
