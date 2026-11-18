// Instagram carousel posts: suggested carousels built from your cover art, clips, the edit itself,
// lyrics and release info; looks (filters) per slide; drawn at 1080x1350 (4:5, Instagram's tallest
// feed size). Structure follows the 2026 carousel research: slide 1 earns the swipe, each middle
// slide pays off one idea, the last slide asks for one action, 5-10 slides.
import { uid } from './core.js';
import { bestLyric } from './captions.js';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export const CAROUSEL_SOURCES = [
  { label: 'Creatorflow: carousel structure (slide 1 earns the swipe; sends per reach)', url: 'https://creatorflow.so/blog/instagram-carousel-structure/' },
  { label: 'Creatorflow: carousel guide (8–10 slides at 1080×1350, one clear CTA)', url: 'https://creatorflow.so/blog/instagram-carousel-posts-guide/' },
  { label: 'Foxy AI: carousels in 2026 (up to 20 slides; 5–10 is the sweet spot)', url: 'https://foxy.ai/academy/how-to-make-a-carousel-on-instagram-a-simple-step-by-step-guide' },
  { label: 'PostNext: carousel ideas (each swipe pays off the one before)', url: 'https://postnext.io/blog/instagram-carousel-ideas/' },
  { label: 'Contentdrips: carousel hook examples', url: 'https://contentdrips.com/blog/2026/06/carousel-hook-examples/' },
];

/**
 * Looks for a slide: a canvas filter plus finishing layers. `why` says what the look does for a post.
 * grain 0..1, vignette 0..1, wash: [color, alpha, blend], frame: 'polaroid' | 'film' | null,
 * flash: bright center falloff (point-and-shoot flash), scan: VHS lines, duotone: map to two colours.
 */
export const FILTERS = [
  { id: 'none', label: 'Original', why: 'Your photo as it is.', css: 'none' },
  { id: 'flash', label: 'Flash', why: 'The point-and-shoot flash look: bright faces, dark edges. Reads as a real night out.', css: 'contrast(1.25) saturate(1.1) brightness(1.08)', flash: 0.55, vignette: 0.55, grain: 0.15 },
  { id: 'film', label: 'Film', why: 'Warm, soft blacks and grain, like a disposable camera. Feels personal, not like an ad.', css: 'contrast(0.95) saturate(0.9) sepia(0.18) brightness(1.03)', wash: ['#2a1a0a', 0.18, 'lighten'], grain: 0.35, vignette: 0.25 },
  { id: 'grit', label: 'Grit', why: 'Crushed, desaturated and grainy: suits heavy music and live shots.', css: 'contrast(1.45) saturate(0.45) brightness(0.92)', grain: 0.5, vignette: 0.45 },
  { id: 'noir', label: 'Noir', why: 'High-contrast black and white. Strong shapes stand out in a colourful feed.', css: 'grayscale(1) contrast(1.4) brightness(0.95)', grain: 0.25, vignette: 0.4 },
  { id: 'neon', label: 'Neon', why: 'Magenta and cyan tints that pop at thumbnail size.', css: 'saturate(1.6) contrast(1.15) hue-rotate(-12deg)', wash: ['#ff2bd6', 0.18, 'soft-light'], vignette: 0.35 },
  { id: 'tealorange', label: 'Cinematic', why: 'Teal shadows, warm skin. Instantly looks like a still from a film.', css: 'contrast(1.12) saturate(1.1)', wash: ['#00586e', 0.22, 'lighten'], wash2: ['#ffb066', 0.16, 'darken'], vignette: 0.3 },
  { id: 'vhs', label: 'VHS', why: 'Lines, colour fringe and a date stamp. Nostalgia for emo and alt fans.', css: 'contrast(1.05) saturate(1.25) brightness(1.02)', scan: 0.35, rgb: 4, grain: 0.2, stamp: true },
  { id: 'dreamy', label: 'Dreamy', why: 'Soft glow and lifted pastels for slow songs and lyric slides.', css: 'brightness(1.08) contrast(0.88) saturate(0.85)', glow: 0.35, wash: ['#f7c6d9', 0.15, 'screen'] },
  { id: 'duotone', label: 'Duotone', why: 'Two colours from your cover art, so every slide matches the release.', css: 'grayscale(1) contrast(1.2)', duotone: true },
  { id: 'polaroid', label: 'Polaroid', why: 'A white instant-photo border: the photo-dump look people swipe through.', css: 'contrast(1.02) saturate(0.95) sepia(0.12)', frame: 'polaroid', grain: 0.12 },
];

