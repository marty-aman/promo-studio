// Dark themes for heavy music. A theme restyles everything at once: lyrics and on-screen text, the
// colour grade and film look, the end card, tab / drum chart / visualizer colours (including the
// chrome of the fancy chart styles), cut-out backgrounds and carousel looks. It keeps your clips,
// timing, lyrics and layers. With `motion`, it also sets cuts, clip effects and lyric motion.
// Every theme has four colours: bg (near black), deep (dark tone), accent (the signature colour),
// light (text). "Make my own" swaps those four and keeps the rest of the theme.

export const THEMES = [
  {
    id: 'bloodash',
    name: 'Blood & Ash',
    blurb: 'Red and black. Bone-white capitals with the sung words turning red, crushed black-and-white picture with a red cast, heavy grain.',
    colors: { bg: '#050505', deep: '#5c0009', accent: '#e0182d', light: '#f2ece4' },
    font: 'Bebas Neue',
    lyric: { uppercase: true, outlineWidth: 0.7, shadow: true },
    animation: 'pop',
    grade: (c) => ({ exposure: 0.95, contrast: 1.35, saturation: 0.12, shadows: c.deep, shadowsAmt: 0.35, fade: 0 }),
    look: { vignette: 0.55, grain: 0.4, letterbox: 0, scanlines: 0, lightLeak: 0, beatFlash: 0.15 },
    transitions: ['flash', 'shake', 'glitch', 'none'],
    cut: 0.25,
    effects: { shake: 0.2, beatPulse: 0.3 },
    endCard: { background: 'color', animation: 'drop' },
    backdrop: 'smoke',
    carousel: 'grit',
    wood: ['#100d0c', '#1c1715', '#0b0908'],
  },
  {
    id: 'doom',
    name: 'Funeral Doom',
    blurb: 'Slow and heavy. Candle-amber serif lyrics that fade in, desaturated warm picture, cinema bars and film grain.',
    colors: { bg: '#0c0d10', deep: '#2a2621', accent: '#c08a3e', light: '#e9e2d0' },
    font: 'Playfair Display',
    lyric: { uppercase: false, outlineWidth: 0, shadow: true },
    animation: 'fade',
    grade: (c) => ({ exposure: 0.88, contrast: 1.05, saturation: 0.35, temperature: 0.25, highlights: c.accent, highlightsAmt: 0.15, fade: 0.2 }),
    look: { vignette: 0.6, grain: 0.3, letterbox: 0.5, scanlines: 0, lightLeak: 0, beatFlash: 0 },
    transitions: ['dipBlack', 'crossfade'],
    cut: 0.9,
    effects: {},
    endCard: { background: 'blur', animation: 'vinyl' },
    backdrop: 'bokeh',
    carousel: 'film',
    wood: ['#2a1a10', '#3d2616', '#24160d'],
  },
  {
    id: 'frost',
    name: 'Frostbite',
    blurb: 'Black-metal cold. Pale capitals, an icy near-black-and-white picture, harsh grain and a deep vignette.',
    colors: { bg: '#0a0f16', deep: '#1b2633', accent: '#9fb4c7', light: '#eef3f7' },
    font: 'Georgia',
    lyric: { uppercase: true, outlineWidth: 0.4, shadow: true },
    animation: 'blur',
    grade: (c) => ({ exposure: 0.95, contrast: 1.3, saturation: 0.2, temperature: -0.6, shadows: c.deep, shadowsAmt: 0.4 }),
    look: { vignette: 0.65, grain: 0.5, letterbox: 0, scanlines: 0, lightLeak: 0, beatFlash: 0.1 },
    transitions: ['glitch', 'dipWhite', 'none'],
    cut: 0.3,
    effects: { flicker: 0.2 },
    endCard: { background: 'color', animation: 'glitch' },
    backdrop: 'starfield',
    carousel: 'noir',
    wood: ['#0f0d0c', '#1a1716', '#0a0908'],
  },
  {
    id: 'hellfire',
    name: 'Hellfire',
    blurb: 'Embers and heat. Orange capitals that slam in on the beat, a hot high-contrast picture and light leaks on the drops.',
    colors: { bg: '#070302', deep: '#5a1300', accent: '#ff4d00', light: '#ffe7c2' },
    font: 'Oswald',
    lyric: { uppercase: true, outlineWidth: 0.6, shadow: true },
    animation: 'bounce',
    grade: (c) => ({ contrast: 1.25, saturation: 1.15, temperature: 0.55, highlights: '#ffb000', highlightsAmt: 0.25, shadows: c.deep, shadowsAmt: 0.3 }),
    look: { vignette: 0.5, grain: 0.2, letterbox: 0, scanlines: 0, lightLeak: 0.35, beatFlash: 0.2 },
    transitions: ['zoom', 'flash', 'shake'],
    cut: 0.3,
    effects: { beatPulse: 0.5, shake: 0.15 },
    endCard: { background: 'color', animation: 'zoom' },
    backdrop: 'stage',
    carousel: 'flash',
    wood: ['#1a0c06', '#2a140a', '#120804'],
  },
  {
    id: 'toxic',
    name: 'Toxic Sludge',
    blurb: 'Grimy and loud. Hand-scrawled acid-green lyrics, a VHS look with colour fringing and glitch cuts.',
    colors: { bg: '#050805', deep: '#14200a', accent: '#8cff00', light: '#d9ffb0' },
    font: 'Permanent Marker',
    lyric: { uppercase: false, outlineWidth: 0.5, shadow: true },
    animation: 'glitch',
    grade: (c) => ({ contrast: 1.2, saturation: 0.5, tint: -0.4, shadows: c.deep, shadowsAmt: 0.4 }),
    look: { vignette: 0.45, grain: 0.3, letterbox: 0, scanlines: 0.25, lightLeak: 0, beatFlash: 0.1 },
    transitions: ['glitch', 'rgbSplit', 'pixelate'],
    cut: 0.3,
    effects: { rgb: 0.3, vhs: true },
    endCard: { background: 'color', animation: 'glitch' },
    backdrop: 'neongrid',
    carousel: 'vhs',
    wood: ['#14100a', '#221a10', '#0e0b07'],
  },
  {
    id: 'ruststeel',
    name: 'Rust & Steel',
    blurb: 'Industrial. Slab-serif capitals, a gunmetal picture with rust highlights, scanlines and hard shaking cuts.',
    colors: { bg: '#141618', deep: '#2b2f33', accent: '#c4521c', light: '#c9ced4' },
    font: 'Roboto Slab',
    lyric: { uppercase: true, outlineWidth: 0.5, shadow: true },
    animation: 'slide',
    grade: (c) => ({ contrast: 1.2, saturation: 0.3, temperature: -0.15, shadows: '#00586e', shadowsAmt: 0.3, highlights: c.accent, highlightsAmt: 0.2 }),
    look: { vignette: 0.45, grain: 0.3, letterbox: 0, scanlines: 0.15, lightLeak: 0, beatFlash: 0 },
    transitions: ['shake', 'none', 'wipe'],
    cut: 0.25,
    effects: { shake: 0.25 },
    endCard: { background: 'color', animation: 'drop' },
    backdrop: 'concrete',
    carousel: 'tealorange',
    wood: ['#1d1f22', '#2b2e32', '#151618'],
  },
];

