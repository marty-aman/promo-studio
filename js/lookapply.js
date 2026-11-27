// Change a lyric look everywhere it is used: a look (lookcolors.js lookId) is a line's per-line style, and lines
// with the same one share it. These run inside store.update on the draft project `d`, so each is one undo step.
// They only ever write to lines that share the chosen line's look (or, for the shared style, keep every other
// look drawing exactly as before), and they keep the look's timeline colour (project.lookColors).
import { uid } from './core.js';
import { LINE_FIELDS, lineStyle, hasLineStyle } from './linestyle.js';
import { lookId, assignLooks, CUSTOM_COLORS } from './lookcolors.js';

// what a missing field means when drawing (the renderer reads these with || / ??)
const FIELD_DEFAULTS = { outAnimation: '', outDuration: 0.35 };

/** Ids of the lines that share `lineId`'s look (the line itself included). Shared-style lines share the '' look. */
export function lookMembers(lines, lineId) {
  const me = (lines || []).find((l) => l.id === lineId);
  if (!me) return [];
  const id = lookId(me);
  return lines.filter((l) => lookId(l) === id).map((l) => l.id);
}

/** A line style with a theme: keeps the keys that are not style fields (lookKey), drops the preset. */
export function withTheme(style, theme) {
  const keep = Object.fromEntries(Object.entries(style || {}).filter(([k]) => k !== 'preset' && !LINE_FIELDS.includes(k)));
  return { ...keep, ...structuredClone(theme.fields) };
}

const colorsOf = (d) => new Map(assignLooks(d.lyrics, d.lookColors).map((k) => [k.id, k.color]));

/**
 * Timeline colours after the lines in `changed` (Map line id -> look id before) moved to new looks.
 * mode 'keep': a look whose content changed keeps its colour; 'fresh': a split-off line gets a colour no other look has.
 * A line that joins a look already there takes that look's colour; preset looks keep their fixed colours.
 */
function settleColors(d, changed, before, mode) {
  const had = new Set(before.keys());
  const out = { ...(d.lookColors || {}) };
  const done = new Set();
  for (const l of d.lyrics) {
    if (!changed.has(l.id)) continue;
    const from = changed.get(l.id);
    const to = lookId(l);
    // preset looks keep their fixed colour; a look that already existed keeps its own
    if (!to.startsWith('c:') || to === from || had.has(to) || done.has(to)) continue;
    done.add(to);
    if (mode === 'keep' && from) out[to] = before.get(from);
    if (mode === 'fresh') {
      const used = new Set([...colorsOf({ lyrics: d.lyrics.filter((x) => lookId(x) !== to), lookColors: out }).values()]);
      const free = CUSTOM_COLORS.find((c) => !used.has(c));
      if (free) out[to] = free;
    }
  }
  const now = new Set(d.lyrics.map(lookId));
  for (const from of new Set(changed.values())) if (from && !now.has(from)) delete out[from];
  d.lookColors = out;
}

/**
 * Change the look of `lineId` and of every line sharing it (or only `lineId` when only = true).
 * change(style) returns the new style (undefined = back to the shared style). `ids` limits the lines
 * (a slider drag keeps the set it started with); a line whose look differs from `lineId`'s is never touched.
 * Returns the number of lines changed.
 */
export function changeLook(d, lineId, change, { only = false, ids = null } = {}) {
  const me = d.lyrics.find((l) => l.id === lineId);
  if (!me) return 0;
  const look = lookId(me);
  const allow = ids ? new Set(ids) : null;
  const targets = only ? [me] : d.lyrics.filter((l) => lookId(l) === look && (!allow || allow.has(l.id) || l.id === lineId));
  const before = colorsOf(d);
  const changed = new Map();
  for (const l of targets) {
    changed.set(l.id, lookId(l));
    const next = change(l.style ? structuredClone(l.style) : undefined, l);
    if (next && Object.keys(next).length) l.style = next;
    else delete l.style;
  }
  settleColors(d, changed, before, only ? 'fresh' : 'keep');
  return targets.length;
}

/** Give one line a look of its own (same appearance, its own timeline colour). Later look edits on it touch only it. */
export function splitLine(d, lineId) {
  return changeLook(d, lineId, (st) => ({ ...(st || {}), lookKey: uid('look') }), { only: true });
}

/** Apply `theme` to a line's look (every line sharing it), or to the shared lyric style when the line has none. */
export function applyTheme(d, lineId, theme, { only = false } = {}) {
  const me = d.lyrics.find((l) => l.id === lineId);
  if (!me) return 0;
  if (!hasLineStyle(me) && !only) return applySharedTheme(d, theme);
  const n = changeLook(d, lineId, (st) => withTheme(st, theme), { only });
  // shortcut: themes carry no effect settings yet; when they do (lyric fx), the look's lines take them too
  if (theme.fx) for (const l of d.lyrics) if (l.id === lineId || (!only && lookId(l) === lookId(me))) l.fx = structuredClone(theme.fx);
  return n;
}

/**
 * Apply `theme` to the shared lyric style. Lines with a look of their own keep drawing exactly as before: any field
 * they took from the shared style and that the theme changes is written into their own style first.
 * Returns the number of shared-style lines (the ones the theme changes).
 */
export function applySharedTheme(d, theme) {
  const old = d.lyricStyle;
  const next = { ...old, ...structuredClone(theme.fields) };
  if (theme.fx) next.fx = structuredClone(theme.fx);
  const before = colorsOf(d);
  const changed = new Map();
  for (const l of d.lyrics) {
    if (!hasLineStyle(l)) continue;
    const was = lineStyle(old, l, d.theme);
    const will = lineStyle(next, l, d.theme);
    const keep = LINE_FIELDS.filter((k) => JSON.stringify(was[k] ?? FIELD_DEFAULTS[k]) !== JSON.stringify(will[k] ?? FIELD_DEFAULTS[k]));
    if (!keep.length) continue;
    changed.set(l.id, lookId(l));
    l.style = { ...l.style, ...Object.fromEntries(keep.map((k) => [k, was[k] ?? FIELD_DEFAULTS[k]])) };
  }
  d.lyricStyle = next;
  settleColors(d, changed, before, 'keep');
  return d.lyrics.filter((l) => !hasLineStyle(l)).length;
}
