// Platform layouts (move everything into an app's clear area) and ready-made song templates.
import { uid, timelineToSong } from './core.js';
import { defaultLyricStyle } from './state.js';
import { GRADE_PRESETS } from './renderer.js';
import { defaultTabLayer, isBassTrack } from './tab.js';
import { defaultDrumLayer } from './drums.js';
import { defaultVizLayer } from './viz.js';
import { DISPLAY_DEFAULTS } from './lyricviz.js';
import { applyTheme } from './themes.js';

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
  if ((d.layers || []).length) tabIntoLayout(d);
}

/** Fit tab and drum-lane layers across the clear area, stacked from the top (lyrics sit in the lower part). */
export function tabIntoLayout(d) {
  const [x0, y0, x1] = AREAS[d.layout] || AREAS.full;
  let y = y0 * 100 + 2;
  for (const L of d.layers || []) {
    const strip = (L.type === 'tab' && L.style !== 'highway') || (L.type === 'drums' && (L.style === 'lanes' || L.style === 'glass'));
    if (!strip) continue;
    L.x = +(((x0 + x1) / 2) * 100).toFixed(1);
    L.width = +((x1 - x0) * 100 * 0.98).toFixed(1);
    L.y = +(y + L.height / 2).toFixed(1);
    y += L.height + 1.5;
  }
}

/** Keep whole-song lyric displays (sheet, poster, tunnel) inside the layout's clear area. */
export function lyricsIntoLayout(d) {
  const [x0, y0, x1, y1] = AREAS[d.layout] || AREAS.full;
  const s = d.lyricStyle;
  s.x = +(((x0 + x1) / 2) * 100).toFixed(1);
  s.maxWidth = Math.min(s.maxWidth, Math.round((x1 - x0) * 100 * 0.94));
  s.y = +Math.min(Math.max(s.y, y0 * 100 + 12), y1 * 100 - 12).toFixed(1);
}

/** Summaries of the Guitar Pro files in the media library, for templates that add tab or drum layers. */
export function tabSources(all) {
  return (all || []).filter((m) => m.kind === 'tab').map((m) => ({ id: m.id, name: m.name, tracks: m.tracks || [], drumTracks: m.drumTracks || [] }));
}

// ---- layers for band templates

const songStart = (d) => +timelineToSong(0, d.song).toFixed(3);

/**
 * Reuse a guitar (or bass) tab layer, or add one from the first Guitar Pro file with a matching track.
 * With no matching file it adds an empty layer so the Guitar Pro tab asks for one.
 */
function ensureTab(d, sources, used, { bass }) {
  d.layers ||= [];
  const isBass = (L) => {
    const src = sources.find((s) => s.id === L.mediaId);
    const tr = src && src.tracks.find((x) => x.index === L.track);
    return tr ? isBassTrack(tr) : /bass/i.test(L.name || '');
  };
  let L = d.layers.find((l) => l.type === 'tab' && !used.has(l.id) && isBass(l) === bass);
  if (!L) {
    for (const src of sources) {
      const tr = src.tracks.find((x) => isBassTrack(x) === bass);
      if (tr) {
        L = { ...defaultTabLayer(), id: uid('lyr'), type: 'tab', name: bass ? 'Bass tab' : 'Guitar tab', visible: true, mediaId: src.id, track: tr.index, offset: songStart(d) };
        break;
      }
    }
    if (!L) L = { ...defaultTabLayer(), id: uid('lyr'), type: 'tab', name: bass ? 'Bass tab' : 'Guitar tab', visible: true, offset: songStart(d) };
    d.layers.push(L);
  }
  L.visible = true;
  used.add(L.id);
  return L;
}

function ensureDrums(d, sources) {
  d.layers ||= [];
  let L = d.layers.find((l) => l.type === 'drums');
  if (!L) {
    const src = sources.find((s) => s.drumTracks.length);
    if (!src) return null;
    L = { ...defaultDrumLayer(), id: uid('lyr'), type: 'drums', name: 'Drum chart', visible: true, source: 'gp', mediaId: src.id, track: src.drumTracks[0].index, offset: songStart(d) };
    d.layers.push(L);
  }
  L.visible = true;
  return L;
}

function ensureViz(d, style, extra = {}) {
  d.layers ||= [];
  let L = d.layers.find((l) => l.type === 'viz' && l.style === style);
  if (!L) {
    L = { ...defaultVizLayer(), id: uid('lyr'), type: 'viz', name: 'Visualizer', visible: true, style };
    d.layers.push(L);
  }
  Object.assign(L, { visible: true }, extra);
  return L;
}

