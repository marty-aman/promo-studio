// Timeline colours for lyric lines, by their look (timeline only: preview and export never read this).
// A line's look is its per-line style (line.style = { preset?, ...own changes }); lines without one use the
// shared lyric style and keep the default yellow block. Each distinct look gets a colour, a letter and a pattern
// so it also reads without colour. project.lookColors = { [lookId]: '#rrggbb' } holds the colours Marty picked.
import { LINE_PRESETS, LINE_FIELDS, hasLineStyle } from './linestyle.js';
import { themeOf } from './lookthemes.js';

export const SHARED_COLOR = '#facc15';
// A fixed colour per preset (so "Scream" is the same red in every project), then slots for custom looks.
const PRESET_LOOK = {
  scream: { color: '#ff4d6d', letter: 'S', pat: 0 },
  breakdown: { color: '#fb923c', letter: 'B', pat: 1 },
  chant: { color: '#a78bfa', letter: 'G', pat: 2 },
  clean: { color: '#38bdf8', letter: 'C', pat: 3 },
  whisper: { color: '#cbd5e1', letter: 'W', pat: 4 },
  spoken: { color: '#4ade80', letter: 'P', pat: 5 },
};
export const CUSTOM_COLORS = ['#f472b6', '#2dd4bf', '#a3e635', '#d97706', '#6366f1', '#f1f5f9'];
export const PATTERNS = 6;

const hash = (s) => {
  let x = 5381;
  for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0;
  return x;
};
const HEX = /^#[\da-f]{6}$/i;

/**
 * The look of a line: '' for the shared style, else 'p:<preset>' (just a preset) or 'c:<hash>' (own changes).
 * style.lookKey (set by "Only this line", lookapply.js) keeps a line in a look of its own even while it looks the same.
 */
export function lookId(line) {
  if (!hasLineStyle(line)) return '';
  const { preset, lookKey, ...rest } = line.style;
  const own = LINE_FIELDS.filter((k) => rest[k] !== undefined).map((k) => [k, rest[k]]);
  if (preset && PRESET_LOOK[preset] && !own.length && !lookKey) return `p:${preset}`;
  return `c:${hash(JSON.stringify(lookKey ? [preset || '', own, lookKey] : [preset || '', own])).toString(36)}`;
}

/**
 * Every look used by `lines`, with its colour: [{ id, name, color, letter, pat, count, picked }] in a stable order
 * (presets first, then custom looks by id). `overrides` is project.lookColors. Custom looks take the colour slot their
 * id hashes to, moving to the next free one when two collide, so the same set of looks always gets the same colours.
 */
export function assignLooks(lines, overrides = {}) {
  const counts = new Map();
  const presetOf = new Map();
  const themeName = new Map();
  for (const l of lines || []) {
    const id = lookId(l);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
    if (!presetOf.has(id)) {
      presetOf.set(id, l.style.preset || '');
      const th = themeOf(l.style);
      if (th) themeName.set(id, th.name);
    }
  }
  const named = new Map(); // theme name -> how many looks use it so far (a split-off copy reads "Blood & Ash 2")
  const ids = [...counts.keys()].sort((a, b) => (a[0] === b[0] ? (a < b ? -1 : 1) : a[0] === 'p' ? -1 : 1));
  const taken = new Set();
  let custom = 0;
  return ids.map((id) => {
    let base;
    if (id[0] === 'p') {
      base = { ...PRESET_LOOK[id.slice(2)], name: LINE_PRESETS.find((p) => p[0] === id.slice(2))[1] };
    } else {
      custom++;
      let slot = hash(id) % CUSTOM_COLORS.length;
      for (let i = 0; i < CUSTOM_COLORS.length && taken.has(slot); i++) slot = (slot + 1) % CUSTOM_COLORS.length;
      taken.add(slot);
      const pre = presetOf.get(id);
      const preName = pre && LINE_PRESETS.find((p) => p[0] === pre);
      const tn = themeName.get(id);
      if (tn) named.set(tn, (named.get(tn) || 0) + 1);
      const name = tn ? (named.get(tn) > 1 ? `${tn} ${named.get(tn)}` : tn) : preName ? `${preName[1]} (edited)` : `Custom look ${custom}`;
      base = { color: CUSTOM_COLORS[slot], letter: String(((custom - 1) % 9) + 1), pat: (slot + (pre ? 1 : 0)) % PATTERNS, name };
    }
    const picked = overrides && HEX.test(overrides[id] || '') ? overrides[id] : null;
    return { id, ...base, color: picked || base.color, picked: !!picked, count: counts.get(id) };
  });
}

/** Map of lyric line id -> look entry (shared-style lines are absent). */
export function looksById(lines, overrides) {
  const looks = assignLooks(lines, overrides);
  const by = new Map(looks.map((k) => [k.id, k]));
  const out = new Map();
  for (const l of lines || []) {
    const k = by.get(lookId(l));
    if (k) out.set(l.id, k);
  }
  return { looks, byLine: out };
}