export const LAYOUTS = [
  ['full', 'Photo with text'],
  ['hook', 'Big hook text'],
  ['quote', 'Lyric quote'],
  ['cover', 'Cover art'],
  ['cta', 'Call to action'],
];

/** A slide. source: { kind: 'image'|'clip'|'edit'|'cover'|'color', mediaId, time, color } */
export const slide = (o) => ({ id: uid('sld'), layout: 'full', text: '', sub: '', filter: 'none', source: { kind: 'color', color: '#111111' }, ...o });

/** What a carousel can be built from. */
export function carouselInputs(mediaAll, p) {
  const all = mediaAll || [];
  const cover = p.endCard && p.endCard.coverMediaId && all.find((m) => m.id === p.endCard.coverMediaId);
  const images = all.filter((m) => m.kind === 'image' && m !== cover && (!p.look || !p.look.watermark || m.id !== p.look.watermark.mediaId));
  const clips = all.filter((m) => m.kind === 'video');
  const lines = (p.lyrics || []).filter((l) => l.text && l.text.trim()).sort((a, b) => a.start - b.start);
  return {
    cover: cover || null,
    images,
    clips,
    lines,
    hasTab: (p.layers || []).some((l) => l.type === 'tab' && l.mediaId && l.visible !== false),
    title: p.endCard && p.endCard.title !== 'Song Title' ? p.endCard.title : '',
    artist: p.endCard && p.endCard.artist !== 'Artist Name' ? p.endCard.artist : '',
    release: p.endCard ? p.endCard.releaseDate : '',
    hasEdit: (p.clips || []).length > 0,
  };
}

/** n photo sources: your images first, then frames spread across your clips. */
function photos(inp, n, seed = 0) {
  const out = inp.images.map((m) => ({ kind: 'image', mediaId: m.id }));
  const clips = inp.clips;
  for (let i = 0; out.length < n && clips.length && i < n * 2; i++) {
    const m = clips[(i + seed) % clips.length];
    const k = Math.floor(i / clips.length);
    const d = m.duration || 4;
    out.push({ kind: 'clip', mediaId: m.id, time: +Math.min(d - 0.1, d * (0.2 + ((k * 0.37 + seed * 0.13) % 0.7))).toFixed(2) });
  }
  if (!out.length) out.push({ kind: 'color', color: '#1a1020' });
  return Array.from({ length: n }, (_, i) => out[(i + seed) % out.length]);
}

const date = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
};

/**
 * Suggested carousels: [{ id, name, why, slides }]. They adapt to what you have (no lyrics -> no lyric
 * reveal, a tab layer -> a riff carousel...). `seed` reshuffles photo choices.
 */
