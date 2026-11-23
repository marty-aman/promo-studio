// Project state, undo/redo history and browser persistence (localStorage + IndexedDB).
import { uid } from './core.js';

export const FONTS = [
  { id: 'Bebas Neue', label: 'Bebas Neue (tall caps)' },
  { id: 'Oswald', label: 'Oswald (condensed)' },
  { id: 'Montserrat', label: 'Montserrat Black' },
  { id: 'Inter', label: 'Inter Bold' },
  { id: 'Permanent Marker', label: 'Permanent Marker (hand drawn)' },
  { id: 'Playfair Display', label: 'Playfair Display (serif)' },
  { id: 'Roboto Slab', label: 'Roboto Slab' },
  { id: 'Impact', label: 'Impact (system)' },
  { id: 'Georgia', label: 'Georgia (system)' },
  { id: 'Courier New', label: 'Courier New (system)' },
];

export const PLATFORMS = [
  { id: 'spotify', label: 'Spotify', color: '#1DB954' },
  { id: 'apple', label: 'Apple Music', color: '#FA2D48' },
  { id: 'youtube', label: 'YouTube Music', color: '#FF0033' },
  { id: 'amazon', label: 'Amazon Music', color: '#25D1DA' },
  { id: 'tidal', label: 'TIDAL', color: '#FFFFFF' },
  { id: 'soundcloud', label: 'SoundCloud', color: '#FF5500' },
  { id: 'bandcamp', label: 'Bandcamp', color: '#629AA9' },
  { id: 'deezer', label: 'Deezer', color: '#A238FF' },
];

export const FILTER_PRESETS = {
  none: { label: 'None', brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0, hue: 0, blur: 0 },
  mono: { label: 'Mono', brightness: 1, contrast: 1.2, saturate: 1, grayscale: 1, sepia: 0, hue: 0, blur: 0 },
  noir: { label: 'Noir', brightness: 0.85, contrast: 1.6, saturate: 1, grayscale: 1, sepia: 0, hue: 0, blur: 0 },
  warm: { label: 'Warm', brightness: 1.05, contrast: 1.05, saturate: 1.2, grayscale: 0, sepia: 0.3, hue: -8, blur: 0 },
  cold: { label: 'Cold', brightness: 1, contrast: 1.1, saturate: 0.9, grayscale: 0, sepia: 0, hue: 15, blur: 0 },
  vivid: { label: 'Vivid', brightness: 1.05, contrast: 1.2, saturate: 1.6, grayscale: 0, sepia: 0, hue: 0, blur: 0 },
  faded: { label: 'Faded', brightness: 1.1, contrast: 0.8, saturate: 0.7, grayscale: 0, sepia: 0.15, hue: 0, blur: 0 },
  dream: { label: 'Dream', brightness: 1.1, contrast: 0.9, saturate: 1.2, grayscale: 0, sepia: 0, hue: 0, blur: 1.5 },
};

export function defaultLyricStyle() {
  return {
    font: 'Bebas Neue',
    size: 9, // % of frame width
    color: '#ffffff',
    highlight: '#ffd400',
    outline: '#000000',
    outlineWidth: 0.6, // % of font size * 10
    shadow: true,
    box: false,
    boxColor: '#000000',
    boxOpacity: 0.55,
    y: 72, // % from top
    x: 50, // % from left (center of the text block)
    align: 'center',
    uppercase: true,
    maxWidth: 86, // % of frame width
    animation: 'pop', // none | fade | pop | slide | typewriter | karaoke | words
    display: 'line', // line | sheet | poster | tunnel (see LYRIC_DISPLAYS)
  };
}

export function defaultEndCard() {
  return {
    enabled: true,
    duration: 4,
    coverMediaId: null,
    coverBy: '', // 'auto' (from the song), 'manual' (picked by hand) or '' (old saves)
    title: 'Song Title',
    artist: 'Artist Name',
    cta: 'OUT NOW',
    releaseDate: '',
    subtext: 'Link in bio',
    platforms: ['spotify', 'apple', 'youtube'],
    background: 'blur', // blur | color | video
    bgColor: '#0d0d12',
    accent: '#ffd400',
    textColor: '#ffffff',
    font: 'Bebas Neue',
    animation: 'rise', // rise | zoom | spin | none
  };
}

