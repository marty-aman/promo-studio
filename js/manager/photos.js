// An artist's photos: press shots, live photos, behind the scenes. The image files live in the
// shared media library; each artist keeps its own list with a caption, the photographer, tags and a
// star. Up to four can be picked for the press kit. Pure functions, unit tested.
import { mid } from './model.js';
import { parseTags } from '../soundindex.js';

export const EPK_PHOTO_MAX = 4;
export { parseTags };

export function newPhoto(rec, now = Date.now()) {
  return { id: mid('photo'), mediaId: rec.id, caption: '', credit: '', tags: [], favorite: false, addedAt: now };
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
    });
  }
  return out;
}

/** Add photos (newest first), skipping files already on the page. Returns how many were added. */
export function addPhotos(m, recs, now = Date.now()) {
  m.photos ||= [];
  const fresh = [];
  recs.forEach((r, i) => {
    if (m.photos.some((p) => p.mediaId === r.id) || fresh.some((p) => p.mediaId === r.id)) return;
    fresh.push(newPhoto(r, now + recs.length - i)); // a batch keeps the order it was picked in
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