export function suggestCarousels(inp, { seed = 0, filter = null } = {}) {
  const title = inp.title || 'our new song';
  const T = inp.title ? `“${inp.title}”` : 'our new song';
  const when = inp.release && new Date(`${inp.release}T00:00:00`) > new Date() ? `OUT ${date(inp.release)}` : 'OUT NOW';
  const cover = inp.cover ? { kind: 'cover', mediaId: inp.cover.id } : { kind: 'color', color: '#111111' };
  const f = (d) => filter || d;
  const list = [];

  const ph = photos(inp, 6, seed);
  list.push({
    id: 'release',
    name: 'Release announcement',
    why: 'Cover first so it’s recognised, real photos to make people care, then one clear ask.',
    slides: [
      slide({ layout: 'cover', source: cover, text: when, sub: inp.artist, filter: 'none' }),
      slide({ layout: 'full', source: ph[0], text: `${T}`, sub: 'swipe →', filter: f('flash') }),
      slide({ layout: 'full', source: ph[1], text: 'Written in a basement', sub: '', filter: f('flash') }),
      slide({ layout: 'full', source: ph[2], text: 'Recorded live in one room', sub: '', filter: f('flash') }),
      slide({ layout: 'cta', source: cover, text: when, sub: 'Send this to who you’d play it for first 📩', filter: 'none' }),
    ],
  });

  if (inp.lines.length >= 2) {
    const hook = bestLyric(inp.lines) || inp.lines[0];
    const picks = [hook, ...inp.lines.filter((l) => l !== hook)].slice(0, 4);
    const lp = photos(inp, picks.length, seed + 1);
    list.push({
      id: 'lyrics',
      name: 'Lyric reveal',
      why: 'One line per slide makes each swipe a payoff, and lyric slides get screenshotted and shared.',
      slides: [
        slide({ layout: 'hook', source: lp[0], text: 'The line we almost cut', sub: '→', filter: f('dreamy') }),
        ...picks.map((l, i) => slide({ layout: 'quote', source: lp[i % lp.length], text: l.text, sub: inp.title ? `${inp.title} · ${inp.artist || ''}`.trim().replace(/ ·$/, '') : '', filter: f('dreamy') })),
        slide({ layout: 'cta', source: cover, text: when, sub: 'Which line is yours? Comment it.', filter: 'none' }),
      ],
    });
  }

  const bp = photos(inp, 4, seed + 2);
  list.push({
    id: 'bts',
    name: 'Behind the song',
    why: 'Process and mistakes beat polish; a numbered story keeps people swiping to the end.',
    slides: [
      slide({ layout: 'hook', source: bp[0], text: `How ${title} was made in 5 slides`, sub: '→', filter: f('film') }),
      slide({ layout: 'full', source: bp[1], text: '1 · The riff', sub: 'Started as a voice memo', filter: f('film') }),
      slide({ layout: 'full', source: bp[2], text: '2 · The fight', sub: 'We argued about the breakdown for a week', filter: f('film') }),
      slide({ layout: 'full', source: bp[3], text: '3 · The take', sub: 'Take 14. The one with the mistake stayed.', filter: f('film') }),
      slide({ layout: 'cta', source: cover, text: when, sub: 'Save this for the full story in our next post', filter: 'none' }),
    ],
  });

  const dp = photos(inp, 7, seed + 3);
  list.push({
    id: 'dump',
    name: 'Photo dump',
    why: 'Casual photo dumps feel like a friend’s post; mixing flash photos with one cover slide still sells the song.',
    slides: [
      slide({ layout: 'full', source: dp[0], text: `${title} photo dump`, sub: '', filter: f('polaroid') }),
      ...dp.slice(1, 6).map((s) => slide({ layout: 'full', source: s, text: '', sub: '', filter: f('polaroid') })),
      slide({ layout: 'cover', source: cover, text: when, sub: inp.artist, filter: 'none' }),
    ],
  });

  if (inp.hasEdit) {
    const ep = [0.15, 0.4, 0.65].map((k) => ({ kind: 'edit', time: k }));
    list.push({
      id: 'rate',
      name: 'Rate the frames',
      why: 'A specific, easy question (“rate 1–10”, “pick a slide”) gets comments; stills from your promo tease the video.',
      slides: [
        slide({ layout: 'hook', source: ep[0], text: 'Pick a slide. We’ll make it the next video.', sub: '→', filter: f('grit') }),
        ...ep.map((s, i) => slide({ layout: 'full', source: s, text: `${i + 1}`, sub: '', filter: f('grit') })),
        slide({ layout: 'cta', source: cover, text: 'Comment 1, 2 or 3', sub: `${T} ${when.toLowerCase()}`, filter: 'none' }),
      ],
    });
  }
  if (inp.hasTab) {
    list.push({
      id: 'riff',
      name: 'Learn the riff',
      why: 'Tutorial slides earn saves; the tab from your edit is already on screen.',
      slides: [
        slide({ layout: 'hook', source: { kind: 'edit', time: 0.2 }, text: 'Learn the riff in 3 slides', sub: 'Save this →', filter: f('noir') }),
        ...[0.3, 0.5, 0.7].map((k, i) => slide({ layout: 'full', source: { kind: 'edit', time: k }, text: `Part ${i + 1}`, sub: '', filter: 'none' })),
        slide({ layout: 'cta', source: cover, text: when, sub: 'Comment “TAB” for the full tab', filter: 'none' }),
      ],
    });
  }
  return list;
}

