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
  };
}

export function defaultEndCard() {
  return {
    enabled: true,
    duration: 4,
    coverMediaId: null,
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
    },
    beats: null, // { bpm, period, beats:[song seconds] }
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
    const p = JSON.parse(raw);
    const base = newProject();
    const look = p.look || {};
    // v1 projects had a red safe-zone toggle; it maps to the TikTok phantom overlay
    if ('safeZones' in look && !('overlay' in look)) look.overlay = look.safeZones ? 'tiktok' : 'off';
    delete look.safeZones;
    return {
      ...base,
      ...p,
      lyricStyle: { ...base.lyricStyle, ...p.lyricStyle },
      endCard: { ...base.endCard, ...p.endCard },
      look: {
        ...base.look,
        ...look,
        watermark: { ...base.look.watermark, ...look.watermark },
        progress: { ...base.look.progress, ...look.progress },
      },
    };
  } catch {
    return null;
  }
}

export function saveProject(p) {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}
export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || [];
  } catch {
    return [];
  }
}
export function saveTemplates(list) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
}

// IndexedDB keeps the media blobs (videos, images, audio, fonts) between visits.
const DB_NAME = 'pvm-media';
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
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
      }),
  );
}

export const mediaDB = {
  put: (rec) => tx('readwrite', (s) => s.put(rec)).catch(() => {}),
  delete: (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {}),
  all: () => tx('readonly', (s) => s.getAll()).catch(() => []),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => {}),
};
