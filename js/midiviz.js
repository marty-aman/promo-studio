// MIDI notes layer: any MIDI part (keys, synth, guitar, bass, strings, vocals melody…) drawn in time with
// the song: a scrolling piano roll, notes falling onto a keyboard, or bursts of light on each note.
// Timing works like the drum chart: the file's time = (song time − offset) × tempoScale.

export const MIDI_STYLES = [
  ['roll', 'Piano roll', 'Notes scroll past a playhead, high notes on top'],
  ['keys', 'Falling keys', 'Notes fall onto a keyboard that lights up'],
  ['bursts', 'Note bursts', 'A flash of light for every note, placed by pitch'],
];
export const MIDI_PLACEMENT = {
  roll: { x: 50, y: 30, width: 92, height: 22 },
  keys: { x: 50, y: 62, width: 96, height: 40 },
  bursts: { x: 50, y: 50, width: 90, height: 40 },
};
export const MIDI_COLOR_MODES = [['track', 'One colour per track'], ['pitch', 'By note (C, C#, D…)'], ['single', 'One colour']];
const TRACK_COLORS = ['#ff4d6d', '#4dd2ff', '#ffd400', '#a78bfa', '#5eead4', '#ff8c42', '#f472b6', '#86efac'];

export function defaultMidiLayer() {
  return {
    mediaId: null,
    tracks: [], // empty: every track that isn't drums
    offset: 0,
    tempoScale: 1,
    start: 0,
    end: null,
    style: 'roll',
    window: 4,
    playhead: 25,
    x: 50,
    y: 30,
    width: 92,
    height: 22,
    colorMode: 'track',
    color: '#4dd2ff',
    bg: '#000000',
    bgOpacity: 0.45,
    glow: 0.8,
  };
}

/** The notes a layer draws from a parsed MIDI file (midi.js), cached per file and track choice. */
const cache = new WeakMap();
export function midiNotesFor(midi, tracks = []) {
  if (!midi) return null;
  const key = (tracks || []).join(',');
  let per = cache.get(midi);
  if (!per) cache.set(midi, (per = new Map()));
  if (per.has(key)) return per.get(key);
  const pick = tracks && tracks.length ? new Set(tracks) : new Set(midi.tracks.filter((t) => t.notes && !t.isDrum).map((t) => t.index));
  // a drums-only file still shows something
  if (!pick.size) midi.tracks.filter((t) => t.notes).forEach((t) => pick.add(t.index));
  const order = [...pick].sort((a, b) => a - b);
  const notes = midi.notes.filter((n) => pick.has(n.track)).map((n) => ({ ...n, slot: order.indexOf(n.track), dur: Math.max(0.06, n.dur) }));
  const low = notes.length ? Math.min(...notes.map((n) => n.note)) : 48;
  const high = notes.length ? Math.max(...notes.map((n) => n.note)) : 72;
  const out = { notes, low, high, maxDur: Math.max(0.1, ...notes.map((n) => n.dur)), duration: midi.duration, tempo: midi.tempo, bars: midi.bars, tracks: order };
  per.set(key, out);
  return out;
}

const PC_COLORS = ['#ff4d6d', '#ff7a45', '#ffb020', '#ffd400', '#b5f23d', '#4ade80', '#2dd4bf', '#38bdf8', '#4d7cff', '#8b5cf6', '#c026d3', '#f472b6'];
export function noteColor(layer, n) {
  if (layer.colorMode === 'single') return layer.color || '#4dd2ff';
  if (layer.colorMode === 'pitch') return PC_COLORS[n.note % 12];
  return (layer.trackColors && layer.trackColors[n.track]) || TRACK_COLORS[n.slot % TRACK_COLORS.length];
}

function firstFrom(notes, t) {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
const rgba = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
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
const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);