export function newProject() {
  return {
    version: 1,
    name: 'New promo',
    aspect: '9:16',
    duration: 20,
    background: '#000000',
    clips: [],
    song: null, // { mediaId, offset, volume, fadeIn, fadeOut }
    audioTracks: [],
    lyrics: [],
    lyricStyle: defaultLyricStyle(),
    texts: [],
    endCard: defaultEndCard(),
    look: {
      vignette: 0.25,
      grain: 0,
      letterbox: 0,
      lightLeak: 0,
      scanlines: 0,
      beatFlash: 0,
      watermark: { mediaId: null, position: 'top-right', size: 14, opacity: 0.85 },
      progress: { enabled: false, color: '#ffffff', position: 'bottom' },
      overlay: 'tiktok', // preview only: off | tiktok | reels | shorts
      overlayOpacity: 0.6,
      overlayClear: true,
      safeGuide: 'off', // preview only: off | all | tiktok | reels | shorts (a dashed box of where text stays clear of app buttons)
    },
    beats: null, // { bpm, period, beats:[song seconds] }
    layers: [], // stacked layers above the main video: video | tab | drums | viz (drawn in order)
    layerVis: {}, // visibility of fixed rows: video, text, lyrics, song, endcard, audio:<id>
  };
}

export function newText(start = 0) {
  return {
    id: uid('txt'),
    text: 'NEW SINGLE',
    start,
    end: start + 3,
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
  };
}

// ------------------------------------------------------------ layers

export const LAYER_TYPES = {
  video: { label: 'Video layer', icon: 'film' },
  tab: { label: 'Guitar tab', icon: 'guitar' },
  drums: { label: 'Drum chart', icon: 'activity' },
  viz: { label: 'Visualizer', icon: 'volume' },
  midi: { label: 'MIDI notes', icon: 'music' },
  game: { label: 'Rhythm game', icon: 'guitar' },
};

/** Is a fixed row (video, text, lyrics, song, endcard, audio:<id>) or a layer visible? */
export function isVisible(p, keyOrLayer) {
  if (keyOrLayer && typeof keyOrLayer === 'object') return keyOrLayer.visible !== false;
  return !(p.layerVis && p.layerVis[keyOrLayer] === false);
}

export const findLayer = (p, id) => (p.layers || []).find((l) => l.id === id) || null;

/** A clip on the main lane or on any video layer: { clip, layer|null }. */
export function findClip(p, id) {
  const main = p.clips.find((c) => c.id === id);
  if (main) return { clip: main, layer: null };
  for (const l of p.layers || []) {
    if (l.type !== 'video') continue;
    const c = l.clips.find((x) => x.id === id);
    if (c) return { clip: c, layer: l };
  }
  return { clip: null, layer: null };
}

/** Overlay clip active at timeline time t on a video layer. */
export function overlayClipAt(layer, t) {
  return layer.clips.find((c) => t >= c.start && t < c.start + c.duration) || null;
}

// ------------------------------------------------------------ store with history

export function createStore(initial) {
  let state = initial;
  const undo = [];
  const redo = [];
  const listeners = new Set();
  let coalesceKey = null;
  let coalesceAt = 0;

  const emit = (meta) => listeners.forEach((fn) => fn(state, meta));

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * Apply a change. `mutator` receives a deep copy to mutate.
     * Changes sharing `key` within 600 ms collapse into one undo step (sliders, drags).
     */
    update(mutator, key = null) {
      const now = Date.now();
      const coalesce = key && key === coalesceKey && now - coalesceAt < 600;
      if (!coalesce) {
        undo.push(JSON.stringify(state));
        if (undo.length > 150) undo.shift();
        redo.length = 0;
      }
      coalesceKey = key;
      coalesceAt = now;
      const draft = structuredClone(state);
      mutator(draft);
      state = draft;
      emit({ type: 'update' });
    },
    /** A bookkeeping change that isn't an undo step of its own (e.g. noting when lyrics were saved on the song). */
    patch(mutator) {
      const draft = structuredClone(state);
      mutator(draft);
      state = draft;
      emit({ type: 'patch' });
    },
    replace(next) {
      undo.length = 0;
      redo.length = 0;
      state = next;
      emit({ type: 'replace' });
    },
    undo() {
      if (!undo.length) return false;
      redo.push(JSON.stringify(state));
      state = JSON.parse(undo.pop());
      coalesceKey = null;
      emit({ type: 'undo' });
      return true;
    },
    redo() {
      if (!redo.length) return false;
      undo.push(JSON.stringify(state));
      state = JSON.parse(redo.pop());
      coalesceKey = null;
      emit({ type: 'redo' });
      return true;
    },
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
  };
}

