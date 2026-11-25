// Media library: turns uploaded or downloaded blobs into playable elements.
import { uid, computePeaks, energyEnvelope } from './core.js';
import { mediaDB, reportSaveFail } from './state.js';
import { TAB_EXTENSIONS, parseTabBytes, tabTracks, buildTabTimeline, importCheck } from './tab.js';
import { drumTracks, drumTimelineFromScore, drumHitsFromAudio, drumTimelineFromMidi, midiToLane } from './drums.js';
import { analyseAudioBlob } from './viz.js';
import { ensureMattes } from './bgremove.js';
import { MIDI_EXTENSIONS, parseMidi } from './midi.js';
import { remember, trim, mergeIndex } from './mediamatch.js';
import { isLazyKind, lightOf, lightUsable, recordFromLight, pickRelease, thumbSize } from './medialight.js';
import { desktop, wantsLink, linkChoice, linkedReader, LINK_BLOB_MAX } from './desktop.js';

const library = new Map(); // id -> record
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
// files that finish loading in the same moment redraw the screen once, not once each
let emitTimer = null;
const soonEmit = () => {
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    emit();
  }, 30);
};
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// What every media id was called (and where it came from), kept apart from the records so a project, a song or a
// design that points at a file which is gone still knows its name. Never shrinks when a record is removed.
const NAMES_KEY = 'pvm.mediaNames.v1';
let names = null;
const nameIndex = () => {
  if (!names) {
    try {
      names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
    } catch {
      names = {};
    }
  }
  return names;
};
let namesHeld = 0; // while restoring a whole library the index is written once at the end, not per file
const saveNames = () => {
  if (namesHeld) return;
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(trim(nameIndex(), (id) => library.has(id))));
  } catch {
    /* storage full: names are only kept for this visit */
  }
};

