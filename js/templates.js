// Platform layouts (move everything into an app's clear area) and ready-made song templates.
import { uid } from './core.js';
import { defaultLyricStyle } from './state.js';
import { GRADE_PRESETS } from './renderer.js';

// Clear areas match js/overlays.js: [x0, y0, x1, y1] as fractions of the 9:16 frame.
const AREAS = {
  tiktok: [0.04, 0.11, 0.83, 0.79],
  reels: [0.04, 0.1, 0.85, 0.79],
  shorts: [0.04, 0.1, 0.84, 0.77],
  all: [0.04, 0.11, 0.83, 0.77],
  full: [0, 0, 1, 1],
};

export const LAYOUTS = [
  { id: 'tiktok', label: 'TikTok', desc: 'Keeps text left of the button rail and above the caption.' },
  { id: 'reels', label: 'Instagram Reels', desc: 'Clear of the Reels buttons, caption and audio line.' },
  { id: 'shorts', label: 'YouTube Shorts', desc: 'Clear of the like/dislike rail and the title lines.' },
  { id: 'all', label: 'Works on all three', desc: 'The area that is clear on TikTok, Reels and Shorts at once.' },
  { id: 'full', label: 'Full frame (no app)', desc: 'Centered layout for YouTube, stories or anywhere without buttons.' },
];

/** Move lyrics, text overlays, logo, progress bar and the end card into the layout's area. */
export function applyLayout(d, id) {
  const a = AREAS[id] || AREAS.full;
  const [x0, y0, x1, y1] = a;
  const cx = ((x0 + x1) / 2) * 100;
  const w = (x1 - x0) * 100;
  d.layout = id;
  d.lyricStyle.x = +cx.toFixed(1);
  d.lyricStyle.maxWidth = Math.min(d.lyricStyle.maxWidth, Math.round(w * 0.96));
  d.lyricStyle.y = +(y0 * 100 + (y1 - y0) * 100 * 0.8).toFixed(1); // lower part of the clear area
  d.lyrics.forEach((l) => delete l.x);
  d.texts.forEach((t) => {
    t.x = +cx.toFixed(1);
    t.y = +Math.min(Math.max(t.y, y0 * 100 + 6), y1 * 100 - 6).toFixed(1);
  });
  d.look.watermark.position = id === 'full' ? 'top-right' : 'custom';
  d.look.watermark.x = +(x1 * 100 - d.look.watermark.size / 2 - 1).toFixed(1);
  d.look.watermark.y = +(y0 * 100 + 4).toFixed(1);
  d.look.progress.position = id === 'full' ? 'bottom' : 'top';
  d.endCard.area = id === 'full' ? null : [x0, y0, x1, y1];
  if (id !== 'full' && id !== 'all') d.look.overlay = id;
  if (d.tab) tabIntoLayout(d);
}

/** Fit the guitar tab across the clear area, in its upper part (lyrics sit in the lower part). */
export function tabIntoLayout(d) {
  const [x0, y0, x1, y1] = AREAS[d.layout] || AREAS.full;
  d.tab.x = +(((x0 + x1) / 2) * 100).toFixed(1);
  d.tab.width = +((x1 - x0) * 100 * 0.98).toFixed(1);
  d.tab.y = +(y0 * 100 + d.tab.height / 2 + 2).toFixed(1);
}

// ------------------------------------------------------------ templates

const T = (text, start, end, extra = {}) => ({
  id: uid('txt'),
  text,
  start,
  end,
  x: 50,
  y: 18,
  size: 9,
  font: 'Bebas Neue',
  color: '#ffffff',
  outline: '#000000',
  box: true,
  boxColor: '#e0182d',
  boxOpacity: 1,
  animation: 'pop',
  ...extra,
});

function eachCut(d, fn) {
  d.clips.forEach((c, i) => fn(c, i));
}

const lyric = (over) => ({ ...defaultLyricStyle(), ...over });

