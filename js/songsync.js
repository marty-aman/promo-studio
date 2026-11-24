// Sync kept on the song, so every edit of it starts in time:
// - the music video: where the song's 0:00 is in it, song.files.video = { mediaId, offset, savedAt? }
// - each Guitar Pro file: where it lines up with the song, song.files.tabs[i].sync = { offset, tempoScale, bar?, savedAt }
//   (the same meaning as a layer's offset and tempoScale: the file's time = (song time − offset) × tempoScale).
// Saves made automatically never replace a different value already on the song (only "Replace" does), unless this
// browser tab saved that value itself. Pure functions, unit tested.

const r3 = (x) => +(+x).toFixed(3);
const r4 = (x) => +(+x).toFixed(4);

// ------------------------------------------------------------ the music video

/** The music video's saved sync: { offset, savedAt } or null. A save from before dates were kept counts when it isn't 0. */
export function savedVideoSync(song) {
  const v = song && song.files && song.files.video;
  if (!v || (!v.savedAt && !v.offset)) return null;
  return { offset: +v.offset || 0, savedAt: v.savedAt || '' };
}

/** Save the music video's sync point (seconds into the video where the song's 0:00 is; before 0 is kept as 0). */
export function setVideoSync(song, sec, now = new Date()) {
  const v = song && song.files && song.files.video;
  if (!v || !Number.isFinite(+sec)) return null;
  v.offset = r3(Math.max(0, +sec));
  v.savedAt = now.toISOString();
  return savedVideoSync(song);
}

export function clearVideoSync(song) {
  const v = song && song.files && song.files.video;
  if (!v) return;
  v.offset = 0;
  delete v.savedAt;
}

export const sameVideoSync = (a, b) => Math.abs(r3(Math.max(0, a)) - r3(Math.max(0, b))) < 0.0015;

// ------------------------------------------------------------ Guitar Pro files

/** A saved tab sync from a save or backup, or null when it's broken. */
export function normalizeTabSync(s) {
  if (!s || typeof s !== 'object' || !Number.isFinite(+s.offset)) return null;
  const ts = +s.tempoScale;
  const bar = Math.round(+s.bar);
  return {
    offset: r3(s.offset),
    tempoScale: Number.isFinite(ts) && ts > 0 ? r4(ts) : 1,
    ...(Number.isFinite(bar) && bar >= 1 ? { bar } : {}),
    savedAt: typeof s.savedAt === 'string' ? s.savedAt : '',
  };
}

const tabEntry = (song, mediaId) => (song && song.files && Array.isArray(song.files.tabs) ? song.files.tabs.find((t) => t.mediaId === mediaId) : null) || null;

/** The saved sync of the song's Guitar Pro file `mediaId`, or null. */
export const savedTabSync = (song, mediaId) => normalizeTabSync(tabEntry(song, mediaId) && tabEntry(song, mediaId).sync);

/** Save a Guitar Pro file's sync on the song. Returns the saved sync, or null when the file isn't one of the song's. */
export function setTabSync(song, mediaId, sync, now = new Date()) {
  const t = tabEntry(song, mediaId);
  const s = normalizeTabSync({ ...sync, savedAt: now.toISOString() });
  if (!t || !s) return null;
  t.sync = s;
  return s;
}

export function clearTabSync(song, mediaId) {
  const t = tabEntry(song, mediaId);
  if (t) delete t.sync;
}

/** Same start and speed (the bar it was anchored on doesn't matter). */
export const sameTabSync = (a, b) => !!a && !!b && Math.abs(a.offset - b.offset) < 0.0015 && Math.abs((a.tempoScale || 1) - (b.tempoScale || 1)) < 0.00015;

/** What a layer's sync is, in the saved shape. */
export const layerSync = (L) => ({ offset: r3(L.offset || 0), tempoScale: r4(L.tempoScale || 1), ...(L.syncBar >= 1 ? { bar: L.syncBar } : {}) });

/** The layer settings that put a layer on a saved sync. */
export const syncPatch = (s) => ({ offset: s.offset, tempoScale: s.tempoScale, syncBar: s.bar || 0, userSync: true });