/** Place a layer inside the clear area A: fy/fh are fractions of the area's height, fw of its width. */
function placeIn(L, A, fy, fh, fw = 0.96) {
  L.x = +(A.cx * 100).toFixed(1);
  L.width = +(A.w * 100 * fw).toFixed(1);
  L.height = +(A.h * 100 * fh).toFixed(1);
  L.y = +((A.y0 + A.h * fy) * 100).toFixed(1);
}

function areaOf(layout) {
  const [x0, y0, x1, y1] = AREAS[layout] || AREAS.full;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, w: x1 - x0, h: y1 - y0 };
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

  // ---- band templates: tab, drum and lyric visualizations
  {
    id: 'riff',
    name: 'Riff breakdown',
    blurb: 'Teach the riff. A light-up guitar neck shows every fret with chord names and the next notes, under a “LEARN THIS RIFF” hook.',
    needs: 'guitar',
    apply(d, sources) {
      d.lyricStyle = lyric({ font: 'Montserrat', size: 5.5, animation: 'words', uppercase: false, outlineWidth: 0.5 });
      Object.assign(d.look, { vignette: 0.4, grain: 0.15, lightLeak: 0, scanlines: 0, beatFlash: 0, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'moody', ...GR('moody') };
        c.effects = {};
        c.transition = { type: i ? 'crossfade' : 'fade', duration: 0.4 };
        c.kenBurns = { fromZoom: 1.04, toZoom: 1.12, fromX: 0, toX: 0, fromY: 0, toY: 0 };
      });
      const g = ensureTab(d, sources, new Set(), { bass: false });
      Object.assign(g, { style: 'neck', role: 'guitar', showChords: true, showStrip: true, bgOpacity: 0.45 });
      d.texts = [T('LEARN THIS RIFF', 0.2, 3.2, { size: 8.5, boxColor: '#ffd400', color: '#111111' })];
      Object.assign(d.endCard, { animation: 'rise', background: 'blur', cta: 'OUT NOW', accent: '#ffd400', font: 'Bebas Neue' });
    },
    place(d, A) {
      placeIn(role(d, 'guitar'), A, 0.42, 0.32);
      d.texts[0].y = +((A.y0 + A.h * 0.08) * 100).toFixed(1);
      d.lyricStyle.y = +((A.y0 + A.h * 0.84) * 100).toFixed(1);
    },
  },
  {
    id: 'basscam',
    name: 'Bass cam',
    blurb: 'For the low end. Your bass line lights up a bass neck while an electric visualizer crackles to the song.',
    needs: 'bass',
    apply(d, sources) {
      d.lyricStyle = lyric({ font: 'Bebas Neue', size: 8, animation: 'pop', outlineWidth: 0.6 });
      Object.assign(d.look, { vignette: 0.45, grain: 0.2, lightLeak: 0, scanlines: 0, beatFlash: 0.1, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'tealOrange', ...GR('tealOrange') };
        c.effects = { beatPulse: 0.3 };
        c.transition = { type: i ? 'zoom' : 'fade', duration: 0.35 };
        c.kenBurns = null;
      });
      const b = ensureTab(d, sources, new Set(), { bass: true });
      Object.assign(b, { style: 'neck', role: 'bass', showChords: false, showStrip: true, bgOpacity: 0.45 });
      ensureViz(d, 'electric', { role: 'viz', source: 'song', color: '#5ad1ff', color2: '#ffffff', intensity: 0.8, blend: 'screen' });
      d.texts = [];
      Object.assign(d.endCard, { animation: 'drop', background: 'blur', cta: 'OUT NOW', accent: '#5ad1ff', font: 'Bebas Neue' });
    },
    place(d, A) {
      placeIn(role(d, 'bass'), A, 0.7, 0.28);
      const v = role(d, 'viz');
      Object.assign(v, { x: +(A.cx * 100).toFixed(1), y: +((A.y0 + A.h * 0.36) * 100).toFixed(1), size: 70 });
      d.lyricStyle.y = +((A.y0 + A.h * 0.08) * 100).toFixed(1);
    },
  },
  {
    id: 'fullband',
    name: 'Full band',
    blurb: 'The whole band at once: guitar on a neon fretboard highway, the drum kit lighting up below, one lyric line on top.',
    needs: 'guitar',
    apply(d, sources) {
      d.lyricStyle = lyric({ font: 'Bebas Neue', size: 7, animation: 'pop', outlineWidth: 0.6 });
      Object.assign(d.look, { vignette: 0.35, grain: 0.15, lightLeak: 0, scanlines: 0, beatFlash: 0.2, letterbox: 0 });
      const mix = ['flash', 'whip', 'zoom'];
      eachCut(d, (c, i) => {
        c.grade = { preset: 'bleach', ...GR('bleach') };
        c.effects = { beatPulse: 0.4 };
        c.transition = { type: i ? mix[i % mix.length] : 'flash', duration: 0.3 };
        c.kenBurns = null;
      });
      const g = ensureTab(d, sources, new Set(), { bass: false });
      Object.assign(g, { style: 'highway', role: 'guitar', showChords: true, window: 2.5 });
      const dr = ensureDrums(d, sources);
      if (dr) Object.assign(dr, { style: 'kit', role: 'drums', kickText: dr.kickText || (d.endCard.artist !== 'Artist Name' ? d.endCard.artist : '') });
      d.texts = [];
      Object.assign(d.endCard, { animation: 'drop', background: 'blur', cta: 'OUT NOW', accent: '#ff4d6d', font: 'Bebas Neue' });
    },
    place(d, A) {
      const dr = role(d, 'drums');
      placeIn(role(d, 'guitar'), A, dr ? 0.36 : 0.5, dr ? 0.5 : 0.72, 0.84);
      if (dr) placeIn(dr, A, 0.8, 0.3, 0.92);
      d.lyricStyle.y = +((A.y0 + A.h * 0.05) * 100).toFixed(1);
    },
  },
  {
    id: 'challenge',
    name: 'Can you play this?',
    blurb: 'A player challenge. “CAN YOU PLAY THIS?” hook, then the riff on vibrating glass strings over your video.',
    needs: 'guitar',
    apply(d, sources) {
      d.lyricStyle = lyric({ font: 'Montserrat', size: 5.5, animation: 'words', uppercase: false, outlineWidth: 0.5 });
      Object.assign(d.look, { vignette: 0.3, grain: 0.1, lightLeak: 0, scanlines: 0, beatFlash: 0, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'moody', ...GR('moody') };
        c.effects = {};
        c.transition = { type: i ? 'whip' : 'fade', duration: 0.3 };
        c.kenBurns = null;
      });
      const g = ensureTab(d, sources, new Set(), { bass: false });
      Object.assign(g, { style: 'strings', role: 'guitar', showChords: true, window: 2.5, playhead: 22 });
      d.texts = [T('CAN YOU PLAY THIS?', 0.2, 3.2, { size: 8, boxColor: '#e0182d' })];
      Object.assign(d.endCard, { animation: 'zoom', background: 'blur', cta: 'OUT NOW', accent: '#e0182d', font: 'Bebas Neue' });
    },
    place(d, A) {
      placeIn(role(d, 'guitar'), A, 0.38, 0.3);
      d.texts[0].y = +((A.y0 + A.h * 0.1) * 100).toFixed(1);
      d.lyricStyle.y = +((A.y0 + A.h * 0.84) * 100).toFixed(1);
    },
  },
  {
    id: 'lyricvideo',
    name: 'Lyric video',
    blurb: 'A full lyric sheet that scrolls with the song. The current line fills in word by word over a blurred, darkened video.',
    apply(d) {
      d.lyricStyle = lyric({ ...DISPLAY_DEFAULTS.sheet, display: 'sheet', font: 'Montserrat', size: 7.5, color: '#ffffff', highlight: '#ffd400', outlineWidth: 0, shadow: true });
      Object.assign(d.look, { vignette: 0.5, grain: 0.1, lightLeak: 0, scanlines: 0, beatFlash: 0, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'moody', ...GR('moody') };
        c.filter = { preset: 'none', adjust: { blur: 8, brightness: 0.6 } };
        c.effects = {};
        c.transition = { type: i ? 'crossfade' : 'fade', duration: 1 };
        c.kenBurns = { fromZoom: 1.1, toZoom: 1.2, fromX: 0, toX: 0, fromY: 0, toY: 0 };
      });
      d.texts = [];
      Object.assign(d.endCard, { animation: 'vinyl', background: 'blur', cta: 'OUT NOW', accent: '#ffd400', font: 'Montserrat' });
    },
    place(d, A) {
      lyricsIntoLayout(d);
      d.lyricStyle.y = +((A.y0 + A.h * 0.5) * 100).toFixed(1);
    },
  },
  {
    id: 'poster',
    name: 'Lyric poster',
    blurb: 'Kinetic typography. Every word slams in on its beat at its own size and angle, over hard-cut black and white video.',
    apply(d) {
      d.lyricStyle = lyric({ ...DISPLAY_DEFAULTS.poster, display: 'poster', font: 'Bebas Neue', size: 9, color: '#ffffff', highlight: '#e0182d', outlineWidth: 0 });
      Object.assign(d.look, { vignette: 0.45, grain: 0.3, lightLeak: 0, scanlines: 0, beatFlash: 0.15, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'mono', ...GR('mono') };
        c.filter = { preset: 'none', adjust: { brightness: 0.7 } };
        c.effects = { shake: 0.1 };
        c.transition = { type: i ? 'none' : 'flash', duration: 0.2 };
        c.kenBurns = null;
      });
      d.texts = [];
      Object.assign(d.endCard, { animation: 'drop', background: 'color', bgColor: '#0d0d0d', cta: 'OUT NOW', accent: '#e0182d', font: 'Bebas Neue' });
    },
    place(d, A) {
      lyricsIntoLayout(d);
      d.lyricStyle.y = +((A.y0 + A.h * 0.45) * 100).toFixed(1);
    },
  },
  {
    id: 'tunnel',
    name: 'Neon tunnel',
    blurb: 'Words fly at the camera out of a neon tunnel that pulses on the beat. Cyberpunk grade and glitch cuts.',
    apply(d) {
      d.lyricStyle = lyric({ ...DISPLAY_DEFAULTS.tunnel, display: 'tunnel', font: 'Montserrat', size: 8, color: '#ffffff', highlight: '#ff2bd6', outlineWidth: 0 });
      Object.assign(d.look, { vignette: 0.5, grain: 0.1, lightLeak: 0, scanlines: 0.15, beatFlash: 0.1, letterbox: 0 });
      eachCut(d, (c, i) => {
        c.grade = { preset: 'cyberpunk', ...GR('cyberpunk') };
        c.filter = { preset: 'none', adjust: { brightness: 0.6 } };
        c.effects = { rgb: 0.2 };
        c.transition = { type: i ? 'glitch' : 'fade', duration: 0.35 };
        c.kenBurns = null;
      });
      d.texts = [];
      Object.assign(d.endCard, { animation: 'glitch', background: 'blur', cta: 'OUT NOW', accent: '#ff2bd6', font: 'Montserrat' });
    },
    place(d, A) {
      lyricsIntoLayout(d);
      d.lyricStyle.y = +((A.y0 + A.h * 0.45) * 100).toFixed(1);
    },
  },
];