export const TEMPLATES = [
  {
    id: 'spotlight',
    name: 'Lyric spotlight',
    blurb: 'Your lyric is the hero. Karaoke highlight, moody grade, slow push-in, vinyl end card. Fits almost any song.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Montserrat', size: 6.5, highlight: '#ffd400', animation: 'karaoke', uppercase: false, outlineWidth: 0.5 });
      Object.assign(d.look, { vignette: 0.35, grain: 0.1, lightLeak: 0, scanlines: 0, beatFlash: 0, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'moody', ...GR('moody') };
        c.effects = {};
        c.transition = { type: i ? 'crossfade' : 'fade', duration: 0.6 };
        c.kenBurns = { fromZoom: 1, toZoom: 1.12, fromX: 0, toX: 0, fromY: 0, toY: 0 };
      });
      Object.assign(d.endCard, { animation: 'vinyl', background: 'blur', cta: 'OUT NOW', accent: '#ffd400', font: 'Bebas Neue' });
      d.texts = [];
    },
  },
  {
    id: 'hype',
    name: 'Hype teaser',
    blurb: 'Fast and loud for drops and chorus hooks. Beat pulses, flash on the beat, mixed hard transitions, “NEW SINGLE” stamp.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Bebas Neue', size: 10, animation: 'pop', outlineWidth: 0.7 });
      Object.assign(d.look, { vignette: 0.3, grain: 0.15, beatFlash: 0.35, lightLeak: 0, scanlines: 0, letterbox: 0 });
      const mix = ['whip', 'flash', 'zoom', 'glitch', 'shake', 'rgbSplit'];
      eachCut(d, (c, i) => {
        c.grade = { preset: 'bleach', ...GR('bleach') };
        c.effects = { beatPulse: 0.7, shake: 0.15 };
        c.transition = { type: i ? mix[i % mix.length] : 'flash', duration: 0.35 };
        c.kenBurns = null;
      });
      d.texts = [T('NEW SINGLE', 0.2, 2.6, { y: 20, size: 11 })];
      Object.assign(d.endCard, { animation: 'drop', background: 'blur', cta: d.endCard.releaseDate ? '{countdown}' : 'OUT NOW', accent: '#e0182d', textColor: '#ffffff' });
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    blurb: 'Film look for ballads and big moments. Cinema bars, teal & orange, slow crossfades, serif lyrics.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Playfair Display', size: 6, animation: 'fade', uppercase: false, outlineWidth: 0, shadow: true });
      Object.assign(d.look, { vignette: 0.4, grain: 0.25, letterbox: 0.55, lightLeak: 0.1, scanlines: 0, beatFlash: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'tealOrange', ...GR('tealOrange') };
        c.effects = {};
        c.transition = { type: i ? (i % 2 ? 'dipBlack' : 'crossfade') : 'fade', duration: 0.9 };
        c.kenBurns = { fromZoom: 1.05, toZoom: 1.15, fromX: -0.3, toX: 0.3, fromY: 0, toY: 0 };
      });
      Object.assign(d.endCard, { animation: 'rise', background: 'blur', cta: 'OUT NOW', accent: '#f2c48d', font: 'Playfair Display' });
      d.texts = [];
    },
  },
  {
    id: 'golden',
    name: 'Golden hour acoustic',
    blurb: 'Warm and intimate for acoustic, folk and singer-songwriter tracks. Light leaks, hand-drawn lyrics, gentle drift.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Permanent Marker', size: 7, color: '#fff7d6', animation: 'rise', uppercase: false, outlineWidth: 0.4, outline: '#2a1a0a' });
      Object.assign(d.look, { vignette: 0.3, grain: 0.2, lightLeak: 0.45, letterbox: 0, scanlines: 0, beatFlash: 0 });
      const drift = [
        { fromZoom: 1.15, toZoom: 1.15, fromX: -0.5, toX: 0.5, fromY: 0, toY: 0 },
        { fromZoom: 1.15, toZoom: 1.15, fromX: 0.5, toX: -0.5, fromY: 0, toY: 0 },
      ];
      eachCut(d, (c, i) => {
        c.grade = { preset: 'golden', ...GR('golden') };
        c.effects = {};
        c.transition = { type: i ? 'lightLeak' : 'fade', duration: 0.8 };
        c.kenBurns = { ...drift[i % 2] };
      });
      Object.assign(d.endCard, { animation: 'rise', background: 'blur', cta: 'OUT NOW', accent: '#ffcf6e', font: 'Permanent Marker' });
      d.texts = [];
    },
  },
  {
    id: 'neon',
    name: 'Neon night',
    blurb: 'Synth-pop, EDM and night drives. Cyberpunk grade, neon lyrics, RGB split and glitch cuts.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ff2bd6', outline: '#ff2bd6', outlineWidth: 0.25, shadow: false, animation: 'neon' });
      Object.assign(d.look, { vignette: 0.4, grain: 0.1, scanlines: 0.2, lightLeak: 0, letterbox: 0, beatFlash: 0.15 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'cyberpunk', ...GR('cyberpunk') };
        c.effects = { rgb: 0.35, beatPulse: 0.3 };
        c.transition = { type: i ? (i % 2 ? 'glitch' : 'rgbSplit') : 'glitch', duration: 0.4 };
        c.kenBurns = null;
      });
      Object.assign(d.endCard, { animation: 'glitch', background: 'blur', cta: 'OUT NOW', accent: '#ff2bd6', font: 'Montserrat' });
      d.texts = [];
    },
  },
  {
    id: 'vhs',
    name: 'Retro VHS',
    blurb: 'Lo-fi, indie and throwback vibes. VHS tape effect, faded film colour, typewriter captions.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Courier New', size: 5.5, color: '#f5f5f5', box: true, boxColor: '#000000', boxOpacity: 0.6, outlineWidth: 0, animation: 'typewriter', uppercase: false });
      Object.assign(d.look, { vignette: 0.35, grain: 0.35, scanlines: 0.15, lightLeak: 0, letterbox: 0, beatFlash: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'vintage', ...GR('vintage') };
        c.effects = { vhs: true };
        c.transition = { type: i ? 'glitch' : 'fade', duration: 0.3 };
        c.kenBurns = null;
      });
      Object.assign(d.endCard, { animation: 'flip', background: 'blur', cta: 'OUT NOW', accent: '#f4e04d', font: 'Bebas Neue' });
      d.texts = [];
    },
  },
  {
    id: 'rock',
    name: 'Punk / rock',
    blurb: 'Alt, metal, emo and punk. Gritty mono grade, camera shake, strobe on the beat, words slam in.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Oswald', size: 8.5, color: '#ffffff', highlight: '#e0182d', outlineWidth: 0.6, animation: 'bounce' });
      Object.assign(d.look, { vignette: 0.5, grain: 0.45, lightLeak: 0, scanlines: 0, letterbox: 0, beatFlash: 0.2 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'mono', ...GR('mono') };
        c.effects = { shake: 0.35, strobe: i % 2 === 1, beatPulse: 0.4 };
        c.transition = { type: i ? (i % 2 ? 'flash' : 'shake') : 'flash', duration: 0.3 };
        c.kenBurns = null;
      });
      Object.assign(d.endCard, { animation: 'drop', background: 'color', bgColor: '#0d0d0d', cta: 'OUT NOW', accent: '#e0182d', font: 'Oswald' });
      d.texts = [];
    },
  },
  {
    id: 'minimal',
    name: 'Minimal clean',
    blurb: 'Readable, simple captions for any genre. No effects, boxed text, clean cuts, solid end card.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Inter', size: 5.2, color: '#111111', box: true, boxColor: '#ffffff', boxOpacity: 0.95, outlineWidth: 0, shadow: false, animation: 'slide', uppercase: false });
      Object.assign(d.look, { vignette: 0.1, grain: 0, lightLeak: 0, scanlines: 0, letterbox: 0, beatFlash: 0 });
      eachCut(d, (c, i) => {
        c.grade = null;
        c.effects = {};
        c.transition = { type: i ? 'none' : 'fade', duration: 0.3 };
        c.kenBurns = null;
      });
      Object.assign(d.endCard, { animation: 'rise', background: 'color', bgColor: '#f4f1ea', textColor: '#111111', accent: '#111111', cta: 'OUT NOW', font: 'Inter' });
      d.texts = [];
    },
  },
  {
    id: 'countdown',
    name: 'Release countdown',
    blurb: 'Pre-release hype. “OUT FRIDAY” stamp, countdown call to action, pulsing lyric and zoom-punch cuts. Set the release date in End card.',
    apply(d) {
      d.lyricStyle = lyric({ font: 'Bebas Neue', size: 9.5, animation: 'beat', outlineWidth: 0.6 });
      Object.assign(d.look, { vignette: 0.3, grain: 0.1, beatFlash: 0.2, lightLeak: 0, scanlines: 0, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'sunset', ...GR('sunset') };
        c.effects = { beatPulse: 0.5 };
        c.transition = { type: i ? 'zoom' : 'flash', duration: 0.35 };
        c.kenBurns = null;
      });
      const contentEnd = Math.max(3, d.duration - (d.endCard.enabled ? d.endCard.duration : 0));
      d.texts = [T(d.endCard.releaseDate ? 'OUT {date}' : 'OUT FRIDAY', 0.2, Math.min(3, contentEnd), { y: 18, size: 11, boxColor: '#ffd400', color: '#111111' })];
      Object.assign(d.endCard, { animation: 'zoom', background: 'blur', cta: d.endCard.releaseDate ? '{countdown}' : 'PRE-SAVE NOW', accent: '#ffd400', textColor: '#ffffff', font: 'Bebas Neue' });
    },
  },
];

function GR(id) {
  const { label, ...rest } = GRADE_PRESETS[id] || {};
  return rest;
}

/** Apply a template, then re-apply the active platform layout so positions stay app-safe. */
export function applyTemplate(d, id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  const keepY = d.lyricStyle.y;
  t.apply(d);
  d.endCard.enabled = true;
  d.template = id;
  if (d.layout) applyLayout(d, d.layout);
  else d.lyricStyle.y = keepY;
}
