// Several artists in one manager. Each artist keeps its own profile (band), songs, shows, posts and
// money; venues, scene bands and contacts are one shared address book. The pages work on a flat
// "view" of the current artist (the same shape as before), and the view is folded back into the
// workspace when it is saved or when you switch artists. Pure functions, unit tested.
import { MANAGER_KEY, normalizeManager, newManager, agenda, nextUp, mid } from './model.js';

export const WORKSPACE_VERSION = 2;
export const ARTIST_KEYS = ['band', 'songs', 'covers', 'shows', 'posts', 'money', 'photos', 'photoFolders', 'tours', 'stats', 'releases', 'events', 'outreach', 'merch', 'fans', 'captionBank', 'availability'];
export const SHARED_KEYS = ['venues', 'bands', 'contacts', 'playlists', 'playlistsOff', 'seeded', 'opportunities'];

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/** A workspace from a single-artist manager (what was saved before artists existed). */
export function workspaceFrom(m) {
  const n = normalizeManager(m);
  const id = mid('artist');
  return { version: WORKSPACE_VERSION, current: id, artists: [{ id, ...pick(n, ARTIST_KEYS) }], shared: pick(n, SHARED_KEYS) };
}

export function normalizeWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return workspaceFrom(newManager());
  if (!Array.isArray(raw.artists)) return workspaceFrom(raw); // an old single-artist save
  const shared = normalizeManager({ ...(raw.shared || {}) });
  const artists = raw.artists
    .filter((a) => a && typeof a === 'object' && typeof a.id === 'string')
    .map((a) => ({ id: a.id, ...pick(normalizeManager({ ...a }), ARTIST_KEYS) }));
  if (!artists.length) return workspaceFrom({ ...shared });
  return { version: WORKSPACE_VERSION, current: artists.some((a) => a.id === raw.current) ? raw.current : artists[0].id, artists, shared: pick(shared, SHARED_KEYS) };
}

/** The flat view the pages edit: the artist's own parts plus the shared address book. */
export function viewOf(ws, id = ws.current) {
  const a = ws.artists.find((x) => x.id === id) || ws.artists[0];
  return normalizeManager({ ...ws.shared, ...pick(a, ARTIST_KEYS), artistId: a.id });
}

/** Fold an edited view back in: its artist parts to that artist, the shared parts to everyone. */
export function mergeView(ws, view) {
  const id = view.artistId || ws.current;
  return {
    ...ws,
    artists: ws.artists.map((a) => (a.id === id ? { id, ...pick(view, ARTIST_KEYS) } : a)),
    shared: pick(view, SHARED_KEYS),
  };
}

/** Add an artist with a fresh profile; returns [workspace, newId]. */
export function addArtist(ws, name = 'New artist', city = 'Seattle') {
  const base = newManager();
  const id = mid('artist');
  const band = { ...base.band, name: String(name).trim().slice(0, 80) || 'New artist', city, genres: '', bio: '', links: {} };
  return [{ ...ws, artists: [...ws.artists, { id, ...pick({ ...base, band }, ARTIST_KEYS) }] }, id];
}

/** Remove an artist (never the last one). */
export function removeArtist(ws, id) {
  if (ws.artists.length <= 1) return ws;
  const artists = ws.artists.filter((a) => a.id !== id);
  return { ...ws, artists, current: ws.current === id ? artists[0].id : ws.current };
}

// ---- the profile photo's framing: band.photoPos = { x, y, zoom }
export const PHOTO_POS = { x: 50, y: 50, zoom: 1 };
const clampN = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** A checked framing: x and y are the photo's focal point in % (0–100), zoom 1–3. Anything missing is the centre at 1×. */
export const photoPos = (p) => (p && typeof p === 'object' ? { x: clampN(p.x, 0, 100, 50), y: clampN(p.y, 0, 100, 50), zoom: clampN(p.zoom, 1, 3, 1) } : { ...PHOTO_POS });
/**
 * Inline style for a profile photo <img> that fills its frame (object-fit: cover; the frame clips it):
 * which part shows, and how far it's zoomed in around that point.
 */
export function photoStyle(p) {
  const { x, y, zoom } = photoPos(p);
  const at = `${+x.toFixed(2)}% ${+y.toFixed(2)}%`;
  return { objectFit: 'cover', objectPosition: at, transformOrigin: at, transform: zoom === 1 ? '' : `scale(${+zoom.toFixed(3)})` };
}
/** The same as CSS text, for the downloaded press kit. */
export const photoStyleCss = (p) => {
  const s = photoStyle(p);
  return `object-fit:cover;object-position:${s.objectPosition};transform-origin:${s.transformOrigin}${s.transform ? `;transform:${s.transform}` : ''}`;
};
/** Move the focal point by a drag of (dx, dy) px in a frame of (w, h) px: dragging right shows more of the left. */
export function nudgePhoto(p, dx, dy, w = 100, h = 100) {
  const q = photoPos(p);
  return photoPos({ ...q, x: q.x - (dx / Math.max(1, w)) * (100 / q.zoom), y: q.y - (dy / Math.max(1, h)) * (100 / q.zoom) });
}

