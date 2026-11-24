// Export range: which part of the edit the exported video covers. project.exportRange is { start, end } in
// timeline seconds, either side null = the edit's own start / end; missing or null = the whole edit (old saves).
// Everything is recorded in real time from `start`, so video, sound, lyrics, layers and the end card simply
// begin there; only the closed-caption files need shifting (shiftCues). Pure; unit tested.
import { FPS } from './timecode.js';

/** The shortest clip the export will make. */
export const MIN_RANGE = 0.5;
const r3 = (x) => +(+x).toFixed(3);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);

/**
 * What the export covers: { start, end, length, whole, set, error }. Bounds are clamped to the edit
 * (0..duration). `error` is a message when the range is too short to export (start at or after end).
 */
export function resolveRange(p) {
  const dur = Math.max(0, +(p && p.duration) || 0);
  const r = (p && p.exportRange) || {};
  const a = num(r.start);
  const b = num(r.end);
  const start = r3(Math.min(Math.max(a === null ? 0 : a, 0), dur));
  const end = r3(Math.min(Math.max(b === null ? dur : b, 0), dur));
  const length = r3(end - start);
  const whole = start <= 0 && end >= dur;
  const set = a !== null || b !== null;
  let error = '';
  if (length < MIN_RANGE - 1e-9) error = end <= start ? 'The end is not after the start. Move the end later, or the start earlier.' : `The export range is only ${length.toFixed(2)} seconds. Make it at least ${MIN_RANGE} seconds.`;
  return { start, end, length, whole, set, error };
}

/** A time snapped to a frame (the player readout's resolution), so typed and dragged values agree. */
export const toFrame = (t, fps = FPS) => r3(Math.round((+t || 0) * fps) / fps);

/**
 * Draft change: set one side of the range. `which` is 'start' or 'end'; `t` null puts that side back to the
 * edit's own. Clamps to the edit and keeps MIN_RANGE from the other side. Returns '' or a message for a refused change
 * (the draft is then left alone). A range that ends up covering the whole edit is stored as null.
 */
export function setRangeSide(d, which, t) {
  const cur = resolveRange(d);
  let v = num(t);
  if (v !== null) {
    v = toFrame(Math.min(Math.max(v, 0), d.duration));
    if (which === 'start' && v > cur.end - MIN_RANGE + 1e-9) return `The start must be at least ${MIN_RANGE} seconds before the end (${cur.end.toFixed(2)}).`;
    if (which === 'end' && v < cur.start + MIN_RANGE - 1e-9) return `The end must be at least ${MIN_RANGE} seconds after the start (${cur.start.toFixed(2)}).`;
  }
  const next = { start: num(d.exportRange && d.exportRange.start), end: num(d.exportRange && d.exportRange.end) };
  next[which] = v === null || (which === 'start' && v <= 0) || (which === 'end' && v >= d.duration) ? null : v;
  d.exportRange = next.start === null && next.end === null ? null : next;
  return '';
}

/** Closed-caption cues for the exported part: only those that overlap it, moved so the range starts at 0. */
export function shiftCues(cues, start, end) {
  const out = [];
  for (const c of cues || []) {
    if (c.end <= start || c.start >= end) continue;
    out.push({ ...c, start: r3(Math.max(c.start, start) - start), end: r3(Math.min(c.end, end) - start) });
  }
  return out;
}

/** Fill in the range for a project from an older save or a file: anything unusable means the whole edit. */
export function cleanRange(p) {
  const r = p && p.exportRange;
  if (!r || typeof r !== 'object') return null;
  const start = num(r.start);
  const end = num(r.end);
  if ((start !== null && start < 0) || (end !== null && end < 0) || (start === null && end === null)) return null;
  return { start, end };
}
