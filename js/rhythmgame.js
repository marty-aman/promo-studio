// Rhythm game layer: a Guitar Hero / Rock Band style note highway "played" in time with the song.
// Notes come from a part's chart (a Guitar Pro track, a MIDI track, a drum chart) or are worked out from a stem
// (where new sounds start, and how bright they are). Every note is hit: gems light the frets, flames burst,
// the streak, multiplier, score and star power count up. Original drawing; no game art or logos are used.
// Chart building is pure and unit tested.

export const INSTRUMENTS = [
  ['guitar', 'Guitar'],
  ['bass', 'Bass'],
  ['drums', 'Drums'],
  ['keys', 'Keys'],
];
/** Five frets, low to high: green, red, yellow, blue, orange. Drums: red, yellow, blue, green pads and an orange kick. */
export const FRET_COLORS = ['#22c55e', '#ef4444', '#facc15', '#3b82f6', '#f97316'];
export const PAD_COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'];
export const KICK_COLOR = '#f97316';
export const STAR_COLOR = '#7dd3fc';

/**
 * Looks for the highway. lanes: five fret colours; pads: four drum pads; kick, star (star power), board
 * (top and bottom), grain (the streaks), rail, flame (the core of each burst), spark, hud (panel), font,
 * gem: 'round' | 'square' (pixel) | 'diamond' | 'flat', scan: CRT lines, arena: the backdrop's two colours.
 */