/**
 * Undo deleting an artist: `before` is the workspace just before the delete, `now` the workspace
 * since. The artist goes back in its old place and becomes the open one; the other artists keep their
 * edits since, an artist added since stays, and the shared address book is today's.
 */
export function restoreArtist(before, now, id) {
  const gone = before.artists.find((x) => x.id === id);
  if (!gone || now.artists.some((x) => x.id === id)) return now;
  const artists = [...before.artists.map((x) => (x.id === id ? x : now.artists.find((y) => y.id === x.id))).filter(Boolean), ...now.artists.filter((y) => !before.artists.some((x) => x.id === y.id))];
  return { ...now, artists, current: id };
}

export const artistList = (ws) => ws.artists.map((a) => ({ id: a.id, name: a.band.name || 'Untitled artist', city: a.band.city || '', theme: a.band.theme || '', logoId: a.band.logoId || null, photoId: a.band.photoId || null, photoPos: photoPos(a.band.photoPos) }));

/** The next two weeks for every artist, each item tagged with its artist. */
export function combinedAgenda(ws, from, days = 14) {
  return ws.artists
    .flatMap((a) => agenda(viewOf(ws, a.id), from, days).map((it) => ({ ...it, artistId: a.id, artist: a.band.name || 'Artist' })))
    .sort((x, y) => x.date.localeCompare(y.date));
}

/** Next show and release across artists. */
export function combinedNext(ws, today) {
  let show = null;
  let release = null;
  for (const a of ws.artists) {
    const n = nextUp(viewOf(ws, a.id), today);
    if (n.show && (!show || n.show.date < show.show.date)) show = { show: n.show, artistId: a.id, artist: a.band.name };
    if (n.release && (!release || n.release.releaseDate < release.release.releaseDate)) release = { release: n.release, artistId: a.id, artist: a.band.name };
  }
  return { show, release };
}

export function loadWorkspace() {
  try {
    return normalizeWorkspace(JSON.parse(localStorage.getItem(MANAGER_KEY)));
  } catch {
    return workspaceFrom(newManager());
  }
}
export function saveWorkspace(ws) {
  try {
    localStorage.setItem(MANAGER_KEY, JSON.stringify(ws));
    return true;
  } catch {
    return false;
  }
}

/** Backups hold every artist. Old single-artist backups still restore (as one artist). */
export const workspaceBackup = (ws, mediaNames = null, opts = {}) => {
  // workspaceBackup(ws, { withoutFans: true }) also works: an options object in the second place
  if (mediaNames && mediaNames.withoutFans !== undefined && opts && !Object.keys(opts).length) [mediaNames, opts] = [null, mediaNames];
  const out = opts && opts.withoutFans ? { ...ws, artists: ws.artists.map((a) => ({ ...a, fans: [] })) } : ws;
  return workspaceJson(out, mediaNames, opts && opts.projects);
};
// `projects`: the Projects library ({ video: [saved edits], photo: [designs] }), left out when empty
const workspaceJson = (ws, mediaNames, projects = null) => {
  const hasProjects = projects && ((projects.video || []).length || (projects.photo || []).length);
  return JSON.stringify({ promoStudioManager: WORKSPACE_VERSION, savedAt: new Date().toISOString(), ...ws, ...(mediaNames && Object.keys(mediaNames).length ? { mediaNames } : {}), ...(hasProjects ? { projects } : {}) }, null, 1);
};
/** The Projects library a backup carries ({ video, photo }), or null (older backups have none). */
export function backupProjects(text) {
  try {
    const p = JSON.parse(text).projects;
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}
/** The file names a backup carries for the media its songs and photos use (id -> [name, path, kind]), or {}. */
export function backupMediaNames(text) {
  try {
    const n = JSON.parse(text).mediaNames;
    return n && typeof n === 'object' && !Array.isArray(n) ? n : {};
  } catch {
    return {};
  }
}
export function parseWorkspaceBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a band manager backup.');
  }
  if (!raw || typeof raw !== 'object' || !raw.promoStudioManager) throw new Error('That file isn’t a band manager backup.');
  delete raw.promoStudioManager;
  delete raw.savedAt;
  delete raw.mediaNames;
  delete raw.projects;
  return normalizeWorkspace(raw);
}