export const media = {
  /**
   * The record for `id` (null when there is none). A photo, video or song that is not open yet is opened in the
   * background (its `el`, `url` and `blob` arrive a moment later and the library's onChange fires); everything
   * else on the record (name, kind, length, size, picture size, thumbnail, waveform) is there at once.
   */
  get: (id) => {
    const rec = library.get(id);
    if (!rec) return null;
    rec.lastUse = now();
    if (rec.loaded === false) ensureLoaded(id);
    return rec;
  },
  /** The record without opening its file (for lists, names, sizes and thumbnails). */
  peek: (id) => library.get(id) || null,
  /** A file that is in the library, opened or not. A file that is not open yet is NOT missing. */
  has: (id) => library.has(id),
  /** Every record, opened or not (does not open anything). */
  all: () => [...library.values()],
  /** The file's data (Blob), read from storage when it is not open; resolves null when there is no file. */
  blob: (id) => blobOf(id),
  /**
   * The file in pieces, for jobs that must not hold a huge file in memory: { size, read(start, end) -> Uint8Array }
   * (end exclusive), or null. A linked file (Mac app) is read from disk; any other from its Blob.
   */
  reader: async (id) => {
    const rec = library.get(id);
    if (!rec) return null;
    if (rec.linked && desktop) return linkedReader(id, rec.size);
    const b = await blobOf(id);
    return b ? { size: b.size, read: async (start, end) => new Uint8Array(await b.slice(start, end).arrayBuffer()) } : null;
  },
  /** True for a file linked in place (Mac app): it streams from disk and has no Blob in memory. */
  isLinked: (id) => !!(library.get(id) || {}).linked,
  /** True when the file's data is in memory (always true for tabs, MIDI files and fonts). */
  isLoaded: (id) => {
    const rec = library.get(id);
    return !!rec && rec.loaded !== false;
  },
  /** "Missing: kick.wav" for an id with no record (falls back to `what`, e.g. "Missing audio"). */
  missingLabel: (id, what = 'media') => {
    const n = nameIndex()[id];
    return n && n[0] ? `Missing: ${n[0]}` : `Missing ${what}`;
  },
  /** The name index: id -> [name, relative path, kind] for every file this browser has held. */
  names: nameIndex,
  /** Take in names from a backup. Ids this browser already knows are left alone. */
  learnNames(other) {
    mergeIndex(nameIndex(), other);
    saveNames();
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function kindOf(type, name = '') {
  if (TAB_EXTENSIONS.test(name) || type === 'application/x-guitar-pro') return 'tab';
  if (MIDI_EXTENSIONS.test(name) || /^audio\/(x-)?midi$/.test(type)) return 'midi'; // before audio: MIDI files are typed audio/midi
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('font/') || /\.(ttf|otf|woff2?)$/i.test(name)) return 'font';
  return null;
}

function loadElement(rec) {
  return new Promise((resolve) => {
    if (rec.kind === 'midi') {
      rec.blob
        .arrayBuffer()
        .then((buf) => {
          const midi = parseMidi(new Uint8Array(buf));
          if (!midi.notes.length) throw new Error('no notes');
          rec.midi = midi;
          rec.duration = midi.duration;
          rec.drumTimelines = new Map();
          resolve(true);
        })
        .catch((e) => {
          console.warn('MIDI parse failed', e);
          resolve(false);
        });
      return;
    }
    if (rec.kind === 'tab') {
      rec.blob
        .arrayBuffer()
        .then((buf) => parseTabBytes(new Uint8Array(buf)))
        .then((score) => {
          rec.score = score;
          rec.tracks = tabTracks(score);
          rec.drumTracks = drumTracks(score);
          rec.timelines = new Map();
          rec.drumTimelines = new Map();
          if (!rec.tracks.length && !rec.drumTracks.length) throw new Error('no guitar, bass or drum tracks');
          rec.duration = rec.tracks.length ? tabTimeline(rec, rec.tracks[0].index).duration : drumTimeline(rec, rec.drumTracks[0].index).duration;
          rec.title = score.title || '';
          try {
            rec.importNotes = importCheck(score, midiToLane); // shown in Tab Studio's Import check
          } catch (e) {
            console.warn('Import check failed', e);
            rec.importNotes = [];
          }
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

/** Drum hits from a Guitar Pro percussion track, or from a MIDI file's drums read with drum map `map` (cached). */
export function drumTimeline(rec, trackIndex, map = 'general_midi') {
  if (rec && rec.kind === 'midi' && rec.midi) {
    const key = `${trackIndex}|${map}`;
    let tl = rec.drumTimelines.get(key);
    if (!tl) {
      tl = drumTimelineFromMidi(rec.midi, trackIndex, map);
      rec.drumTimelines.set(key, tl);
    }
    return tl;
  }
  if (!rec || rec.kind !== 'tab' || !rec.score) return null;
  let tl = rec.drumTimelines.get(trackIndex);
  if (!tl) {
    tl = drumTimelineFromScore(rec.score, trackIndex);
    rec.drumTimelines.set(trackIndex, tl);
  }
  return tl;
}

// Audio analysis for visualizers and drum stems runs once per file (and sensitivity) in the background.
const pending = new Map();
function background(key, rec, field, work, onReady) {
  if (rec[field] && rec[field].has(key)) return rec[field].get(key);
  rec[field] ||= new Map();
  const pk = `${rec.id}|${field}|${key}`;
  if (!pending.has(pk)) {
    pending.set(
      pk,
      work()
        .then((v) => {
          rec[field].set(key, v);
          onReady && onReady();
          return v;
        })
        .catch((e) => {
          console.warn('analysis failed', rec.name, e);
          rec[field].set(key, null);
          return null;
        })
        .finally(() => pending.delete(pk)),
    );
  }
  return undefined; // not ready yet
}

/** Visualizer features for an audio (or video) file; undefined while analysing, null on failure. */
export function vizFeatures(rec, onReady) {
  if (waitForFile(rec, onReady)) return undefined;
  if (!rec || !rec.blob) return null;
  return background('viz', rec, 'vizCache', () => analyseAudioBlob(rec.blob), onReady);
}

/**
 * A video's sound, for its waveform on the timeline and for lining it up with the song: decodes the file's
 * audio once in the background and fills rec.peaks / rec.envelope like a song file's.
 * Returns 'ready', 'pending' (onReady is called when it lands), 'none' (no sound in it) or null (not a video).
 */
const waveWaiters = new Map();
export function videoWaveform(rec, onReady) {
  if (!rec || rec.kind !== 'video') return null;
  if (rec.peaks) return 'ready';
  if (rec.noAudio) return 'none';
  if (onReady) (waveWaiters.get(rec.id) || waveWaiters.set(rec.id, new Set()).get(rec.id)).add(onReady);
  if (!rec.waveLoading) {
    rec.waveLoading = ensureLoaded(rec.id).then((r) => (r ? analyseAudio(r) : null)).then(() => {
      if (!rec.peaks) rec.noAudio = true; // decodeAudioData refuses a file with no audio track
      rec.waveLoading = null;
      const fns = waveWaiters.get(rec.id);
      waveWaiters.delete(rec.id);
      if (fns) fns.forEach((fn) => fn());
    });
  }
  return 'pending';
}

/** Drum hits detected from a drum stem at a given sensitivity. */
export function drumHitsFromStem(rec, sensitivity, onReady) {
  if (waitForFile(rec, onReady)) return undefined;
  if (!rec || !rec.blob) return null;
  const s = Math.round((sensitivity ?? 0.5) * 20) / 20;
  return background(`drums:${s}`, rec, 'drumCache', () => drumHitsFromAudio(rec.blob, { sensitivity: s }), onReady);
}

/**
 * Resolve when every file and analysis a project needs is ready (used before exporting). `onLoad(done, total)` is
 * called while the project's files are opened.
 */
export async function ensureLayerAnalyses(p, { onLoad = null } = {}) {
  await ensureProjectMedia(p, onLoad);
  await primeClipElements(p);
  const jobs = [];
  for (const l of p.layers || []) {
    if (l.visible === false) continue;
    if (l.type === 'viz') {
      const rec = media.get(l.source === 'song' ? p.song && p.song.mediaId : l.source);
      if (rec && vizFeatures(rec) === undefined) jobs.push(pending.get(`${rec.id}|vizCache|viz`));
    }
    if (l.type === 'drums' && l.source === 'audio') {
      const rec = media.get(l.mediaId);
      const s = Math.round((l.sensitivity ?? 0.5) * 20) / 20;
      if (rec && drumHitsFromStem(rec, s) === undefined) jobs.push(pending.get(`${rec.id}|drumCache|drums:${s}`));
    }
  }
  await Promise.all(jobs.filter(Boolean));
  // person cut-outs must be ready so the real-time export never shows an uncut frame
  return ensureMattes(p, (id) => media.get(id));
}
/** A photo's small picture, as a data URL that outlives the file's object URL (lists show it; no full decode). */
function imageThumb(img) {
  try {
    const { w, h } = thumbSize(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const webp = c.toDataURL('image/webp', 0.82); // keeps transparency (logos) at a small size
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  } catch {
    return null;
  }
}
function makeThumb(rec) {
  return new Promise((resolve) => {
    if (rec.kind === 'image') return resolve(imageThumb(rec.el) || rec.url);
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
    const blob = rec.blob || (rec.linked ? await blobOf(rec.id) : null);
    if (!blob) return;
    const buf = await blob.arrayBuffer();
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
    if (rec.kind !== 'video' || !rec.duration) rec.duration = audio.duration; // a video keeps its picture's length
  } catch (e) {
    console.warn('Audio analysis failed', e);
  }
}

/**
 * Add a blob to the library. `meta` may carry source/attribution for stock media.
 * Persists to IndexedDB unless `persist` is false (used when restoring).
 */
export async function addMedia(blob, name, meta = {}, { persist = true, id = null, cached = null } = {}) {
  const kind = meta.kind || kindOf(blob.type || '', name);
  if (!kind) throw new Error(`Unsupported file type: ${name}`);
  if (persist && wantsLink(blob, kind, linkChoice())) return addLinked(blob, name, kind, meta, id);
  const rec = {
    id: id || uid('m'),
    name,
    kind,
    blob,
    url: URL.createObjectURL(blob),
    source: meta.source || 'upload',
    attribution: meta.attribution || null,
    size: blob.size || 0,
    type: blob.type || '',
    addedAt: meta.addedAt || Date.now(),
    duration: 0,
    ready: false,
    loaded: true,
    lastUse: now(),
  };
  const ok = await loadElement(rec);
  if (!ok) {
    URL.revokeObjectURL(rec.url);
    if (kind === 'tab') throw new Error(`Could not read ${name}. Guitar Pro 3–8 (.gp3/.gp4/.gp5/.gpx/.gp) and MusicXML files with a guitar, bass or drum track are supported.`);
    if (kind === 'midi') throw new Error(`Could not read ${name}: it isn’t a MIDI file with notes in it.`);
    throw new Error(`Could not open ${name}. Your browser may not support this format.`);
  }
  // a file analysed on an earlier visit comes back with its waveform, loudness curve and thumbnail: no decoding again
  const fromCache = useAnalysis(rec, cached);
  if (!fromCache && (kind === 'audio' || (kind === 'video' && meta.analyse))) await analyseAudio(rec);
  rec.thumb = fromCache && fromCache.thumb !== undefined ? fromCache.thumb : await makeThumb(rec);
  rec.ready = true;
  rec.path = meta.path || blob.webkitRelativePath || '';
  withOpen(rec);
  library.set(rec.id, rec);
  remember(nameIndex(), rec.id, { name, path: rec.path, kind });
  saveNames();
  if (persist) {
    requestPersistence();
    mediaDB.put(stored(rec), lightOf(rec, analysisOf(rec))).catch(async (e) => {
      // the file works in this visit but would be gone after a reload: say so now, not later
      rec.unsaved = true;
      reportSaveFail(`the file “${name}”`, { media: true, name, bytes: blob.size, space: await spaceLeft(), error: e && e.name });
    });
  }
  emit();
  return rec;
}

/**
 * What is worth keeping next to a file so the next visit doesn't analyse it again: the waveform peaks, the loudness
 * curve, the length and the thumbnail (a video's frame). Images need nothing (their thumbnail is the file itself).
 */
const ANALYSIS_V = 1;
export function analysisOf(rec) {
  if (rec.kind === 'audio' && rec.peaks && rec.envelope) return { v: ANALYSIS_V, peaks: rec.peaks, peaksPerSec: rec.peaksPerSec, envelope: rec.envelope, envRate: rec.envRate, duration: rec.duration, thumb: rec.thumb || null };
  if (rec.kind === 'video' && rec.thumb) return { v: ANALYSIS_V, thumb: rec.thumb, peaks: rec.peaks || null, peaksPerSec: rec.peaksPerSec, envelope: rec.envelope || null, envRate: rec.envRate, duration: rec.peaks ? rec.duration : 0 };
  return null;
}
/** The record as it is kept in IndexedDB. */
const stored = (rec) => ({ id: rec.id, name: rec.name, kind: rec.kind, blob: rec.linked ? null : rec.blob, linked: rec.linked || undefined, source: rec.source, attribution: rec.attribution, path: rec.path, analysis: analysisOf(rec) });
/** Fill rec from a kept analysis. Returns it when it was usable (right version, right kind), else null. */
export function useAnalysis(rec, a) {
  if (!a || a.v !== ANALYSIS_V) return null;
  if (rec.kind === 'audio') {
    if (!a.peaks || !a.envelope || !(a.duration > 0)) return null;
  } else if (rec.kind !== 'video' || a.thumb === undefined) return null;
  if (a.peaks && a.envelope) {
    rec.peaks = a.peaks;
    rec.peaksPerSec = a.peaksPerSec;
    rec.envelope = a.envelope;
    rec.envRate = a.envRate;
    if (rec.kind === 'audio') rec.duration = a.duration;
  }
  return a;
}

let askedPersist = false;
/** Ask the browser not to clear this site's storage on its own (once; most browsers answer without a prompt). */
function requestPersistence() {
  if (askedPersist) return;
  askedPersist = true;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
/** Bytes the browser says are still free for this site, or null when it can't tell. */
async function spaceLeft() {
  try {
    const e = await navigator.storage.estimate();
    return e && e.quota ? Math.max(0, e.quota - (e.usage || 0)) : null;
  } catch {
    return null;
  }
}

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?)$/i;
/** The kind of a picked file, by its type and then its name (null when the app can't use it). */
export const fileKind = (file) => kindOf(file.type || '', file.name) || (AUDIO_EXT.test(file.name) ? 'audio' : null);

/**
 * Give a missing id its file back. The id stays the same, so every clip, layer, song file and photo that used it
 * works again; the file is analysed afresh (duration, waveform, thumbnail). An id that is present is never touched.
 */
export async function restoreMissing(id, file) {
  if (library.has(id)) throw new Error(`“${file.name}” is not missing.`);
  return addMedia(file, file.name, { kind: fileKind(file) || undefined }, { id });
}

export function removeMedia(id) {
  const rec = library.get(id);
  if (!rec) return;
  if (rec.url) URL.revokeObjectURL(rec.url);
  library.delete(id);
  mediaDB.delete(id);
  if (rec.linked && desktop) desktop.media.unlink(id).catch(() => {}); // forgets the link; the file stays where it is
  emit();
}

/**
 * Mac app: add a file the person picked or dropped by linking it where it is. Nothing is copied: the record's
 * url streams from disk (app://promo-studio/__media/<id>), IndexedDB keeps only the record, the main process keeps
 * the path. A file that later moves or sits on an unplugged drive shows as missing (Replace missing files).
 */
async function addLinked(file, name, kind, meta, id) {
  const rid = id || uid('m');
  const info = await desktop.media.link(rid, file);
  const rec = {
    id: rid,
    name,
    kind,
    blob: null,
    url: desktop.media.urlFor(rid),
    linked: true,
    source: meta.source || 'upload',
    attribution: meta.attribution || null,
    size: info.size || file.size || 0,
    type: file.type || '',
    addedAt: meta.addedAt || Date.now(),
    duration: 0,
    ready: false,
    loaded: true,
    lastUse: now(),
  };
  if (!(await loadElement(rec))) {
    desktop.media.unlink(rid).catch(() => {});
    throw new Error(`Could not open ${name}. The Mac app may not support this format.`);
  }
  rec.thumb = await makeThumb(rec);
  rec.ready = true;
  rec.path = meta.path || '';
  withOpen(rec);
  library.set(rec.id, rec);
  remember(nameIndex(), rec.id, { name, path: rec.path, kind });
  saveNames();
  mediaDB.put(stored(rec), lightOf(rec, analysisOf(rec))).catch((e) => reportSaveFail(`the file “${name}”`, { media: true, name, bytes: 0, error: e && e.name }));
  emit();
  return rec;
}

/** Mac app: open a linked record (restored as a light record or read the old way). Resolves rec, or null when the file is gone. */
async function openLinked(rec) {
  if (!desktop) return null;
  const st = await desktop.media.stat(rec.id).catch(() => null);
  if (!st || !st.exists) return null;
  rec.url = desktop.media.urlFor(rec.id);
  rec.blob = null;
  rec.linked = true;
  if (st.size) rec.size = st.size;
  return (await loadElement(rec)) ? rec : null;
}

// ------------------------------------------------------------------ opening files when they are used
const opening = new Map(); // id -> promise of the record (or null)
/**
 * For modules that get a record but don't import this one: rec.open() resolves the record with its file open;
 * rec.file() resolves its Blob without keeping it open (for a background job that reads it once).
 */
function withOpen(rec) {
  Object.defineProperty(rec, 'open', { value: () => ensureLoaded(rec.id), configurable: true });
  Object.defineProperty(rec, 'file', { value: () => blobOf(rec.id), configurable: true });
  return rec;
}

/**
 * Open a file that was restored as a light record: read its blob from IndexedDB, make its object URL and its
 * element (picture, video, audio). Resolves the record, or null when it has no file any more (then it is taken out
 * of the library, so it shows as missing and Replace missing files can give it back). Safe to call many times.
 */
export function ensureLoaded(id) {
  const rec = library.get(id);
  if (!rec) return Promise.resolve(null);
  rec.lastUse = now();
  if (rec.loaded !== false) return Promise.resolve(rec);
  if (opening.has(id)) return opening.get(id);
  const p = (async () => {
    let row = null;
    try {
      row = await mediaDB.get(id);
    } catch (e) {
      console.warn('Could not read', rec.name, e);
    }
    if (library.get(id) !== rec) return library.get(id) || null; // replaced or removed meanwhile
    if (row && row.linked) {
      const lightDuration = rec.duration;
      if (!(await openLinked(rec))) {
        library.delete(id); // moved, renamed or on a drive that is not plugged in: missing (the link is kept)
        soonEmit();
        return null;
      }
      if (rec.kind === 'audio' && lightDuration > 0) rec.duration = lightDuration;
      rec.loaded = true;
      rec.lastUse = now();
      soonEmit();
      return rec;
    }
    if (!row || !row.blob) {
      // the light record outlived its file: it is really missing now
      library.delete(id);
      mediaDB.deleteMeta(id);
      soonEmit();
      return null;
    }
    rec.blob = row.blob;
    rec.url = URL.createObjectURL(row.blob);
    const lightDuration = rec.duration;
    const ok = await loadElement(rec);
    if (!ok) {
      // fallback: the eager path, which reads and analyses the file from scratch under the same id
      URL.revokeObjectURL(rec.url);
      rec.url = null;
      rec.blob = null;
      library.delete(id);
      try {
        return await addMedia(row.blob, row.name || rec.name, { kind: row.kind, source: row.source, attribution: row.attribution, path: row.path }, { persist: false, id, cached: row.analysis });
      } catch (e) {
        console.warn('Could not open', rec.name, e);
        soonEmit();
        return null;
      }
    }
    if (rec.kind === 'audio' && lightDuration > 0) rec.duration = lightDuration; // the decoded length, not the element's guess
    rec.loaded = true;
    rec.lastUse = now();
    soonEmit();
    return rec;
  })().finally(() => opening.delete(id));
  opening.set(id, p);
  return p;
}

/** Open several files, a few at a time. onProgress(done, total). Resolves the records that opened. */
export async function ensureMany(ids, onProgress = null) {
  const list = [...new Set(ids)].filter((id) => library.has(id));
  const need = list.filter((id) => library.get(id).loaded === false);
  let done = 0;
  let next = 0;
  if (onProgress && need.length) onProgress(0, need.length);
  const worker = async () => {
    while (next < need.length) {
      await ensureLoaded(need[next++]);
      if (onProgress) onProgress(++done, need.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, need.length) }, worker));
  return list.map((id) => library.get(id)).filter(Boolean);
}

/** Every library id that some saved data (a project, a design, a song) points at. */
export function idsIn(...roots) {
  const out = new Set();
  const seen = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      if (library.has(v)) out.add(v);
    } else if (v && typeof v === 'object' && !seen.has(v)) {
      seen.add(v);
      for (const k of Array.isArray(v) ? v.keys() : Object.keys(v)) walk(v[k]);
    }
  };
  roots.forEach(walk);
  return out;
}

/** Open every file a project uses (before an export, or when a project is opened). */
export const ensureProjectMedia = (p, onProgress = null) => ensureMany([...idsIn(p)], onProgress);

/**
 * Before an export: the video elements the edit's clips play from have their first frame (a file opened a moment
 * ago is still loading, and the recording would start on empty frames). Waits at most `ms` per clip.
 */
export async function primeClipElements(p, ms = 6000) {
  const clips = [...(p.clips || []), ...(p.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips || [])].filter((c) => c && c.kind !== 'image' && c.mediaId);
  await Promise.all(
    clips.map((clip) => {
      const e = clipElement(clip);
      if (!e || e.el.readyState >= 2) return null;
      return new Promise((resolve) => {
        const done = () => (clearTimeout(t), e.el.removeEventListener('loadeddata', done), e.el.removeEventListener('error', done), resolve());
        const t = setTimeout(done, ms);
        e.el.addEventListener('loadeddata', done);
        e.el.addEventListener('error', done);
      });
    }),
  );
}

/** The file's data (a Blob) without keeping it open: for jobs that read a file once (search, transcription). */
export async function blobOf(id) {
  const rec = library.get(id);
  if (!rec) return null;
  if (rec.blob) return rec.blob;
  if (rec.linked) {
    // a linked file is read from disk; a huge one is not read whole (jobs use media.reader)
    if (!desktop || !(rec.size <= LINK_BLOB_MAX)) return null;
    try {
      const r = await fetch(desktop.media.urlFor(id));
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  }
  try {
    const row = await mediaDB.get(id);
    return (row && row.blob) || null;
  } catch {
    return null;
  }
}

/** For the analysis helpers: a file that is not open yet is opened, and onReady runs once it is. True while waiting. */
function waitForFile(rec, onReady) {
  if (!rec || rec.loaded !== false) return false;
  ensureLoaded(rec.id).then((r) => r && onReady && onReady());
  return true;
}

/** Let go of an open photo, video or song: its element, object URL and blob. The light record stays. */
export function releaseMedia(id) {
  const rec = library.get(id);
  if (!rec || rec.loaded === false || !isLazyKind(rec.kind) || (!rec.blob && !rec.linked)) return false;
  if (rec.el && rec.el.pause) {
    rec.el.pause();
    rec.el.removeAttribute('src');
    rec.el.load();
  }
  for (const [cid, entry] of clipEls) {
    if (entry.mediaId !== id) continue;
    entry.el.pause();
    entry.el.removeAttribute('src');
    entry.el.load();
    clipEls.delete(cid);
  }
  if (rec.url) URL.revokeObjectURL(rec.url);
  rec.el = null;
  rec.url = null;
  rec.blob = null;
  rec.loaded = false;
  rec.vizCache = null; // features are rebuilt from the file when it is used again
  rec.drumCache = null;
  return true;
}

/**
 * Release every open photo, video and song that the open project or screen does not use: not in `keep`
 * and not used since `before` (performance.now() ms). Returns how many were released.
 */
export function releaseUnused(keep = new Set(), before = now()) {
  const ids = pickRelease(library.values(), { keep, before });
  ids.forEach(releaseMedia);
  return ids.length;
}

/** Counts for the storage panel and the checks: { total, loaded } (loaded = photos, videos and songs open now). */
export function loadedCount() {
  let n = 0;
  for (const r of library.values()) if (r.loaded !== false && isLazyKind(r.kind)) n++;
  return { total: library.size, loaded: n };
}

/**
 * Bring the saved files back. A photo, video or song with a light record (written since this version) comes back
 * without reading its file: the file is opened when it is used. Everything else (tabs, MIDI, fonts, and files saved
 * by an older version) is read and analysed as before, and older files get their light record written once, in the
 * background, so the next visit is light too. When the light records can't be read at all, every file is read
 * (the old path). `onProgress(done, total)` is called as files arrive.
 */
export async function restoreMedia({ onProgress = null } = {}) {
  let metas = null;
  let keys = null;
  try {
    [metas, keys] = await Promise.all([mediaDB.metas(), mediaDB.keys()]);
  } catch (e) {
    console.warn('Light records unavailable, reading every file', e);
    metas = null;
  }
  let heavy; // ids (or whole rows) read the old way
  if (metas && keys) {
    const byId = new Map(metas.map((m) => [m.id, m]));
    const kept = new Set(keys);
    heavy = [];
    for (const id of keys) {
      const m = byId.get(id);
      if (lightUsable(m)) {
        library.set(id, withOpen(recordFromLight(m)));
        remember(nameIndex(), id, { name: m.name, path: m.path, kind: m.kind });
      } else heavy.push(id);
    }
    for (const m of metas) if (!kept.has(m.id)) mediaDB.deleteMeta(m.id); // its file is gone
  } else {
    heavy = await mediaDB.all();
  }
  // a few files at a time: decoding runs off the main thread, so four in flight cut the wait on a big library
  // shortcut: fixed pool of 4; the first visit after this change still decodes every older file once
  let next = 0;
  let done = library.size;
  const total = library.size + heavy.length;
  if (onProgress && done) onProgress(done, total);
  const backfill = [];
  namesHeld++;
  const worker = async () => {
    while (next < heavy.length) {
      const item = heavy[next++];
      let r = item;
      try {
        if (typeof item === 'string') r = await mediaDB.get(item);
        if (r && r.linked) {
          // read the old way (no usable light record): open it from disk and write its light record
          const rec = withOpen({ id: r.id, name: r.name, kind: r.kind, blob: null, source: r.source || 'upload', attribution: r.attribution || null, path: r.path || '', size: 0, type: '', addedAt: 0, duration: 0, ready: false, loaded: true, lastUse: now() });
          if (!(await openLinked(rec))) throw new Error('linked file missing');
          useAnalysis(rec, r.analysis);
          rec.thumb = r.analysis && r.analysis.thumb !== undefined ? r.analysis.thumb : await makeThumb(rec);
          rec.ready = true;
          library.set(rec.id, rec);
          remember(nameIndex(), rec.id, { name: rec.name, path: rec.path, kind: rec.kind });
          backfill.push({ rec, analysis: false });
          if (onProgress) onProgress(++done, total);
          continue;
        }
        if (!r || !r.blob) throw new Error('no file');
        const rec = await addMedia(r.blob, r.name, { kind: r.kind, source: r.source, attribution: r.attribution, path: r.path }, { persist: false, id: r.id, cached: r.analysis });
        backfill.push({ rec, analysis: !r.analysis && !!analysisOf(rec) });
      } catch (e) {
        console.warn('Could not restore', (r && r.name) || item, e);
      }
      if (onProgress) onProgress(++done, total);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, heavy.length) }, worker));
  } finally {
    namesHeld--;
    saveNames();
  }
  if (library.size) emit();
  // one at a time and after everything else, so it never competes with the first screen
  (async () => {
    for (const { rec, analysis } of backfill) {
      if (library.get(rec.id) !== rec) continue;
      await new Promise((res) => setTimeout(res, 50));
      if (analysis) await mediaDB.put(stored(rec)).catch(() => {}); // the file is already stored; only the shortcut is lost
      await mediaDB.putMeta(lightOf(rec, analysisOf(rec))).catch(() => {}); // the next visit starts without reading it
    }
  })();
}

/**
 * Delete files from the library and from this browser (the Clean up panel). They leave the library at once; the
 * stored files are deleted after `undoMs` (or when the page is closed), so undo() just puts the records back
 * (no file is read again). Resolves undo(), which resolves how many came back (0 once the time is up).
 */
export async function removeFiles(ids, { undoMs = 15000 } = {}) {
  const held = [];
  for (const id of ids) {
    const rec = library.get(id);
    if (!rec) continue;
    releaseMedia(id);
    library.delete(id);
    held.push(rec);
  }
  if (held.length) emit();
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    for (const r of held) {
      mediaDB.delete(r.id);
      if (r.linked && desktop) desktop.media.unlink(r.id).catch(() => {}); // only the link: the file stays where it is
    }
  };
  const timer = setTimeout(commit, undoMs);
  if (typeof addEventListener === 'function') addEventListener('pagehide', commit, { once: true });
  return async () => {
    if (settled) return 0;
    settled = true;
    clearTimeout(timer);
    for (const r of held) if (!library.has(r.id)) library.set(r.id, r);
    emit();
    return held.length;
  };
}

export function clearMedia() {
  for (const rec of library.values()) {
    if (rec.url) URL.revokeObjectURL(rec.url);
    if (rec.linked && desktop) desktop.media.unlink(rec.id).catch(() => {});
  }
  library.clear();
  mediaDB.clear();
  emit();
}

/** Each clip gets its own <video> element so two clips can share one source file. */
const clipEls = new Map(); // clipId -> {el, mediaId}
export function clipElement(clip) {
  const rec = media.get(clip.mediaId); // opens the file when it is not open yet
  if (!rec || rec.kind !== 'video' || !rec.url) return null;
  let entry = clipEls.get(clip.id);
  if (!entry || entry.mediaId !== clip.mediaId || entry.url !== rec.url) {
    if (entry) entry.el.pause();
    const el = document.createElement('video');
    el.preload = 'auto';
    el.playsInline = true;
    el.muted = true;
    el.src = rec.url;
    entry = { el, mediaId: clip.mediaId, url: rec.url, audioNode: null };
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
