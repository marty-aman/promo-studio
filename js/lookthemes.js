// Lyric look themes: ready-made looks for a lyric line (or for the shared lyric style). A theme sets every
// per-line style field (LINE_FIELDS), so a themed line looks the same whatever the shared style does.
// { id, name, hint, fields, fx } — `fields` holds LINE_FIELDS values; `fx` the lyric effect settings (lyricfx.js:
// pulse timing and size, shake, and the amount/speed of the theme's entrance effect), written to the look's
// style.fx (or lyricStyle.fx for the shared style) by lookapply.js. A theme never sets the pulse tempo: the
// lyrics keep following the project tempo (or the tempo Marty set for them).
import { LINE_FIELDS, lineStyle } from './linestyle.js';
import { FX_FIELDS, GROUP_FIELDS, fxGroups, cleanFx } from './lyricfx.js';

/**
 * A theme's full effect settings: every setting the theme's entrance and the shake use, at its default unless the
 * theme says otherwise, so the look moves the same whatever the shared effect settings are.
 */
function fullFx(animation, f) {
  const keys = fxGroups({ display: 'line', animation }).flatMap((g) => GROUP_FIELDS[g]);
  const out = Object.fromEntries(keys.map((k) => [k, FX_FIELDS[k][0]]));
  return cleanFx({ ...out, shakeBeat: false, shakeDir: 'both', ...f }, { explicit: true });
}

const T = (id, name, hint, f, fx = {}) => {
  const fields = { outline: '#000000', outlineWidth: 0, outDuration: 0.35, uppercase: true, box: false, boxColor: '#000000', boxOpacity: 0.55, shadow: true, ...f };
  return { id, name, hint, fields, fx: fullFx(fields.animation, fx) };
};

