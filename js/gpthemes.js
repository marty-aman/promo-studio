// Themes for the Guitar Pro visualizers: the tab layer (Scrolling tab, Fretboard highway, Light-up neck,
// Vibrating strings) and, through a matching rhythm game theme, the Guitar Hero style highway.
// Picking a theme writes its colours into the layer (like the project theme does), so every colour stays
// yours to change afterwards, and a save without `tabTheme` looks exactly as it did.
// Pure data and functions; unit tested.

/**
 * One tab theme. bg, lineColor, numColor, hiColor: the Scrolling tab (and the panel behind the fancy styles);
 * strings: string colours, lowest string first (7, so a 7-string has one too); chrome: the fancy styles'
 * backdrop (bg0, bg1), road, grid, edge, rail, neck wood (wood0-2), fret, nut, inlay, ink (labels, chord
 * names, techniques), hit (note highlights, sparks, the hit line), gemInk (the fret number on a note),
 * strIdle (a string at rest). game: the rhythm game theme that goes with it.
 * `original` is the look from before themes (no stringColors and no chrome: the drawing code's own defaults).
 */
export const TAB_THEMES = {
  original: {
    name: 'Original',
    blurb: 'Purple night, rainbow strings, yellow highlight',
    bg: '#000000', lineColor: '#ffffff', numColor: '#ffffff', hiColor: '#ffd400',
    strings: null, chrome: null, game: 'classic',
    swatch: { bg: ['#07040f', '#1a0d2e'], strings: ['#b26bff', '#4dff88', '#ff9f1c', '#3ee0ff', '#ffd23f', '#ff4d6d'], hi: '#ffd400' },
  },
  bloodsteel: {
    name: 'Blood & steel',
    blurb: 'Dark metal: black, blood red and bare steel',
    bg: '#050000', lineColor: '#bfb3b3', numColor: '#f2e6e6', hiColor: '#ff1a1a',
    strings: ['#7a0a0a', '#a10f0f', '#c81414', '#e01818', '#ff3b3b', '#ff6b6b', '#5c0808'],
    chrome: { bg0: '#000000', bg1: '#1c0202', road: '#070000', grid: '#a00d0d', edge: '#e01818', rail: '#ff2a2a', wood0: '#0c0a09', wood1: '#16110e', wood2: '#090706', fret: '#8f9096', nut: '#d9d9de', inlay: '#c41010', ink: '#f4e9e9', hit: '#ffd6d6', gemInk: '#140000', strIdle: '#6e6262' },
    game: 'bloodsteel',
  },
  blackout: {
    name: 'Blackout',
    blurb: 'All black and grey, white light',
    bg: '#050505', lineColor: '#8a8a90', numColor: '#e4e4e7', hiColor: '#ffffff',
    strings: ['#5a5a60', '#71717a', '#8a8a92', '#a1a1aa', '#c4c4cb', '#e4e4e7', '#48484e'],
    chrome: { bg0: '#000000', bg1: '#141416', road: '#060607', grid: '#5a5a60', edge: '#8a8a90', rail: '#bdbdc2', wood0: '#111112', wood1: '#1a1a1c', wood2: '#0c0c0d', fret: '#7c7c82', nut: '#b8b8be', inlay: '#5f5f66', ink: '#ececef', hit: '#ffffff', gemInk: '#0a0a0b', strIdle: '#55555b' },
    game: 'blackout',
  },
  inferno: {
    name: 'Inferno',
    blurb: 'Charred neck, fire-orange strings and embers',
    bg: '#0a0302', lineColor: '#d6a27a', numColor: '#ffe2c4', hiColor: '#ff6a00',
    strings: ['#b91c1c', '#dc2626', '#ea580c', '#f97316', '#f59e0b', '#fde047', '#7f1d1d'],
    chrome: { bg0: '#0a0302', bg1: '#2e0b04', road: '#140502', grid: '#c2410c', edge: '#f97316', rail: '#ff8a3d', wood0: '#1a0a05', wood1: '#2a1006', wood2: '#120603', fret: '#b9a48f', nut: '#f1d8b8', inlay: '#ff5a14', ink: '#fff1e0', hit: '#ffe0a8', gemInk: '#1a0602', strIdle: '#8a5a3a' },
    game: 'inferno',
  },
  frostbite: {
    name: 'Frostbite',
    blurb: 'Black metal frost: ice white and pale blue on black',
    bg: '#02040a', lineColor: '#b7c7dc', numColor: '#eef6ff', hiColor: '#9fd4ff',
    strings: ['#4f6b8a', '#6b8bb0', '#8fb0d6', '#b3d1f0', '#d6e8fb', '#f2f8ff', '#3e5670'],
    chrome: { bg0: '#010205', bg1: '#0c1626', road: '#04070e', grid: '#6b8bb0', edge: '#bfe0ff', rail: '#d6ebff', wood0: '#0b0d12', wood1: '#141821', wood2: '#08090d', fret: '#c9d6e6', nut: '#eef6ff', inlay: '#9fd4ff', ink: '#f2f8ff', hit: '#ffffff', gemInk: '#03060c', strIdle: '#5d6d82' },
    game: 'ice',
  },
  neon: {
    name: 'Neon',
    blurb: 'Synthwave pink and cyan glow on black',
    bg: '#04000c', lineColor: '#ff7ad9', numColor: '#ffffff', hiColor: '#00e5ff',
    strings: ['#bc13fe', '#ff2079', '#ff7ad9', '#00e5ff', '#39ff14', '#fff01f', '#7b2bff'],
    chrome: { bg0: '#04000c', bg1: '#1a0033', road: '#08001a', grid: '#ff2079', edge: '#00e5ff', rail: '#ff7ad9', wood0: '#0d0618', wood1: '#170a2a', wood2: '#090412', fret: '#00e5ff', nut: '#ff7ad9', inlay: '#ff2079', ink: '#ffffff', hit: '#e6fdff', gemInk: '#0a0014', strIdle: '#6a4a8a' },
    game: 'neon',
  },
  clean: {
    name: 'Clean',
    blurb: 'Minimal: white strings and numbers, one blue accent',
    bg: '#0b0d10', lineColor: '#ffffff', numColor: '#ffffff', hiColor: '#3ea6ff',
    strings: ['#e5e7eb', '#e5e7eb', '#f3f4f6', '#f3f4f6', '#ffffff', '#ffffff', '#d1d5db'],
    chrome: { bg0: '#0b0d10', bg1: '#161a20', road: '#0e1115', grid: '#6b7280', edge: '#9ca3af', rail: '#d1d5db', wood0: '#1b1d21', wood1: '#24272c', wood2: '#15171a', fret: '#c0c4ca', nut: '#f3f4f6', inlay: '#9ca3af', ink: '#ffffff', hit: '#cfe8ff', gemInk: '#0b0d10', strIdle: '#9ca3af' },
    game: 'mono',
  },
  rosewood: {
    name: 'Rosewood (realistic)',
    blurb: 'Real neck: rosewood board, nickel frets, pearl dots, bronze and steel strings',
    bg: '#120c08', lineColor: '#d8c7a8', numColor: '#fff6e6', hiColor: '#ffc65c',
    strings: ['#a87b45', '#b8894f', '#c79a5c', '#d9d6cf', '#e6e3dc', '#f1efea', '#96693a'],
    chrome: { bg0: '#0e0906', bg1: '#24160d', road: '#140d08', grid: '#8a6a44', edge: '#c9a46a', rail: '#e0c690', wood0: '#2b1710', wood1: '#3e2416', wood2: '#22120b', fret: '#d4d4d0', nut: '#efe6d2', inlay: '#f2ede4', ink: '#fff6e6', hit: '#fff2d6', gemInk: '#1c0f06', strIdle: '#c9b89a' },
    game: 'classic',
  },
};
export const TAB_THEME_LIST = Object.entries(TAB_THEMES).map(([id, t]) => [id, t.name, t.blurb]);
export const tabThemeOf = (id) => TAB_THEMES[id] || null;

