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
  ['scatter', 'Scatter apart'],
  ['ash', 'Smoke / ash dissolve'],
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
  ['scatter', 'Fly in from all sides'],
  ['ash', 'Drift in from smoke'],
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
    case 'scatter': // the whole block tumbles off to the top left, swelling (a clip or layer; text scatters word by word)
      r.fx = -0.32 * easeIn(q);
      r.fy = -0.2 * easeIn(q);
      r.rot = -0.55 * easeIn(q);
      r.scale = 1 + 0.7 * easeIn(q);
      r.alpha = 1 - clamp01((q - 0.25) / 0.75);
      break;
    case 'ash': // the whole block blurs, drifts up and fades (text does it letter by letter)
      r.fy = -0.09 * (1 - (1 - q) * (1 - q));
      r.blur = 0.03 * q;
      r.scale = 1 + 0.05 * q;
      r.alpha = 1 - smooth(q);
      break;
    case 'fade':
    default:
      r.alpha = 1 - q;
  }
  return r;
}

const STILL_PIECE = Object.freeze({ tx: 0, ty: 0, rot: 0, scale: 1, alpha: 1 });
/**
 * Scatter, one word: q = how far through the exit (0..1); (dx, dy) = where the word's centre sits against the block's
 * centre, in px; far = how far a word flies at most, in px (the frame's width or so). Words start flying one after
 * another (a delay of up to 30% of the exit), go outward from the centre with a little spread and spin, swell and
 * fade out. Returns { tx, ty (px), rot (radians), scale, alpha }. Pure: the same inputs give the same pose.
 * i is the word's number (it picks its spin and delay); dist and spin are the effect settings (×1 = as designed).
 */
export function scatterPiece(i, q0, dx, dy, far, dist = 1, spin = 1) {
  const q = clamp01(q0);
  if (q <= 0) return STILL_PIECE;
  const delay = hash(i * 2.3 + 5) * 0.3;
  const k = clamp01((q - delay) / (1 - delay));
  if (k <= 0) return STILL_PIECE;
  const ang = Math.hypot(dx, dy) > far * 0.04 ? Math.atan2(dy, dx) + (hash(i * 1.7 + 1) - 0.5) * 0.6 : hash(i * 3.1 + 2) * Math.PI * 2;
  const d = far * 0.9 * dist * easeIn(k);
  return {
    tx: Math.cos(ang) * d,
    ty: Math.sin(ang) * d,
    rot: (hash(i * 4.3 + 9) - 0.5) * 4.4 * spin * easeIn(k),
    scale: 1 + 0.5 * k,
    alpha: 1 - clamp01((k - 0.45) / 0.55),
  };
}

const STILL_LETTER = Object.freeze({ alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0 });
/**
 * Ash dissolve, one letter: q = how far through the exit, n = the letter's number in the line, frame = whole frames
 * (at 30 a second) of the line's life, so the sway is the same in the preview and in an export. Letters start at
 * different moments (a stagger of up to 55% of the exit, ×stagger), then blur, drift up and fade. Returns
 * { alpha, dx, dy, scale, blur }, the offsets and blur in ems (multiply by the font size). No Math.random.
 */
export function ashLetter(n, q0, frame, drift = 1, blurAmt = 1, stagger = 1) {
  const q = clamp01(q0);
  if (q <= 0) return STILL_LETTER;
  const delay = Math.min(0.8, hash(n * 1.9 + 3) * 0.55 * stagger);
  const k = clamp01((q - delay) / (1 - delay));
  if (k <= 0) return STILL_LETTER;
  return {
    alpha: 1 - smooth(k),
    dx: ((hash(n * 7.7 + 1) - 0.5) * 0.5 + Math.sin(frame * 0.12 + n) * 0.06) * k,
    dy: -0.9 * drift * (1 - (1 - k) * (1 - k)),
    scale: 1 + 0.12 * k,
    blur: 0.2 * blurAmt * k,
  };
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
