// The Projects library: saved Video Studio edits and Photo Studio designs you can find, open, copy, recover and
// reuse. Pure functions (versions, search and sort, the projects file, templates, media swaps, storage level);
// the browser storage is in projectstore.js and the dialog in projects-ui.js.
import { normalizeProject } from './state.js';
import { normalizeDoc } from './photo/model.js';
import { referencedIds } from './mediamatch.js';
import { PROJECT_FILE_KIND, describeProject } from './projectfile.js';

export const LIBRARY_FILE_KIND = 'promo-studio-projects';
export const LIBRARY_FILE_VERSION = 1;
/** Versions kept per project, and the least time between two automatic ones. */
export const VERSION_CAP = 10;
export const VERSION_GAP_MS = 2 * 60 * 1000;

const clone = (x) => JSON.parse(JSON.stringify(x));
const newId = (kind, now = Date.now()) => `${kind === 'photo' ? 'doc' : 'prj'}_${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const makeProjectId = (now = Date.now()) => newId('video', now);

/**
 * A version list (newest first) with `data` in front. An identical copy of the newest one is not added again.
 * Returns a new list of at most `cap`; the newest version is never the one dropped.
 */
export function pushVersion(list, data, now = Date.now(), cap = VERSION_CAP) {
  const prev = Array.isArray(list) ? list : [];
  if (prev[0] && JSON.stringify(prev[0].data) === JSON.stringify(data)) return prev.slice(0, cap);
  return [{ at: now, data: clone(data) }, ...prev].slice(0, cap);
}

/** Should an automatic save also keep a version? Yes when forced, when there is none, or after VERSION_GAP_MS. */
export const dueVersion = (list, now = Date.now(), force = false, gap = VERSION_GAP_MS) => force || !list || !list.length || now - list[0].at >= gap;

/** "My promo" -> "My promo copy", "My promo copy" -> "My promo copy 2" (against the names already used). */
export function copyName(name, used = []) {
  const base = String(name || 'Untitled').replace(/ copy( \d+)?$/, '');
  const taken = new Set(used);
  if (!taken.has(`${base} copy`)) return `${base} copy`;
  for (let i = 2; ; i++) if (!taken.has(`${base} copy ${i}`)) return `${base} copy ${i}`;
}

/** The few facts the list shows for a project: length (s), song, and a short "what is in it". */
export function videoInfo(p, songName = '') {
  return { length: Math.max(0, +p.duration || 0), song: songName || '', what: describeProject(p), aspect: p.aspect || '' };
}
export function photoInfo(d) {
  return { length: 0, song: '', what: `${d.slides > 1 ? `${d.slides} slides · ` : ''}${d.w}×${d.h} · ${(d.layers || []).length} layer${(d.layers || []).length === 1 ? '' : 's'}`, aspect: '' };
}

export const SORTS = [
  ['edited', 'Last edited'],
  ['name', 'Name'],
  ['created', 'Newest first'],
  ['length', 'Longest first'],
];
const t = (s) => (typeof s === 'number' ? s : Date.parse(s || '') || 0);
/** Projects matching `q` (name, song or contents, any case) in the order `sort` asks for. Entries: { name, info, updatedAt, createdAt }. */
export function findProjects(list, q = '', sort = 'edited') {
  const needle = String(q || '').trim().toLowerCase();
  const hit = needle ? list.filter((e) => [e.name, e.info && e.info.song, e.info && e.info.what].some((s) => String(s || '').toLowerCase().includes(needle))) : list.slice();
  const by = {
    edited: (a, b) => t(b.updatedAt) - t(a.updatedAt),
    created: (a, b) => t(b.createdAt) - t(a.createdAt) || t(b.updatedAt) - t(a.updatedAt),
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }),
    length: (a, b) => ((b.info && b.info.length) || 0) - ((a.info && a.info.length) || 0),
  }[sort] || ((a, b) => t(b.updatedAt) - t(a.updatedAt));
  return hit.sort(by);
}

// ---------------------------------------------------------------- the projects file
/**
 * The text of a projects file: video entries ({ id, name, createdAt, updatedAt, thumb, info, data }) and photo designs,
 * the names of every media file they use (so Replace missing files can ask for them), and which of those files this
 * browser did not have when it was saved (`missing`). Media themselves stay out: they can be gigabytes.
 */
export function makeLibraryFile({ video = [], photo = [] } = {}, names = {}, isPresent = () => true, now = new Date()) {
  const vids = video.map((e) => ({ id: e.id, name: e.name, createdAt: e.createdAt || '', updatedAt: e.updatedAt || '', thumb: e.thumb || '', info: e.info || null, data: e.data }));
  const docs = photo.map((d) => clone(d));
  const ids = [...referencedIds(vids.map((e) => e.data), docs)];
  const mediaNames = {};
  for (const id of ids) if (names[id]) mediaNames[id] = names[id];
  return JSON.stringify({ kind: LIBRARY_FILE_KIND, version: LIBRARY_FILE_VERSION, savedAt: now.toISOString(), mediaNames, missing: ids.filter((id) => !isPresent(id)), video: vids, photo: docs }, null, 1);
}

export function libraryFileName(what = 'projects', now = new Date()) {
  const slug = String(what || 'projects').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projects';
  return `${slug}-${now.toISOString().slice(0, 10)}.projects.json`;
}

/**
 * Read a projects file, or a single Video Studio project file. Returns { video: [entries], photo: [docs], names };
 * throws an Error with a sentence for the user. Damaged entries are skipped rather than failing the whole file.
 */
export function parseLibraryFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a projects file.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('That file isn’t a projects file.');
  const names = raw.mediaNames && typeof raw.mediaNames === 'object' && !Array.isArray(raw.mediaNames) ? raw.mediaNames : {};
  if (raw.kind === PROJECT_FILE_KIND && raw.project && typeof raw.project === 'object') {
    const data = normalizeProject(clone(raw.project));
    return { video: [{ id: '', name: data.name || 'Untitled', createdAt: raw.savedAt || '', updatedAt: raw.savedAt || '', thumb: '', info: null, data }], photo: [], names };
  }
  if (raw.kind !== LIBRARY_FILE_KIND) throw new Error('That file isn’t a projects file.');
  if (raw.version > LIBRARY_FILE_VERSION) throw new Error('That projects file was saved by a newer version of the app. Update the app and open it again.');
  return { ...readProjects(raw), names };
}

/** The checked video entries and photo designs of a projects file or a backup's `projects` ({ video, photo }); damaged ones are left out. */
export function readProjects(raw) {
  if (!raw || typeof raw !== 'object') return { video: [], photo: [] };
  const video = (Array.isArray(raw.video) ? raw.video : [])
    .filter((e) => e && typeof e === 'object' && e.data && typeof e.data === 'object' && ['clips', 'lyrics', 'texts', 'audioTracks'].every((k) => e.data[k] == null || Array.isArray(e.data[k])))
    .map((e) => {
      const data = normalizeProject(clone(e.data));
      return { id: typeof e.id === 'string' ? e.id : '', name: String(e.name || data.name || 'Untitled').slice(0, 120), createdAt: e.createdAt || '', updatedAt: e.updatedAt || '', thumb: typeof e.thumb === 'string' && e.thumb.startsWith('data:image/') ? e.thumb : '', info: e.info && typeof e.info === 'object' ? e.info : null, data };
    });
  const photo = (Array.isArray(raw.photo) ? raw.photo : []).map((d) => normalizeDoc(d)).filter(Boolean);
  return { video, photo };
}

/**
 * Which incoming items to add next to `existing` (both [{ id, ... }]), never replacing anything: an item whose id is
 * already here with the same content is skipped; one whose id is here with other content (or has no id) comes in
 * under a new id. `same(a, b)` compares content. Returns [{ item, renamed }].
 */
export function mergeIncoming(existing, incoming, same, kind = 'video', now = Date.now()) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const out = [];
  incoming.forEach((it, i) => {
    const here = it.id && byId.get(it.id);
    if (here && same(here, it)) return;
    const fresh = !it.id || here || out.some((o) => o.item.id === it.id);
    out.push({ item: fresh ? { ...it, id: newId(kind, now + i) } : it, renamed: !!here });
  });
  return out;
}

// ---------------------------------------------------------------- templates and media swaps
/**
 * A new project made from a saved one: the same layout, texts, styles and timing, a new identity. The media stay
 * as they are until you swap them (mediaSlots + swapMedia).
 */
export function templateFrom(kind, data, name = '') {
  const c = clone(data);
  if (kind === 'photo') {
    c.id = '';
    c.updatedAt = '';
    c.name = name || `${data.name} (from template)`;
    return normalizeDoc(c);
  }
  delete c.projectId;
  c.name = name || `${data.name || 'Untitled'} (from template)`;
  return normalizeProject(c);
}

/** Where each media id is used, in words, for the swap list: [{ id, where }] in the order they first appear. */
export function mediaSlots(kind, data) {
  const out = new Map();
  const add = (id, where) => id && !out.has(id) && out.set(id, where);
  if (kind === 'photo') {
    (data.layers || []).forEach((L, i) => L.type === 'image' && add(L.mediaId, L.name || `Picture ${i + 1}`));
  } else {
    if (data.song) add(data.song.mediaId, 'Song');
    (data.clips || []).forEach((c, i) => add(c.mediaId, `Clip ${i + 1}`));
    (data.audioTracks || []).forEach((a, i) => add(a.mediaId, `Audio ${i + 1}`));
    (data.layers || []).forEach((L) => {
      (L.clips || []).forEach((c, i) => add(c.mediaId, `${L.name || 'Video layer'} clip ${i + 1}`));
      add(L.mediaId, L.name || 'Layer');
    });
    if (data.endCard) add(data.endCard.coverMediaId, 'End card cover');
    if (data.look && data.look.watermark) add(data.look.watermark.mediaId, 'Watermark');
  }
  for (const id of referencedIds(data)) add(id, 'Other');
  return [...out].map(([id, where]) => ({ id, where }));
}

/** Every use of a media id in `data` (anywhere, any depth) replaced by its value in `map` ({ oldId: newId }). In place; returns the count. */
export function swapMedia(data, map) {
  let n = 0;
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const k of Array.isArray(v) ? v.keys() : Object.keys(v)) {
      const x = v[k];
      if (typeof x === 'string' && Object.prototype.hasOwnProperty.call(map, x) && map[x] && map[x] !== x) {
        v[k] = map[x];
        n++;
      } else if (x && typeof x === 'object') walk(x);
    }
  };
  walk(data);
  return n;
}

/**
 * After a swap, a clip whose new file is shorter than its in-point plus length would play past the end: pull its
 * in-point back first, then shorten it. `durationOf(mediaId)` gives seconds or 0 when unknown. Returns clips changed.
 */
export function fitClipsToMedia(p, durationOf) {
  let n = 0;
  const fit = (c) => {
    const src = durationOf(c.mediaId);
    if (!src || !Number.isFinite(src)) return;
    const speed = c.speed || 1;
    const need = (c.in || 0) + (c.duration || 0) * speed;
    if (need <= src + 1e-3) return;
    c.in = Math.max(0, src - (c.duration || 0) * speed);
    if (c.in + (c.duration || 0) * speed > src) c.duration = Math.max(0.1, (src - c.in) / speed);
    n++;
  };
  (p.clips || []).forEach(fit);
  (p.layers || []).forEach((L) => (L.clips || []).forEach(fit));
  return n;
}

// ---------------------------------------------------------------- storage
/**
 * How full the browser's storage for this site is: { pct, free, warn, text }. Warns at 80 % or under 300 MB free.
 * `usage` and `quota` in bytes (null when the browser can't tell).
 */
export function storageLevel(usage, quota) {
  const mb = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(0, Math.round(n / 1048576))} MB`);
  if (!quota || !Number.isFinite(quota)) return { pct: null, free: null, warn: false, text: usage ? `${mb(usage)} used` : 'The browser does not say how much room is left.' };
  const pct = Math.min(1, Math.max(0, (usage || 0) / quota));
  const free = Math.max(0, quota - (usage || 0));
  const warn = pct >= 0.8 || free < 300 * 1048576;
  return { pct, free, warn, text: `${mb(usage || 0)} of ${mb(quota)} used (${Math.round(pct * 100)} %)${warn ? `. Only ${mb(free)} left: download your projects and free some space.` : ''}` };
}