export const themeById = (id) => THEMES.find((t) => t.id === id) || null;

function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
export const mix = (a, b, k) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
const isHex = (s) => /^#[\da-f]{6}$/i.test(s || '');

/** The four colours in use: the theme's, with any of your own swapped in. */
export function themeColors(theme, custom) {
  const c = { ...theme.colors };
  for (const k of ['bg', 'deep', 'accent', 'light']) if (custom && isHex(custom[k])) c[k] = custom[k].toLowerCase();
  return c;
}

/** Tab string colours for a theme: shades running from the accent to the light colour. */
export function stringRamp(c, n = 7) {
  return Array.from({ length: n }, (_, i) => mix(c.accent, c.light, n > 1 ? (i / (n - 1)) * 0.85 : 0));
}

/** Drum lane colours for a theme: kick and snare stand out, cymbals sit between. */
export const drumColors = (c) => ({
  kick: c.accent,
  snare: c.light,
  hihat: mix(c.light, c.accent, 0.35),
  tom: mix(c.accent, c.light, 0.25),
  tom1: mix(c.accent, c.light, 0.4),
  tom2: mix(c.accent, c.light, 0.25),
  floor: mix(c.accent, c.deep, 0.25),
  crash: mix(c.light, '#ffffff', 0.4),
  crash2: mix(c.light, c.accent, 0.15),
  china: mix(c.accent, '#ffffff', 0.35),
  ride: mix(c.accent, c.light, 0.6),
});