// ------------------------------------------------------------ drawing

const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 256;
  const g = grainTile.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd(i * 0.37) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grainTile;
}

function cover(ctx, src, x, y, w, h) {
  const sw = src.videoWidth || src.naturalWidth || src.width;
  const sh = src.videoHeight || src.naturalHeight || src.height;
  if (!sw || !sh) return;
  const k = Math.max(w / sw, h / sh);
  ctx.drawImage(src, x + (w - sw * k) / 2, y + (h - sh * k) / 2, sw * k, sh * k);
}

/** Apply a look to the region already drawn at (x, y, w, h). */
function finish(ctx, f, x, y, w, h, palette, W) {
  const fill = (color, a, op) => {
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  };
  if (f.duotone) {
    const [c1, c2] = palette || ['#ff2bd6', '#2b6bff'];
    fill(c2, 1, 'multiply');
    fill(c1, 0.85, 'screen');
  }
  if (f.wash) fill(...f.wash);
  if (f.wash2) fill(...f.wash2);
  if (f.flash) {
    const g = ctx.createRadialGradient(x + w / 2, y + h * 0.42, 0, x + w / 2, y + h * 0.42, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgba(255,255,255,${f.flash * 0.35})`);
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(0,0,0,${f.flash})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  if (f.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = f.glow;
    ctx.filter = `blur(${Math.round(W * 0.012)}px)`;
    ctx.drawImage(ctx.canvas, x, y, w, h, x, y, w, h);
    ctx.restore();
  }
  if (f.scan) {
    ctx.save();
    ctx.globalAlpha = f.scan * 0.5;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.round(W / 270));
    for (let yy = y; yy < y + h; yy += step * 2) ctx.fillRect(x, yy, w, step);
    ctx.restore();
  }
  if (f.rgb) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ctx.canvas, x, y, w, h, x + (f.rgb * W) / 1080, y, w, h);
    ctx.restore();
  }
  if (f.grain) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = f.grain * 0.45;
    const pat = ctx.createPattern(grain(), 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (f.vignette) {
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${f.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  if (f.stamp) {
    const d = new Date();
    ctx.save();
    ctx.font = `700 ${Math.round(W * 0.034)}px "Courier New", monospace`;
    ctx.fillStyle = '#ffb03a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#ff6a00';
    ctx.shadowBlur = W * 0.006;
    ctx.fillText(`${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')} '${String(d.getFullYear()).slice(2)}`, x + w - W * 0.04, y + h - W * 0.04);
    ctx.restore();
  }
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx, text, family, weight, maxW, maxH, start) {
  let size = start;
  let lines;
  for (; size > 14; size *= 0.92) {
    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length * size * 1.08 <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  return { size, lines: lines || [] };
}

/**
 * Draw slide `s` at W x H. assets: { image(source) -> drawable|null }, ctx2: { palette, accent, index, total }.
 */
export function drawSlide(ctx, W, H, s, assets, { palette = null, accent = '#ffd400', index = 0, total = 1 } = {}) {
  const f = FILTERS.find((x) => x.id === s.filter) || FILTERS[0];
  const k = W / SLIDE_W;
  ctx.save();
  ctx.fillStyle = s.source.kind === 'color' ? s.source.color || '#111' : '#0d0d10';
  ctx.fillRect(0, 0, W, H);
  // photo area
  let px = 0;
  let py = 0;
  let pw = W;
  let ph = H;
  if (f.frame === 'polaroid') {
    ctx.fillStyle = '#f6f3ec';
    ctx.fillRect(0, 0, W, H);
    px = W * 0.07;
    py = W * 0.07;
    pw = W - px * 2;
    ph = H - py - W * 0.26;
  }
  const img = assets.image(s.source);
  if (s.layout === 'cover' || s.layout === 'cta') {
    // blurred cover behind a centred square cover
    if (img) {
      ctx.save();
      ctx.filter = 'blur(40px) brightness(0.55) saturate(1.2)';
      cover(ctx, img, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
      ctx.restore();
      const sz = W * (s.layout === 'cta' ? 0.56 : 0.78);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 40 * k;
      cover(ctx, img, (W - sz) / 2, H * (s.layout === 'cta' ? 0.14 : 0.12), sz, sz);
      ctx.restore();
    }
  } else if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.filter = f.css || 'none';
    cover(ctx, img, px, py, pw, ph);
    ctx.filter = 'none';
    finish(ctx, f, px, py, pw, ph, palette, W);
    ctx.restore();
  }
  // text
  const sans = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';
  const body = 'Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const shadowText = () => {
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 18 * k;
  };
  if (s.text) {
    if (s.layout === 'hook') {
      const dark = ctx.createLinearGradient(0, H * 0.35, 0, H);
      dark.addColorStop(0, 'rgba(0,0,0,0)');
      dark.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W, H);
      const t = fitText(ctx, s.text.toUpperCase(), sans, 400, W * 0.84, H * 0.36, 150 * k);
      ctx.fillStyle = '#ffffff';
      shadowText();
      const y0 = H * 0.92 - t.lines.length * t.size * 1.02 - (s.sub ? 70 * k : 0);
      t.lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * t.size * 1.02));
      if (s.sub) {
        ctx.fillStyle = accent;
        ctx.font = `800 ${Math.round(48 * k)}px ${body}`;
        ctx.fillText(s.sub, W / 2, H * 0.92 - 52 * k);
      }
    } else if (s.layout === 'quote') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      const t = fitText(ctx, `“${s.text}”`, '"Playfair Display", Georgia, serif', 700, W * 0.8, H * 0.5, 110 * k);
      ctx.fillStyle = '#ffffff';
      shadowText();
      const y0 = (H - t.lines.length * t.size * 1.1) / 2 - 30 * k;
      t.lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * t.size * 1.1));
      if (s.sub) {
        ctx.fillStyle = accent;
        ctx.font = `700 ${Math.round(36 * k)}px ${body}`;
        ctx.fillText(s.sub.toUpperCase(), W / 2, y0 + t.lines.length * t.size * 1.1 + 40 * k);
      }
    } else if (s.layout === 'cover' || s.layout === 'cta') {
      const top = s.layout === 'cta' ? H * 0.14 + W * 0.56 + 50 * k : H * 0.12 + W * 0.78 + 40 * k;
      ctx.fillStyle = accent;
      const t = fitText(ctx, s.text.toUpperCase(), sans, 400, W * 0.84, H * 0.14, 130 * k);
      shadowText();
      t.lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * t.size));
      if (s.sub) {
        ctx.fillStyle = '#ffffff';
        const st = fitText(ctx, s.sub, body, 700, W * 0.82, H * 0.12, 46 * k);
        st.lines.forEach((l, i) => ctx.fillText(l, W / 2, top + t.lines.length * t.size + 18 * k + i * st.size * 1.15));
      }
    } else {
      // full: a caption band at the bottom (inside the polaroid border when there is one)
      const polaroid = f.frame === 'polaroid';
      const t = fitText(ctx, polaroid ? s.text : s.text.toUpperCase(), polaroid ? '"Permanent Marker", "Comic Sans MS", cursive' : sans, 400, W * 0.84, H * 0.16, (polaroid ? 70 : 104) * k);
      ctx.fillStyle = polaroid ? '#222' : '#ffffff';
      if (!polaroid) shadowText();
      const base = polaroid ? py + ph + W * 0.05 : H - 80 * k - t.lines.length * t.size - (s.sub ? 60 * k : 0);
      t.lines.forEach((l, i) => ctx.fillText(l, W / 2, base + i * t.size));
      if (s.sub) {
        ctx.font = `600 ${Math.round(40 * k)}px ${body}`;
        ctx.fillStyle = polaroid ? '#555' : '#ffffff';
        ctx.fillText(s.sub, W / 2, base + t.lines.length * t.size + 14 * k);
      }
    }
  }
  ctx.shadowBlur = 0;
  // slide counter dots on slide 1 hint that there's more to swipe
  if (index === 0 && total > 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 ${Math.round(30 * k)}px ${body}`;
    ctx.textAlign = 'right';
    ctx.fillText(`1/${total}`, W - 40 * k, 40 * k);
  }
  ctx.restore();
}
