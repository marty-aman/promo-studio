// Media library: turns uploaded or downloaded blobs into playable elements.
import { uid, computePeaks, energyEnvelope } from './core.js';
import { mediaDB } from './state.js';
import { TAB_EXTENSIONS, parseTabBytes, tabTracks, buildTabTimeline } from './tab.js';
import { drumTracks, drumTimelineFromScore, drumHitsFromAudio, drumTimelineFromMidi } from './drums.js';
import { analyseAudioBlob } from './viz.js';
import { ensureMattes } from './bgremove.js';
import { MIDI_EXTENSIONS, parseMidi } from './midi.js';
import { remember, trim, mergeIndex } from './mediamatch.js';

const library = new Map(); // id -> record
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

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
const saveNames = () => {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(trim(nameIndex(), (id) => library.has(id))));
  } catch {
    /* storage full: names are only kept for this visit */
  }
};

export const media = {
  get: (id) => library.get(id) || null,
  has: (id) => library.has(id),
  all: () => [...library.values()],
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
    rec.waveLoading = analyseAudio(rec).then(() => {
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
  if (!rec || !rec.blob) return null;
  const s = Math.round((sensitivity ?? 0.5) * 20) / 20;
  return background(`drums:${s}`, rec, 'drumCache', () => drumHitsFromAudio(rec.blob, { sensitivity: s }), onReady);
}

/** Resolve when every analysis a project needs is finished (used before exporting). */
export async function ensureLayerAnalyses(p) {
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
    if (rec.kind !== 'video' || !rec.duration) rec.duration = audio.duration; // a video keeps its picture's length
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
    if (kind === 'tab') throw new Error(`Could not read ${name}. Guitar Pro 3–8 (.gp3/.gp4/.gp5/.gpx/.gp) and MusicXML files with a guitar, bass or drum track are supported.`);
    if (kind === 'midi') throw new Error(`Could not read ${name}: it isn’t a MIDI file with notes in it.`);
    throw new Error(`Could not open ${name}. Your browser may not support this format.`);
  }
  if (kind === 'audio' || (kind === 'video' && meta.analyse)) await analyseAudio(rec);
  rec.thumb = await makeThumb(rec);
  rec.ready = true;
  rec.path = meta.path || blob.webkitRelativePath || '';
  library.set(rec.id, rec);
  remember(nameIndex(), rec.id, { name, path: rec.path, kind });
  saveNames();
  if (persist) {
    mediaDB.put({ id: rec.id, name, kind, blob, source: rec.source, attribution: rec.attribution, path: rec.path });
  }
  emit();
  return rec;
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
  URL.revokeObjectURL(rec.url);
  library.delete(id);
  mediaDB.delete(id);
  emit();
}

export async function restoreMedia() {
  const recs = await mediaDB.all();
  for (const r of recs) {
    try {
      await addMedia(r.blob, r.name, { kind: r.kind, source: r.source, attribution: r.attribution, path: r.path }, { persist: false, id: r.id });
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
