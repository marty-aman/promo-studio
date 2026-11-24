// Light media records: what the app keeps about a file so it can start, list and lay out the library without
// reading the file itself. Pure functions, no browser APIs (media.js does the reading and the object URLs).
//
// Videos, songs/stems and photos are "lazy": at start-up only their light record is read, and the file is opened
// when something uses it (media.ensureLoaded). Guitar Pro tabs, MIDI files and fonts are small and are parsed into
// data other code reads at once (tracks, notes, font families), so they are still opened at start-up.

export const LIGHT_V = 1;
export const LAZY_KINDS = new Set(['video', 'audio', 'image']);
export const isLazyKind = (kind) => LAZY_KINDS.has(kind);

/** The light record kept in IndexedDB's 'meta' store for a loaded media record. `analysis` is media.analysisOf(rec). */
export function lightOf(rec, analysis = null) {
  const size = rec.size ?? (rec.blob ? rec.blob.size : 0);
  const type = rec.type ?? (rec.blob ? rec.blob.type : '');
  return {
    v: LIGHT_V,
    id: rec.id,
    name: rec.name,
    kind: rec.kind,
    source: rec.source || 'upload',
    attribution: rec.attribution || null,
    path: rec.path || '',
    size: size || 0,
    type: type || '',
    duration: Number.isFinite(rec.duration) ? rec.duration : rec.kind === 'image' ? -1 : 0, // -1 = a still (Infinity does not survive every store)
    width: rec.width || 0,
    height: rec.height || 0,
    thumb: rec.thumb ?? null,
    noAudio: !!rec.noAudio,
    analysis,
    at: rec.addedAt || Date.now(),
  };
}

/** True when `meta` carries all a lazy record needs to stand in for the file until it is opened. */
export function lightUsable(meta) {
  if (!meta || meta.v !== LIGHT_V || !isLazyKind(meta.kind) || !meta.id) return false;
  if (meta.kind === 'image') return meta.width > 0 && meta.height > 0 && typeof meta.thumb === 'string' && !meta.thumb.startsWith('blob:');
  if (!(meta.duration > 0)) return false;
  if (meta.kind === 'audio') return !!(meta.analysis && meta.analysis.peaks && meta.analysis.envelope);
  return meta.width > 0 && meta.thumb !== undefined && !(typeof meta.thumb === 'string' && meta.thumb.startsWith('blob:'));
}

/** A library record built from a light record: everything but the file (blob, url, el) and loaded = false. */
export function recordFromLight(meta) {
  const rec = {
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    blob: null,
    url: null,
    el: null,
    source: meta.source || 'upload',
    attribution: meta.attribution || null,
    path: meta.path || '',
    size: meta.size || 0,
    type: meta.type || '',
    duration: meta.duration === -1 || meta.kind === 'image' ? Infinity : meta.duration,
    width: meta.width || 0,
    height: meta.height || 0,
    thumb: meta.thumb ?? null,
    noAudio: !!meta.noAudio,
    addedAt: meta.at || 0,
    ready: true,
    loaded: false,
    lastUse: 0,
  };
  const a = meta.analysis;
  if (a && a.peaks && a.envelope) {
    rec.peaks = a.peaks;
    rec.peaksPerSec = a.peaksPerSec;
    rec.envelope = a.envelope;
    rec.envRate = a.envRate;
  }
  return rec;
}

/**
 * Which loaded lazy records to let go of: not kept (used by the open project or screen), not held by a running job,
 * and not used since `before` (ms, same clock as rec.lastUse). Returns their ids.
 */
export function pickRelease(recs, { keep = new Set(), before = Infinity } = {}) {
  const out = [];
  for (const r of recs) {
    if (!r || !r.loaded || !isLazyKind(r.kind) || !r.blob) continue;
    if (keep.has(r.id) || r.holds > 0) continue;
    if ((r.lastUse || 0) >= before) continue;
    out.push(r.id);
  }
  return out;
}

/** Library files no saved project, song, design or version points at, biggest first: [{ id, name, kind, size }]. */
export function unusedMedia(recs, used) {
  return recs
    .filter((r) => r && !used.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, kind: r.kind, size: r.size || (r.blob ? r.blob.size : 0) || 0, thumb: typeof r.thumb === 'string' ? r.thumb : null }))
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
}

export const KIND_GROUP = { video: 'video', audio: 'audio', image: 'photos', tab: 'other', midi: 'other', font: 'other' };
export const GROUP_LABEL = { video: 'Videos', audio: 'Songs and stems', photos: 'Photos', models: 'AI models and caches', projects: 'Projects and versions', other: 'Other' };

/**
 * Bytes per group. recs: library records (their size), extra: { models, projects } measured elsewhere, usage: the
 * browser's total for this site (null when unknown). 'other' takes what the browser counts that nothing here explains.
 */
export function storageBreakdown(recs, { models = 0, projects = 0, usage = null } = {}) {
  const g = { video: 0, audio: 0, photos: 0, models: models || 0, projects: projects || 0, other: 0 };
  for (const r of recs) g[KIND_GROUP[r.kind] || 'other'] += r.size || (r.blob ? r.blob.size : 0) || 0;
  if (usage != null) {
    const known = g.video + g.audio + g.photos + g.models + g.projects + g.other;
    if (usage > known) g.other += usage - known;
  }
  return g;
}

/** The biggest library files: [{ id, name, kind, size }]. */
export const biggestFiles = (recs, n = 5) =>
  recs
    .map((r) => ({ id: r.id, name: r.name, kind: r.kind, size: r.size || (r.blob ? r.blob.size : 0) || 0 }))
    .sort((a, b) => b.size - a.size)
    .slice(0, n);

/** "1.2 GB", "34 MB", "120 KB". */
export function fmtBytes(n) {
  if (!(n > 0)) return '0 MB';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${Math.round(n / 1048576)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Long side of the small picture kept for every photo (lists and pickers show it instead of the full file). */
export const PHOTO_THUMB = 480;
/** The size of a photo's thumbnail: { w, h } no larger than `max` on the long side (never upscaled). */
export function thumbSize(w, h, max = PHOTO_THUMB) {
  const k = Math.min(1, max / Math.max(w || 1, h || 1));
  return { w: Math.max(1, Math.round((w || 1) * k)), h: Math.max(1, Math.round((h || 1) * k)) };
}
