// Personal sound library: sound clips stored in this browser (IndexedDB), kept across projects.
import { uid } from './core.js';

const DB = 'pvm-sounds';
const STORE = 'sounds';
export const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm|aif|aiff)$/i;

let dbp = null;
function db() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function run(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Storage full or blocked'));
      }),
  );
}

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
let cache = null;

export const soundLib = {
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async all() {
    if (!cache) cache = ((await run('readonly', (s) => s.getAll())) || []).sort((a, b) => b.addedAt - a.addedAt);
    return cache;
  },
  async get(id) {
    return (await soundLib.all()).find((s) => s.id === id) || null;
  },
  async put(rec) {
    await run('readwrite', (s) => s.put(rec));
    cache = null;
    emit();
    return rec;
  },
  async update(id, patch) {
    const rec = await soundLib.get(id);
    if (!rec) return null;
    return soundLib.put({ ...rec, ...patch });
  },
  async remove(id) {
    await run('readwrite', (s) => s.delete(id));
    cache = null;
    emit();
  },
  async clear() {
    await run('readwrite', (s) => s.clear());
    cache = null;
    emit();
  },
};

/** Duration from metadata only (fast; no full decode). */
export function probeDuration(blob) {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const done = (v) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(-1);
    setTimeout(() => done(null), 8000);
    a.src = url;
  });
}

export const isAudioFile = (f) => (f.type && f.type.startsWith('audio/')) || AUDIO_EXT.test(f.name || '');

/** Tags from the file name and folder: "Impacts/Big Boom 02.wav" -> ["impacts", "big", "boom"]. */
export function tagsFromPath(path) {
  return [
    ...new Set(
      String(path)
        .replace(AUDIO_EXT, '')
        .toLowerCase()
        .split(/[\\/_\-\s.()[\]]+/)
        .filter((w) => w.length > 1 && !/^\d+$/.test(w)),
    ),
  ].slice(0, 12);
}

/**
 * Add many files. Skips non-audio, files over the size limit and duplicates (same name + size).
 * Returns { added, skipped: [{name, reason}] }.
 */
export async function importSounds(files, { onProgress, maxBytes = 50 * 1024 * 1024, source = 'upload', attribution = null } = {}) {
  const existing = await soundLib.all();
  const seen = new Set(existing.map((s) => `${s.name}|${s.size}`));
  const added = [];
  const skipped = [];
  let i = 0;
  for (const f of files) {
    i += 1;
    onProgress && onProgress(i, files.length, f.name);
    const name = f.name || 'sound';
    if (!isAudioFile(f)) {
      skipped.push({ name, reason: 'not an audio file' });
      continue;
    }
    if (f.size > maxBytes) {
      skipped.push({ name, reason: `over ${Math.round(maxBytes / 1048576)} MB` });
      continue;
    }
    const key = `${name}|${f.size}`;
    if (seen.has(key)) {
      skipped.push({ name, reason: 'already in your library' });
      continue;
    }
    const duration = await probeDuration(f);
    if (duration === -1) {
      skipped.push({ name, reason: 'this browser cannot play it' });
      continue;
    }
    const rec = {
      id: uid('snd'),
      name: name.replace(AUDIO_EXT, ''),
      fileName: name,
      size: f.size,
      type: f.type || 'audio/mpeg',
      blob: f,
      duration,
      tags: tagsFromPath(f.webkitRelativePath || name),
      source,
      attribution,
      favorite: false,
      addedAt: Date.now() + i, // keeps upload order stable
    };
    try {
      await run('readwrite', (s) => s.put(rec));
    } catch (e) {
      skipped.push({ name, reason: 'browser storage is full' });
      break;
    }
    seen.add(key);
    added.push(rec);
  }
  cache = null;
  emit();
  return { added, skipped };
}

/** Ask the browser not to evict the library under storage pressure; returns usage info. */
export async function storageInfo() {
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: est ? est.usage : null, quota: est ? est.quota : null, persisted };
}
export async function requestPersistence() {
  return navigator.storage && navigator.storage.persist ? navigator.storage.persist() : false;
}

/** Filter + sort for the library list. */
export function filterSounds(list, query = '', { favoritesOnly = false } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((s) => !favoritesOnly || s.favorite)
    .filter((s) => words.every((w) => s.name.toLowerCase().includes(w) || (s.tags || []).some((t) => t.startsWith(w))))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.addedAt - a.addedAt);
}