/** Colour one layer (tab, drums or visualizer) for a theme. */
export function themeLayer(L, theme, c) {
  if (!L || !theme) return L;
  if (L.type === 'tab') {
    Object.assign(L, { bg: c.bg, lineColor: c.light, numColor: c.light, hiColor: c.accent, stringColors: stringRamp(c) });
    L.chrome = { bg0: c.bg, bg1: mix(c.bg, c.deep, 0.7), road: c.bg, grid: c.accent, edge: c.accent, rail: c.light, wood0: theme.wood[0], wood1: theme.wood[1], wood2: theme.wood[2], fret: mix(c.light, '#888888', 0.4), nut: c.light, inlay: c.accent };
    L.tabTheme = 'project'; // the tab theme picker shows the colours came from the project theme
  } else if (L.type === 'drums') {
    L.bg = c.bg;
    L.colors = drumColors(c);
    L.chrome = { bg0: c.bg, bg1: mix(c.bg, c.deep, 0.55), bg2: c.deep, road: c.bg, grid: c.accent, glow: c.accent, edge: c.accent, shell: mix(c.bg, c.deep, 0.6), kickShell: c.deep };
  } else if (L.type === 'viz') {
    Object.assign(L, { color: c.accent, color2: c.light, classic: false });
  } else if (L.type === 'game') {
    L.themeColors = { bg: c.bg, deep: c.deep, accent: c.accent, light: c.light }; // used while “Follow the project theme” is on
  } else if (L.type === 'video' && theme.grade) {
    for (const clip of L.clips || []) clip.grade = { preset: 'custom', ...theme.grade(c) };
  }
  return L;
}

/** The cut-out background that suits a theme. */
export const themeBackdrop = (theme, c) => ({ kind: 'scene', scene: theme.backdrop, color: c.accent, color2: theme.backdrop === 'smoke' || theme.backdrop === 'stage' ? c.deep : c.light });

/**
 * Apply theme `id` to project draft `d`.
 * opts: { colors: your own four colours (optional), motion: also set cuts, effects and lyric motion }
 */
export function applyTheme(d, id, { colors = null, motion = false } = {}) {
  const t = themeById(id);
  if (!t) return;
  const c = themeColors(t, colors);
  d.theme = { id: t.id, colors: c, custom: !!(colors && Object.keys(colors).some((k) => isHex(colors[k]) && colors[k].toLowerCase() !== t.colors[k])) };

  // lyrics and on-screen text
  Object.assign(d.lyricStyle, { font: t.font, color: c.light, highlight: c.accent, outline: '#000000', boxColor: c.deep }, t.lyric);
  if (motion && (!d.lyricStyle.display || d.lyricStyle.display === 'line')) d.lyricStyle.animation = t.animation;
  (d.texts || []).forEach((tx, i) => {
    Object.assign(tx, { font: t.font, color: c.light, outline: '#000000', boxColor: i === 0 || tx.hook ? c.accent : c.deep });
    if (motion) tx.animation = t.animation === 'fade' ? 'fade' : 'pop';
  });

  // picture: grade and film look on every clip
  const grade = t.grade(c);
  const allClips = [...(d.clips || []), ...(d.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips || [])];
  allClips.forEach((clip, i) => {
    clip.grade = { preset: 'custom', ...grade };
    if (clip.bgRemove && clip.bgRemove.enabled) clip.bgRemove.background = themeBackdrop(t, c);
    if (motion) {
      if ((d.clips || []).includes(clip)) clip.transition = { type: i ? t.transitions[i % t.transitions.length] : t.transitions[0] === 'dipBlack' ? 'fade' : 'flash', duration: t.cut };
      clip.effects = { ...t.effects };
    }
  });
  // the film look; cinema bars are framing, so a theme adds them (Funeral Doom) but never removes them
  const { letterbox, ...look } = t.look;
  Object.assign(d.look, look);
  if (letterbox > (d.look.letterbox || 0)) d.look.letterbox = letterbox;
  d.look.progress = { ...d.look.progress, color: c.accent };

  // end card
  Object.assign(d.endCard, { bgColor: c.bg, accent: c.accent, textColor: c.light, font: t.font, background: t.endCard.background });
  if (motion) d.endCard.animation = t.endCard.animation;

  // tab, drum chart and visualizer layers
  for (const L of d.layers || []) themeLayer(L, t, c);

  // carousel photo slides
  if (d.carousel && d.carousel.slides) for (const s of d.carousel.slides) if (!['cover', 'cta'].includes(s.layout)) s.filter = t.carousel;
}
