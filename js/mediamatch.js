// Finding missing media again: which media ids a piece of saved data points at, what each id was called,
// and which of a picked set of files is the one that went missing. Pure functions, no browser APIs.

const ID_RE = /^m_[0-9a-z]{6,}$/; // ids made by uid('m') in media.js

/** Every media id that appears as a string value anywhere inside `roots` (objects, arrays, nested). */
export function referencedIds(...roots) {
  const out = new Set();
  const seen = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      if (ID_RE.test(v)) out.add(v);
    } else if (v && typeof v === 'object' && !seen.has(v)) {
      seen.add(v);
      for (const k of Array.isArray(v) ? v.keys() : Object.keys(v)) walk(v[k]);
    }
  };
  roots.forEach(walk);
  return out;
}

/** A name for comparing: same letters whatever the case or the way accents are stored. */
export const normName = (s) => String(s || '').normalize('NFC').toLowerCase().trim();

/** "Band/Stems/kick.wav" -> { name: 'kick.wav', dirs: ['band', 'stems'] } (folders lower-cased, in order). */
export function splitPath(path, fallbackName = '') {
  const parts = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts.length ? parts.pop() : fallbackName;
  return { name, dirs: parts.map(normName) };
}

// ------------------------------------------------------------------ the name index
// id -> [name, relative path ('' when it was not picked from a folder), kind]. Kept apart from the media
// records so a reference still knows what its file was called after the record is gone.

export const INDEX_CAP = 5000;

/** Remember `info` ({ name, path, kind }) for an id; a blank field never erases a known one. Returns the index. */
export function remember(index, id, info) {
  const old = index[id] || ['', '', ''];
  const name = info.name || old[0];
  if (!name) return index;
  const path = info.path || old[1];
  const kind = info.kind || old[2];
  if (old[0] === name && old[1] === path && old[2] === kind) return index;
  delete index[id]; // newest last
  index[id] = [name, path, kind];
  return index;
}

/** Keep the index under `cap`: forget the oldest ids still in the library first (their records hold their names). */
export function trim(index, isPresent, cap = INDEX_CAP) {
  let extra = Object.keys(index).length - cap;
  if (extra <= 0) return index;
  const ids = Object.keys(index);
  for (const id of ids) {
    if (extra > 0 && isPresent(id)) (delete index[id], extra--);
  }
  for (const id of ids) {
    if (extra > 0 && id in index) (delete index[id], extra--);
  }
  return index;
}

/** Merge entries from another index (a backup) without changing what this browser already knows. */
export function mergeIndex(index, other) {
  if (!other || typeof other !== 'object') return index;
  for (const [id, v] of Object.entries(other)) {
    if (!ID_RE.test(id) || id in index || !Array.isArray(v) || typeof v[0] !== 'string' || !v[0]) continue;
    index[id] = [v[0].slice(0, 300), typeof v[1] === 'string' ? v[1].slice(0, 500) : '', typeof v[2] === 'string' ? v[2].slice(0, 20) : ''];
  }
  return index;
}

/** The missing items among `ids`: [{ id, name, path, kind }] (name '' when it was never known), sorted by name. */
export function missingItems(ids, isPresent, index) {
  return [...ids]
    .filter((id) => !isPresent(id))
    .map((id) => {
      const [name = '', path = '', kind = ''] = index[id] || [];
      return { id, name, path, kind };
    })
    .sort((a, b) => !a.name - !b.name || normName(a.name).localeCompare(normName(b.name)) || a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ matching

/**
 * Pair each missing item with the picked file of the same name.
 *   missing: [{ id, name, path, kind }]   files: [{ name, webkitRelativePath }]
 * A file matches on its name alone (case and accent form ignored). When several files share the name, the one whose
 * folders agree most with where the missing file was (counting folders from the file outwards) wins; when that does
 * not settle it, or when two different missing files want the same picked file, nobody gets it: a wrong guess would
 * fill a slot that can never be redone. The same file may serve several ids that were imported from one place.
 * Returns { matches: [{ item, file }], still: [{ item, reason }], extra: [file] } where reason is 'notFound' |
 * 'ambiguous' | 'taken' | 'unknown' (the name was never known).
 */
export function pickMatches(missing, files) {
  const byName = new Map();
  const info = new Map();
  for (const f of files) {
    const sp = splitPath(f.webkitRelativePath, f.name);
    info.set(f, { name: f.name, dirs: sp.dirs });
    const key = normName(f.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(f);
  }
  const trailing = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  };
  const sameSpot = (a, b) => info.get(a).dirs.join('/') === info.get(b).dirs.join('/') && a.name === b.name;
  const keyOf = (m) => `${normName(m.name)}|${splitPath(m.path, m.name).dirs.join('/')}`;

  const claims = []; // { item, file, score }
  const still = [];
  for (const item of missing) {
    if (!item.name) {
      still.push({ item, reason: 'unknown' });
      continue;
    }
    const cands = byName.get(normName(item.name)) || [];
    if (!cands.length) {
      still.push({ item, reason: 'notFound' });
      continue;
    }
    const dirs = splitPath(item.path, item.name).dirs;
    const scored = cands.map((f) => ({ f, s: trailing(dirs, info.get(f).dirs) + (f.name === item.name ? 0.5 : 0) }));
    const best = Math.max(...scored.map((x) => x.s));
    const top = scored.filter((x) => x.s === best).map((x) => x.f);
    if (top.some((f) => !sameSpot(f, top[0]))) still.push({ item, reason: 'ambiguous' });
    else claims.push({ item, file: top[0], score: best });
  }

  // one picked file can only heal missing files that came from the same place
  const matches = [];
  const byFile = new Map();
  for (const c of claims) (byFile.get(c.file) || byFile.set(c.file, []).get(c.file)).push(c);
  const sameFileSpot = (cs) => cs.every((c) => keyOf(c.item) === keyOf(cs[0].item));
  for (const [file, cs] of byFile) {
    if (sameFileSpot(cs)) {
      cs.forEach((c) => matches.push({ item: c.item, file }));
      continue;
    }
    const top = Math.max(...cs.map((c) => c.score));
    const winners = cs.filter((c) => c.score === top);
    const winning = sameFileSpot(winners) ? winners : [];
    for (const c of cs) {
      if (winning.includes(c)) matches.push({ item: c.item, file });
      else still.push({ item: c.item, reason: winning.length ? 'taken' : 'ambiguous' });
    }
  }
  const used = new Set(matches.map((m) => m.file));
  const order = new Map(missing.map((m, i) => [m.id, i]));
  matches.sort((a, b) => order.get(a.item.id) - order.get(b.item.id));
  still.sort((a, b) => order.get(a.item.id) - order.get(b.item.id));
  return { matches, still, extra: files.filter((f) => !used.has(f)) };
}

/** Group items by name for a short readable list: [{ name, count }]. */
export function namesWithCounts(items) {
  const m = new Map();
  for (const it of items) {
    const n = it.name || 'a file whose name was not saved';
    m.set(n, (m.get(n) || 0) + 1);
  }
  return [...m].map(([name, count]) => ({ name, count }));
}

export const REASONS = {
  notFound: 'not in the files you picked',
  ambiguous: 'several files have this name and none is in the same folder',
  taken: 'the only file with this name belongs to another missing file',
  unknown: 'its name was not saved, so it can’t be matched',
  wrongType: 'the file with this name is a different kind of file',
  unreadable: 'the file could not be opened',
};
