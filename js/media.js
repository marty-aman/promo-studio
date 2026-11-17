// Media library: turns uploaded or downloaded blobs into playable elements.
import { uid, computePeaks, energyEnvelope } from './core.js';
import { mediaDB } from './state.js';
import { TAB_EXTENSIONS, parseTabBytes, tabTracks, buildTabTimeline } from './tab.js';

const library = new Map(); // id -> record
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const media = {
  get: (id) => library.get(id) || null,
  all: () => [...library.values()],
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function kindOf(type, name = '') {
  if (TAB_EXTENSIONS.test(name) || type === 'application/x-guitar-pro') return 'tab';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('font/') || /\.(ttf|otf|woff2?)$/i.test(name)) return 'font';
  return null;
}

function loadElement(rec) {
  return new Promise((resolve) => {
    if (rec.kind === 'tab') {
      rec.blob
        .arrayBuffer()
        .then((buf) => parseTabBytes(new Uint8Array(buf)))
        .then((score) => {
          rec.score = score;
          rec.tracks = tabTracks(score);
          rec.timelines = new Map();
          if (!rec.tracks.length) throw new Error('no guitar or bass tracks');
          rec.duration = tabTimeline(rec, rec.tracks[0].index).duration;
          rec.title = score.title || '';
          resolve(true);
        })
        .catch((e) => {
          console.warn('Tab parse failed', e);
          resolve(false);
        });
      return;
    }
    if (rec.kind === 'image') {
      const img = new Image();
      img.onload = () => {
        rec.width = img.naturalWidth;
        rec.height = img.naturalHeight;
        rec.duration = Infinity;
        rec.el = img;
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = rec.url;
      return;
    }
    if (rec.kind === 'font') {
      const family = rec.name.replace(/\.[^.]+$/, '').replace(/[^\w ]+/g, ' ').trim() || 'Custom font';
      rec.family = family;
      new FontFace(family, `url(${rec.url})`)
        .load()
        .then((ff) => {
          document.fonts.add(ff);
          resolve(true);
        })
        .catch(() => resolve(false));
      return;
    }
    const el = document.createElement(rec.kind === 'video' ? 'video' : 'audio');
    el.preload = 'auto';
    el.muted = rec.kind === 'video';
    el.playsInline = true;
    el.onloadedmetadata = () => {
      rec.duration = el.duration;
      rec.width = el.videoWidth || 0;
      rec.height = el.videoHeight || 0;
      rec.el = el;
      resolve(true);
    };
    el.onerror = () => resolve(false);
    el.src = rec.url;
  });
}

/** Cached tab timeline for one track of a tab media record. */
export function tabTimeline(rec, trackIndex) {
  if (!rec || rec.kind !== 'tab' || !rec.score) return null;
  let tl = rec.timelines.get(trackIndex);
  if (!tl) {
    tl = buildTabTimeline(rec.score, trackIndex);
    rec.timelines.set(trackIndex, tl);
  }
  return tl;
}

/** Poster thumbnail as a data URL, for the media grid. */
function makeThumb(rec) {
  return new Promise((resolve) => {
    if (rec.kind === 'image') return resolve(rec.url);
    if (rec.kind !== 'video') return resolve(null);
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = rec.url;
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
    };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      const s = 160 / Math.max(v.videoWidth, v.videoHeight);
      c.width = Math.max(1, Math.round(v.videoWidth * s));
      c.height = Math.max(1, Math.round(v.videoHeight * s));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
      v.removeAttribute('src');
      v.load();
    };
    v.onerror = () => resolve(null);
  });
}

/** Decode audio for waveform peaks and the beat/hook analysis. */
async function analyseAudio(rec) {
  try {
    const buf = await rec.blob.arrayBuffer();
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(1, 2, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const ch0 = audio.getChannelData(0);
    let mono = ch0;
    if (audio.numberOfChannels > 1) {
      const ch1 = audio.getChannelData(1);
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
    rec.peaksPerSec = 50;
    rec.peaks = computePeaks(mono, Math.max(1, Math.ceil(audio.duration * rec.peaksPerSec)));
    rec.envRate = 100;
    rec.envelope = energyEnvelope(mono, audio.sampleRate, rec.envRate);
    rec.duration = audio.duration;
  } catch (e) {
    console.warn('Audio analysis failed', e);
  }
}

/**
 * Add a blob to the library. `meta` may carry source/attribution for stock media.
 * Persists to IndexedDB unless `persist` is false (used when restoring).
 */
export async function addMedia(blob, name, meta = {}, { persist = true, id = null } = {}) {
  const kind = meta.kind || kindOf(blob.type || '', name);
  if (!kind) throw new Error(`Unsupported file type: ${name}`);
  const rec = {
    id: id || uid('m'),
    name,
    kind,
    blob,
    url: URL.createObjectURL(blob),
    source: meta.source || 'upload',
    attribution: meta.attribution || null,
    duration: 0,
    ready: false,
  };
  const ok = await loadElement(rec);
  if (!ok) {
    URL.revokeObjectURL(rec.url);
    if (kind === 'tab') throw new Error(`Could not read ${name}. Guitar Pro 3–8 (.gp3/.gp4/.gp5/.gpx/.gp) and MusicXML files with a guitar or bass track are supported.`);
    throw new Error(`Could not open ${name}. Your browser may not support this format.`);
  }
  if (kind === 'audio' || (kind === 'video' && meta.analyse)) await analyseAudio(rec);
  rec.thumb = await makeThumb(rec);
  rec.ready = true;
  library.set(rec.id, rec);
  if (persist) {
    mediaDB.put({ id: rec.id, name, kind, blob, source: rec.source, attribution: rec.attribution });
  }
  emit();
  return rec;
}

export function removeMedia(id) {
  const rec = library.get(id);
  if (!rec) return;
  URL.revokeObjectURL(rec.url);
  library.delete(id);
  mediaDB.delete(id);
  emit();
}

export async function restoreMedia() {
  const recs = await mediaDB.all();
  for (const r of recs) {
    try {
      await addMedia(r.blob, r.name, { kind: r.kind, source: r.source, attribution: r.attribution }, { persist: false, id: r.id });
    } catch (e) {
      console.warn('Could not restore', r.name, e);
    }
  }
}

export function clearMedia() {
  for (const rec of library.values()) URL.revokeObjectURL(rec.url);
  library.clear();
  mediaDB.clear();
  emit();
}

/** Each clip gets its own <video> element so two clips can share one source file. */
const clipEls = new Map(); // clipId -> {el, mediaId}
export function clipElement(clip) {
  const rec = library.get(clip.mediaId);
  if (!rec || rec.kind !== 'video') return null;
  let entry = clipEls.get(clip.id);
  if (!entry || entry.mediaId !== clip.mediaId) {
    if (entry) entry.el.pause();
    const el = document.createElement('video');
    el.preload = 'auto';
    el.playsInline = true;
    el.muted = true;
    el.src = rec.url;
    entry = { el, mediaId: clip.mediaId, audioNode: null };
    clipEls.set(clip.id, entry);
  }
  return entry;
}
export function pruneClipElements(liveIds) {
  for (const [id, entry] of clipEls) {
    if (!liveIds.has(id)) {
      entry.el.pause();
      entry.el.removeAttribute('src');
      entry.el.load();
      clipEls.delete(id);
    }
  }
}
export const allClipElements = () => clipEls;
