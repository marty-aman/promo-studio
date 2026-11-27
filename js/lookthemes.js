// Lyric look themes: ready-made looks for a lyric line (or for the shared lyric style). A theme sets every
// per-line style field (LINE_FIELDS), so a themed line looks the same whatever the shared style does.
// { id, name, hint, fields } — `fields` holds LINE_FIELDS values. A later theme may also carry `fx` (the lyric
// effect settings: pulse tempo, shake amount and speed), written to line.fx / lyricStyle.fx by lookapply.js.
import { LINE_FIELDS } from './linestyle.js';

const T = (id, name, hint, f) => ({
  id,
  name,
  hint,
  fields: { outline: '#000000', outlineWidth: 0, outDuration: 0.35, uppercase: true, box: false, boxColor: '#000000', boxOpacity: 0.55, shadow: true, ...f },
});

export const LOOK_THEMES = [
  // dark metal
  T('bloodash', 'Blood & Ash', 'Bone-white capitals that light up blood red, glitching in and out', { font: 'Bebas Neue', size: 10, color: '#f2ede4', highlight: '#e0182d', outlineWidth: 0.8, animation: 'glitch', outAnimation: 'glitch' }),
  T('blackmass', 'Black Mass', 'White capitals on a deep red box, dropping in word by word', { font: 'Bebas Neue', size: 9, color: '#ffffff', highlight: '#ff2a2a', box: true, boxColor: '#7a0010', boxOpacity: 0.9, shadow: false, animation: 'bounce', outAnimation: 'drop' }),
  T('hellfire', 'Hellfire', 'Gold on orange, pulsing on the beat', { font: 'Oswald', size: 9.5, color: '#ffb000', highlight: '#ff4d00', outline: '#1a0500', outlineWidth: 0.7, animation: 'beat', outAnimation: 'zoomout' }),
  T('funeral', 'Funeral Doom', 'Soft serif in old gold that fades in and out', { font: 'Playfair Display', size: 7, color: '#d9c9a8', highlight: '#c08a3e', uppercase: false, animation: 'fade', outAnimation: 'fade', outDuration: 0.6 }),
  T('ruststeel', 'Rust & Steel', 'Steel slab letters with rust highlights, sliding up', { font: 'Roboto Slab', size: 8, color: '#c9ccd1', highlight: '#c4521c', outline: '#111111', outlineWidth: 0.6, animation: 'slide', outAnimation: 'slidedown' }),
  T('frostbite', 'Frostbite', 'Ice-blue capitals that blur in', { font: 'Oswald', size: 8, color: '#dfe9f2', highlight: '#9fb4c7', outline: '#0b1520', outlineWidth: 0.5, animation: 'blur', outAnimation: 'blur' }),
  T('toxic', 'Toxic Sludge', 'Acid-green marker that waves in', { font: 'Permanent Marker', size: 8, color: '#8cff00', highlight: '#ffffff', outline: '#0a1400', outlineWidth: 0.7, uppercase: false, animation: 'wave', outAnimation: 'glitch' }),
  // clean
  T('cleanwhite', 'Clean white', 'Sentence-case karaoke fill in white and yellow', { font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ffd400', outlineWidth: 0.4, uppercase: false, animation: 'karaoke', outAnimation: 'fade' }),
  T('cleanbox', 'Clean box', 'Dark text on a white box, sliding up', { font: 'Inter', size: 5.5, color: '#111111', highlight: '#e0182d', box: true, boxColor: '#ffffff', boxOpacity: 0.95, shadow: false, uppercase: false, animation: 'slide', outAnimation: 'slideup' }),
  // neon
  T('neonpink', 'Neon pink', 'Pink neon glow that flickers on and off', { font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ff2bd6', outline: '#ff2bd6', outlineWidth: 0.25, shadow: false, animation: 'neon', outAnimation: 'flicker' }),
  T('neoncyan', 'Neon cyan', 'Cyan neon glow that flickers on and off', { font: 'Oswald', size: 7.5, color: '#e8fdff', highlight: '#00e5ff', outline: '#00e5ff', outlineWidth: 0.25, shadow: false, animation: 'neon', outAnimation: 'flicker' }),
];

export const themeById = (id) => LOOK_THEMES.find((t) => t.id === id) || null;

/** The theme whose fields `style` matches exactly (a line style with no preset, or the shared style), else null. */
export function themeOf(style) {
  if (!style || style.preset) return null;
  return LOOK_THEMES.find((t) => LINE_FIELDS.every((k) => t.fields[k] === style[k])) || null;
}