/** Draw the layer at timeline time t (song time `songTime`). */
export function drawMidi(ctx, W, H, layer, data, t, songTime) {
  if (!data || !data.notes.length) return;
  const dt = (songTime - (layer.offset || 0)) * (layer.tempoScale || 1);
  const aw = (W * (layer.width ?? 92)) / 100;
  const ah = (H * (layer.height ?? 22)) / 100;
  const ax = (W * (layer.x ?? 50)) / 100 - aw / 2;
  const ay = (H * (layer.y ?? 30)) / 100 - ah / 2;
  const glow = layer.glow ?? 0.8;
  ctx.save();
  if ((layer.bgOpacity ?? 0.45) > 0) {
    ctx.fillStyle = rgba(layer.bg || '#000000', layer.bgOpacity ?? 0.45);
    rrect(ctx, ax, ay, aw, ah, Math.min(aw, ah) * 0.06);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();
  const style = layer.style || 'roll';
  if (style === 'keys') drawKeys(ctx, layer, data, dt, ax, ay, aw, ah, glow);
  else if (style === 'bursts') drawBursts(ctx, layer, data, dt, ax, ay, aw, ah, glow);
  else drawRoll(ctx, layer, data, dt, ax, ay, aw, ah, glow);
  ctx.restore();
}

function drawRoll(ctx, layer, data, dt, ax, ay, aw, ah, glow) {
  const win = Math.max(0.5, layer.window || 4);
  const pps = aw / win;
  const headX = ax + (aw * (layer.playhead ?? 25)) / 100;
  const lo = data.low - 1;
  const span = Math.max(12, data.high - data.low + 3);
  const rowH = ah / span;
  const yOf = (note) => ay + ah - (note - lo + 1) * rowH;
  const from = dt - (headX - ax) / pps;
  // beat lines from the bars, faint
  if (data.bars && data.bars.length) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, aw * 0.0015);
    for (const b of data.bars) {
      if (b.time < from - 1 || b.time > from + win + 1) continue;
      const x = headX + (b.time - dt) * pps;
      ctx.beginPath();
      ctx.moveTo(x, ay);
      ctx.lineTo(x, ay + ah);
      ctx.stroke();
    }
  }
  const notes = data.notes;
  for (let i = firstFrom(notes, from - data.maxDur); i < notes.length && notes[i].time <= from + win; i++) {
    const n = notes[i];
    const x0 = headX + (n.time - dt) * pps;
    const x1 = x0 + n.dur * pps;
    if (x1 < ax) continue;
    const on = dt >= n.time && dt < n.time + n.dur;
    const c = noteColor(layer, n);
    const y = yOf(n.note);
    ctx.fillStyle = on ? c : rgba(c, x0 < headX ? 0.4 : 0.75);
    if (on && glow > 0) {
      ctx.shadowColor = c;
      ctx.shadowBlur = rowH * 3 * glow;
    }
    rrect(ctx, x0, y + rowH * 0.1, Math.max(2, x1 - x0 - 1), rowH * 0.8, rowH * 0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(headX - Math.max(1, aw * 0.0015), ay, Math.max(2, aw * 0.003), ah);
}

function drawKeys(ctx, layer, data, dt, ax, ay, aw, ah, glow) {
  const lo = data.low - (data.low % 12); // from a C
  const hi = data.high + (11 - (data.high % 12)); // to a B
  const whites = [];
  for (let n = lo; n <= hi; n++) if (!isBlack(n)) whites.push(n);
  const ww = aw / whites.length;
  const kbH = Math.min(ah * 0.22, ww * 5.5);
  const kbY = ay + ah - kbH;
  const keyX = new Map();
  whites.forEach((n, i) => keyX.set(n, { x: ax + i * ww, w: ww, black: false }));
  for (let n = lo; n <= hi; n++) if (isBlack(n)) {
    const left = keyX.get(n - 1);
    if (left) keyX.set(n, { x: left.x + ww * 0.68, w: ww * 0.64, black: true });
  }
  const win = Math.max(0.5, layer.window || 4);
  const pps = (kbY - ay) / win;
  const lit = new Map();
  const notes = data.notes;
  for (let i = firstFrom(notes, dt - data.maxDur); i < notes.length && notes[i].time <= dt + win; i++) {
    const n = notes[i];
    const k = keyX.get(n.note);
    if (!k) continue;
    const c = noteColor(layer, n);
    const on = dt >= n.time && dt < n.time + n.dur;
    if (on) lit.set(n.note, c);
    const yb = kbY - (n.time - dt) * pps; // bottom of the note reaches the keys when it plays
    const yt = yb - n.dur * pps;
    if (yt > kbY) continue;
    ctx.fillStyle = on ? c : rgba(c, 0.85);
    if (glow > 0) {
      ctx.shadowColor = c;
      ctx.shadowBlur = ww * (on ? 1.2 : 0.4) * glow;
    }
    rrect(ctx, k.x + k.w * 0.08, Math.max(ay, yt), k.w * 0.84, Math.max(2, Math.min(yb, kbY) - Math.max(ay, yt)), k.w * 0.25);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // the keyboard: white keys, then black keys on top
  for (const n of whites) {
    const k = keyX.get(n);
    const c = lit.get(n);
    ctx.fillStyle = c || '#f4f4f5';
    ctx.fillRect(k.x + 0.5, kbY, k.w - 1, kbH);
  }
  for (const [n, k] of keyX) {
    if (!k.black) continue;
    const c = lit.get(n);
    ctx.fillStyle = c || '#18181b';
    ctx.fillRect(k.x, kbY, k.w, kbH * 0.62);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(ax, kbY - 2, aw, 2);
}

function drawBursts(ctx, layer, data, dt, ax, ay, aw, ah, glow) {
  const life = 0.9;
  const lo = data.low - 1;
  const span = Math.max(12, data.high - data.low + 2);
  const notes = data.notes;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = firstFrom(notes, dt - Math.max(life, data.maxDur)); i < notes.length && notes[i].time <= dt; i++) {
    const n = notes[i];
    const age = dt - n.time;
    const held = age < n.dur;
    const k = held ? Math.min(1, age / 0.08) : Math.max(0, 1 - (age - n.dur) / life);
    if (k <= 0) continue;
    const x = ax + ((n.note - lo) / span) * aw;
    const y = ay + ah * (0.5 + 0.35 * Math.sin(n.note * 1.7 + n.track)) ;
    const r = Math.min(aw, ah) * (0.05 + 0.12 * (n.vel / 127)) * (1 + (held ? 0 : (age - n.dur) * 0.8));
    const c = noteColor(layer, n);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * (1 + glow));
    g.addColorStop(0, rgba(c, 0.95 * k));
    g.addColorStop(0.35, rgba(c, 0.5 * k));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + glow), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