export const GAME_THEMES = {
  classic: { name: 'Classic', blurb: 'Green, red, yellow, blue, orange frets on a purple-black board', lanes: FRET_COLORS, pads: PAD_COLORS, kick: KICK_COLOR, star: STAR_COLOR, board: ['rgba(18,14,30,0.94)', 'rgba(28,22,44,0.98)'], grain: ['#3b2a55', '#56407a'], rail: '#a78bfa', flame: '#ffd27a', spark: '#fff3c4', hud: 'rgba(8,6,14,0.82)', font: 'Montserrat, "Arial Black", Impact, sans-serif', gem: 'round', arena: ['#ff2bd6', '#2b6bff'] },
  neon: { name: 'Neon', blurb: 'Glowing outlines on black, synthwave pink and cyan', lanes: ['#39ff14', '#ff2079', '#fff01f', '#00e5ff', '#bc13fe'], pads: ['#ff2079', '#fff01f', '#00e5ff', '#39ff14'], kick: '#bc13fe', star: '#ffffff', board: ['rgba(4,0,12,0.92)', 'rgba(10,0,24,0.97)'], grain: ['#ff2079', '#00e5ff'], rail: '#ff2079', flame: '#ff7ad9', spark: '#b8f7ff', hud: 'rgba(6,0,16,0.86)', font: 'Montserrat, "Arial Black", sans-serif', gem: 'ring', arena: ['#ff2079', '#00e5ff'] },
  inferno: { name: 'Inferno', blurb: 'Scorched metal board, chrome gems, roaring fire', lanes: ['#16a34a', '#dc2626', '#eab308', '#2563eb', '#ea580c'], pads: ['#dc2626', '#eab308', '#2563eb', '#16a34a'], kick: '#f97316', star: '#fde68a', board: ['rgba(20,6,2,0.95)', 'rgba(48,14,6,0.98)'], grain: ['#5a1d0a', '#8a2c0c'], rail: '#f97316', flame: '#ff6a00', spark: '#ffd166', hud: 'rgba(20,6,2,0.88)', font: 'Impact, "Arial Black", sans-serif', gem: 'diamond', arena: ['#ff4d00', '#ffb000'] },
  arcade: { name: '8-bit arcade', blurb: 'Square pixel gems, scanlines and a blocky score', lanes: ['#00d26a', '#ff3b3b', '#ffd23f', '#3b82ff', '#ff8c1a'], pads: ['#ff3b3b', '#ffd23f', '#3b82ff', '#00d26a'], kick: '#ff8c1a', star: '#7df9ff', board: ['rgba(0,8,32,0.95)', 'rgba(0,16,56,0.98)'], grain: ['#0b2a6b', '#123a8f'], rail: '#7df9ff', flame: '#ffffff', spark: '#ffd23f', hud: 'rgba(0,6,24,0.9)', font: '"Courier New", ui-monospace, monospace', gem: 'square', scan: true, arena: ['#3b82ff', '#ff3b3b'] },
  ice: { name: 'Ice', blurb: 'Frosted glass board, cool tones, icy sparks', lanes: ['#5eead4', '#f0abfc', '#fef08a', '#93c5fd', '#fdba74'], pads: ['#f0abfc', '#fef08a', '#93c5fd', '#5eead4'], kick: '#c4b5fd', star: '#ffffff', board: ['rgba(10,24,40,0.88)', 'rgba(24,48,72,0.94)'], grain: ['#335a7a', '#4c7aa0'], rail: '#bae6fd', flame: '#e0f2fe', spark: '#ffffff', hud: 'rgba(8,20,34,0.82)', font: 'Montserrat, sans-serif', gem: 'round', arena: ['#38bdf8', '#a78bfa'] },
  bloodsteel: { name: 'Blood & steel', blurb: 'Dark metal: black iron board, blood-red rails and fire, steel gems', lanes: ['#9ca3af', '#dc1010', '#e5e7eb', '#7f1d1d', '#ff3b3b'], pads: ['#dc1010', '#e5e7eb', '#9ca3af', '#7f1d1d'], kick: '#ff1a1a', star: '#ffd0d0', board: ['rgba(2,0,0,0.95)', 'rgba(22,2,2,0.98)'], grain: ['#2a0505', '#5c0b0b'], rail: '#e01818', flame: '#ff2a00', spark: '#ffb0a0', hud: 'rgba(6,0,0,0.9)', font: '"Bebas Neue", Impact, sans-serif', gem: 'diamond', arena: ['#e01818', '#4a0000'] },
  blackout: { name: 'Blackout', blurb: 'All black and grey: smoked board, graphite gems, white light', lanes: ['#f4f4f5', '#a1a1aa', '#d4d4d8', '#71717a', '#e4e4e7'], pads: ['#f4f4f5', '#a1a1aa', '#d4d4d8', '#71717a'], kick: '#e4e4e7', star: '#ffffff', board: ['rgba(4,4,5,0.95)', 'rgba(20,20,22,0.98)'], grain: ['#1c1c1f', '#2c2c30'], rail: '#bdbdc2', flame: '#e4e4e7', spark: '#ffffff', hud: 'rgba(0,0,0,0.88)', font: '"Bebas Neue", Impact, sans-serif', gem: 'flat', arena: ['#8a8a90', '#2a2a2e'] },
  mono: { name: 'Mono', blurb: 'Black and white with one accent colour: clean and minimal', lanes: ['#ffffff', '#d4d4d8', '#a1a1aa', '#d4d4d8', '#ffffff'], pads: ['#ffffff', '#d4d4d8', '#a1a1aa', '#ffffff'], kick: '#e0182d', star: '#e0182d', board: ['rgba(6,6,6,0.94)', 'rgba(16,16,16,0.98)'], grain: ['#222222', '#2e2e2e'], rail: '#ffffff', flame: '#ffffff', spark: '#ffffff', hud: 'rgba(0,0,0,0.85)', font: '"Bebas Neue", Impact, sans-serif', gem: 'flat', arena: ['#e0182d', '#ffffff'] },
};
export const GAME_THEME_LIST = Object.entries(GAME_THEMES).map(([id, t]) => [id, t.name, t.blurb]);

/**
 * The theme a layer draws with: its preset, with the project theme's colours on the board, rails and star
 * when it follows the artist's theme (layer.followTheme and layer.themeColors from themes.js).
 */
