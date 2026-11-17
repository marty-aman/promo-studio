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
} from './core.js';
import { FILTER_PRESETS, PLATFORMS } from './state.js';

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

/**
 * Draw an animated text block.
 * style: {font,sizePx,color,highlight,outline,outlineWidth,shadow,box,boxColor,boxOpacity,align,uppercase,maxW,animation}
 * life: seconds since the block started; dur: block length.
 */
function drawAnimatedText(ctx, text, cx, cy, style, life, dur) {
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
  let alpha = anim === 'none' ? 1 : Math.min(anim === 'fade' || anim === 'slide' ? pIn : 1, pOut);
  let scale = 1;
  let dy = 0;
  if (anim === 'pop') {
    scale = 0.6 + 0.4 * ease.outBack(pIn);
    alpha = Math.min(pOut, clamp(life / 0.12, 0, 1));
  }
  if (anim === 'slide') dy = (1 - ease.outCubic(pIn)) * px * 0.9;
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy + dy);
  ctx.scale(scale, scale);

  // progress through the line for per-word effects (finish slightly before the end)
  const prog = clamp(life / Math.max(0.2, dur * 0.92), 0, 1);
  const timings = wordTimings(t);
  const totalChars = t.replace(/\s+/g, '').length;
  const reveal = anim === 'typewriter' ? Math.floor(clamp(life / Math.max(0.3, Math.min(dur * 0.6, totalChars * 0.06)), 0, 1) * totalChars) : Infinity;

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
      if (anim === 'words') {
        const since = (prog - wt.start) * dur;
        if (since < 0) {
          x += word.w + space;
          continue;
        }
        wScale = 0.7 + 0.3 * ease.outBack(clamp(since / 0.18, 0, 1));
        wAlpha = clamp(since / 0.08, 0, 1);
      }
      ctx.save();
      ctx.globalAlpha *= wAlpha;
      const wx = x + word.w / 2;
      ctx.translate(wx, y);
      ctx.scale(wScale, wScale);
      ctx.textAlign = 'center';
      if (style.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = px * 0.18;
        ctx.shadowOffsetY = px * 0.05;
      }
      if (outlinePx > 0) {
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = outlinePx * 2;
        ctx.strokeText(text, 0, 0);
        ctx.shadowColor = 'transparent';
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

function drawClip(ctx, W, H, clip, local, src, extra = {}) {
  if (!hasFrame(src)) return false;
  const m = clipMotion(clip, local);
  ctx.save();
  ctx.filter = filterString(clip.filter, extra.blur || 0);
  if (extra.alpha != null) ctx.globalAlpha = extra.alpha;
  if (extra.dx) ctx.translate(extra.dx, 0);
  drawFitted(ctx, src, W, H, {
    fit: clip.fit || 'cover',
    zoom: m.zoom * (extra.zoom || 1),
    x: m.x,
    y: m.y,
    rotate: clip.rotate || 0,
  });
  ctx.restore();
  return true;
}

function drawVideoLane(ctx, W, H, project, t, env) {
  const laid = layoutClips(project.clips);
  const i = laid.findIndex((l) => t >= l.start && t < l.end);
  if (i < 0) return;
  const cur = laid[i];
  const local = t - cur.start;
  const src = env.sourceFor(cur.clip);
  const tr = cur.clip.transition || { type: 'none', duration: 0.4 };
  const d = Math.min(tr.duration || 0.4, cur.clip.duration * 0.9);
  const p = tr.type !== 'none' && i > 0 ? clamp(local / d, 0, 1) : tr.type === 'fade' ? clamp(local / d, 0, 1) : 1;
  const mirror = (fn) => {
    if (!cur.clip.flip) return fn();
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    fn();
    ctx.restore();
  };

  if (p >= 1 || tr.type === 'none') {
    mirror(() => drawClip(ctx, W, H, cur.clip, local, src));
    return;
  }
  const prev = laid[i - 1];
  const e = ease.inOut(p);
  switch (tr.type) {
    case 'fade': // dip from black
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src, { alpha: e }));
      break;
    case 'crossfade':
      if (prev) drawClip(ctx, W, H, prev.clip, prev.clip.duration - 0.01, env.sourceFor(prev.clip));
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src, { alpha: e }));
      break;
    case 'flash':
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src));
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 1 - e;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    case 'zoom':
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src, { zoom: 1 + 0.35 * (1 - ease.outCubic(p)), blur: (1 - p) * W * 0.01 }));
      break;
    case 'slide':
      if (prev) drawClip(ctx, W, H, prev.clip, prev.clip.duration - 0.01, env.sourceFor(prev.clip), { dx: -W * ease.outCubic(p) });
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src, { dx: W * (1 - ease.outCubic(p)) }));
      break;
    case 'glitch': {
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src));
      const slices = 8;
      for (let s = 0; s < slices; s++) {
        if (Math.random() > 1 - p * 0.2) continue;
        const sy = (H / slices) * s;
        const off = (Math.random() - 0.5) * W * 0.12 * (1 - p);
        ctx.drawImage(ctx.canvas, 0, sy, W, H / slices, off, sy, W, H / slices);
      }
      break;
    }
    default:
      mirror(() => drawClip(ctx, W, H, cur.clip, local, src));
  }
}

