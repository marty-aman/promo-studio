// Effect settings for the lyric motion effects: pulse timing and size, shake, glitch, neon flicker, wave,
// bounce, the poster's slam and the tunnel's speed. Saved as lyricStyle.fx (and a line's own line.fx);
// the pulse tempo is lyricStyle.tempo (see tempo.js gridOf). Every setting missing means "as before":
// the multipliers default to 1 and the maths multiplies by them, so old projects render exactly as they did.
// Pure functions only, so they are unit tested.
import { beatEnvelope } from './core.js';
import { gridOf } from './tempo.js';

/** How often the pulse hits, in beats. */
export const DIVISIONS = [
  ['1', 'Every beat'],
  ['2', 'Every 2 beats'],
  ['0.5', 'Every half beat'],
  ['4', 'Every bar (4 beats)'],
];
const DIV_VALUES = [1, 2, 0.5, 4];

const pct = (v) => `${Math.round(v * 100)}%`;
const times = (v) => `×${(+v).toFixed(2)}`;

/**
 * Every setting: [default, min, max, step, label, format]. Multipliers (×1 = as before) for the old constants,
 * so the defaults reproduce today's look exactly.
 */
export const FX_FIELDS = {
  // pulse on the beat ('beat' animation, the poster's pulse, the tunnel's frames)
  div: [1, 0.5, 4, 0.5, 'Pulse every', null],
  len: [1, 0.25, 4, 0.05, 'Pulse length', times],
  pulse: [1, 0, 4, 0.05, 'Pulse size', pct],
  // shake (any lyric style; off unless you turn it up)
  shake: [0, 0, 1, 0.01, 'Shake amount', pct],
  shakeSpeed: [1, 0.1, 4, 0.05, 'Shake speed', times],
  // glitch: the word jitter, the colour split, how often it fires after the start
  glitchAmt: [1, 0, 4, 0.05, 'Glitch amount', pct],
  glitchSpeed: [1, 0.1, 4, 0.05, 'Glitch speed', times],
  glitchRate: [1, 0, 5, 0.1, 'Glitch how often', times],
  // neon flicker
  neonFlicker: [1, 0, 4, 0.05, 'Flicker-on length', times],
  neonHum: [1, 0, 5, 0.1, 'Glow hum amount', pct],
  neonSpeed: [1, 0.1, 4, 0.05, 'Glow hum speed', times],
  // wave
  waveAmt: [1, 0, 4, 0.05, 'Wave height', pct],
  waveSpeed: [1, 0.1, 4, 0.05, 'Wave speed', times],
  waveSpread: [1, 0, 4, 0.05, 'Wave spread', times],
  // words drop & bounce
  bounceHeight: [1, 0, 3, 0.05, 'Drop height', pct],
  bounceTime: [1, 0.25, 4, 0.05, 'Bounce length', times],
  // kinetic poster
  slamShake: [1, 0, 5, 0.1, 'Slam shake', pct],
  slamSpeed: [1, 0.1, 4, 0.05, 'Slam shake speed', times],
  // 3D tunnel
  tunnelSpeed: [1, 0, 4, 0.05, 'Tunnel speed', times],
};
export const SHAKE_DIRS = [['both', 'All ways'], ['x', 'Side to side'], ['y', 'Up and down']];