export function gameTheme(layer) {
  const base = GAME_THEMES[layer && layer.gameTheme] || GAME_THEMES.classic;
  const c = layer && layer.followTheme !== false && layer.themeColors;
  if (!c) return base;
  const hexA = (hex, a) => rgbaHex(hex, a);
  return { ...base, board: [hexA(c.bg, 0.94), hexA(c.deep || c.bg, 0.97)], grain: [c.deep || base.grain[0], c.accent || base.grain[1]], rail: c.accent || base.rail, star: c.light || base.star, kick: c.accent || base.kick, hud: hexA(c.bg, 0.86), arena: [c.accent || base.arena[0], c.light || base.arena[1]] };
}
const rgbaHex = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(10,10,16,${a})`;
};

export function defaultGameLayer() {
  return {
    source: 'tab', // tab | midi | stem
    mediaId: null,
    track: 0,
    drumMap: 'general_midi',
    instrument: 'guitar',
    sensitivity: 0.5,
    offset: 0,
    tempoScale: 1,
    start: 0,
    end: null,
    x: 50,
    y: 60,
    width: 70,
    height: 64,
    window: 1.6, // seconds of notes on the highway
    hud: true,
    starPower: true,
    flames: true,
    backdrop: 'none', // none | arena (draws the arena behind the highway, full frame)
    gameTheme: 'classic', // see GAME_THEMES
    followTheme: true, // take the project theme's colours (when it has one) on the board, rails and star
    label: '',
  };
}

// ------------------------------------------------------------ charts

const GAP = 0.07; // two gems on one lane can't be closer than this

/**
 * Pitched notes [{ time, pitch, dur }] to five-lane gems, the way charts move: each note's lane is its pitch's
 * rank among the notes around it (±4 s), so the hand moves up and down the frets with the melody. Chords get
 * neighbouring lanes (up to three). Long notes become sustains.
 */
export function pitchedToGems(notes, { lanes = 5, window = 4, maxChord = 3 } = {}) {
  const sorted = [...notes].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  // group chords (notes starting within 25 ms)
  const groups = [];
  for (const n of sorted) {
    const g = groups[groups.length - 1];
    if (g && n.time - g.time < 0.025) g.notes.push(n);
    else groups.push({ time: n.time, notes: [n] });
  }
  const gems = [];
  let lo = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    while (groups[lo].time < g.time - window) lo++;
    const near = [];
    for (let j = lo; j < groups.length && groups[j].time <= g.time + window; j++) for (const n of groups[j].notes) near.push(n.pitch);
    near.sort((a, b) => a - b);
    const minP = near[0];
    const maxP = near[near.length - 1];
    const pitches = [...new Set(g.notes.map((n) => n.pitch))].sort((a, b) => a - b);
    const rankOf = (p) => (maxP === minP ? 0.5 : (p - minP) / (maxP - minP));
    const size = Math.min(maxChord, pitches.length);
    let base = Math.round(rankOf(pitches[0]) * (lanes - size));
    base = Math.max(0, Math.min(lanes - size, base));
    const dur = Math.max(...g.notes.map((n) => n.dur || 0));
    for (let k = 0; k < size; k++) gems.push({ time: g.time, lane: base + k, len: dur > 0.45 ? +(dur - 0.12).toFixed(3) : 0, chord: size > 1 });
  }
  return finishGems(gems);
}

/** Drum chart hits (drums.js lanes) to Rock Band style pads: 0 red snare, 1 yellow hi-hat / high tom, 2 blue ride / mid tom, 3 green crash / floor tom, and kicks (lane -1). */
export function drumsToGems(hits) {
  const PAD = { snare: 0, hihat: 1, tom1: 1, ride: 2, tom2: 2, crash2: 2, crash: 3, china: 3, floor: 3, kick: -1 };
  const gems = [];
  for (const h of hits || []) {
    const lane = PAD[h.lane];
    if (lane === undefined) continue;
    gems.push({ time: h.time, lane, len: 0, cymbal: ['hihat', 'ride', 'crash', 'crash2', 'china'].includes(h.lane) });
  }
  return finishGems(gems);
}

/**
 * Gems from a stem's analysis (viz.js analyseSamples: env100, bands, fps): a gem where each new sound starts,
 * its lane from how bright it is compared with the sounds around it, a sustain while it rings out.
 * `onsets(env, rate)` finds the starts (drums.js detectOnsets).
 */
export function stemToGems(feat, onsets, { lanes = 5, sensitivity = 0.5 } = {}) {
  if (!feat || !feat.env100) return finishGems([]);
  const starts = onsets(feat.env100, 100, { sensitivity, minGap: 0.11 });
  const nb = feat.nbands || 16;
  const bright = (t) => {
    const f = Math.min(feat.frames - 1, Math.max(0, Math.round((t + 0.02) * feat.fps)));
    let sum = 0;
    let wsum = 0;
    for (let b = 0; b < nb; b++) {
      const v = feat.bands[f * nb + b];
      sum += v * b;
      wsum += v;
    }
    return wsum ? sum / wsum : nb / 2;
  };
  const notes = starts.map((o) => {
    const t = o.time ?? o;
    // ring-out: until the level falls under half of what it was at the start
    const f0 = Math.round(t * feat.fps);
    const l0 = feat.level[Math.min(feat.frames - 1, f0 + 1)] || 0;
    let f = f0 + 2;
    while (f < feat.frames && feat.level[f] > l0 * 0.5 && f - f0 < feat.fps * 2) f++;
    return { time: t, pitch: bright(t), dur: (f - f0) / feat.fps };
  });
  return pitchedToGems(notes, { lanes, maxChord: 1 });
}

/** Sort, drop gems too close on one lane, and add the running score (streak multiplier, star power doubles it). */
export function finishGems(gems) {
  const sorted = [...gems].sort((a, b) => a.time - b.time || a.lane - b.lane);
  const last = new Map();
  const out = [];
  for (const g of sorted) {
    const prev = last.get(g.lane);
    if (prev !== undefined && g.time - prev < GAP) continue;
    last.set(g.lane, g.time);
    out.push({ ...g });
  }
  // star power: every so often a phrase of notes glows; it fills the meter, then the next stretch scores double
  const PHRASE = 24;
  const ACTIVE = 30;
  let score = 0;
  out.forEach((g, i) => {
    const step = i % (PHRASE + ACTIVE);
    g.star = step < 8; // the glowing phrase
    g.sp = step >= PHRASE; // star power is on
    const mult = Math.min(4, 1 + Math.floor(i / 10)) * (g.sp ? 2 : 1);
    score += 50 * mult + (g.len ? Math.round(g.len * 25) * mult : 0);
    g.score = score;
    g.n = i + 1;
  });
  return { gems: out, notes: out.length, duration: out.length ? out[out.length - 1].time + (out[out.length - 1].len || 0) : 0 };
}

/** Where the HUD is at chart time `dt`: notes hit, streak, multiplier, score, star meter, star power on. */
export function gameState(chart, dt) {
  const gems = chart.gems;
  let lo = 0;
  let hi = gems.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (gems[mid].time <= dt) lo = mid + 1;
    else hi = mid;
  }
  const n = lo;
  const g = gems[n - 1];
  const step = n % 54;
  const meter = step < 24 ? Math.min(1, (step / 24) * 1.1) : 1 - (step - 24) / 30;
  return { n, streak: n, mult: Math.min(4, 1 + Math.floor(n / 10)), score: g ? g.score : 0, meter: Math.max(0, Math.min(1, meter)), sp: !!(g && g.sp), last: g || null, timeOf: (k) => (gems[k - 1] ? gems[k - 1].time : -Infinity) };
}

// ------------------------------------------------------------ drawing

const rgba = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
};
const mix = (hex, k) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return hex;
  return `rgb(${[1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) + (255 - parseInt(m[i], 16)) * k)).join(',')})`;
};
const firstFrom = (gems, t) => {
  let lo = 0;
  let hi = gems.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (gems[mid].time + (gems[mid].len || 0) < t) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 8);
};

/** Draw the highway at song time `songTime`. `drawArena(ctx, W, H)` paints the full-frame backdrop when the layer asks for it. */
export function drawGame(ctx, W, H, layer, chart, t, songTime, { beat = 0, drawArena = null, bars = null } = {}) {
  if (layer.backdrop === 'arena' && drawArena) drawArena(ctx, W, H);
  if (!chart || !chart.gems) return;
  const dt = (songTime - (layer.offset || 0)) * (layer.tempoScale || 1);
  const drums = layer.instrument === 'drums';
  const lanes = drums ? 4 : 5;
  const T = gameTheme(layer);
  const colors = drums ? T.pads : T.lanes;
  const STAR = T.star;
  const KICK = T.kick;
  const bw = (W * (layer.width ?? 70)) / 100; // board width at the strike line
  const bh = (H * (layer.height ?? 64)) / 100;
  const cx = (W * (layer.x ?? 50)) / 100;
  const yBot = (H * (layer.y ?? 60)) / 100 + bh / 2;
  const yStrike = yBot - bh * 0.1;
  const topW = bw * 0.36;
  const win = Math.max(0.6, layer.window || 1.6);
  const st = gameState(chart, dt);
  const spOn = layer.starPower !== false && st.sp;
  // perspective: u is 0 at the strike line and 1 at the far end
  const P = (u) => (1 - 1 / (1 + 3 * u)) / 0.75;
  const Y = (u) => yStrike - P(u) * (yStrike - (yBot - bh));
  const half = (u) => (bw / 2) * (1 - P(u)) + (topW / 2) * P(u);
  const laneX = (lane, u) => cx - half(u) + ((lane + 0.5) / lanes) * half(u) * 2;
  const uOf = (time) => (time - dt) / win;

  ctx.save();
  // ---- the board
  const farY = Y(1.05);
  const g = ctx.createLinearGradient(0, farY, 0, yBot);
  g.addColorStop(0, 'rgba(10,8,18,0)');
  g.addColorStop(0.15, T.board[0]);
  g.addColorStop(1, T.board[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - half(1.05), farY);
  ctx.lineTo(cx + half(1.05), farY);
  ctx.lineTo(cx + bw / 2 * 1.04, yBot);
  ctx.lineTo(cx - bw / 2 * 1.04, yBot);
  ctx.closePath();
  ctx.fill();
  // wood-grain streaks scrolling toward you
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.18;
  for (let k = 0; k < 40; k++) {
    const u = (((k / 40 - dt / win / 3) % 1) + 1) % 1;
    const y = Y(u);
    ctx.fillStyle = k % 3 ? T.grain[0] : T.grain[1];
    ctx.fillRect(cx - half(u), y, half(u) * 2, Math.max(1, (yStrike - farY) * 0.004 * (1 - P(u) * 0.7)));
  }
  ctx.restore();
  // lane lines
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(1, bw * 0.003);
  for (let l = 1; l < lanes; l++) {
    ctx.beginPath();
    ctx.moveTo(cx - half(1) + (l / lanes) * half(1) * 2, Y(1));
    ctx.lineTo(cx - bw / 2 + (l / lanes) * bw, yBot);
    ctx.stroke();
  }
  // beat lines: from the file's bars, else every half second
  const beatLen = chart.tempo ? 60 / chart.tempo : 0.5;
  const firstBeat = Math.floor(dt / beatLen) * beatLen;
  for (let b = firstBeat; b < dt + win * 1.05; b += beatLen) {
    const u = uOf(b);
    if (u < -0.05 || u > 1.05) continue;
    const bar = Math.round(b / beatLen) % 4 === 0;
    ctx.strokeStyle = `rgba(255,255,255,${bar ? 0.32 : 0.12})`;
    ctx.lineWidth = Math.max(1, bw * (bar ? 0.006 : 0.003) * (1 - P(u) * 0.6));
    ctx.beginPath();
    ctx.moveTo(cx - half(u), Y(u));
    ctx.lineTo(cx + half(u), Y(u));
    ctx.stroke();
  }
  // glowing side rails (blue with star power)
  const rail = spOn ? STAR : T.rail;
  ctx.strokeStyle = rgba(rail, spOn ? 0.95 : 0.6);
  ctx.lineWidth = Math.max(2, bw * 0.012);
  ctx.shadowColor = rail;
  ctx.shadowBlur = bw * (spOn ? 0.05 : 0.02);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * half(1), Y(1));
    ctx.lineTo(cx + s * bw / 2 * 1.02, yBot);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // ---- the strike line and fret buttons (lit while a note is played)
  const fretR = (bw / lanes) * 0.36;
  const lit = new Array(lanes).fill(0);
  let kickHit = 0;
  const gems = chart.gems;
  for (let i = firstFrom(gems, dt - 0.25); i < gems.length && gems[i].time <= dt + 0.02; i++) {
    const gm = gems[i];
    const age = dt - gm.time;
    const held = gm.len && age >= 0 && age < gm.len;
    const k = held ? 1 : age >= -0.02 && age < 0.18 ? 1 - Math.max(0, age) / 0.18 : 0;
    if (gm.lane < 0) kickHit = Math.max(kickHit, k);
    else lit[gm.lane] = Math.max(lit[gm.lane], k);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - bw / 2, yStrike - Math.max(1, bh * 0.003), bw, Math.max(2, bh * 0.006));
  for (let l = 0; l < lanes; l++) {
    const x = laneX(l, 0);
    const c = colors[l];
    ctx.beginPath();
    ctx.ellipse(x, yStrike, fretR, fretR * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit[l] ? mix(c, 0.35 * lit[l]) : 'rgba(10,10,16,0.85)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, fretR * 0.22);
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, yStrike - fretR * 0.06, fretR * 0.45, fretR * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit[l] ? '#ffffff' : 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
  if (drums) {
    ctx.fillStyle = kickHit ? mix(KICK, 0.4 * kickHit) : rgba(KICK, 0.35);
    ctx.fillRect(cx - bw / 2, yStrike + fretR * 0.75, bw, Math.max(3, fretR * 0.22));
  }

  // ---- gems and sustains, far to near
  const visible = [];
  for (let i = firstFrom(gems, dt - 0.2); i < gems.length && gems[i].time <= dt + win * 1.05; i++) visible.push(gems[i]);
  for (const gm of visible) {
    if (!gm.len || gm.lane < 0) continue;
    const u0 = Math.max(0, uOf(gm.time));
    const u1 = Math.min(1.05, uOf(gm.time + gm.len));
    if (u1 <= 0 || u0 >= 1.05) continue;
    const held = dt >= gm.time && dt < gm.time + gm.len;
    const c = spOn || gm.sp ? STAR : colors[gm.lane];
    ctx.strokeStyle = held ? mix(c, 0.3) : c;
    ctx.lineCap = 'round';
    ctx.shadowColor = c;
    ctx.shadowBlur = held ? fretR * 0.8 : 0;
    ctx.beginPath();
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const u = u0 + ((u1 - u0) * s) / steps;
      const wob = held ? Math.sin((u * 30 - dt * 30) + gm.lane) * fretR * 0.12 * (1 - P(u)) : 0;
      const x = laneX(gm.lane, u) + wob;
      if (s) ctx.lineTo(x, Y(u));
      else ctx.moveTo(x, Y(u));
      ctx.lineWidth = Math.max(2, fretR * 0.32 * (1 - P(u) * 0.6));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  for (let i = visible.length - 1; i >= 0; i--) {
    const gm = visible[i];
    const u = uOf(gm.time);
    if (u < -0.005 || u > 1.05) continue; // played gems disappear into the frets
    const sc = 1 - P(Math.max(0, u)) * 0.64;
    const alpha = u > 0.92 ? Math.max(0, (1.05 - u) / 0.13) : 1;
    ctx.globalAlpha = alpha;
    if (gm.lane < 0) {
      // kick: a bar across the highway
      const y = Y(u);
      ctx.fillStyle = spOn ? STAR : KICK;
      ctx.fillRect(cx - half(u) * 0.96, y - fretR * 0.12 * sc, half(u) * 1.92, Math.max(2, fretR * 0.24 * sc));
      ctx.globalAlpha = 1;
      continue;
    }
    const x = laneX(gm.lane, u);
    const y = Y(u);
    const r = fretR * sc;
    const c = spOn || gm.sp ? STAR : colors[gm.lane];
    if (gm.star && !spOn) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = r * 0.9;
    }
    // base
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.12, r * 0.98, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    // body, in the theme's gem shape
    const wide = drums && gm.cymbal ? 1.13 : 1; // cymbal gems are flatter, wider
    const tall = drums && gm.cymbal ? 0.76 : 1;
    ctx.beginPath();
    if (T.gem === 'square') {
      const w = r * 1.5 * wide;
      const hh = r * 0.8 * tall;
      ctx.rect(Math.round(x - w / 2), Math.round(y - hh / 2), Math.round(w), Math.round(hh));
    } else if (T.gem === 'diamond') {
      ctx.moveTo(x, y - r * 0.55 * tall);
      ctx.lineTo(x + r * 0.95 * wide, y);
      ctx.lineTo(x, y + r * 0.55 * tall);
      ctx.lineTo(x - r * 0.95 * wide, y);
      ctx.closePath();
    } else if (T.gem === 'flat') ctx.ellipse(x, y, r * 0.95 * wide, r * 0.32 * tall, 0, 0, Math.PI * 2);
    else ctx.ellipse(x, y, r * 0.9 * wide, r * 0.5 * tall, 0, 0, Math.PI * 2);
    if (T.gem === 'ring') {
      // neon: a glowing outline with a dark centre
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fill();
      ctx.shadowColor = c;
      ctx.shadowBlur = r * 0.9;
      ctx.lineWidth = Math.max(1.5, r * 0.26);
      ctx.strokeStyle = c;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else {
      ctx.fillStyle = c;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, r * (T.gem === 'square' ? 0.18 : 0.14));
      ctx.strokeStyle = T.gem === 'diamond' ? '#e5e7eb' : T.gem === 'square' ? '#000000' : '#ffffff';
      ctx.stroke();
      if (T.gem === 'round' || T.gem === 'diamond') {
        // shine
        ctx.beginPath();
        ctx.ellipse(x - r * 0.18, y - r * 0.12, r * 0.38, r * 0.14, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fill();
      } else if (T.gem === 'square') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(Math.round(x - r * 0.6), Math.round(y - r * 0.32), Math.max(2, Math.round(r * 0.3)), Math.max(2, Math.round(r * 0.18)));
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- flames on every hit
  if (layer.flames !== false) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = firstFrom(gems, dt - 0.3); i < gems.length && gems[i].time <= dt; i++) {
      const gm = gems[i];
      const age = dt - gm.time;
      if (age < 0 || age > 0.28) continue;
      const k = 1 - age / 0.28;
      const xs = gm.lane < 0 ? [cx] : [laneX(gm.lane, 0)];
      const c = spOn ? STAR : gm.lane < 0 ? KICK : colors[gm.lane];
      for (const x of xs) {
        const h = fretR * (1.6 + 2.2 * (1 - k));
        const fl = ctx.createRadialGradient(x, yStrike, 0, x, yStrike - h * 0.5, h);
        fl.addColorStop(0, rgba('#ffffff', 0.9 * k));
        fl.addColorStop(0.25, rgba(T.flame, 0.75 * k));
        fl.addColorStop(0.6, rgba(c, 0.45 * k));
        fl.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.ellipse(x, yStrike - h * 0.45, fretR * (gm.lane < 0 ? lanes : 1.1), h * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        // sparks
        for (let s = 0; s < 5; s++) {
          const a = -Math.PI / 2 + (s - 2) * 0.35 + Math.sin(gm.time * 97 + s) * 0.2;
          const d = fretR * (0.6 + 3 * (1 - k)) * (0.6 + ((s * 37) % 10) / 20);
          ctx.fillStyle = rgba(T.spark, k);
          ctx.fillRect(x + Math.cos(a) * d, yStrike + Math.sin(a) * d, Math.max(1, fretR * 0.12), Math.max(1, fretR * 0.12));
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- HUD: score, streak multiplier, star power meter, rock meter
  if (T.scan) {
    // CRT scanlines over the highway
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const step = Math.max(2, Math.round(H / 360));
    for (let yy = Math.round(farY); yy < yBot; yy += step * 2) ctx.fillRect(cx - bw / 2, yy, bw, step);
  }
  if (layer.hud !== false) drawHud(ctx, W, H, layer, st, { cx, bw, yBot, fretR, dt, beat, spOn, T });
  ctx.restore();
}

function drawHud(ctx, W, H, layer, st, { cx, bw, yBot, fretR, dt, spOn, T }) {
  const STAR_COLOR = T.star;
  // a panel under the highway, as wide as it: rock meter | score and star power | multiplier
  const ph = Math.max(18, bw * 0.17);
  const top = yBot + ph * 0.12;
  const s = ph / 2.2;
  const font = (px, w = 800) => `${w} ${Math.round(px)}px ${T.font}`;
  const x0 = cx - bw / 2;
  ctx.fillStyle = T.hud;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, top, bw, ph, ph * 0.18);
  else ctx.rect(x0, top, bw, ph);
  ctx.fill();
  ctx.strokeStyle = spOn ? STAR_COLOR : rgba(T.rail, 0.55);
  ctx.lineWidth = Math.max(1, ph * 0.04);
  ctx.stroke();
  const my = top + ph / 2;
  ctx.textBaseline = 'middle';
  // rock meter: a needle that stays in the green (every note is hit)
  const rr = ph * 0.34;
  const rx = x0 + ph * 0.55;
  const ry = my + rr * 0.45;
  const seg = [['#ef4444', Math.PI, Math.PI * 1.33], ['#facc15', Math.PI * 1.33, Math.PI * 1.66], ['#22c55e', Math.PI * 1.66, Math.PI * 2]];
  ctx.lineWidth = rr * 0.28;
  for (const [c, a0, a1] of seg) {
    ctx.beginPath();
    ctx.arc(rx, ry, rr, a0, a1);
    ctx.strokeStyle = c;
    ctx.stroke();
  }
  const ang = Math.PI * (1.82 + 0.06 * Math.sin(dt * 3));
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(ang) * rr * 1.1, ry + Math.sin(ang) * rr * 1.1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = rr * 0.12;
  ctx.stroke();
  // multiplier dial
  const R = ph * 0.36;
  const mx = x0 + bw - ph * 0.55;
  const ring = st.mult >= 4 ? 1 : (st.n % 10) / 10;
  const multCol = spOn ? STAR_COLOR : ['#ffffff', '#facc15', '#22c55e', '#a855f7'][st.mult - 1];
  ctx.beginPath();
  ctx.arc(mx, my, R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(mx, my, R * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring);
  ctx.strokeStyle = multCol;
  ctx.lineWidth = R * 0.2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = font(R * 0.8);
  ctx.fillStyle = multCol;
  ctx.fillText(`×${st.mult * (spOn ? 2 : 1)}`, mx, my + R * 0.04);
  // score, with the star power meter under it
  const midL = rx + rr * 1.4;
  const midR = mx - R * 1.3;
  const score = String(st.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  ctx.font = font(Math.min(s * 0.95, ((midR - midL) / Math.max(4, score.length)) * 1.6));
  ctx.fillStyle = '#ffffff';
  ctx.fillText(score, (midL + midR) / 2, my - ph * 0.1);
  const bh = Math.max(2, ph * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(midL, my + ph * 0.2, midR - midL, bh);
  ctx.fillStyle = spOn ? STAR_COLOR : '#e0f2fe';
  ctx.fillRect(midL, my + ph * 0.2, (midR - midL) * st.meter, bh);
  ctx.textBaseline = 'alphabetic';
  // streak call-outs
  const milestone = [50, 100, 150, 200, 300, 400, 500].find((m) => st.n >= m && dt - st.timeOf(m) < 1.4);
  if (milestone) {
    const k = Math.min(1, (dt - st.timeOf(milestone)) / 0.15);
    ctx.font = font(bw * 0.075 * (0.8 + 0.2 * k));
    ctx.textAlign = 'center';
    ctx.lineWidth = bw * 0.012;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(`${milestone} NOTE STREAK!`, cx, yBot - fretR * 9);
    ctx.fillStyle = '#facc15';
    ctx.fillText(`${milestone} NOTE STREAK!`, cx, yBot - fretR * 9);
  }
  if (spOn && st.last && dt - st.timeOf(st.n - ((st.n - 1) % 54) + 24) < 1.2) {
    ctx.font = font(bw * 0.08);
    ctx.textAlign = 'center';
    ctx.fillStyle = STAR_COLOR;
    ctx.fillText('STAR POWER!', cx, yBot - fretR * 11);
  }
  if (layer.label) {
    ctx.font = font(s * 0.62, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(layer.label.toUpperCase(), cx, top + ph + s * 0.75);
  }
}
