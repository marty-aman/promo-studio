// Exit (and layer entrance) animations, shared by text, lyrics, layers and clips. Pure, unit tested.
// exitTransform(type, q): q = how far through the exit (0 = still fully there, 1 = gone). Returns
//   { alpha, scale, fx, fy, rot, blur }: fx / fy as fractions of the frame (width / height), rot in
//   radians, blur as a fraction of the frame height (callers turn it into pixels).
// An entrance is the matching exit played backwards: enterTransform(type, p) = exitTransform(type, 1 − p).

export const EXITS = [
  ['fade', 'Fade out'],
  ['popout', 'Pop out'],
  ['zoomout', 'Zoom out (grow and fade)'],
  ['shrink', 'Shrink away'],
  ['slidedown', 'Slide down'],
  ['slideup', 'Slide up'],
  ['slideleft', 'Slide off left'],
  ['slideright', 'Slide off right'],
  ['blur', 'Blur out'],
  ['spin', 'Spin out'],
  ['drop', 'Drop away'],
  ['glitch', 'Glitch out'],
  ['flicker', 'Flicker off'],
  ['cut', 'Cut (no exit)'],
];
/** Layer entrances, named for what you see (the exit played backwards). */
export const ENTRANCES = [
  ['fade', 'Fade in'],
  ['popout', 'Pop in'],
  ['zoomout', 'Zoom in from big'],
  ['shrink', 'Grow from small'],
  ['slidedown', 'Rise up from below'],
  ['slideup', 'Drop in from above'],
  ['slideleft', 'Slide in from the left'],
  ['slideright', 'Slide in from the right'],
  ['blur', 'Blur in'],
  ['spin', 'Spin in'],
  ['glitch', 'Glitch in'],
  ['flicker', 'Flicker on'],
  ['cut', 'Cut (no entrance)'],
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeIn = (p) => p * p * p;
const smooth = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
export const STILL = Object.freeze({ alpha: 1, scale: 1, fx: 0, fy: 0, rot: 0, blur: 0 });

export function exitTransform(type, q0) {
  const q = clamp01(q0);
  if (q <= 0) return STILL;
  const r = { alpha: 1, scale: 1, fx: 0, fy: 0, rot: 0, blur: 0 };
  switch (type) {
    case 'cut':
    case 'none':
      r.alpha = q >= 1 ? 0 : 1;
      break;
    case 'popout': // a quick swell, then it snaps away
      r.scale = q < 0.3 ? 1 + 0.4 * q : 1.12 * (1 - easeIn((q - 0.3) / 0.7));
      r.alpha = 1 - clamp01((q - 0.55) / 0.45);
      break;
    case 'zoomout':
      r.scale = 1 + 0.8 * easeIn(q);
      r.alpha = 1 - smooth(q);
      break;
    case 'shrink':
      r.scale = 1 - 0.95 * easeIn(q);
      r.alpha = 1 - q * q;
      break;
    case 'slidedown':
      r.fy = 0.22 * easeIn(q);
      r.alpha = 1 - smooth(q);
      break;
    case 'slideup':
      r.fy = -0.22 * easeIn(q);
      r.alpha = 1 - smooth(q);
      break;
    case 'slideleft':
      r.fx = -0.7 * easeIn(q);
      r.alpha = 1 - clamp01((q - 0.4) / 0.6);
      break;
    case 'slideright':
      r.fx = 0.7 * easeIn(q);
      r.alpha = 1 - clamp01((q - 0.4) / 0.6);
      break;
    case 'blur':
      r.blur = 0.025 * q;
      r.scale = 1 + 0.05 * q;
      r.alpha = 1 - smooth(q);
      break;
    case 'spin':
      r.rot = Math.PI * easeIn(q);
      r.scale = 1 - 0.9 * smooth(q);
      r.alpha = 1 - q * q;
      break;
    case 'drop': // falls like it lost its grip
      r.fy = 0.7 * q * q;
      r.rot = 0.35 * q * q;
      r.alpha = 1 - clamp01((q - 0.6) / 0.4);
      break;
    case 'glitch': {
      const step = Math.floor(q * 24);
      r.fx = (hash(step) - 0.5) * 0.08 * q;
      r.fy = (hash(step + 7) - 0.5) * 0.03 * q;
      r.alpha = q >= 1 ? 0 : hash(step + 3) < q * 0.9 ? 0.15 : 1 - q * 0.5;
      break;
    }
    case 'flicker': {
      const step = Math.floor(q * 18);
      r.alpha = q >= 1 ? 0 : hash(step + 11) < q ? 0.1 : 1 - q * 0.3;
      break;
    }
    case 'fade':
    default:
      r.alpha = 1 - q;
  }
  return r;
}
export const enterTransform = (type, p) => exitTransform(type, 1 - clamp01(p));

/**
 * How far into its exit an item is: `remaining` seconds left of `dur` exit time → q in 0..1.
 * And into its entrance: `life` seconds since it started.
 */
export const exitProgress = (remaining, dur) => (dur > 0 ? clamp01(1 - remaining / dur) : remaining <= 0 ? 1 : 0);
export const enterProgress = (life, dur) => (dur > 0 ? clamp01(life / dur) : 1);

/** Combine an entrance and an exit (the stronger effect of each wins). */
export function combine(a, b) {
  return { alpha: a.alpha * b.alpha, scale: a.scale * b.scale, fx: a.fx + b.fx, fy: a.fy + b.fy, rot: a.rot + b.rot, blur: Math.max(a.blur, b.blur) };
}
export const isStill = (x) => x.alpha === 1 && x.scale === 1 && !x.fx && !x.fy && !x.rot && !x.blur;