/** Colours a theme puts on a tab layer. */
export function tabThemeFields(id) {
  const t = TAB_THEMES[id];
  if (!t) return null;
  return { bg: t.bg, lineColor: t.lineColor, numColor: t.numColor, hiColor: t.hiColor, stringColors: t.strings ? t.strings.slice() : undefined, chrome: t.chrome ? { ...t.chrome } : undefined };
}

/** Put theme `id` on tab layer L (in place). Original removes the theme's string colours and chrome. */
export function applyTabTheme(L, id) {
  const f = tabThemeFields(id);
  if (!L || L.type !== 'tab' || !f) return L;
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) delete L[k];
    else L[k] = v;
  }
  L.tabTheme = id;
  return L;
}

/** The tab theme that goes with a rhythm game theme (for "use it on every Guitar Pro visualizer"). */
export function tabThemeForGame(gameId) {
  const hit = Object.entries(TAB_THEMES).find(([, t]) => t.game === gameId);
  return hit ? hit[0] : 'original';
}

/**
 * Use tab theme `id` on every tab layer and the matching game theme on every guitar, bass or keys
 * rhythm game layer of draft d (drums highways are left alone). Returns how many layers changed.
 */
export function applyGpThemeEverywhere(d, id) {
  const t = TAB_THEMES[id];
  if (!t) return 0;
  let n = 0;
  for (const L of d.layers || []) {
    if (L.type === 'tab') {
      applyTabTheme(L, id);
      n++;
    } else if (L.type === 'game' && L.instrument !== 'drums') {
      L.gameTheme = t.game;
      L.followTheme = false; // a theme picked here wins over the project theme's colours
      n++;
    }
  }
  return n;
}
