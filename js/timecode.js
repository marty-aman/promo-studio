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
    const sec = clockSeconds(t);
    return Number.isFinite(sec) ? frameIndex(sec, fps) / fps : NaN;
  }
  return secFrameSeconds(t, fps);
}

/** "1:02", "1:02.50", "1:02:03.25" → seconds (not snapped); NaN when it is not a clock time. */
function clockSeconds(t) {
  const m = /^(?:(\d+):)?(\d+):(\d{1,2})(?:\.(\d+))?$/.exec(t);
  if (!m) return NaN;
  const [, hh, mm, ss, frac] = m;
  if (hh !== undefined && Number(mm) > 59) return NaN;
  if (Number(ss) > 59) return NaN;
  return (hh ? Number(hh) * 3600 : 0) + Number(mm) * 60 + Number(ss) + (frac ? Number(`0.${frac}`) : 0);
}

/** "12.15" → second 12 + frame 15; NaN when it is not a number or the frame is not under fps. */
function secFrameSeconds(t, fps) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return NaN;
  const frame = m[2] === undefined ? 0 : Number(m[2]);
  if (frame >= fps) return NaN;
  return (Number(m[1]) * fps + frame) / fps;
}

// ---- time fields (song section start/end, custom song-part range): one chosen format, the others when unambiguous

/** The formats a time field can show and read, with their switch labels. */
export const TIME_FORMATS = [
  ['clock', 'Clock m:ss.xx'],
  ['frames', 'Seconds.frames'],
  ['seconds', 'Plain seconds'],
];
const FORMAT_IDS = TIME_FORMATS.map(([k]) => k);
export const cleanFormat = (f) => (FORMAT_IDS.includes(f) ? f : 'clock');
const r3 = (x) => +(+x).toFixed(3);
const snap = (sec, fps) => Math.round(sec * fps + 1e-6) / fps;

/** A time in the field's format: clock 1:23.50, seconds.frame 83.15, or plain seconds 83.5. */
export function formatTimeIn(sec, format = 'clock', fps = FPS) {
  const f = cleanFormat(format);
  if (f === 'frames') return secFrame(sec, fps);
  if (f === 'seconds') return String(r3(Math.max(0, Number(sec) || 0)));
  return clockTime(sec);
}

/** The small line under a field: the same time in the other format(s). */
export function timeHint(sec, format = 'clock', fps = FPS) {
  const f = cleanFormat(format);
  if (f === 'clock') return `${secFrame(sec, fps)} sec.frame`;
  if (f === 'frames') return clockTime(sec);
  return `${clockTime(sec)} · ${secFrame(sec, fps)} sec.frame`;
}

/**
 * Read what was typed into a time field shown in `format`. The rule for a number without a colon:
 *  - anything with a colon is a clock time (1:23, 1:23.5, 01:23.50, 1:02:03.25), whatever the format;
 *  - a trailing "s" means plain seconds (83.5s) and a trailing "f" seconds.frame (83.15f), whatever the format;
 *  - otherwise the field's format decides: Seconds.frames reads 83.15 as second 83, frame 15 (frames under fps);
 *    Clock and Plain seconds read it as 83.15 seconds. A whole number (83) is the same in all three.
 * Clock and seconds.frame times are snapped to the nearest frame, like the player; plain seconds keep 3 decimals.
 * Returns { sec } (null for an empty field) or { error } with a message to show.
 */
export function parseTimeIn(text, format = 'clock', fps = FPS) {
  const f = cleanFormat(format);
  let t = String(text ?? '').trim().replace(/\s+/g, '');
  if (!t) return { sec: null };
  let as = f;
  if (/s$/i.test(t)) (as = 'seconds'), (t = t.slice(0, -1));
  else if (/f$/i.test(t)) (as = 'frames'), (t = t.slice(0, -1));
  if (t.includes(':')) {
    const sec = clockSeconds(t);
    if (!Number.isFinite(sec)) return { error: 'That is not a clock time. Type it like 1:23.50 (minutes:seconds.hundredths) or 1:02:03 with hours.' };
    return { sec: as === 'seconds' ? r3(sec) : snap(sec, fps) };
  }
  if (as === 'frames') {
    const sec = secFrameSeconds(t, fps);
    if (Number.isFinite(sec)) return { sec };
    const m = /^\d+\.(\d+)$/.exec(t);
    if (m) return { error: `Frame ${Number(m[1])} is too high: at ${fps} fps the frames go from 0 to ${fps - 1}. For decimal seconds type ${t}s.` };
    return { error: 'Type a time like 83.15 (second 83, frame 15) or 1:23.50.' };
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: as === 'seconds' ? 'Type a number of seconds like 83.5, or a clock time like 1:23.50.' : 'Type a time like 1:23.50, or seconds like 83.5.' };
  return { sec: as === 'seconds' ? r3(+t) : snap(+t, fps) };
}

/** One nudge step from `sec`: a frame in Clock and Seconds.frames, 0.1 s in Plain seconds, a second with big. Never below 0. */
export function stepTime(sec, format = 'clock', dir = 1, big = false, fps = FPS) {
  const s = Math.max(0, Number(sec) || 0);
  if (cleanFormat(format) === 'seconds') return Math.max(0, r3(s + dir * (big ? 1 : 0.1)));
  const frame = Math.round(s * fps + 1e-6) + dir * (big ? fps : 1);
  return Math.max(0, frame) / fps;
}
