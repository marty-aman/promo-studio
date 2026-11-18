// Shared canvas effects: reusable scratch buffers, a cheap glow pass and a frosted-glass backdrop.
// Used by the drum chart, tab and lyric styles.

// Scratch canvases, reused between frames.
const bufs = {};
export function buf(name, w, h) {
  const c = (bufs[name] ||= document.createElement('canvas'));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  if (typeof g.filter === 'string') g.filter = 'none';
  g.clearRect(0, 0, w, h);
  return [c, g];
}

/** Blur `src` into a same-size buffer. Uses ctx.filter where the browser has it, else a downscale round trip. */
export function blurred(name, src, px, extra = '') {
  const [t, tg] = buf(name, src.width, src.height);
  tg.drawImage(src, 0, 0); // base copy keeps the edges filled
  if (typeof tg.filter === 'string') {
    tg.filter = `blur(${Math.max(0.5, px).toFixed(1)}px) ${extra}`;
    tg.drawImage(src, 0, 0);
    tg.filter = 'none';
  } else {
    const f = Math.max(1, Math.round(px));
    const [s, sg] = buf(name + '-s', Math.max(1, Math.ceil(src.width / f)), Math.max(1, Math.ceil(src.height / f)));
    sg.drawImage(src, 0, 0, s.width, s.height);
    tg.clearRect(0, 0, t.width, t.height);
    tg.drawImage(s, 0, 0, t.width, t.height);
  }
  return t;
}

const GLOW_SCALE = 4;
/**
 * Glow without shadowBlur, which costs 5-10x more on a 1080x1920 canvas. Callers draw glow shapes
 * into a quarter-size buffer with add(); flush() blurs it and adds it onto ctx.
 */
export function glowPass(ctx, bx, by, bw, bh, radius) {
  const pad = Math.ceil(radius * 2);
  const ox = bx - pad;
  const oy = by - pad;
  const w = Math.max(1, Math.ceil((bw + pad * 2) / GLOW_SCALE));
  const h = Math.max(1, Math.ceil((bh + pad * 2) / GLOW_SCALE));
  const [c, g] = buf('glow', w, h);
  g.setTransform(1 / GLOW_SCALE, 0, 0, 1 / GLOW_SCALE, -ox / GLOW_SCALE, -oy / GLOW_SCALE);
  let used = false;
  return {
    add(fn) {
      used = true;
      g.save();
      fn(g);
      g.restore();
    },
    flush(strength = 1) {
      if (!used) return;
      const t = blurred('glow-b', c, radius / GLOW_SCALE);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= strength;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(t, ox, oy, w * GLOW_SCALE, h * GLOW_SCALE);
      ctx.restore();
    },
  };
}

/** Frosted glass: a blurred, quarter-size copy of the canvas area under the box. */
export function frost(ctx, bx, by, bw, bh, blur) {
  const cv = ctx.canvas;
  const m = ctx.getTransform();
  const pad = blur * 2;
  const x0 = Math.max(0, Math.floor(m.a * (bx - pad) + m.e));
  const y0 = Math.max(0, Math.floor(m.d * (by - pad) + m.f));
  const x1 = Math.min(cv.width, Math.ceil(m.a * (bx + bw + pad) + m.e));
  const y1 = Math.min(cv.height, Math.ceil(m.d * (by + bh + pad) + m.f));
  if (x1 <= x0 || y1 <= y0) return;
  const S = 4;
  const [c, g] = buf('frost', Math.max(1, Math.ceil((x1 - x0) / S)), Math.max(1, Math.ceil((y1 - y0) / S)));
  g.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  const t = blurred('frost-b', c, (blur * m.a) / S, 'saturate(1.3)');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(t, 0, 0, c.width, c.height, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}
