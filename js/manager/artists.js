// Several artists in one manager. Each artist keeps its own profile (band), songs, shows, posts and
// money; venues, scene bands and contacts are one shared address book. The pages work on a flat
// "view" of the current artist (the same shape as before), and the view is folded back into the
// workspace when it is saved or when you switch artists. Pure functions, unit tested.
import { MANAGER_KEY, normalizeManager, newManager, agenda, nextUp, mid } from './model.js';

export const WORKSPACE_VERSION = 2;
export const ARTIST_KEYS = ['band', 'songs', 'shows', 'posts', 'money', 'photos'];
export const SHARED_KEYS = ['venues', 'bands', 'contacts', 'playlists', 'playlistsOff', 'seeded'];

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

export const artistList = (ws) => ws.artists.map((a) => ({ id: a.id, name: a.band.name || 'Untitled artist', city: a.band.city || '', theme: a.band.theme || '', logoId: a.band.logoId || null }));

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
export const workspaceBackup = (ws) => JSON.stringify({ promoStudioManager: WORKSPACE_VERSION, savedAt: new Date().toISOString(), ...ws }, null, 1);
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
  return normalizeWorkspace(raw);
}