// ------------------------------------------------------------ persistence

const PROJECT_KEY = 'pvm.project.v1';
const SETTINGS_KEY = 'pvm.settings.v1';
const TEMPLATES_KEY = 'pvm.templates.v1';

export function loadProject() {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** A saved project (this browser's, a project file, an earlier version) with every newer field filled in. */
export function normalizeProject(p) {
  const base = newProject();
  const look = p.look || {};
  // v1 projects had a red safe-zone toggle; it maps to the TikTok phantom overlay
  if ('safeZones' in look && !('overlay' in look)) look.overlay = look.safeZones ? 'tiktok' : 'off';
  delete look.safeZones;
  // v2 projects had one guitar tab (`tab`); it becomes the first layer
  const layers = Array.isArray(p.layers) ? p.layers : [];
  if (p.tab && p.tab.mediaId && !layers.some((l) => l.type === 'tab')) layers.push({ id: uid('lyr'), type: 'tab', name: 'Guitar tab', visible: true, ...p.tab });
  delete p.tab;
  return {
    ...base,
    ...p,
    layers,
    layerVis: p.layerVis || {},
    lyricStyle: { ...base.lyricStyle, ...p.lyricStyle },
    endCard: { ...base.endCard, ...p.endCard },
    look: {
      ...base.look,
      ...look,
      watermark: { ...base.look.watermark, ...look.watermark },
      progress: { ...base.look.progress, ...look.progress },
    },
  };
}

export function saveProject(p) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ earlier projects
// A few snapshots of edits that were replaced (New project, opening a project file), kept so nothing is lost for good.
const RECENT_KEY = 'pvm.recent.v1';
export const RECENT_CAP = 5;

export function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(list) ? list.filter((r) => r && r.project && typeof r.at === 'number') : [];
  } catch {
    return [];
  }
}
/** Keep `list`, dropping the oldest snapshots until the browser has room. Returns the list that was stored. */
export function saveRecent(list) {
  let keep = list.slice(0, RECENT_CAP);
  for (;;) {
    try {
      if (keep.length) localStorage.setItem(RECENT_KEY, JSON.stringify(keep));
      else localStorage.removeItem(RECENT_KEY);
      return keep;
    } catch {
      if (!keep.length) return keep;
      keep = keep.slice(0, -1);
    }
  }
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}
/** Save the settings; false (and a message through `onFail`, when set) if the browser has no room. Never throws. */
export function saveSettings(s) {
  return safeSet(SETTINGS_KEY, s, 'your settings');
}

export function loadTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || [];
  } catch {
    return [];
  }
}
export function saveTemplates(list) {
  return safeSet(TEMPLATES_KEY, list, 'your templates');
}

let onSaveFail = null;
/** The app registers one function to hear about a save that did not fit: fn(what, detail). */
export function setSaveFailHandler(fn) {
  onSaveFail = fn;
}
/** Tell the app that `what` could not be saved in this browser (storage full). */
export function reportSaveFail(what, detail = {}) {
  if (onSaveFail) onSaveFail(what, detail);
}
function safeSet(key, value, what) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    reportSaveFail(what);
    return false;
  }
}

// IndexedDB keeps the media blobs (videos, images, audio, fonts) between visits.
const DB_NAME = 'pvm-media';
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media', { keyPath: 'id' });
      req.onsuccess = () => {
        // let another tab (or a page kept in the browser's back/forward cache) delete or upgrade the database
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction('media', mode);
        const result = fn(t.objectStore('media'));
        t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('The browser could not store the file'));
      }),
  );
}

export const mediaDB = {
  /** Resolves once the file is stored; REJECTS when the browser could not store it (storage full), so callers can tell the user. */
  put: (rec) => tx('readwrite', (s) => s.put(rec)),
  delete: (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {}),
  all: () => tx('readonly', (s) => s.getAll()).catch(() => []),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => {}),
};
