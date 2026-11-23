// Wrapped tab layout for phones and tablets: bars flow into lines that fit the screen width,
// like a printed tab, instead of one long line you scroll sideways. Pure, so it is unit tested.

/**
 * Lay bars out in lines.
 * @param {number[][]} bars natural beat widths per bar (px at the current zoom)
 * @param {number} width the canvas width
 * @param {object} [o]
 * @param {number} [o.gutter] room on the left of each line for the string names
 * @param {number} [o.barPad] space at the start of a bar, before its first beat
 * @param {number} [o.barGap] space after a bar's last beat
 * @param {number} [o.right] margin on the right of each line
 * @param {number} [o.maxStretch] the most a line is widened to fill the width (the last line is never widened)
 * @returns {{ lines: { bars: number[], scale: number }[], bars: { x: number, w: number, line: number, beats: { x: number, w: number }[] }[] }}
 */
export function wrapBars(bars, width, { gutter = 44, barPad = 12, barGap = 4, right = 8, maxStretch = 1.6 } = {}) {
  const avail = Math.max(40, width - gutter - right);
  const natural = bars.map((beats) => barPad + beats.reduce((s, w) => s + w, 0) + barGap);
  // greedy: as many whole bars as fit on each line; a bar wider than the line gets a line of its own
  const lines = [];
  let cur = [];
  let used = 0;
  natural.forEach((w, bi) => {
    if (cur.length && used + w > avail + 0.5) {
      lines.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(bi);
    used += w;
  });
  if (cur.length) lines.push(cur);
  const out = new Array(bars.length);
  const outLines = lines.map((idx, li) => {
    const sum = idx.reduce((s, bi) => s + natural[bi], 0);
    const last = li === lines.length - 1;
    // squeeze a line that is too wide; widen the others so the right edges line up
    let scale = sum > avail ? avail / sum : last ? 1 : Math.min(maxStretch, avail / sum);
    if (!last && scale >= maxStretch) scale = 1; // a nearly empty line looks worse stretched than ragged
    let x = gutter;
    for (const bi of idx) {
      let cx = x + barPad * scale;
      const beats = bars[bi].map((bw) => {
        const b = { x: cx, w: bw * scale };
        cx += b.w;
        return b;
      });
      const w = natural[bi] * scale;
      out[bi] = { x, w, line: li, beats };
      x += w;
    }
    return { bars: idx, scale };
  });
  return { lines: outLines, bars: out };
}

/** Clamp a zoom factor for the tab view. */
export const clampZoom = (z) => Math.round(Math.max(0.6, Math.min(2.2, Number(z) || 1)) * 100) / 100;

/** Playback speeds the transport cycles through. */
export const SPEEDS = [0.5, 0.75, 1, 1.25];
export const nextSpeed = (s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] || 1;

/**
 * Where playback is inside a loop. `elapsed` is song seconds since playback started (already speed-adjusted),
 * `start`/`end` are the loop's song times. Without a loop the position just runs on.
 */
export function loopPosition(elapsed, start, end, loop) {
  if (!loop || !(end > start)) return start + elapsed;
  const len = end - start;
  return start + (((elapsed % len) + len) % len);
}

/**
 * Read a finished touch gesture on the tab: a tap, a long press, or a sideways swipe that moves the cursor.
 * Returns { kind: 'tap' | 'long' | 'swipe' | 'none', step } where step is +1 / -1 (beat) or +2 / -2 (bar) for swipes.
 */
export function readGesture(dx, dy, ms) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 10 && ay < 10) return { kind: ms >= 500 ? 'long' : 'tap', step: 0 };
  if (ax >= 40 && ax > ay * 1.5) {
    const dir = dx < 0 ? 1 : -1; // finger moves left: forward, like turning a page
    return { kind: 'swipe', step: ax >= 160 ? dir * 2 : dir };
  }
  return { kind: 'none', step: 0 };
}