function drawLook(ctx, W, H, look) {
  if (look.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
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
  if (look.letterbox > 0) {
    const bar = H * look.letterbox * 0.12;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
}

function drawTexts(ctx, W, H, texts, t) {
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
    );
  }
}

function drawLyrics(ctx, W, H, project, t) {
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

function drawSafeZones(ctx, W, H, aspect) {
  if (aspect !== '9:16' && aspect !== '4:5') return;
  ctx.save();
  ctx.setLineDash([W * 0.012, W * 0.01]);
  ctx.lineWidth = Math.max(1, W * 0.003);
  ctx.strokeStyle = 'rgba(255,80,80,0.75)';
  ctx.fillStyle = 'rgba(255,80,80,0.08)';
  const zones =
    aspect === '9:16'
      ? [
          [0, 0, W, H * 0.08, 'Top bar'],
          [W * 0.84, H * 0.38, W * 0.16, H * 0.45, 'Buttons'],
          [0, H * 0.82, W, H * 0.18, 'Caption & username'],
        ]
      : [[0, H * 0.88, W, H * 0.12, 'Caption']];
  ctx.font = `${Math.round(W * 0.022)}px Inter, sans-serif`;
  ctx.textBaseline = 'top';
  for (const [x, y, w, h, label] of zones) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(255,120,120,0.95)';
    ctx.fillText(label, x + W * 0.015, y + W * 0.012);
    ctx.fillStyle = 'rgba(255,80,80,0.08)';
  }
  ctx.restore();
}

/**
 * Render the frame at timeline time t.
 * env: { sourceFor(clip) -> drawable|null, image(mediaId) -> drawable|null, preview: bool }
 */
export function renderFrame(ctx, W, H, project, t, env) {
  ctx.save();
  ctx.fillStyle = project.background || '#000';
  ctx.fillRect(0, 0, W, H);
  drawVideoLane(ctx, W, H, project, t, env);
  drawLook(ctx, W, H, project.look);
  const ecStart = project.endCard.enabled ? project.duration - project.endCard.duration : Infinity;
  drawTexts(ctx, W, H, project.texts, t);
  if (t < ecStart) drawLyrics(ctx, W, H, project, t);
  drawEndCard(ctx, W, H, project, t, env);
  drawWatermark(ctx, W, H, project.look.watermark, env);
  drawProgress(ctx, W, H, project.look.progress, t, project.duration);
  if (env.preview && project.look.safeZones) drawSafeZones(ctx, W, H, project.aspect);
  // fade the whole video out over the last 0.3s when there is no end card
  if (!project.endCard.enabled) {
    const g = fadeGain(t, 0, project.duration, 0, 0.3);
    if (g < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - g})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  ctx.restore();
}