const role = (d, r) => (d.layers || []).find((l) => l.role === r);

function GR(id) {
  const { label, ...rest } = GRADE_PRESETS[id] || {};
  return rest;
}

/**
 * Apply a template, then re-apply the active platform layout so positions stay app-safe.
 * `sources` (from tabSources) lets band templates add tab and drum layers from your Guitar Pro files.
 */
export function applyTemplate(d, id, sources = []) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  const keepY = d.lyricStyle.y;
  (d.layers || []).forEach((l) => delete l.role);
  t.apply(d, sources);
  d.endCard.enabled = true;
  d.template = id;
  if (d.layout) applyLayout(d, d.layout);
  else d.lyricStyle.y = keepY;
  if (t.place) t.place(d, areaOf(d.layout));
  // band templates show only their own tab / drum / visualizer layers (the rest are hidden, not deleted)
  if (t.needs) for (const l of d.layers || []) if (['tab', 'drums', 'viz', 'midi'].includes(l.type) && !l.role) l.visible = false;
  (d.layers || []).forEach((l) => delete l.role);
  // a chosen theme keeps its colours and fonts on top of the template's layout and motion
  if (d.theme && d.theme.id) applyTheme(d, d.theme.id, { colors: d.theme.colors });
}

/** What a band template still needs from you ('guitar' or 'bass' Guitar Pro track), or null. */
export function templateNeeds(id, sources = []) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t || !t.needs) return null;
  const has = sources.some((s) => s.tracks.some((tr) => isBassTrack(tr) === (t.needs === 'bass')));
  return has ? null : t.needs;
}