/**
 * The song's Guitar Pro file a layer reads, or null: a tab layer, a drum chart from a Guitar Pro file, a rhythm game
 * from a tab. MIDI notes and MIDI drum charts read MIDI files, which aren't kept on the song, so they never match.
 */
export function layerTabFile(L, tabIds) {
  if (!L || !L.mediaId || !tabIds.includes(L.mediaId)) return null;
  if (L.type === 'tab' || (L.type === 'drums' && L.source === 'gp') || (L.type === 'game' && L.source === 'tab')) return L.mediaId;
  return null;
}

/**
 * What changed for the song's tab files between two edits. `seen` maps layer id → { mediaId, offset, tempoScale } from
 * the edit before; `savedOf(mediaId)` is the song's saved sync. Returns { seen (for the next edit), edited, fresh }:
 * edited = [{ mediaId, sync }] for layers whose start or speed you changed (the last one per file), fresh = [{ id, sync }]
 * for layers that just got one of the song's files and should start on its saved sync.
 */
export function tabSyncChanges(seen, layers, tabIds, savedOf) {
  const next = new Map();
  const edited = new Map();
  const fresh = [];
  for (const L of layers || []) {
    const now = layerSync(L);
    // every layer is remembered, so a layer that was already there never counts as new
    next.set(L.id, { mediaId: L.mediaId || '', offset: now.offset, tempoScale: now.tempoScale });
    const file = layerTabFile(L, tabIds);
    if (!file) continue;
    const before = seen.get(L.id);
    if (!before || before.mediaId !== file) {
      const saved = savedOf(file);
      if (saved && !sameTabSync(saved, now)) fresh.push({ id: L.id, sync: saved });
    } else if (L.userSync && !sameTabSync(before, now)) edited.set(file, now);
  }
  return { seen: next, edited: [...edited].map(([mediaId, sync]) => ({ mediaId, sync })), fresh };
}

/**
 * Which music video clip's sync you changed between two edits: `clips` = [{ id, mediaId, in, speed, start }] (start on
 * the timeline). Only a changed in-point of a normal-speed clip of the music video counts; moving a clip doesn't.
 * Returns { seen, point } with point = the clip's sync point, or null.
 */
export function videoSyncChange(seen, clips, mvId, songOffset = 0) {
  const next = new Map();
  let point = null;
  for (const c of clips || []) {
    next.set(c.id, { mediaId: c.mediaId, in: c.in || 0 });
    if (!mvId || c.mediaId !== mvId) continue;
    const before = seen.get(c.id);
    if (before && before.mediaId === c.mediaId && Math.abs(before.in - (c.in || 0)) > 0.0005 && (c.speed || 1) === 1) point = r3((c.in || 0) - (songOffset + c.start));
  }
  return { seen: next, point };
}

/** For an automatic save: 'save', 'same' or 'conflict'. `mine` is the savedAt of the value this tab saved last. */
export function autoSyncDecision(saved, value, same, mine = '') {
  if (!saved) return 'save';
  if (same(saved, value)) return 'same';
  if (mine && saved.savedAt && saved.savedAt === mine) return 'save';
  return 'conflict';
}

/** "saved 24 Nov 2026" (empty without a date). */
export function savedOn(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(+d) ? `saved ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
}

/** "starts at 0:12.40 in the song, 98.5% speed, bar 5 at that point". */
export function describeTabSync(s) {
  const m = Math.floor(Math.abs(s.offset) / 60);
  const sec = (Math.abs(s.offset) % 60).toFixed(2).padStart(5, '0');
  const at = `${s.offset < 0 ? '−' : ''}${m}:${sec}`;
  const speed = Math.abs((s.tempoScale || 1) - 1) < 0.0005 ? 'the file’s own tempo' : `${Math.round((s.tempoScale || 1) * 1000) / 10}% speed`;
  return `bar 1 at ${at} in the song, ${speed}${s.bar ? `, lined up on bar ${s.bar}` : ''}`;
}
