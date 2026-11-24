// Time readouts for the Video Studio player: a clock timestamp and seconds.frame, plus a parser for the seek box.
// Pure functions, no DOM.

/** The edit's frame rate. The arrow-key step, the Sound sync frame nudge and the default export all use 30 fps. */
export const FPS = 30;

/** Whole frames in `sec` at `fps`. The small epsilon keeps 0.1 s × 30 at frame 3, not 2.9999 → 2. */
export function frameIndex(sec, fps = FPS) {
  const s = Math.max(0, Number(sec) || 0);
  return Math.floor(s * fps + 1e-6);
}

/** Digits a frame number takes at this fps: 2 for 24, 25, 30 and 60 fps, 3 for 120 fps. */
export function frameDigits(fps = FPS) {
  return String(Math.max(1, Math.round(fps) - 1)).length;
}

/**
 * Clock timestamp in the app's usual m:ss.cc (centiseconds), with h:mm:ss.cc from one hour on.
 * Negative and missing values show as 0:00.00.
 */
export function clockTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const cTotal = Math.floor(s * 100 + 1e-6);
  const cs = cTotal % 100;
  const whole = Math.floor(cTotal / 100);
  const hrs = Math.floor(whole / 3600);
  const min = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const tail = `${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  return hrs ? `${hrs}:${String(min).padStart(2, '0')}:${tail}` : `${min}:${tail}`;
}

/** Seconds.frame: 12.15 is second 12, frame 15. The frame is zero-padded to the fps digits and never reaches fps. */
export function secFrame(sec, fps = FPS) {
  const f = frameIndex(sec, fps);
  const whole = Math.floor(f / fps);
  return `${whole}.${String(f % fps).padStart(frameDigits(fps), '0')}`;
}

/**
 * Parse what someone types in the seek box. Accepts:
 *  - seconds.frame: "12.15" (frame 15 of second 12), "12" (whole seconds); the frame must be under fps
 *  - a clock time: "1:02", "1:02.50" (centiseconds, like the readout), "1:02:03.25"
 * Returns seconds snapped to a frame, or NaN when the text is not a time.
 */
export function parseSeek(text, fps = FPS) {
  const t = String(text ?? '').trim().replace(/s$/i, '');
  if (!t) return NaN;
  if (t.includes(':')) {
    const m = /^(?:(\d+):)?(\d+):(\d{1,2})(?:\.(\d+))?$/.exec(t);
    if (!m) return NaN;
    const [, hh, mm, ss, frac] = m;
    if (hh !== undefined && Number(mm) > 59) return NaN;
    if (Number(ss) > 59) return NaN;
    const sec = (hh ? Number(hh) * 3600 : 0) + Number(mm) * 60 + Number(ss) + (frac ? Number(`0.${frac}`) : 0);
    return frameIndex(sec, fps) / fps;
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return NaN;
  const frame = m[2] === undefined ? 0 : Number(m[2]);
  if (frame >= fps) return NaN;
  return (Number(m[1]) * fps + frame) / fps;
}
