// An artist's photos: press shots, live photos, behind the scenes. The image files live in the
// shared media library; each artist keeps its own list with a caption, the photographer, tags and a
// star. Up to four can be picked for the press kit. Pure functions, unit tested.
import { mid } from './model.js';
import { parseTags } from '../soundindex.js';

export const EPK_PHOTO_MAX = 4;
export { parseTags };

export function newPhoto(rec, now = Date.now()) {
  return { id: mid('photo'), mediaId: rec.id, caption: '', credit: '', tags: [], favorite: false, addedAt: now, folder: '' };
}

/** Clean a saved list (drops broken entries and repeats of the same file). */
export function normalizePhotos(raw) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!p || typeof p !== 'object' || typeof p.mediaId !== 'string' || seen.has(p.mediaId)) continue;
    seen.add(p.mediaId);
    out.push({
      id: typeof p.id === 'string' ? p.id : mid('photo'),
      mediaId: p.mediaId,
      caption: String(p.caption || ''),
      credit: String(p.credit || ''),
      tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).toLowerCase()).filter(Boolean) : [],
      favorite: !!p.favorite,
      addedAt: +p.addedAt || 0,
      folder: typeof p.folder === 'string' ? p.folder : '',
    });
  }
  return out;
}

/** Add photos (newest first), skipping files already on the page. Returns how many were added. */
export function addPhotos(m, recs, now = Date.now(), folder = '') {
  m.photos ||= [];
  const fresh = [];
  recs.forEach((r, i) => {
    if (m.photos.some((p) => p.mediaId === r.id) || fresh.some((p) => p.mediaId === r.id)) return;
    fresh.push({ ...newPhoto(r, now + recs.length - i), folder }); // a batch keeps the order it was picked in
  });
  m.photos.unshift(...fresh);
  return fresh.length;
}

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/**
 * Filter: words of `q` must each match the caption, credit, a tag or the file name (word prefix);
 * `tag`, `starred` and `epk` (only press-kit photos) narrow it. Starred first, then newest.
 */
export function filterPhotos(list, { q = '', tag = '', starred = false, epk = null, nameOf = () => '' } = {}) {
  const qs = words(q);
  return list
    .filter((p) => (!starred || p.favorite) && (!tag || p.tags.includes(tag)) && (!epk || epk.includes(p.mediaId)))
    .filter((p) => {
      if (!qs.length) return true;
      const hay = [...words(p.caption), ...words(p.credit), ...p.tags.flatMap(words), ...words(nameOf(p.mediaId))];
      return qs.every((w) => hay.some((x) => x.startsWith(w)));
    })
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.addedAt - a.addedAt);
}

export function photoTags(list, max = 16) {
  const n = new Map();
  for (const p of list) for (const t of p.tags) n.set(t, (n.get(t) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([tag, k]) => ({ tag, n: k }));
}

/** Put a photo in the press kit or take it out. Returns false when the kit already has the maximum. */
export function toggleEpkPhoto(band, mediaId, max = EPK_PHOTO_MAX) {
  const cur = Array.isArray(band.epkPhotos) ? band.epkPhotos : [];
  if (cur.includes(mediaId)) {
    band.epkPhotos = cur.filter((x) => x !== mediaId);
    return true;
  }
  if (cur.length >= max) return false;
  band.epkPhotos = [...cur, mediaId];
  return true;
}

/** "Photo: Jo Lee" credit lines for the press kit, in the press kit's photo order. */
export function epkCredits(photos, epkIds) {
  return (epkIds || []).map((id) => photos.find((p) => p.mediaId === id)).map((p) => (p && p.credit.trim() ? `Photo: ${p.credit.trim()}` : ''));
}

// ---------------------------------------------------------------- folders
// Folders can hold folders. A photo is in one folder (or none: `folder` is '').

export const newFolder = (name, parent = '') => ({ id: mid('fold'), name: String(name || 'New folder').trim().slice(0, 60) || 'New folder', parent });

/** Clean a saved folder list: drops broken entries, and parents that don't exist or loop back. */
export function normalizeFolders(raw) {
  const list = (Array.isArray(raw) ? raw : []).filter((f) => f && typeof f.id === 'string' && f.id).map((f) => ({ id: f.id, name: String(f.name || 'Folder').slice(0, 60), parent: typeof f.parent === 'string' ? f.parent : '' }));
  const ids = new Set(list.map((f) => f.id));
  for (const f of list) if (f.parent && !ids.has(f.parent)) f.parent = '';
  // break loops (a folder inside itself, directly or further down)
  for (const f of list) {
    const seen = new Set([f.id]);
    let p = f.parent;
    while (p) {
      if (seen.has(p)) {
        f.parent = '';
        break;
      }
      seen.add(p);
      p = (list.find((x) => x.id === p) || {}).parent || '';
    }
  }
  return list;
}

/** The folders directly inside `parent` ('' = the top), by name. */
export const subfolders = (folders, parent = '') => folders.filter((f) => (f.parent || '') === parent).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

/** From the top down to `id`: [{ id, name }, …] (empty for the top). */
export function folderPath(folders, id) {
  const out = [];
  let cur = folders.find((f) => f.id === id);
  while (cur && out.length < 50) {
    out.unshift(cur);
    cur = folders.find((f) => f.id === cur.parent);
  }
  return out;
}

/** A folder and every folder inside it. */
export function folderTree(folders, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (out.has(f.parent) && !out.has(f.id)) (out.add(f.id), (grew = true));
  }
  return out;
}