/** A setting's value: the line's or style's own, else its default. */
export const fxv = (fx, key) => {
  const v = fx && fx[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : FX_FIELDS[key][0];
};

/**
 * A clean copy of a saved fx object: known keys only, numbers kept in range, junk dropped. null when empty.
 * explicit: keep "Shake on the beat" off and "All ways" too (a look's own fx, lookapply.js: they must win over the
 * shared settings underneath, so they are written out even at their defaults).
 */
export function cleanFx(fx, { explicit = false } = {}) {
  if (!fx || typeof fx !== 'object') return null;
  const out = {};
  for (const [k, [, min, max]] of Object.entries(FX_FIELDS)) {
    const n = typeof fx[k] === 'string' ? parseFloat(fx[k]) : fx[k];
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    out[k] = k === 'div' ? (DIV_VALUES.includes(n) ? n : 1) : Math.max(min, Math.min(max, n));
  }
  if (fx.shakeBeat === true || (explicit && fx.shakeBeat === false)) out.shakeBeat = fx.shakeBeat;
  if (SHAKE_DIRS.some(([d]) => d === fx.shakeDir) && (explicit || fx.shakeDir !== 'both')) out.shakeDir = fx.shakeDir;
  return Object.keys(out).length ? out : null;
}

/**
 * Saved effect settings made safe on load (normalizeProject): junk dropped, numbers in range, an empty fx
 * removed; the same for a look's own fx (line.style.fx, from a look theme). Lines without fx are passed through
 * as they are. Returns { lyricStyle, lyrics }.
 */
export function cleanLyricFx(lyricStyle, lyrics) {
  const st = { ...lyricStyle };
  if ('fx' in st) {
    const c = cleanFx(st.fx);
    if (c) st.fx = c;
    else delete st.fx;
  }
  if (st.tempo && !(st.tempo.bpm > 0)) delete st.tempo;
  const list = Array.isArray(lyrics)
    ? lyrics.map((l) => {
        if (l && l.style && typeof l.style === 'object' && 'fx' in l.style) {
          const c = cleanFx(l.style.fx, { explicit: true });
          const { fx, ...st2 } = l.style;
          l = { ...l, style: c ? { ...st2, fx: c } : st2 };
        }
        if (!l || !('fx' in l)) return l;
        const c = cleanFx(l.fx);
        const { fx, ...rest } = l;
        return c ? { ...rest, fx: c } : rest;
      })
    : lyrics;
  return { lyricStyle: st, lyrics: list };
}

/** Which effects a lyric style moves with, so the Effect settings group shows only those. */
export function fxGroups(style) {
  const display = style.display || 'line';
  const anim = style.animation || 'none';
  const g = [];
  if (display === 'poster' || display === 'tunnel' || (display === 'line' && anim === 'beat')) g.push('pulse');
  if (display === 'line' && ['glitch', 'neon', 'wave', 'bounce'].includes(anim)) g.push(anim);
  if (display === 'poster') g.push('slam');
  if (display === 'tunnel') g.push('tunnel');
  g.push('shake');
  return g;
}

/** The settings each group shows. */
export const GROUP_FIELDS = {
  pulse: ['div', 'len', 'pulse'],
  glitch: ['glitchAmt', 'glitchSpeed', 'glitchRate'],
  neon: ['neonFlicker', 'neonHum', 'neonSpeed'],
  wave: ['waveAmt', 'waveSpeed', 'waveSpread'],
  bounce: ['bounceHeight', 'bounceTime'],
  slam: ['slamShake', 'slamSpeed'],
  tunnel: ['tunnelSpeed'],
  shake: ['shake', 'shakeSpeed'],
};
export const GROUP_LABEL = { pulse: 'Pulse on the beat', glitch: 'Glitch', neon: 'Neon flicker', wave: 'Wave', bounce: 'Drop & bounce', slam: 'Poster slam', tunnel: 'Tunnel', shake: 'Shake' };

/** Does the lyric beat need its own maths (own tempo, division or length), or is it the frame's beat? */
export const ownBeat = (style, fx) => !!(style && style.tempo && style.tempo.bpm > 0) || fxv(fx, 'div') !== 1 || fxv(fx, 'len') !== 1;

/**
 * Beat envelope with a division: 1 on a pulse, decaying like beatEnvelope until the next one.
 * grid: { beats, period?, first? } or null (the old 120 BPM grid from 0). div: pulses every `div` beats
 * (0.5 = on each beat and halfway between). Whole divisions count from the grid's first beat (`first`,
 * else the first beat), so "Every bar" lands on the beat you set as the first one.
 */
export function divEnvelope(grid, ts, div = 1, decay = 9) {
  const beats = grid && grid.beats && grid.beats.length ? grid.beats : null;
  if (div === 1) return beatEnvelope(beats || undefined, ts, decay);
  let last;
  if (beats) {
    if (ts < beats[0]) return 0;
    let lo = 0;
    let hi = beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid] <= ts) lo = mid;
      else hi = mid - 1;
    }
    if (div < 1) {
      const step = beats[lo + 1] !== undefined ? beats[lo + 1] - beats[lo] : lo > 0 ? beats[lo] - beats[lo - 1] : grid.period || 0.5;
      const half = beats[lo] + step / 2;
      last = ts >= half ? half : beats[lo];
    } else {
      const n = Math.round(div);
      const period = grid.period || (beats.length > 1 ? beats[1] - beats[0] : 0.5);
      const k0 = Number.isFinite(grid.first) ? Math.round((grid.first - beats[0]) / period) : 0;
      let i = lo - ((((lo - k0) % n) + n) % n);
      if (i < 0) return 0;
      last = beats[i];
    }
  } else {
    if (ts < 0) return 0;
    const p = 0.5 * div;
    last = Math.floor(ts / p) * p;
  }
  return Math.exp(-(ts - last) * decay);
}

/**
 * The beat (0..1) the lyrics move to at song time ts. `frameBeat` is the frame's project beat: used unchanged
 * when nothing is set, so old projects keep their exact look.
 */
export function lyricBeat(project, fx, ts, frameBeat) {
  const st = project.lyricStyle;
  if (!ownBeat(st, fx)) return frameBeat;
  return divEnvelope(gridOf(project, st), ts, fxv(fx, 'div'), 9 / fxv(fx, 'len'));
}

/**
 * The shake offset at song time ts for text of size px: { dx, dy, rot } or null when shake is off.
 * `noise` is the renderer's frame-stable noise; `beat` scales it when "Shake on the beat" is on.
 */
export function shakeOffset(fx, ts, px, beat, noise) {
  const amt = fxv(fx, 'shake');
  if (!(amt > 0)) return null;
  const k = amt * (fx.shakeBeat ? beat : 1);
  const f = Math.floor(ts * 30 * fxv(fx, 'shakeSpeed'));
  const dir = fx.shakeDir || 'both';
  const r = px * 0.25 * k;
  return {
    dx: dir === 'y' ? 0 : (noise(f * 1.3 + 11) - 0.5) * 2 * r,
    dy: dir === 'x' ? 0 : (noise(f * 1.7 + 53) - 0.5) * 2 * r,
    rot: dir === 'both' ? (noise(f + 97) - 0.5) * 0.08 * k : 0,
  };
}

/** The glitch's "fires again" threshold on the noise: higher rate, more often (×1 is the old 0.93). */
export const glitchThreshold = (fx) => {
  const r = fxv(fx, 'glitchRate');
  return r === 1 ? 0.93 : Math.max(0, 1 - 0.07 * r);
};

/** Is any setting changed from its default? */
export const fxChanged = (fx) => !!cleanFx(fx);
