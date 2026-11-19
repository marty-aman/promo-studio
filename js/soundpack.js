// The bundled free sound pack: public-domain (CC0) sound effects shipped with the app in sounds/pack,
// found through Openverse (mostly from Freesound). index.json lists each sound with its creator and
// source page. CC0 needs no credit, but the creator is shown anyway.

let packPromise = null;
let pack = null;

/** Load the pack's index once (null until loaded; [] if the pack isn't there). */
export function loadPack(onReady) {
  if (pack) return pack;
  packPromise ||= fetch(new URL('../sounds/pack/index.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((list) => (pack = Array.isArray(list) ? list.filter((x) => x && x.file && x.name) : []));
  if (onReady) packPromise.then(onReady);
  return null;
}

/** The pack's categories in their listed order, with counts. */
export function packCategories(list) {
  const out = new Map();
  for (const s of list || []) out.set(s.cat, (out.get(s.cat) || 0) + 1);
  return [...out].map(([name, n]) => ({ name, n }));
}

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Search the pack: every word of `q` must match the name, category, search term or tags
 * (as a word prefix). Name matches rank first. `cat` limits to one category.
 */
export function filterPack(list, q = '', cat = '') {
  const qs = words(q);
  const out = [];
  for (const s of list || []) {
    if (cat && s.cat !== cat) continue;
    if (!qs.length) {
      out.push([0, s]);
      continue;
    }
    const name = words(s.name);
    const rest = [...words(s.cat), ...words(s.q), ...(s.tags || []).flatMap(words)];
    let score = 0;
    let ok = true;
    for (const w of qs) {
      if (name.some((x) => x.startsWith(w))) score += 3;
      else if (rest.some((x) => x.startsWith(w))) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) out.push([score, s]);
  }
  return out.sort((a, b) => b[0] - a[0] || a[1].dur - b[1].dur).map(([, s]) => s);
}

/** A pack sound in the shape the sound lists use. */
export const packResult = (s) => ({
  id: `pack-${s.id}`,
  url: new URL(`../${s.file}`, import.meta.url).href,
  title: s.name,
  duration: s.dur,
  author: s.creator || 'unknown',
  pageUrl: s.page,
  license: 'CC0',
  needsCredit: false,
  provider: 'Band Manager pack',
});