/** Photos in a folder; `deep` counts those in its folders too. */
export function photosIn(photos, folders, id = '', { deep = false } = {}) {
  if (!deep) return photos.filter((p) => (p.folder || '') === id);
  if (!id) return photos;
  const tree = folderTree(folders, id);
  return photos.filter((p) => tree.has(p.folder));
}

/** Delete a folder: its photos and folders move up to its parent (nothing is lost). */
export function deleteFolder(m, id) {
  const f = (m.photoFolders || []).find((x) => x.id === id);
  if (!f) return 0;
  let moved = 0;
  for (const p of m.photos) if (p.folder === id) (p.folder = f.parent || ''), moved++;
  for (const x of m.photoFolders) if (x.parent === id) x.parent = f.parent || '';
  m.photoFolders = m.photoFolders.filter((x) => x.id !== id);
  return moved;
}

/** Put photos (by photo id) in a folder. Returns how many moved. */
export function movePhotos(m, ids, folder = '') {
  const want = new Set(ids);
  let n = 0;
  for (const p of m.photos) if (want.has(p.id) && p.folder !== folder) (p.folder = folder), n++;
  return n;
}

/** Move a folder into another one (not into itself or one of its own folders). */
export function moveFolder(m, id, parent = '') {
  const f = (m.photoFolders || []).find((x) => x.id === id);
  if (!f || (parent && folderTree(m.photoFolders, id).has(parent))) return false;
  f.parent = parent;
  return true;
}

// ---------------------------------------------------------------- pages
export const PAGE_SIZES = [24, 48, 96, 200];
const PAGE_KEY = 'pvm.photos.pageSize';
export function loadPageSize(storage = globalThis.localStorage) {
  try {
    const n = +storage.getItem(PAGE_KEY);
    return PAGE_SIZES.includes(n) ? n : 48;
  } catch {
    return 48;
  }
}
export function savePageSize(n, storage = globalThis.localStorage) {
  try {
    storage.setItem(PAGE_KEY, String(n));
  } catch {
    /* private mode: it lasts for this visit */
  }
}

/** One page of a list: { items, page (from 1, clamped), pages, from, to, total }. */
export function paginate(list, page = 1, size = 48) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const start = (p - 1) * size;
  return { items: list.slice(start, start + size), page: p, pages, from: total ? start + 1 : 0, to: Math.min(total, start + size), total };
}

/**
 * Pinned items on top, then one page of the rest: { pinned, ...paginate(rest) }. `pinned` is a list
 * of ids kept in its own order (missing ids and repeats are skipped), so what you picked never
 * hides on another page.
 */
export function pinnedPage(list, pinned, page = 1, size = 48, idOf = (x) => x.id) {
  const byId = new Map(list.map((x) => [idOf(x), x]));
  const top = [...new Set(pinned || [])].map((id) => byId.get(id)).filter(Boolean);
  const on = new Set(top.map(idOf));
  return { pinned: top, ...paginate(list.filter((x) => !on.has(idOf(x))), page, size) };
}

// ---------------------------------------------------------------- tags for many photos
/**
 * Add and remove tags on many photos at once (by photo id). Tags are cleaned like the tag field
 * (lower case, no #). Returns how many photos changed.
 */
export function tagPhotos(m, ids, add = [], remove = []) {
  const want = new Set(ids);
  const plus = parseTags(Array.isArray(add) ? add.join(',') : add);
  const minus = new Set(parseTags(Array.isArray(remove) ? remove.join(',') : remove));
  let n = 0;
  for (const p of m.photos) {
    if (!want.has(p.id)) continue;
    const next = [...new Set([...p.tags.filter((t) => !minus.has(t)), ...plus.filter((t) => !minus.has(t))])];
    if (next.join('|') !== p.tags.join('|')) (p.tags = next), n++;
  }
  return n;
}

/** "live, 2026, -old" → { add: ['live', '2026'], remove: ['old'] } (a leading minus takes a tag off). */
export function parseTagEdit(text) {
  const parts = String(text || '').split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
  return { add: parseTags(parts.filter((x) => !x.startsWith('-')).join(',')), remove: parseTags(parts.filter((x) => x.startsWith('-')).map((x) => x.slice(1)).join(',')) };
}

/**
 * What a click does to the ticked photos: a plain click on the tick toggles one; Shift ticks
 * everything from the last one you clicked to this one (in the order shown); Ctrl or Cmd toggles
 * one. Returns the new selection and the new anchor.
 */
export function clickSelect(selected, order, id, { shift = false, anchor = null } = {}) {
  const next = new Set(selected);
  if (shift && anchor && order.includes(anchor)) {
    const a = order.indexOf(anchor);
    const b = order.indexOf(id);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i++) next.add(order[i]);
    return { selected: next, anchor };
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { selected: next, anchor: id };
}
