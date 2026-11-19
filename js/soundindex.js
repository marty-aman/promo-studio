// One list of every sound you have: your own uploads, the bundled free pack and the built-in
// effects. Each sound can be renamed, tagged and starred. Your uploads keep those edits on their
// own record (soundlib); pack and built-in sounds keep them in a small override map in this
// browser, since their files ship with the app. Pure functions, unit tested.

export const SOUND_META_KEY = 'pvm.soundMeta.v1';
export const SOURCES = [
  ['all', 'All'],
  ['mine', 'Mine'],
  ['pack', 'Free pack'],
  ['builtin', 'Built-in'],
];
export const SOURCE_LABEL = { mine: 'Mine', pack: 'Free pack', builtin: 'Built-in' };

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Clean tags typed by a person: "Impacts, big boom,  #drop" -> ["impacts", "big boom", "drop"]. */
export function parseTags(text) {
  const out = [];
  for (const raw of String(text || '').split(/[,;\n]+/)) {
    const t = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, 30);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

/** Your uploaded sound (a soundlib record) as a list item. */
export function fromLibrary(rec) {
  return {
    key: `lib:${rec.id}`,
    id: rec.id,
    source: 'mine',
    name: rec.name,
    defaultName: rec.name,
    tags: [...(rec.tags || [])],
    favorite: !!rec.favorite,
    duration: rec.duration || 0,
    addedAt: rec.addedAt || 0,
    attribution: rec.attribution || null,
    fileName: rec.fileName || '',
  };
}
/** A bundled pack sound (from sounds/pack/index.json) as a list item. */
export function fromPack(s, url) {
  return {
    key: `pack:${s.id}`,
    id: s.id,
    source: 'pack',
    name: s.name,
    defaultName: s.name,
    tags: [...new Set([s.cat, ...(s.tags || [])].filter(Boolean).map((t) => String(t).toLowerCase()))],
    favorite: false,
    duration: s.dur || 0,
    addedAt: 0,
    url,
    attribution: { provider: 'pack', providerLabel: 'Free sound pack (CC0)', author: s.creator || 'unknown', pageUrl: s.page, license: 'CC0', needsCredit: false },
    search: s.q || '',
  };
}
/** A built-in synthesized effect as a list item. */
export function fromBuiltin(b) {
  return { key: `builtin:${b.id}`, id: b.id, source: 'builtin', name: b.label, defaultName: b.label, tags: ['built-in', ...words(b.label).slice(0, 2)], favorite: false, duration: b.secs || 0, addedAt: 0, attribution: null };
}

/** Apply saved renames, tags and stars to pack and built-in sounds. Your own sounds keep theirs. */
export function applyMeta(items, meta = {}) {
  return items.map((it) => {
    if (it.source === 'mine') return it;
    const m = meta[it.key];
    if (!m) return it;
    return { ...it, name: m.name || it.name, tags: Array.isArray(m.tags) ? m.tags : it.tags, favorite: m.favorite ?? it.favorite, edited: true };
  });
}
/** The override to store for a pack or built-in sound after an edit (null when back to defaults). */
export function metaFor(item, patch, defaults) {
  const next = { name: patch.name ?? item.name, tags: patch.tags ?? item.tags, favorite: patch.favorite ?? item.favorite };
  const out = {};
  if (next.name && next.name !== item.defaultName) out.name = next.name;
  if (JSON.stringify(next.tags) !== JSON.stringify(defaults.tags)) out.tags = next.tags;
  if (next.favorite) out.favorite = true;
  return Object.keys(out).length ? out : null;
}

/**
 * Filter and sort: `source` (all/mine/pack/builtin), `starred`, `tag`, and words of `q` that must
 * each match the name, a tag or (pack) its search term, as word prefixes. Starred first, then name
 * matches, then your newest uploads, then A–Z.
 */
export function filterAll(items, { q = '', source = 'all', starred = false, tag = '' } = {}) {
  const qs = words(q);
  const out = [];
  for (const it of items) {
    if (source !== 'all' && it.source !== source) continue;
    if (starred && !it.favorite) continue;
    if (tag && !it.tags.includes(tag)) continue;
    let score = 0;
    let ok = true;
    if (qs.length) {
      const name = words(it.name);
      const rest = [...it.tags.flatMap(words), ...words(it.search)];
      for (const w of qs) {
        if (name.some((x) => x.startsWith(w))) score += 3;
        else if (rest.some((x) => x.startsWith(w))) score += 1;
        else {
          ok = false;
          break;
        }
      }
    }
    if (ok) out.push([score, it]);
  }
  return out
    .sort((a, b) => Number(b[1].favorite) - Number(a[1].favorite) || b[0] - a[0] || (b[1].addedAt || 0) - (a[1].addedAt || 0) || a[1].name.localeCompare(b[1].name))
    .map(([, it]) => it);
}

/** The most used tags (after the other filters), for the tag chips: [{ tag, n }]. */
export function topTags(items, max = 14) {
  const n = new Map();
  for (const it of items) for (const t of it.tags) if (t !== 'built-in') n.set(t, (n.get(t) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([tag, k]) => ({ tag, n: k }));
}

export function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(SOUND_META_KEY));
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}
export function saveMeta(m) {
  try {
    localStorage.setItem(SOUND_META_KEY, JSON.stringify(m));
  } catch {
    /* storage full: edits stay for this session */
  }
}
