// Timeline zoom maths (pure, unit tested): how far it can zoom, "fit the whole edit", and ruler tick spacing.

/** Closest zoom in, in pixels per second of video. */
export const ZOOM_MAX = 300;
/** The old fixed limit: short edits can still zoom out to here, past "fit". */
const ZOOM_OUT_SHORT = 10;
/** Floor so the maths stays sane even for a very long edit in a very narrow window. */
const ZOOM_FLOOR = 0.01;
/** Seconds of empty timeline after the end of the edit (the room to drag the end handle out). */
export const TAIL_SEC = 4;
/** Longest edit the timeline and the Length box allow, in seconds (was 10 minutes). */
export const MAX_LENGTH = 3600;

/** Pixels per second at which the whole edit (plus its tail) fits `viewWidth` px. */
export function fitZoom(duration, viewWidth) {
  const w = Math.max(40, (viewWidth || 0) - 8);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_FLOOR, w / (Math.max(1, duration || 0) + TAIL_SEC)));
}

/** Furthest zoom out: the whole edit fits, and short edits keep the old 10 px/s. */
export const zoomMin = (duration, viewWidth) => Math.min(ZOOM_OUT_SHORT, fitZoom(duration, viewWidth));

export const clampZoom = (pps, duration, viewWidth) => Math.min(ZOOM_MAX, Math.max(zoomMin(duration, viewWidth), +pps || ZOOM_MAX));

/** The zoom slider runs on a log scale (0..1000) so every step feels the same at any zoom. */
export const SLIDER_STEPS = 1000;
export function zoomToSlider(pps, min, max = ZOOM_MAX) {
  if (!(max > min)) return SLIDER_STEPS;
  const v = (Math.log(Math.min(max, Math.max(min, pps))) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.round(v * SLIDER_STEPS);
}
export function sliderToZoom(v, min, max = ZOOM_MAX) {
  if (!(max > min)) return max;
  const f = Math.min(1, Math.max(0, v / SLIDER_STEPS));
  return Math.exp(Math.log(min) + f * (Math.log(max) - Math.log(min)));
}

/** scrollLeft that keeps time `t` at `offsetPx` from the left of the view after a zoom. */
export const anchorScroll = (t, pps, offsetPx) => Math.max(0, t * pps - offsetPx);

// Label steps (seconds) the ruler may use, and the minor tick step under each one.
const STEPS = [
  [0.5, 0.1], [1, 0.5], [2, 1], [5, 1], [10, 5], [15, 5], [30, 10], [60, 15], [120, 30], [300, 60], [600, 120], [900, 300], [1800, 600], [3600, 900],
];
/** Labels need this much room ("12:30" plus a gap); minor ticks this much. */
export const LABEL_PX = 56;
const MINOR_PX = 7;

/**
 * Ruler spacing at `pps` px/s: `label` seconds between labelled ticks (always at least LABEL_PX apart, so labels
 * never overlap) and `minor` seconds between unlabelled ticks (0 when they would be too dense to see).
 */
export function rulerSteps(pps) {
  const s = Math.max(1e-6, pps);
  const pick = STEPS.find(([l]) => l * s >= LABEL_PX) || [Math.ceil((LABEL_PX / s) / 3600) * 3600, 900];
  const [label, minor] = pick;
  return { label, minor: minor * s >= MINOR_PX ? minor : 0 };
}

/** Ruler label: m:ss, or h:mm:ss from an hour on. Shows tenths only when labels are under a second apart. */
export function rulerLabel(t, label) {
  const sec = Math.max(0, t);
  if (label < 1) return `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
  const r = Math.round(sec);
  const hh = Math.floor(r / 3600);
  const mm = Math.floor((r % 3600) / 60);
  const ss = String(r % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Beat marks are drawn only while beats are at least this many px apart (they are a solid smear otherwise). */
export const showBeats = (beats, pps) => {
  if (!beats || beats.length < 2) return !!(beats && beats.length);
  const span = beats[beats.length - 1] - beats[0];
  return (span / (beats.length - 1)) * pps >= 4;
};

/** Blocks narrower than this skip their label; narrower than THUMB_PX skip their thumbnail and clip waveform. */
export const LABEL_MIN_PX = 18;
export const THUMB_MIN_PX = 24;
/** Widest backing canvas for a waveform; wider blocks stretch it (a 30-minute song at full zoom is 540,000 px). */
export const WAVE_MAX_PX = 4096;
