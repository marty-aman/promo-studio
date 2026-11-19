// Draws one frame of the project onto a 2D canvas. Used by the preview and the exporter.
import {
  clamp,
  ease,
  layoutClips,
  activeLyric,
  timelineToSong,
  wordTimings,
  fadeGain,
  ctaText,
  noise,
  beatEnvelope,
} from './core.js';
import { FILTER_PRESETS, PLATFORMS, isVisible, overlayClipAt } from './state.js';
import { drawPlatformOverlay, overlaySupported } from './overlays.js';
import { drawTab } from './tab.js';
import { drawDrums } from './drums.js';
import { drawViz } from './viz.js';
import { drawLyricDisplay } from './lyricviz.js';
import { lineStyle } from './linestyle.js';
import { drawBackdrop } from './backgrounds.js';
import { blurred } from './canvasfx.js';
import { animate } from './keyframes.js';
import { exitTransform, enterTransform, exitProgress, enterProgress, combine, isStill, STILL } from './exits.js';

// what the frame being rendered needs deep inside drawClip (set at the start of renderFrame)
const FRAME = { env: null, t: 0, beat: 0 };

// ------------------------------------------------------------ helpers

function filterString(f, extraBlurPx = 0, grade = null) {
  const base = FILTER_PRESETS[(f && f.preset) || 'none'] || FILTER_PRESETS.none;
  const v = { ...base, ...((f && f.adjust) || {}) };
  if (grade) {
    v.brightness *= grade.exposure ?? 1;
    v.contrast *= grade.contrast ?? 1;
    v.saturate *= grade.saturation ?? 1;
  }
  const parts = [];
  if (v.brightness !== 1) parts.push(`brightness(${v.brightness})`);
  if (v.contrast !== 1) parts.push(`contrast(${v.contrast})`);
  if (v.saturate !== 1) parts.push(`saturate(${v.saturate})`);
  if (v.grayscale) parts.push(`grayscale(${v.grayscale})`);
  if (v.sepia) parts.push(`sepia(${v.sepia})`);
  if (v.hue) parts.push(`hue-rotate(${v.hue}deg)`);
  const blur = (v.blur || 0) + extraBlurPx;
  if (blur) parts.push(`blur(${blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

function srcSize(src) {
  return {
    w: src.videoWidth || src.naturalWidth || src.width || 1,
    h: src.videoHeight || src.naturalHeight || src.height || 1,
  };
}

function hasFrame(src) {
  if (!src) return false;
  if (src instanceof HTMLVideoElement) return src.readyState >= 2;
  if (src instanceof HTMLImageElement) return src.complete && src.naturalWidth > 0;
  return true;
}

/** Draw src into the W x H frame. fit: cover | contain | blurfill. */
function drawFitted(ctx, src, W, H, { fit = 'cover', zoom = 1, x = 0, y = 0, rotate = 0 } = {}) {
  const { w, h } = srcSize(src);
  if (fit === 'blurfill') fit = 'contain';
  const scale = (fit === 'cover' ? Math.max(W / w, H / h) : Math.min(W / w, H / h)) * zoom;
  const dw = w * scale;
  const dh = h * scale;
  // x / y in -1..1 pan within the overflow (or a fraction of the frame when contained)
  const ox = (W - dw) / 2 + (x * Math.abs(dw - W || W * 0.5)) / 2;
  const oy = (H - dh) / 2 + (y * Math.abs(dh - H || H * 0.5)) / 2;
  if (rotate) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(src, ox, oy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(src, ox, oy, dw, dh);
  }
}

/** Blurred, darkened full-frame copy of src (background for "Fit + blur", masks and small pictures). */
function drawBlurBg(ctx, src, W, H, filter = 'none') {
  const { w, h } = srcSize(src);
  ctx.save();
  ctx.filter = `${filter === 'none' ? '' : filter + ' '}blur(${Math.round(W * 0.03)}px) brightness(0.7)`;
  const s = Math.max(W / w, H / h) * 1.1;
  ctx.drawImage(src, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexToRgba(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return `rgba(0,0,0,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

function luminance(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const readableOn = (hex) => (luminance(hex) > 0.45 ? '#111111' : '#ffffff');

const fontStr = (px, family) => `${Math.round(px)}px "${family}", Impact, "Arial Black", sans-serif`;

/** Word-wrap into lines of {words:[{text,w}], width}. */
function layoutWords(ctx, text, maxW) {
  const space = ctx.measureText(' ').width;
  const lines = [];
  let cur = { words: [], width: 0 };
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const w = ctx.measureText(word).width;
    const add = cur.words.length ? space + w : w;
    if (cur.words.length && cur.width + add > maxW) {
      lines.push(cur);
      cur = { words: [], width: 0 };
      cur.words.push({ text: word, w });
      cur.width = w;
    } else {
      cur.words.push({ text: word, w });
      cur.width += add;
    }
  }
  if (cur.words.length) lines.push(cur);
  return { lines, space };
}

export const TEXT_ANIMATIONS = [
  ['pop', 'Pop in'],
  ['fade', 'Fade'],
  ['slide', 'Slide up'],
  ['rise', 'Words rise'],
  ['bounce', 'Words drop & bounce'],
  ['zoom', 'Zoom in from big'],
  ['blur', 'Blur in'],
  ['spin', 'Spin in'],
  ['flip', 'Flip open'],
  ['typewriter', 'Typewriter'],
  ['karaoke', 'Karaoke highlight'],
  ['words', 'Word by word'],
  ['wave', 'Wave'],
  ['neon', 'Neon flicker'],
  ['glitch', 'Glitch'],
  ['beat', 'Pulse on the beat'],
  ['none', 'No animation'],
];

const outBounce = (x) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  let t = clamp(x, 0, 1);
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/**
 * Draw an animated text block.
 * style: {font,sizePx,color,highlight,outline,outlineWidth,shadow,box,boxColor,boxOpacity,align,uppercase,maxW,animation}
 * life: seconds since the block started; dur: block length; beat: 0..1 beat envelope.
 */
function drawAnimatedText(ctx, text, cx, cy, style, life, dur, beat = 0) {
  if (!text) return;
  const t = style.uppercase ? text.toUpperCase() : text;
  const px = style.sizePx;
  ctx.save();
  ctx.font = fontStr(px, style.font);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const { lines, space } = layoutWords(ctx, t, style.maxW);
  const lh = px * 1.12;
  const totalH = lines.length * lh;

  const anim = style.animation || 'none';
  const inT = 0.35;
  const outT = 0.2;
  const pIn = clamp(life / inT, 0, 1);
  // with an exit animation chosen, it replaces the old short fade at the end
  const exitType = style.outAnimation;
  const pOut = exitType ? 1 : clamp((dur - life) / outT, 0, 1);
  const frame = Math.floor(life * 30);
  let alpha = anim === 'none' ? 1 : pOut;
  let scale = 1;
  let dy = 0;
  let rot = 0;
  let scaleY = 1;
  switch (anim) {
    case 'pop':
      scale = 0.6 + 0.4 * ease.outBack(pIn);
      alpha = Math.min(pOut, clamp(life / 0.12, 0, 1));
      break;
    case 'fade':
      alpha = Math.min(pIn, pOut);
      break;
    case 'slide':
      dy = (1 - ease.outCubic(pIn)) * px * 0.9;
      alpha = Math.min(pIn, pOut);
      break;
    case 'zoom':
      scale = 1 + 1.4 * (1 - ease.outCubic(pIn));
      alpha = Math.min(pIn, pOut);
      break;
    case 'blur':
      ctx.filter = `blur(${((1 - pIn) * px * 0.35).toFixed(1)}px)`;
      alpha = Math.min(pIn, pOut);
      break;
    case 'spin':
      rot = (1 - ease.outBack(pIn)) * -0.7;
      scale = 0.4 + 0.6 * ease.outBack(pIn);
      alpha = Math.min(clamp(life / 0.12, 0, 1), pOut);
      break;
    case 'flip':
      scaleY = Math.max(0.02, ease.outBack(pIn));
      break;
    case 'neon': {
      // flickers on like a tube, then hums
      const on = life > 0.45 || noise(frame) > 0.45;
      alpha = Math.min(pOut, on ? 1 : 0.15);
      break;
    }
    case 'beat':
      scale = 1 + 0.12 * beat;
      alpha = Math.min(clamp(life / 0.1, 0, 1), pOut);
      break;
    default:
  }
  let ex = STILL;
  if (exitType) {
    ex = exitTransform(exitType, exitProgress(dur - life, style.outDuration ?? 0.35));
    if (ex.blur) ctx.filter = `blur(${(ex.blur * ctx.canvas.height).toFixed(1)}px)`;
  }
  ctx.globalAlpha *= alpha * (style.opacity ?? 1) * ex.alpha;
  ctx.translate(cx + ex.fx * ctx.canvas.width, cy + dy + ex.fy * ctx.canvas.height);
  rot += ((style.rotate || 0) * Math.PI) / 180 + ex.rot;
  if (rot) ctx.rotate(rot);
  ctx.scale(scale * ex.scale, scale * scaleY * ex.scale);

  // progress through the line for per-word effects (finish slightly before the end)
  const prog = clamp(life / Math.max(0.2, dur * 0.92), 0, 1);
  const timings = wordTimings(t);
  const totalChars = t.replace(/\s+/g, '').length;
  const reveal = anim === 'typewriter' ? Math.floor(clamp(life / Math.max(0.3, Math.min(dur * 0.6, totalChars * 0.06)), 0, 1) * totalChars) : Infinity;
  const glitching = anim === 'glitch' && (life < 0.35 || noise(frame * 3.1) > 0.93);

  const outlinePx = px * (style.outlineWidth || 0) * 0.12;
  let wi = 0;
  let charsSoFar = 0;
  lines.forEach((line, li) => {
    const y = -totalH / 2 + lh * (li + 0.5);
    let x = style.align === 'left' ? -style.maxW / 2 : style.align === 'right' ? style.maxW / 2 - line.width : -line.width / 2;
    if (style.box) {
      const padX = px * 0.28;
      const padY = px * 0.08;
      ctx.save();
      ctx.fillStyle = hexToRgba(style.boxColor, style.boxOpacity ?? 0.6);
      roundRect(ctx, x - padX, y - lh / 2 - padY + lh * 0.06, line.width + padX * 2, lh + padY * 2 - lh * 0.12, px * 0.18);
      ctx.fill();
      ctx.restore();
    }
    for (const word of line.words) {
      const idx = wi;
      const wt = timings[wi] || { start: 0, end: 1 };
      wi += 1;
      let text = word.text;
      if (charsSoFar >= reveal) {
        charsSoFar += text.length;
        x += word.w + space;
        continue;
      }
      if (charsSoFar + text.length > reveal) text = text.slice(0, reveal - charsSoFar);
      charsSoFar += word.text.length;

      let wScale = 1;
      let wAlpha = 1;
      let wy = 0;
      let wx = 0;
      if (anim === 'words') {
        const since = (prog - wt.start) * dur;
        if (since < 0) {
          x += word.w + space;
          continue;
        }
        wScale = 0.7 + 0.3 * ease.outBack(clamp(since / 0.18, 0, 1));
        wAlpha = clamp(since / 0.08, 0, 1);
      } else if (anim === 'rise' || anim === 'bounce') {
        const since = life - idx * (anim === 'rise' ? 0.06 : 0.08);
        if (since < 0) {
          x += word.w + space;
          continue;
        }
        if (anim === 'rise') {
          wy = (1 - ease.outCubic(clamp(since / 0.35, 0, 1))) * px * 0.8;
          wAlpha = clamp(since / 0.2, 0, 1);
        } else {
          wy = -(1 - outBounce(clamp(since / 0.55, 0, 1))) * px * 1.6;
          wAlpha = clamp(since / 0.1, 0, 1);
        }
      } else if (anim === 'wave') {
        wy = Math.sin(life * 5 - idx * 0.7) * px * 0.12;
        wAlpha = Math.min(1, clamp(life / 0.2, 0, 1));
      }
      if (glitching) {
        wx = (noise(frame + idx * 7) - 0.5) * px * 0.25;
        wy += (noise(frame * 1.7 + idx) - 0.5) * px * 0.12;
      }
      ctx.save();
      ctx.globalAlpha *= wAlpha;
      ctx.translate(x + word.w / 2 + wx, y + wy);
      ctx.scale(wScale, wScale);
      ctx.textAlign = 'center';
      if (glitching) {
        const off = px * 0.06;
        ctx.globalAlpha *= 0.8;
        ctx.fillStyle = '#00f0ff';
        ctx.fillText(text, -off, 0);
        ctx.fillStyle = '#ff2bd6';
        ctx.fillText(text, off, 0);
        ctx.globalAlpha /= 0.8;
      }
      if (anim === 'neon') {
        ctx.shadowColor = style.highlight;
        ctx.shadowBlur = px * (0.45 + 0.1 * Math.sin(life * 12));
      } else if (style.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = px * 0.18;
        ctx.shadowOffsetY = px * 0.05;
      }
      if (outlinePx > 0) {
        ctx.strokeStyle = anim === 'neon' ? style.highlight : style.outline;
        ctx.lineWidth = outlinePx * 2;
        ctx.strokeText(text, 0, 0);
        if (anim !== 'neon') ctx.shadowColor = 'transparent';
      }
      const highlighted = (anim === 'karaoke' || anim === 'words') && prog >= wt.end;
      ctx.fillStyle = highlighted ? style.highlight : style.color;
      ctx.fillText(text, 0, 0);
      ctx.shadowColor = 'transparent';
      if (anim === 'karaoke' && prog > wt.start && prog < wt.end) {
        const f = (prog - wt.start) / (wt.end - wt.start);
        ctx.beginPath();
        ctx.rect(-word.w / 2, -lh, word.w * f, lh * 2);
        ctx.clip();
        ctx.fillStyle = style.highlight;
        ctx.fillText(text, 0, 0);
      }
      ctx.restore();
      x += word.w + space;
    }
  });
  ctx.restore();
}


// Film grain tile, generated once.
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  const img = g.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

// ------------------------------------------------------------ layers

// Reusable offscreen canvases for pixelate, mirror, RGB split and similar effects.
const scratch = {};
function layer(name, W, H) {
  let c = scratch[name];
  if (!c) c = scratch[name] = document.createElement('canvas');
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.clearRect(0, 0, W, H);
  return [c, g];
}
function snapshotFrame(ctx, W, H) {
  const [c, g] = layer('frame', W, H);
  g.drawImage(ctx.canvas, 0, 0, W, H);
  return c;
}

export const TRANSITIONS = [
  ['none', 'Hard cut'],
  ['crossfade', 'Crossfade'],
  ['fade', 'Fade from black'],
  ['dipBlack', 'Dip to black'],
  ['dipWhite', 'Dip to white'],
  ['flash', 'White flash'],
  ['blur', 'Blur dissolve'],
  ['zoom', 'Zoom punch'],
  ['zoomOut', 'Zoom out'],
  ['zoomThrough', 'Zoom through'],
  ['spin', 'Spin'],
  ['slide', 'Push left'],
  ['pushUp', 'Push up'],
  ['slideOver', 'Slide over'],
  ['whip', 'Whip pan'],
  ['wipe', 'Wipe right'],
  ['wipeDown', 'Wipe down'],
  ['split', 'Split open'],
  ['iris', 'Circle reveal'],
  ['pixelate', 'Pixelate'],
  ['glitch', 'Glitch'],
  ['rgbSplit', 'RGB split'],
  ['shake', 'Shake'],
  ['lightLeak', 'Light leak'],
];

export const END_ANIMATIONS = [
  ['rise', 'Rise up'],
  ['zoom', 'Zoom'],
  ['spin', 'Spin in'],
  ['drop', 'Drop & bounce'],
  ['flip', 'Card flip'],
  ['vinyl', 'Vinyl slides out'],
  ['glitch', 'Glitch'],
  ['none', 'None'],
];

export const CLIP_EFFECTS = {
  beatPulse: 'Zoom pulse on the beat',
  shake: 'Camera shake',
  rgb: 'RGB split',
  flicker: 'Flicker',
  vhs: 'VHS tape',
  strobe: 'Strobe on the beat',
  invertBeat: 'Invert on the beat',
};
export const MIRRORS = [
  ['none', 'No mirror'],
  ['h', 'Mirror left → right'],
  ['v', 'Mirror top → bottom'],
  ['quad', 'Kaleidoscope (4-way)'],
];

function clipMotion(clip, local) {
  const k = clip.kenBurns;
  if (!k) return { zoom: clip.zoom || 1, x: clip.panX || 0, y: clip.panY || 0 };
  const f = ease.inOut(clamp(local / clip.duration, 0, 1));
  return {
    zoom: (clip.zoom || 1) * (k.fromZoom + (k.toZoom - k.fromZoom) * f),
    x: k.fromX + (k.toX - k.fromX) * f,
    y: k.fromY + (k.toY - k.fromY) * f,
  };
}

export const MASK_SHAPES = [
  ['none', 'No mask'],
  ['circle', 'Circle'],
  ['oval', 'Oval'],
  ['rounded', 'Rounded rectangle'],
  ['square', 'Square'],
  ['arch', 'Arch window'],
  ['heart', 'Heart'],
  ['star', 'Star'],
  ['diamond', 'Diamond'],
  ['hexagon', 'Hexagon'],
  ['topHalf', 'Top part (split screen)'],
  ['bottomHalf', 'Bottom part (split screen)'],
  ['leftHalf', 'Left part'],
  ['rightHalf', 'Right part'],
];

/** Build the mask path on g (centered at the mask position, rotated) and run paint(g). */
function withMaskPath(g, W, H, m, paint) {
  const s = m.size ?? 0.8;
  const cx = W / 2 + ((m.x || 0) * W) / 2;
  const cy = H / 2 + ((m.y || 0) * H) / 2;
  g.save();
  g.beginPath();
  const halves = { topHalf: [0, 0, W, cy], bottomHalf: [0, cy, W, H - cy], leftHalf: [0, 0, cx, H], rightHalf: [cx, 0, W - cx, H] };
  if (halves[m.shape]) {
    g.rect(...halves[m.shape]);
  } else {
    g.translate(cx, cy);
    if (m.rotate) g.rotate((m.rotate * Math.PI) / 180);
    const r = (W * s) / 2;
    const poly = (n, inner = null, ry = 1) => {
      const pts = inner ? n * 2 : n;
      for (let i = 0; i < pts; i++) {
        const rad = inner && i % 2 ? r * inner : r;
        const a = -Math.PI / 2 + (i * Math.PI * 2) / pts;
        const fn = i ? 'lineTo' : 'moveTo';
        g[fn](Math.cos(a) * rad, Math.sin(a) * rad * ry);
      }
      g.closePath();
    };
    switch (m.shape) {
      case 'circle':
        g.arc(0, 0, r, 0, Math.PI * 2);
        break;
      case 'oval':
        g.ellipse(0, 0, r, r * 1.4, 0, 0, Math.PI * 2);
        break;
      case 'rounded':
        roundRect(g, -(W * s) / 2, -(H * s) / 2, W * s, H * s, W * 0.06);
        break;
      case 'square':
        roundRect(g, -r, -r, r * 2, r * 2, W * 0.02);
        break;
      case 'arch': {
        const hh = r * 2.8;
        g.moveTo(-r, hh / 2);
        g.lineTo(-r, -hh / 2 + r);
        g.arc(0, -hh / 2 + r, r, Math.PI, 0);
        g.lineTo(r, hh / 2);
        g.closePath();
        break;
      }
      case 'heart': {
        const k = (r * 2) / 34;
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2;
          const x = 16 * Math.pow(Math.sin(t), 3) * k;
          const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k;
          g[i ? 'lineTo' : 'moveTo'](x, y);
        }
        g.closePath();
        break;
      }
      case 'star':
        poly(5, 0.45);
        break;
      case 'diamond':
        poly(4, null, 1.3);
        break;
      case 'hexagon':
        poly(6);
        break;
      default:
        g.rect(-W, -H, W * 2, H * 2);
    }
  }
  paint(g);
  g.restore();
}

export const GRADE_PRESETS = {
  none: { label: 'None' },
  tealOrange: { label: 'Teal & orange', contrast: 1.15, saturation: 1.1, shadows: '#00586e', shadowsAmt: 0.45, highlights: '#ffb066', highlightsAmt: 0.3 },
  golden: { label: 'Golden hour', exposure: 1.05, saturation: 1.1, temperature: 0.6, highlights: '#ffd28c', highlightsAmt: 0.3 },
  moody: { label: 'Moody', exposure: 0.9, contrast: 1.1, saturation: 0.8, shadows: '#141e3c', shadowsAmt: 0.45, fade: 0.15 },
  cyberpunk: { label: 'Cyberpunk', contrast: 1.2, saturation: 1.3, tint: 0.45, shadows: '#1e005a', shadowsAmt: 0.5, highlights: '#00ffe6', highlightsAmt: 0.25 },
  bleach: { label: 'Bleach bypass', exposure: 1.05, contrast: 1.35, saturation: 0.55 },
  vintage: { label: 'Vintage film', contrast: 0.9, saturation: 0.75, temperature: 0.3, fade: 0.35, highlights: '#ffebc8', highlightsAmt: 0.2 },
  crossProcess: { label: 'Cross process', saturation: 1.2, tint: 0.25, shadows: '#003c78', shadowsAmt: 0.3, highlights: '#fff096', highlightsAmt: 0.3 },
  cold: { label: 'Cold blue', saturation: 0.85, temperature: -0.55, shadows: '#0a1e3c', shadowsAmt: 0.3 },
  matte: { label: 'Matte', contrast: 0.9, fade: 0.3 },
  mono: { label: 'High-contrast mono', contrast: 1.3, saturation: 0 },
  sunset: { label: 'Sunset pink', temperature: 0.35, tint: 0.3, highlights: '#ff9ec4', highlightsAmt: 0.35, saturation: 1.15 },
};

/** Temperature, tint, split-toning and fade, applied over the frame with blend modes. */
function applyGradeWash(ctx, W, H, gr) {
  if (!gr) return;
  const fill = (color, alpha, op) => {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };
  const temp = gr.temperature || 0;
  if (temp) fill(temp > 0 ? '#ff9628' : '#2880ff', Math.abs(temp) * 0.5, 'soft-light');
  const tint = gr.tint || 0;
  if (tint) fill(tint > 0 ? '#ff00c8' : '#00ff50', Math.abs(tint) * 0.35, 'soft-light');
  if (gr.shadows) fill(gr.shadows, (gr.shadowsAmt || 0) * 0.6, 'lighten');
  if (gr.highlights) fill(gr.highlights, (gr.highlightsAmt || 0) * 0.6, 'darken');
  if (gr.fade) fill('#2a2a2a', gr.fade, 'lighten');
}

/** extra: { alpha, dx, dy, zoom, blur, rot (deg) } on top of the clip's own framing. */
function drawClip(ctx, W, H, clip0, local, src, extra0 = {}) {
  if (!hasFrame(src)) return false;
  // keyframed properties take their value at this moment; opacity and blur add to the effect's own
  const clip = animate(clip0, local);
  const extra = clip === clip0 && clip.opacity == null && !clip.blur ? extra0 : { ...extra0, alpha: (extra0.alpha ?? 1) * (clip.opacity ?? 1), blur: (extra0.blur || 0) + (clip.blur || 0) };
  const m = clipMotion(clip, local);
  const mask = clip.mask && clip.mask.shape && clip.mask.shape !== 'none' ? clip.mask : null;
  const filter = filterString(clip.filter, extra.blur || 0, clip.grade);
  const alpha = extra.alpha != null ? clamp(extra.alpha, 0, 1) : 1;
  const small = (m.zoom * (extra.zoom || 1) < 1 || clip.posX || clip.posY) && clip.fit !== 'contain';
  // the picture's framing, shared by the frame and its cut-out matte so they line up exactly
  const paint = (g, source) => {
    g.save();
    g.translate((extra.dx || 0) + ((clip.posX || 0) * W) / 2, (extra.dy || 0) + ((clip.posY || 0) * H) / 2);
    if (clip.flip) {
      g.translate(W, 0);
      g.scale(-1, 1);
    }
    drawFitted(g, source, W, H, {
      fit: clip.fit || 'cover',
      zoom: m.zoom * (extra.zoom || 1),
      x: m.x,
      y: m.y,
      rotate: (clip.rotate || 0) + (extra.rot || 0),
    });
    g.restore();
  };

  // remove background: draw the chosen background, then only the cut-out of the picture
  const matte = clip.bgRemove && clip.bgRemove.enabled && FRAME.env && FRAME.env.matte ? FRAME.env.matte(clip, src) : null;
  if (matte) {
    const bgCfg = clip.bgRemove.background || { kind: 'blur' };
    if (!extra.noBg) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      if (!drawBackdrop(ctx, W, H, bgCfg, FRAME.t, FRAME.beat)) {
        const other = bgCfg.kind === 'media' && FRAME.env.backdropSource ? FRAME.env.backdropSource(clip) : null;
        if (other && hasFrame(other)) drawFitted(ctx, other, W, H, { fit: 'cover' });
        else drawBlurBg(ctx, src, W, H, filter);
      }
      ctx.restore();
    }
    const [fc, fg] = layer('cutout', W, H);
    fg.filter = filter;
    paint(fg, src);
    fg.globalCompositeOperation = 'destination-in';
    // soften the edge on the small matte (cheap) rather than blurring at full frame size
    const soft = clip.bgRemove.softness ?? 0.35;
    const edgeMatte = soft > 0.05 ? blurred('matte-soft', matte, 0.6 + soft * 2.4, '', false) : matte;
    fg.filter = 'none';
    fg.imageSmoothingEnabled = true;
    fg.imageSmoothingQuality = 'high';
    paint(fg, edgeMatte);
    if (mask) {
      fg.filter = mask.feather ? `blur(${(mask.feather * W * 0.04).toFixed(1)}px)` : 'none';
      fg.fillStyle = '#000';
      withMaskPath(fg, W, H, mask, (p) => p.fill());
    }
    fg.globalCompositeOperation = 'source-over';
    fg.filter = 'none';
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(fc, 0, 0);
    ctx.restore();
    return true;
  }

  // what shows around the picture: blurred copy, a color, or nothing
  const bg = extra.noBg ? (mask && mask.background === 'color' ? 'color' : 'none') : mask ? mask.background || 'blur' : clip.fit === 'blurfill' || (small && !extra.exiting) ? 'blur' : 'none';
  if (bg !== 'none') {
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (bg === 'blur') drawBlurBg(ctx, src, W, H, filter);
    else {
      ctx.fillStyle = mask.color || '#000';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  const [lc, lg] = mask ? layer('mask', W, H) : [null, null];
  const g = mask ? lg : ctx;
  if (!mask) {
    g.save();
    g.globalAlpha *= alpha;
  }
  g.filter = filter;
  paint(g, src);
  g.filter = 'none';
  if (!mask) g.restore();

  if (mask) {
    lg.globalCompositeOperation = 'destination-in';
    lg.filter = mask.feather ? `blur(${(mask.feather * W * 0.04).toFixed(1)}px)` : 'none';
    lg.fillStyle = '#000';
    withMaskPath(lg, W, H, mask, (p) => p.fill());
    lg.globalCompositeOperation = 'source-over';
    lg.filter = 'none';
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(lc, 0, 0);
    if (mask.border > 0) {
      ctx.strokeStyle = mask.borderColor || '#ffffff';
      ctx.lineWidth = mask.border * W * 0.012;
      ctx.lineJoin = 'round';
      withMaskPath(ctx, W, H, mask, (p) => p.stroke());
    }
    ctx.restore();
  }
  return true;
}

function pixelated(ctx, W, H, size, draw) {
  const [c, g] = layer('px', W, H);
  draw(g);
  const [s, sg] = layer('pxs', Math.max(1, Math.ceil(W / size)), Math.max(1, Math.ceil(H / size)));
  sg.drawImage(c, 0, 0, s.width, s.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s, 0, 0, W, H);
  ctx.restore();
}

function rgbSplit(ctx, W, H, offset, alpha = 0.55) {
  if (offset < 0.5) return;
  const frame = snapshotFrame(ctx, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  ctx.filter = 'sepia(1) saturate(8) hue-rotate(-45deg) brightness(0.8)';
  ctx.drawImage(frame, offset, 0);
  ctx.filter = 'sepia(1) saturate(8) hue-rotate(160deg) brightness(0.8)';
  ctx.drawImage(frame, -offset, 0);
  ctx.restore();
}

function warmLeak(ctx, W, H, t, strength) {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const spots = [
    [0.15 + 0.25 * Math.sin(t * 0.5), 0.2 + 0.1 * Math.cos(t * 0.4), 'rgba(255,140,40,', 0.7],
    [0.85 + 0.15 * Math.cos(t * 0.35), 0.75 + 0.15 * Math.sin(t * 0.3), 'rgba(255,60,120,', 0.6],
  ];
  for (const [x, y, col, r] of spots) {
    const g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * r);
    g.addColorStop(0, `${col}${0.75 * strength})`);
    g.addColorStop(1, `${col}0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** Draws the transition from `prev` into `cur` at progress p (0..1). */
function drawTransition(ctx, W, H, type, p, cur, prev, env) {
  const e = ease.inOut(p);
  const curSrc = env.sourceFor(cur.clip);
  const prevSrc = prev ? env.sourceFor(prev.clip) : null;
  const pl = prev ? prev.clip.duration - 0.01 : 0;
  const drawCur = (x = {}) => drawClip(ctx, W, H, cur.clip, cur.local, curSrc, { ...cur.fx, ...x, zoom: (cur.fx.zoom || 1) * (x.zoom || 1) });
  const drawPrev = (x = {}) => prev && drawClip(ctx, W, H, prev.clip, pl, prevSrc, x);
  const clipTo = (shape, fn) => {
    ctx.save();
    ctx.beginPath();
    shape();
    ctx.clip();
    fn();
    ctx.restore();
  };
  switch (type) {
    case 'fade':
      drawCur({ alpha: e });
      break;
    case 'crossfade':
      drawPrev();
      drawCur({ alpha: e });
      break;
    case 'dipBlack':
    case 'dipWhite': {
      const tint = type === 'dipBlack' ? '#000' : '#fff';
      if (p < 0.5) drawPrev();
      else drawCur();
      ctx.save();
      ctx.fillStyle = tint;
      ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 2;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    }
    case 'flash':
      drawCur();
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = Math.pow(1 - p, 2.5);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    case 'blur':
      drawPrev({ blur: e * W * 0.03 });
      drawCur({ alpha: e, blur: (1 - e) * W * 0.03 });
      break;
    case 'zoom':
      drawCur({ zoom: 1 + 0.35 * (1 - ease.outCubic(p)), blur: (1 - p) * W * 0.01 });
      break;
    case 'zoomOut':
      drawPrev();
      drawCur({ zoom: 0.55 + 0.45 * ease.outCubic(p), alpha: clamp(p * 3, 0, 1) });
      break;
    case 'zoomThrough':
      if (p < 0.5) drawPrev({ zoom: 1 + 2.5 * ease.inOut(p * 2), blur: p * W * 0.04 });
      else drawCur({ zoom: 1.8 - 0.8 * ease.outCubic((p - 0.5) * 2), blur: (1 - p) * W * 0.04 });
      break;
    case 'spin':
      drawPrev({ rot: e * 90, zoom: 1 + e, alpha: 1 - e });
      drawCur({ rot: (1 - ease.outCubic(p)) * -120, zoom: 0.4 + 0.6 * ease.outCubic(p), alpha: clamp(p * 2, 0, 1) });
      break;
    case 'slide':
      drawPrev({ dx: -W * ease.outCubic(p) });
      drawCur({ dx: W * (1 - ease.outCubic(p)) });
      break;
    case 'pushUp':
      drawPrev({ dy: -H * ease.outCubic(p) });
      drawCur({ dy: H * (1 - ease.outCubic(p)) });
      break;
    case 'slideOver':
      drawPrev();
      drawCur({ dx: W * (1 - ease.outCubic(p)) });
      break;
    case 'whip': {
      const q = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const blur = Math.sin(Math.PI * p) * W * 0.035;
      drawPrev({ dx: -W * q, blur });
      drawCur({ dx: W * (1 - q), blur });
      break;
    }
    case 'wipe':
      drawPrev();
      clipTo(() => ctx.rect(0, 0, W * e, H), () => drawCur());
      break;
    case 'wipeDown':
      drawPrev();
      clipTo(() => ctx.rect(0, 0, W, H * e), () => drawCur());
      break;
    case 'split':
      drawPrev();
      clipTo(() => ctx.rect((W * (1 - e)) / 2, 0, W * e, H), () => drawCur());
      break;
    case 'iris':
      drawPrev();
      clipTo(() => ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.5 * e, 0, Math.PI * 2), () => drawCur());
      break;
    case 'pixelate': {
      const size = Math.max(1, Math.round(W * 0.08 * (1 - Math.abs(p - 0.5) * 2)));
      pixelated(ctx, W, H, size, (g) => (p < 0.5 ? prev && drawClip(g, W, H, prev.clip, pl, prevSrc) : drawClip(g, W, H, cur.clip, cur.local, curSrc, cur.fx)));
      break;
    }
    case 'glitch': {
      drawCur();
      const slices = 10;
      const frame = Math.floor(env.t * 30);
      for (let s = 0; s < slices; s++) {
        if (noise(frame * 13 + s) > 0.35 + p * 0.6) {
          const sy = (H / slices) * s;
          const off = (noise(frame + s * 3) - 0.5) * W * 0.15 * (1 - p);
          ctx.drawImage(ctx.canvas, 0, sy, W, H / slices, off, sy, W, H / slices);
        }
      }
      rgbSplit(ctx, W, H, W * 0.02 * (1 - p));
      break;
    }
    case 'rgbSplit':
      drawPrev({ alpha: 1 - e });
      drawCur({ alpha: e });
      rgbSplit(ctx, W, H, W * 0.04 * Math.sin(Math.PI * p), 0.7);
      break;
    case 'shake': {
      const frame = Math.floor(env.t * 30);
      const a = (1 - p) * W * 0.05;
      drawCur({ dx: (noise(frame) - 0.5) * 2 * a, dy: (noise(frame + 50) - 0.5) * 2 * a, zoom: 1.08 });
      break;
    }
    case 'lightLeak':
      drawPrev();
      drawCur({ alpha: e });
      warmLeak(ctx, W, H, env.t * 3, Math.sin(Math.PI * p) * 1.2);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,220,180,${0.5 * Math.sin(Math.PI * p)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    default:
      drawCur();
  }
}

/** Continuous per-clip effects drawn after the clip is on the canvas. */
function postEffects(ctx, W, H, fx, t, beat) {
  const frame = Math.floor(t * 30);
  if (fx.mirror && fx.mirror !== 'none') {
    const src = snapshotFrame(ctx, W, H);
    ctx.save();
    if (fx.mirror === 'h' || fx.mirror === 'quad') {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, W / 2, H, 0, 0, W / 2, H);
      ctx.restore();
    }
    if (fx.mirror === 'v' || fx.mirror === 'quad') {
      const top = snapshotFrame(ctx, W, H);
      ctx.translate(0, H);
      ctx.scale(1, -1);
      ctx.drawImage(top, 0, 0, W, H / 2, 0, 0, W, H / 2);
    }
    ctx.restore();
  }
  if (fx.rgb > 0) rgbSplit(ctx, W, H, W * 0.012 * fx.rgb * (1 + beat), 0.5);
  if (fx.vhs) {
    // tracking band, colour bleed, scanlines and an on-screen display
    const band = noise(Math.floor(t * 4)) * H;
    const bh = H * 0.06;
    ctx.drawImage(ctx.canvas, 0, band, W, bh, (noise(frame) - 0.5) * W * 0.04, band, W, bh);
    rgbSplit(ctx, W, H, W * 0.006, 0.4);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const step = Math.max(2, Math.round(H / 320));
    for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${Math.round(W * 0.045)}px "Courier New", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('PLAY ▶', W * 0.06, H * 0.1);
    const s = Math.floor(t);
    ctx.fillText(`SP 0:00:${String(s).padStart(2, '0')}`, W * 0.06, H * 0.1 + W * 0.06);
    ctx.restore();
  }
  if (fx.flicker > 0) {
    ctx.fillStyle = `rgba(0,0,0,${noise(frame) * fx.flicker * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (fx.invertBeat && beat > 0.55) {
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (fx.strobe && beat > 0.2) {
    ctx.fillStyle = `rgba(255,255,255,${Math.pow(beat, 2) * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawVideoLane(ctx, W, H, project, t, env) {
  const laid = layoutClips(project.clips);
  const i = laid.findIndex((l) => t >= l.start && t < l.end);
  if (i < 0) return;
  const cur = laid[i];
  const local = t - cur.start;
  const fx = cur.clip.effects || {};
  const beat = beatEnvelope(project.beats && project.beats.beats, timelineToSong(t, project.song));
  // motion effects become part of how the current clip is framed
  const frame = Math.floor(t * 24);
  const shake = (fx.shake || 0) * W * 0.025;
  const curState = {
    ...cur,
    local,
    fx: {
      zoom: 1 + (fx.beatPulse || 0) * 0.1 * beat + (fx.shake ? 0.04 * fx.shake : 0),
      dx: shake ? (noise(frame) - 0.5) * 2 * shake : 0,
      dy: shake ? (noise(frame + 99) - 0.5) * 2 * shake : 0,
      rot: shake ? (noise(frame + 7) - 0.5) * 2 * fx.shake : 0,
    },
  };
  const tr = cur.clip.transition || { type: 'none', duration: 0.4 };
  const d = Math.min(tr.duration || 0.4, cur.clip.duration * 0.9);
  const inTransition = tr.type !== 'none' && local < d && (i > 0 || tr.type === 'fade' || tr.type === 'flash' || tr.type === 'zoom' || tr.type === 'shake' || tr.type === 'glitch');
  if (inTransition) drawTransition(ctx, W, H, tr.type, clamp(local / d, 0, 1), curState, laid[i - 1], { ...env, t });
  else drawClip(ctx, W, H, cur.clip, local, env.sourceFor(cur.clip), i === laid.length - 1 ? clipExitFx(cur.clip, cur.end - t, W, H, curState.fx) : curState.fx);
  applyGradeWash(ctx, W, H, cur.clip.grade);
  postEffects(ctx, W, H, fx, t, beat);
}

function drawLook(ctx, W, H, look, t, beat) {
  if (look.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  warmLeak(ctx, W, H, t, look.lightLeak || 0);
  if (look.scanlines > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${look.scanlines * 0.35})`;
    const step = Math.max(2, Math.round(H / 400));
    for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
    ctx.restore();
  }
  if (look.grain > 0) {
    ctx.save();
    ctx.globalAlpha = look.grain * 0.35;
    ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(grain(), 'repeat');
    ctx.translate(Math.random() * 192, Math.random() * 192);
    ctx.fillStyle = pat;
    ctx.fillRect(-192, -192, W + 384, H + 384);
    ctx.restore();
  }
  if (look.beatFlash > 0 && beat > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${Math.pow(beat, 3) * look.beatFlash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (look.letterbox > 0) {
    const bar = H * look.letterbox * 0.12;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
}


function drawTexts(ctx, W, H, texts, t, beat = 0, releaseDate = '') {
  for (const tx0 of texts) {
    if (t < tx0.start || t >= tx0.end) continue;
    const tx = animate(tx0, t - tx0.start);
    drawAnimatedText(
      ctx,
      /\{(date|countdown)\}/i.test(tx.text) ? ctaText(tx.text, releaseDate) : tx.text,
      (W * tx.x) / 100,
      (H * tx.y) / 100,
      {
        font: tx.font,
        sizePx: (W * tx.size) / 100,
        color: tx.color,
        highlight: tx.color,
        outline: tx.outline,
        outlineWidth: tx.box ? 0 : 0.5,
        shadow: !tx.box,
        box: tx.box,
        boxColor: tx.boxColor,
        boxOpacity: tx.boxOpacity,
        align: 'center',
        uppercase: false,
        maxW: W * 0.88,
        animation: tx.animation,
        outAnimation: tx.outAnimation,
        outDuration: tx.outDuration,
        opacity: tx.opacity,
        rotate: tx.rotate,
      },
      t - tx.start,
      tx.end - tx.start,
      beat,
    );
  }
}

function drawLyrics(ctx, W, H, project, t, beat = 0) {
  const ts = timelineToSong(t, project.song);
  if (drawLyricDisplay(ctx, W, H, project.lyrics, project.lyricStyle, ts, beat, project.theme)) return;
  const line0 = activeLyric(project.lyrics, ts);
  if (!line0) return;
  const line = animate(line0, ts - line0.start);
  const s0 = lineStyle(project.lyricStyle, line, project.theme);
  const s = line.keys && line.keys.size ? { ...s0, size: line.size } : s0;
  const y = clamp(line.y ?? s.y, 5, 95);
  drawAnimatedText(
    ctx,
    line.text,
    (W * (line.x ?? s.x ?? 50)) / 100,
    (H * y) / 100,
    { ...s, sizePx: (W * s.size) / 100, maxW: (W * s.maxWidth) / 100, opacity: line.opacity, rotate: line.rotate },
    ts - line.start,
    line.end - line.start,
    beat,
  );
}

function drawEndCard(ctx, W, H, project, t, env) {
  const ec = project.endCard;
  const start = project.duration - ec.duration;
  if (!ec.enabled || t < start) return;
  const life = t - start;
  const fadeIn = clamp(life / 0.5, 0, 1);
  const cover = ec.coverMediaId ? env.image(ec.coverMediaId) : null;
  // layout area: the whole frame, or an app's clear area when a platform layout is active
  const [ax0, ay0, ax1, ay1] = ec.area || [0, 0, 1, 1];
  const AX = W * ax0;
  const AY = H * ay0;
  const AW = W * (ax1 - ax0);
  const AH = H * (ay1 - ay0);
  const portrait = AH >= AW * 0.95;

  ctx.save();
  ctx.globalAlpha = fadeIn;
  if (ec.background === 'blur' && cover) {
    ctx.save();
    ctx.filter = `blur(${Math.round(W * 0.05)}px) brightness(0.5) saturate(1.2)`;
    drawFitted(ctx, cover, W, H, { fit: 'cover', zoom: 1.25 });
    ctx.restore();
  } else if (ec.background === 'video') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = ec.bgColor;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  const anim = ec.animation;
  const step = (delay) => clamp((life - delay) / 0.55, 0, 1);
  const rise = (delay) => (anim === 'none' ? { a: fadeIn, dy: 0 } : { a: step(delay), dy: (1 - ease.outCubic(step(delay))) * H * 0.04 });

  // layout
  const coverSize = portrait ? Math.min(AW * 0.66, AH * 0.4) : Math.min(AH * 0.62, AW * 0.4);
  const cx = portrait ? AX + AW / 2 : AX + AW * 0.3;
  const coverY = portrait ? AY + AH * 0.1 : AY + (AH - coverSize) / 2;
  const textX = portrait ? AX + AW / 2 : AX + AW * 0.68;
  let ty = portrait ? coverY + coverSize + AH * 0.06 : AY + AH * 0.3;
  const unit = portrait ? AW : AW * 0.55;

  // cover
  const cp = step(0);
  ctx.save();
  ctx.globalAlpha = anim === 'none' ? fadeIn : cp;
  ctx.translate(cx, coverY + coverSize / 2);
  if (anim === 'zoom') ctx.scale(0.7 + 0.3 * ease.outBack(cp), 0.7 + 0.3 * ease.outBack(cp));
  if (anim === 'spin') ctx.rotate(((1 - ease.outCubic(cp)) * -25 * Math.PI) / 180);
  if (anim === 'rise') ctx.translate(0, (1 - ease.outCubic(cp)) * H * 0.05);
  if (anim === 'drop') {
    const b = clamp(life / 0.8, 0, 1);
    ctx.globalAlpha = clamp(life / 0.15, 0, 1);
    ctx.translate(0, -(1 - outBounce(b)) * H * 0.5);
  }
  if (anim === 'flip') ctx.scale(Math.max(0.02, Math.abs(Math.cos((1 - ease.outCubic(cp)) * Math.PI * 0.5))), 1);
  if (anim === 'glitch' && (life < 0.6 || noise(Math.floor(life * 30)) > 0.96)) {
    const f = Math.floor(life * 30);
    ctx.translate((noise(f) - 0.5) * coverSize * 0.12, (noise(f + 3) - 0.5) * coverSize * 0.05);
  }
  if (anim === 'vinyl') {
    // a record slides out from behind the cover and keeps spinning
    const out = ease.outCubic(clamp((life - 0.35) / 0.8, 0, 1));
    ctx.translate(-coverSize * 0.14 * out, 0);
    ctx.save();
    ctx.translate(coverSize * 0.36 * out, 0);
    ctx.rotate(life * 2.2);
    const r = coverSize * 0.48;
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(1, r * 0.01);
    for (let g = 0.42; g < 0.97; g += 0.06) {
      ctx.beginPath();
      ctx.arc(0, 0, r * g, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = r * 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, -0.4, 0.2);
    ctx.stroke();
    ctx.fillStyle = ec.accent;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // slow push-in after the entrance
  const push = 1 + 0.04 * clamp((life - 0.6) / Math.max(1, ec.duration), 0, 1);
  ctx.scale(push, push);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = coverSize * 0.12;
  ctx.shadowOffsetY = coverSize * 0.04;
  if (cover && hasFrame(cover)) {
    roundRect(ctx, -coverSize / 2, -coverSize / 2, coverSize, coverSize, coverSize * 0.03);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    ctx.clip();
    const { w, h } = srcSize(cover);
    const s = Math.max(coverSize / w, coverSize / h);
    ctx.drawImage(cover, -(w * s) / 2, -(h * s) / 2, w * s, h * s);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(-coverSize / 2, -coverSize / 2, coverSize / 2, coverSize / 2);
    g.addColorStop(0, ec.accent);
    g.addColorStop(1, '#222');
    ctx.fillStyle = g;
    roundRect(ctx, -coverSize / 2, -coverSize / 2, coverSize, coverSize, coverSize * 0.03);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = fontStr(coverSize * 0.12, 'Inter');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add cover art', 0, 0);
  }
  ctx.restore();

  const textBlock = (text, px, family, color, delay) => {
    if (!text) return;
    const r = rise(delay);
    ctx.save();
    ctx.globalAlpha = r.a;
    ctx.font = fontStr(px, family);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = px * 0.2;
    const maxW = portrait ? AW * 0.92 : AW * 0.5;
    let size = px;
    while (ctx.measureText(text).width > maxW && size > 8) {
      size *= 0.92;
      ctx.font = fontStr(size, family);
    }
    ctx.fillText(text, textX, ty + size * 0.5 + r.dy);
    ctx.restore();
    ty += size * 1.15;
  };

  textBlock(ec.title, unit * 0.1, ec.font, ec.textColor, 0.15);
  textBlock(ec.artist, unit * 0.05, 'Inter', hexToRgba(ec.textColor, 0.8), 0.25);
  ty += unit * 0.03;

  // CTA pill
  const cta = ctaText(ec.cta, ec.releaseDate);
  if (cta) {
    const r = rise(0.4);
    const px = unit * 0.075;
    ctx.save();
    ctx.globalAlpha = r.a;
    ctx.font = fontStr(px, ec.font);
    const w = ctx.measureText(cta).width + px * 1.2;
    const h = px * 1.35;
    const pulse = 1 + 0.03 * Math.sin(Math.max(0, life - 1) * 5);
    ctx.translate(textX, ty + h / 2 + r.dy);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = ec.accent;
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = readableOn(ec.accent);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cta, 0, px * 0.04);
    ctx.restore();
    ty += h + unit * 0.04;
  }

  // platform badges
  const plats = PLATFORMS.filter((p) => ec.platforms.includes(p.id));
  if (plats.length) {
    const r = rise(0.55);
    const px = unit * 0.034;
    ctx.save();
    ctx.globalAlpha = r.a;
    ctx.font = fontStr(px, 'Inter');
    ctx.textBaseline = 'middle';
    const padX = px * 0.8;
    const h = px * 2;
    const gap = px * 0.6;
    const maxRow = portrait ? AW * 0.92 : AW * 0.55;
    const items = plats.map((p) => ({ ...p, w: ctx.measureText(p.label).width + padX * 2 + px * 1.1 }));
    const rows = [[]];
    let rowW = 0;
    for (const it of items) {
      if (rowW + it.w > maxRow && rows[rows.length - 1].length) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1].push(it);
      rowW += it.w + gap;
    }
    rows.forEach((row) => {
      const total = row.reduce((s, it) => s + it.w, 0) + gap * (row.length - 1);
      let x = textX - total / 2;
      for (const it of row) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, x, ty + r.dy, it.w, h, h / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = Math.max(1, px * 0.06);
        ctx.stroke();
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(x + padX + px * 0.35, ty + h / 2 + r.dy, px * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(it.label, x + padX + px * 1.1, ty + h / 2 + r.dy);
        x += it.w + gap;
      }
      ty += h + gap;
    });
    ctx.restore();
    ty += unit * 0.02;
  }
  textBlock(ec.subtext, unit * 0.045, 'Inter', hexToRgba(ec.textColor, 0.85), 0.7);
}

function drawWatermark(ctx, W, H, wm, env) {
  if (!wm.mediaId) return;
  const img = env.image(wm.mediaId);
  if (!img || !hasFrame(img)) return;
  const { w, h } = srcSize(img);
  const dw = (W * wm.size) / 100;
  const dh = (dw * h) / w;
  const m = W * 0.04;
  let x;
  let y;
  if (wm.position === 'custom') {
    x = (W * (wm.x ?? 50)) / 100 - dw / 2;
    y = (H * (wm.y ?? 10)) / 100 - dh / 2;
  } else {
    const [vy, hx] = wm.position.split('-');
    x = hx === 'left' ? m : hx === 'center' ? (W - dw) / 2 : W - dw - m;
    y = vy === 'top' ? m * 1.6 : H - dh - m * 1.6;
  }
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  ctx.drawImage(img, x, y, dw, dh);
  ctx.restore();
}

function drawProgress(ctx, W, H, pr, t, duration) {
  if (!pr.enabled) return;
  const h = Math.max(3, H * 0.006);
  const y = pr.position === 'top' ? 0 : H - h;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = pr.color;
  ctx.fillRect(0, y, W * clamp(t / duration, 0, 1), h);
}

/** A video layer: the clip under the playhead, with the layer's opacity and blend mode. */
function drawVideoLayer(ctx, W, H, layer, t, env) {
  const clip = overlayClipAt(layer, t);
  if (!clip) return;
  const local = t - clip.start;
  const tr = clip.transition || { type: 'none' };
  const d = Math.min(tr.duration || 0.4, clip.duration * 0.45);
  // overlay clips fade in and out instead of cutting, unless set to a hard cut; a chosen exit replaces the fade out
  const hasExit = clip.exit && clip.exit.type;
  const edge = tr.type === 'none' ? 1 : Math.min(1, local / d, hasExit ? 1 : (clip.duration - local) / d);
  ctx.save();
  ctx.globalAlpha *= (layer.opacity ?? 1) * Math.max(0, edge);
  ctx.globalCompositeOperation = layer.blend || 'source-over';
  drawClip(ctx, W, H, clip, local, env.sourceFor(clip), clipExitFx(clip, clip.duration - local, W, H, { noBg: true }));
  ctx.restore();
}

/**
 * A layer's entrance and exit at time t: layer.enter / layer.exit = { type, duration } (see exits.js).
 * The layer ends at its own end, or where the end card starts.
 */
function layerMotion(l, t, visEnd) {
  const start = l.start || 0;
  const end = l.end ?? visEnd;
  const enter = l.enter && l.enter.type && l.enter.type !== 'cut' ? enterTransform(l.enter.type, enterProgress(t - start, l.enter.duration ?? 0.4)) : STILL;
  const exit = l.exit && l.exit.type && l.exit.type !== 'cut' ? exitTransform(l.exit.type, exitProgress(end - t, l.exit.duration ?? 0.4)) : STILL;
  return enter === STILL ? exit : exit === STILL ? enter : combine(enter, exit);
}

/** A clip's exit as drawClip extras (alpha, zoom, offset, rotation in degrees, blur in px). */
function clipExitFx(clip, remaining, W, H, base = {}) {
  const ex = clip.exit && clip.exit.type && clip.exit.type !== 'cut' ? exitTransform(clip.exit.type, exitProgress(remaining, clip.exit.duration ?? 0.5)) : STILL;
  if (ex === STILL) return base;
  return {
    ...base,
    exiting: true,
    alpha: (base.alpha ?? 1) * ex.alpha,
    zoom: (base.zoom || 1) * ex.scale,
    dx: (base.dx || 0) + ex.fx * W,
    dy: (base.dy || 0) + ex.fy * H,
    rot: (base.rot || 0) + (ex.rot * 180) / Math.PI,
    blur: (base.blur || 0) + ex.blur * H,
  };
}

/**
 * Render the frame at timeline time t.
 * env: { sourceFor(clip), image(mediaId), tab(mediaId, track), drums(layer), viz(layer), preview: bool }
 */
export function renderFrame(ctx, W, H, project, t, env) {
  FRAME.env = env;
  FRAME.t = t;
  FRAME.beat = beatEnvelope(project.beats && project.beats.beats, timelineToSong(t, project.song));
  ctx.save();
  ctx.fillStyle = project.background || '#000';
  ctx.fillRect(0, 0, W, H);
  const songT = timelineToSong(t, project.song);
  const beat = beatEnvelope(project.beats && project.beats.beats, songT);
  const ecStart = project.endCard.enabled ? project.duration - project.endCard.duration : Infinity;
  const visEnd = ecStart === Infinity ? project.duration : ecStart;
  const layers = (project.layers || []).filter((l) => l.visible !== false);

  if (isVisible(project, 'video')) drawVideoLane(ctx, W, H, project, t, env);
  // video layers sit directly on the picture, so the look (vignette, grain…) covers them too
  for (const l of layers) {
    if (l.type !== 'video') continue;
    const L = animate(l, t - (l.start || 0));
    const mo = layerMotion(L, t, visEnd);
    if (isStill(mo)) {
      drawVideoLayer(ctx, W, H, L, t, env);
      continue;
    }
    ctx.save();
    ctx.globalAlpha *= mo.alpha;
    if (mo.blur) ctx.filter = `blur(${(mo.blur * H).toFixed(1)}px)`;
    ctx.translate(W / 2 + mo.fx * W, H / 2 + mo.fy * H);
    if (mo.rot) ctx.rotate(mo.rot);
    if (mo.scale !== 1) ctx.scale(mo.scale, mo.scale);
    ctx.translate(-W / 2, -H / 2);
    drawVideoLayer(ctx, W, H, L, t, env);
    ctx.restore();
  }
  drawLook(ctx, W, H, project.look, t, beat);
  // graphics layers in stack order
  for (const l0 of layers) {
    if (l0.type === 'video') continue;
    const l = animate(l0, t - (l0.start || 0));
    const mo = layerMotion(l, t, visEnd);
    const moving = !isStill(mo);
    if (moving) {
      if (mo.alpha <= 0.001) continue;
      ctx.save();
      const cx = (W * (l.x ?? 50)) / 100;
      const cy = (H * (l.y ?? 50)) / 100;
      ctx.globalAlpha *= mo.alpha;
      if (mo.blur) ctx.filter = `blur(${(mo.blur * H).toFixed(1)}px)`;
      ctx.translate(cx + mo.fx * W, cy + mo.fy * H);
      if (mo.rot) ctx.rotate(mo.rot);
      if (mo.scale !== 1) ctx.scale(mo.scale, mo.scale);
      ctx.translate(-cx, -cy);
    }
    const fadeOwn = l.type !== 'viz' && l.opacity != null && l.opacity < 1; // viz layers apply their own opacity
    if (fadeOwn) {
      ctx.save();
      ctx.globalAlpha *= Math.max(0, l.opacity);
    }
    if (l.type === 'viz' && env.viz) drawViz(ctx, W, H, l, env.viz(l0), t, songT, visEnd, project.beats);
    else if (l.type === 'tab' && env.tab && l.mediaId) drawTab(ctx, W, H, l, env.tab(l.mediaId, l.track), t, songT, visEnd);
    else if (l.type === 'drums' && env.drums) drawDrums(ctx, W, H, l, env.drums(l0), t, songT, visEnd, project.beats && project.beats.period);
    if (fadeOwn) ctx.restore();
    if (moving) ctx.restore();
  }
  if (isVisible(project, 'text')) drawTexts(ctx, W, H, project.texts, t, beat, project.endCard.releaseDate);
  if (t < ecStart && isVisible(project, 'lyrics')) drawLyrics(ctx, W, H, project, t, beat);
  if (isVisible(project, 'endcard')) drawEndCard(ctx, W, H, project, t, env);
  drawWatermark(ctx, W, H, project.look.watermark, env);
  drawProgress(ctx, W, H, project.look.progress, t, project.duration);
  // fade the whole video out over the last 0.3s when there is no end card
  if (!project.endCard.enabled) {
    const g = fadeGain(t, 0, project.duration, 0, 0.3);
    if (g < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - g})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  const ov = project.look.overlay;
  if (env.preview && ov && ov !== 'off' && overlaySupported(project.aspect)) {
    drawPlatformOverlay(ctx, W, H, ov, { opacity: project.look.overlayOpacity ?? 0.6, clear: project.look.overlayClear !== false });
  }
  ctx.restore();
}
