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
import { FILTER_PRESETS, PLATFORMS } from './state.js';
import { drawPlatformOverlay, overlaySupported } from './overlays.js';

// ------------------------------------------------------------ helpers

function filterString(f, extraBlurPx = 0) {
  if (!f) return extraBlurPx ? `blur(${extraBlurPx}px)` : 'none';
  const base = FILTER_PRESETS[f.preset] || FILTER_PRESETS.none;
  const v = { ...base, ...f.adjust };
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
  if (fit === 'blurfill') {
    ctx.save();
    const prev = ctx.filter;
    ctx.filter = `${prev === 'none' ? '' : prev + ' '}blur(${Math.round(W * 0.03)}px) brightness(0.7)`;
    const s = Math.max(W / w, H / h) * 1.1;
    ctx.drawImage(src, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
    ctx.restore();
  }
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
  const pOut = clamp((dur - life) / outT, 0, 1);
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
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy + dy);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale * scaleY);

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

/** extra: { alpha, dx, dy, zoom, blur, rot (deg) } on top of the clip's own framing. */
function drawClip(ctx, W, H, clip, local, src, extra = {}) {
  if (!hasFrame(src)) return false;
  const m = clipMotion(clip, local);
  ctx.save();
  ctx.filter = filterString(clip.filter, extra.blur || 0);
  if (extra.alpha != null) ctx.globalAlpha *= clamp(extra.alpha, 0, 1);
  if (extra.dx || extra.dy) ctx.translate(extra.dx || 0, extra.dy || 0);
  if (clip.flip) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  drawFitted(ctx, src, W, H, {
    fit: clip.fit || 'cover',
    zoom: m.zoom * (extra.zoom || 1),
    x: m.x,
    y: m.y,
    rotate: (clip.rotate || 0) + (extra.rot || 0),
  });
  ctx.restore();
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
  else drawClip(ctx, W, H, cur.clip, local, env.sourceFor(cur.clip), curState.fx);
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


function drawTexts(ctx, W, H, texts, t, beat = 0) {
  for (const tx of texts) {
    if (t < tx.start || t >= tx.end) continue;
    drawAnimatedText(
      ctx,
      tx.text,
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
      },
      t - tx.start,
      tx.end - tx.start,
      beat,
    );
  }
}

function drawLyrics(ctx, W, H, project, t, beat = 0) {
  const ts = timelineToSong(t, project.song);
  const line = activeLyric(project.lyrics, ts);
  if (!line) return;
  const s = project.lyricStyle;
  const y = clamp(line.y ?? s.y, 5, 95);
  drawAnimatedText(
    ctx,
    line.text,
    W / 2,
    (H * y) / 100,
    { ...s, sizePx: (W * s.size) / 100, maxW: (W * s.maxWidth) / 100 },
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
  const portrait = H >= W * 0.95;

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
  const coverSize = portrait ? Math.min(W * 0.66, H * 0.4) : Math.min(H * 0.62, W * 0.4);
  const cx = portrait ? W / 2 : W * 0.3;
  const coverY = portrait ? H * 0.12 : (H - coverSize) / 2;
  const textX = portrait ? W / 2 : W * 0.68;
  let ty = portrait ? coverY + coverSize + H * 0.06 : H * 0.3;
  const unit = portrait ? W : W * 0.55;

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
    const maxW = portrait ? W * 0.9 : W * 0.5;
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
    const maxRow = portrait ? W * 0.9 : W * 0.55;
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
  const [vy, hx] = wm.position.split('-');
  const x = hx === 'left' ? m : hx === 'center' ? (W - dw) / 2 : W - dw - m;
  const y = vy === 'top' ? m * 1.6 : H - dh - m * 1.6;
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

/**
 * Render the frame at timeline time t.
 * env: { sourceFor(clip) -> drawable|null, image(mediaId) -> drawable|null, preview: bool }
 */
export function renderFrame(ctx, W, H, project, t, env) {
  ctx.save();
  ctx.fillStyle = project.background || '#000';
  ctx.fillRect(0, 0, W, H);
  const beat = beatEnvelope(project.beats && project.beats.beats, timelineToSong(t, project.song));
  drawVideoLane(ctx, W, H, project, t, env);
  drawLook(ctx, W, H, project.look, t, beat);
  const ecStart = project.endCard.enabled ? project.duration - project.endCard.duration : Infinity;
  drawTexts(ctx, W, H, project.texts, t, beat);
  if (t < ecStart) drawLyrics(ctx, W, H, project, t, beat);
  drawEndCard(ctx, W, H, project, t, env);
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