export const LOOK_THEMES = [
  // dark metal
  T('bloodash', 'Blood & Ash', 'Bone-white capitals that light up blood red, glitching in and out', { font: 'Bebas Neue', size: 10, color: '#f2ede4', highlight: '#e0182d', outlineWidth: 0.8, animation: 'glitch', outAnimation: 'glitch' }, { shake: 0.35, shakeSpeed: 1.2, shakeBeat: true, glitchAmt: 1.4, glitchRate: 1.6 }),
  T('blackmass', 'Black Mass', 'White capitals on a deep red box, dropping in word by word', { font: 'Bebas Neue', size: 9, color: '#ffffff', highlight: '#ff2a2a', box: true, boxColor: '#7a0010', boxOpacity: 0.9, shadow: false, animation: 'bounce', outAnimation: 'drop' }, { shake: 0.3, shakeBeat: true, shakeDir: 'y', bounceHeight: 1.3, bounceTime: 0.8 }),
  T('hellfire', 'Hellfire', 'Gold on orange, pulsing on the beat', { font: 'Oswald', size: 9.5, color: '#ffb000', highlight: '#ff4d00', outline: '#1a0500', outlineWidth: 0.7, animation: 'beat', outAnimation: 'zoomout' }, { div: 1, len: 0.8, pulse: 1.7, shake: 0.25, shakeBeat: true }),
  T('funeral', 'Funeral Doom', 'Soft serif in old gold that fades in and out', { font: 'Playfair Display', size: 7, color: '#d9c9a8', highlight: '#c08a3e', uppercase: false, animation: 'fade', outAnimation: 'fade', outDuration: 0.6 }, { shake: 0.08, shakeSpeed: 0.25, shakeDir: 'y' }),
  T('ruststeel', 'Rust & Steel', 'Steel slab letters with rust highlights, sliding up', { font: 'Roboto Slab', size: 8, color: '#c9ccd1', highlight: '#c4521c', outline: '#111111', outlineWidth: 0.6, animation: 'slide', outAnimation: 'slidedown' }, { shake: 0.25, shakeBeat: true, shakeDir: 'y' }),
  T('frostbite', 'Frostbite', 'Ice-blue capitals that blur in', { font: 'Oswald', size: 8, color: '#dfe9f2', highlight: '#9fb4c7', outline: '#0b1520', outlineWidth: 0.5, animation: 'blur', outAnimation: 'blur' }, { shake: 0.12, shakeSpeed: 2.2, shakeDir: 'x' }),
  T('toxic', 'Toxic Sludge', 'Acid-green marker that waves in', { font: 'Permanent Marker', size: 8, color: '#8cff00', highlight: '#ffffff', outline: '#0a1400', outlineWidth: 0.7, uppercase: false, animation: 'wave', outAnimation: 'glitch' }, { shake: 0.15, shakeBeat: true, waveAmt: 1.5, waveSpeed: 0.7 }),
  // clean
  T('cleanwhite', 'Clean white', 'Sentence-case karaoke fill in white and yellow', { font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ffd400', outlineWidth: 0.4, uppercase: false, animation: 'karaoke', outAnimation: 'fade' }, { shake: 0 }),
  T('cleanbox', 'Clean box', 'Dark text on a white box, sliding up', { font: 'Inter', size: 5.5, color: '#111111', highlight: '#e0182d', box: true, boxColor: '#ffffff', boxOpacity: 0.95, shadow: false, uppercase: false, animation: 'slide', outAnimation: 'slideup' }, { shake: 0 }),
  // neon
  T('neonpink', 'Neon pink', 'Pink neon glow that flickers on and off', { font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ff2bd6', outline: '#ff2bd6', outlineWidth: 0.25, shadow: false, animation: 'neon', outAnimation: 'flicker' }, { shake: 0, neonFlicker: 1.4, neonHum: 2, neonSpeed: 1.3 }),
  T('neoncyan', 'Neon cyan', 'Cyan neon glow that flickers on and off', { font: 'Oswald', size: 7.5, color: '#e8fdff', highlight: '#00e5ff', outline: '#00e5ff', outlineWidth: 0.25, shadow: false, animation: 'neon', outAnimation: 'flicker' }, { shake: 0, neonFlicker: 2, neonHum: 1.6, neonSpeed: 0.8 }),
];

export const themeById = (id) => LOOK_THEMES.find((t) => t.id === id) || null;

/** The theme whose fields `style` matches exactly (a line style with no preset, or the shared style), else null. */
export function themeOf(style) {
  if (!style || style.preset) return null;
  return LOOK_THEMES.find((t) => LINE_FIELDS.every((k) => t.fields[k] === style[k])) || null;
}

const sameFx = (a, b) => {
  const x = cleanFx(a, { explicit: true }) || {};
  const y = cleanFx(b, { explicit: true }) || {};
  return Object.keys(y).every((k) => x[k] === y[k]);
};

/**
 * The theme a line (or the shared style, line = null) wears, and whether its effect settings were changed since:
 * { theme, edited } or null. `edited` is true when the effect settings the line moves with (shared, look and its
 * own, lineStyle) differ from the theme's on any setting the theme sets.
 */
export function themeState(lyricStyle, line = null) {
  const own = line && line.style && Object.keys(line.style).length ? line.style : null;
  const theme = themeOf(own || lyricStyle);
  if (!theme) return null;
  const drawn = line ? lineStyle(lyricStyle, line) : lyricStyle;
  // a setting the look's own effect settings add that the theme leaves at its default (say "Pulse every 2 beats")
  const extra = !!own && !!own.fx && Object.entries(own.fx).some(([k, v]) => !(k in (theme.fx || {})) && v !== (k in FX_FIELDS ? FX_FIELDS[k][0] : k === 'shakeDir' ? 'both' : false));
  return { theme, edited: extra || !sameFx(drawn.fx, theme.fx) };
}

/** A few words on how a theme moves (the swatch card's label): 'Shake on the beat · Pulse', or 'Still'. */
export function motionLabel(t) {
  const fx = t.fx || {};
  const bits = [];
  if (fx.shake > 0) bits.push(fx.shakeBeat ? 'Shake on the beat' : fx.shakeSpeed < 0.5 ? 'Slow sway' : fx.shakeSpeed > 1.5 ? 'Shiver' : 'Shake');
  const a = t.fields.animation;
  if (a === 'beat') bits.push('Beat pulse');
  if (a === 'neon') bits.push('Glow flicker');
  if (a === 'glitch') bits.push('Glitch');
  if (a === 'wave') bits.push('Wave');
  if (a === 'bounce') bits.push('Drop');
  return bits.length ? bits.join(' · ') : 'Still';
}
