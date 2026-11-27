// Whole-song lyric displays: a scrolling lyric sheet, a kinetic typography poster and a 3D word tunnel.
// They replace the one-line-at-a-time lyric when lyricStyle.display is set.
import { wordTimings, savedWordTimes } from './core.js';
import { glowPass } from './canvasfx.js';
import { lineStyle } from './linestyle.js';
import { fxv } from './lyricfx.js';
import { tickerLayout, tickerOffset, tickerLines, tickerHandOffset } from './lyricanim.js';

export const LYRIC_DISPLAYS = [
  ['line', 'One line at a time', 'Each line on its own with the animation you pick'],
  ['sheet', 'Scrolling lyric sheet', 'Current line big and filling in, the lines around it dimmed'],
  ['poster', 'Kinetic poster', 'Words slam in at different sizes and angles'],
  ['tunnel', '3D word tunnel', 'Words fly at the camera out of a neon tunnel'],
  ['ticker', 'Horizontal ticker', 'One band of lyrics crawling sideways in the lower third'],
];

/** Lyric style settings that suit each display when you switch to it. */
export const DISPLAY_DEFAULTS = {
  line: {},
  sheet: { y: 50, size: 7.5, align: 'left', maxWidth: 84, uppercase: false },
  poster: { y: 46, size: 9, align: 'center', maxWidth: 84, uppercase: true },
  tunnel: { y: 46, size: 9, align: 'center', uppercase: true },
  ticker: { y: 74, size: 5.5, align: 'left', uppercase: true, boxColor: '#000000', boxOpacity: 0.6 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => k * k * (3 - 2 * k);
const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
const outBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

function rgba(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
}
const fontOf = (px, family, weight = 800) => `${weight} ${Math.round(px)}px "${family}", Impact, system-ui, sans-serif`;
const caseOf = (s, text) => (s.uppercase ? String(text).toUpperCase() : String(text));

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// a few dozen lines at most, so sorting every frame is cheap and never stale
function sorted(lyrics) {
  return lyrics.filter((l) => l && l.text).sort((a, b) => a.start - b.start);
}

/** Index of the last line that has started by ts (-1 if none). */
export function lastStarted(lines, ts) {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].start <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Absolute (song-time) start/end of each word in a line. */
export function wordTimes(line) {
  const saved = savedWordTimes(line); // times from Auto-sync, when the line has them
  if (saved) return saved;
  const d = Math.max(0.05, line.end - line.start);
  return wordTimings(line.text).map((w) => ({ word: w.word, start: line.start + w.start * d, end: line.start + w.end * d }));
}

/**
 * Where the lyric sheet is scrolled to: `index` is the current line, `scroll` is 0..1 progress
 * toward the next line (it glides over the 0.3 s before the next line starts). Null when nothing shows.
 */
export function sheetPosition(lines, ts) {
  if (!lines.length) return null;
  let i = lastStarted(lines, ts);
  if (i < 0) {
    if (lines[0].start - ts > 1.5) return null;
    i = 0;
  }
  const cur = lines[i];
  const next = lines[i + 1];
  if (ts > cur.end + 2.5 && (!next || next.start - ts > 1.5)) return null;
  const scroll = next ? smooth(clamp((ts - (next.start - 0.3)) / 0.3, 0, 1)) : 0;
  const fadeIn = clamp(1 - (lines[0].start - ts) / 1.5, 0, 1);
  const last = lines[lines.length - 1];
  const fadeOut = i === lines.length - 1 ? clamp(1 - (ts - last.end - 2) / 0.5, 0, 1) : 1;
  return { index: i, scroll, alpha: Math.min(fadeIn, fadeOut) };
}

function wrap(ctx, words, maxW) {
  const space = ctx.measureText(' ').width;
  const rows = [];
  let row = [];
  let w = 0;
  for (const word of words) {
    const ww = ctx.measureText(word).width;
    if (row.length && w + space + ww > maxW) {
      rows.push({ words: row, width: w });
      row = [];
      w = 0;
    }
    w += (row.length ? space : 0) + ww;
    row.push(word);
  }
  if (row.length) rows.push({ words: row, width: w });
  return { rows, space };
}

// ------------------------------------------------------------ A: scrolling lyric sheet

function drawSheet(ctx, W, H, lines, s, ts, beat, styleOf = () => s) {
  const pos = sheetPosition(lines, ts);
  if (!pos || pos.alpha <= 0) return;
  const { index: i, scroll } = pos;
  const f = i + scroll;
  const big = (W * s.size) / 100;
  const small = big * 0.62;
  const maxW = (W * (s.maxWidth || 84)) / 100;
  const cx = (W * (s.x ?? 50)) / 100;
  const y0 = (H * s.y) / 100;
  const gapPx = big * 0.45;
  const items = [];
  for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 4); j++) {
    const dist = Math.abs(j - f);
    const ls = styleOf(lines[j]);
    const size = big + (small - big) * clamp(dist, 0, 1);
    ctx.font = fontOf(size, ls.font);
    const words = caseOf(ls, lines[j].text).split(/\s+/).filter(Boolean);
    const { rows, space } = wrap(ctx, words, maxW * (size / big));
    items.push({ j, size, rows, space, h: rows.length * size * 1.08, dist, ls });
  }
  // stack the blocks, then shift so the scroll position sits on y0
  const posY = new Map();
  let y = 0;
  items.forEach((it, k) => {
    if (k) y += items[k - 1].h / 2 + gapPx + it.h / 2;
    posY.set(it.j, y);
  });
  const a = posY.get(i) ?? 0;
  const b = posY.get(i + 1) ?? a;
  const offset = a + (b - a) * scroll;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const it of items) {
    const alpha = (it.dist < 1 ? 1 - 0.55 * it.dist : Math.max(0, 0.45 - 0.14 * (it.dist - 1))) * pos.alpha;
    if (alpha <= 0.01) continue;
    const cy = y0 + posY.get(it.j) - offset;
    if (cy < -it.h || cy > H + it.h) continue;
    const ls = it.ls;
    ctx.font = fontOf(it.size, ls.font);
    const line = lines[it.j];
    const isCur = it.j === i && ts >= line.start;
    const times = isCur ? wordTimes(line) : null;
    let wi = 0;
    it.rows.forEach((row, r) => {
      const ry = cy - it.h / 2 + it.size * 1.08 * (r + 0.5);
      let x = s.align === 'left' ? cx - maxW / 2 : s.align === 'right' ? cx + maxW / 2 - row.width : cx - row.width / 2;
      for (const word of row.words) {
        const ww = ctx.measureText(word).width;
        const sung = times && times[wi] && ts >= times[wi].start;
        ctx.globalAlpha = alpha;
        if ((ls.outlineWidth || 0) > 0) {
          ctx.strokeStyle = ls.outline;
          ctx.lineWidth = it.size * ls.outlineWidth * 0.12;
          ctx.strokeText(word, x, ry);
        } else if (ls.shadow !== false) {
          // soft dark edge so the sheet reads over bright video
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = it.size * 0.1;
          ctx.strokeText(word, x, ry);
        }
        ctx.fillStyle = isCur ? (sung ? ls.highlight : rgba(ls.color, 0.6)) : ls.color;
        ctx.textAlign = 'left';
        ctx.fillText(word, x, ry);
        x += ww + it.space;
        wi++;
      }
    });
  }
  ctx.restore();
}

// ------------------------------------------------------------ B: kinetic poster

const posterCache = new Map();

/**
 * Lay a line out as a poster: words packed into short rows, each row scaled to fill the width.
 * Deterministic for a given line, so every frame (and the export) matches.
 * Returns { rows: [{ size, width, words: [{ text, index, dx, width, rot, outline, accent }] }], height }.
 */
export function posterLayout(ctx, line, s, W, H) {
  const key = `${line.id}|${line.text}|${W}|${H}|${s.font}|${s.size}|${s.maxWidth}|${s.uppercase}`;
  if (posterCache.has(key)) return posterCache.get(key);
  const seed = hashStr(line.id || line.text);
  const words = caseOf(s, line.text).split(/\s+/).filter(Boolean);
  const maxW = (W * (s.maxWidth || 84)) / 100;
  const cap = ((W * s.size) / 100) * 2.6;
  const longest = words.reduce((bi, w, i) => (w.replace(/\W/g, '').length > words[bi].replace(/\W/g, '').length ? i : bi), 0);
  // rows of up to ~10 characters, longest word on its own row
  const groups = [];
  let g = [];
  let chars = 0;
  words.forEach((w, i) => {
    const solo = i === longest && words.length > 2;
    if (g.length && chars + w.length > 10) {
      groups.push({ idx: g, solo: false });
      g = [];
      chars = 0;
    }
    if (solo) {
      if (g.length) groups.push({ idx: g, solo: false });
      groups.push({ idx: [i], solo: true });
      g = [];
      chars = 0;
      return;
    }
    g.push(i);
    chars += w.length + 1;
  });
  if (g.length) groups.push({ idx: g, solo: false });
  const ref = 100;
  ctx.save();
  ctx.font = fontOf(ref, s.font, 900);
  const space = ctx.measureText(' ').width;
  const rows = groups.map((gr) => {
    const ws = gr.idx.map((i) => ({ text: words[i], index: i, w: ctx.measureText(words[i]).width }));
    const width = ws.reduce((a, w) => a + w.w, 0) + space * (ws.length - 1);
    const size = Math.min(cap, (ref * maxW) / Math.max(1, width));
    const k = size / ref;
    let dx = 0;
    const placed = ws.map((w) => {
      const out = {
        text: w.text,
        index: w.index,
        dx: dx * k,
        width: w.w * k,
        rot: rnd(seed * 97 + w.index) < 0.3 ? (rnd(seed * 13 + w.index) - 0.5) * 0.24 : 0,
        outline: w.index !== longest && rnd(seed * 31 + w.index) < 0.22,
        accent: w.index === longest,
      };
      dx += w.w + space;
      return out;
    });
    return { size, width: width * k, words: placed };
  });
  ctx.restore();
  let height = rows.reduce((a, r) => a + r.size * 0.92, 0);
  const maxH = H * 0.5;
  if (height > maxH) {
    const k = maxH / height;
    rows.forEach((r) => {
      r.size *= k;
      r.width *= k;
      r.words.forEach((w) => ((w.dx *= k), (w.width *= k)));
    });
    height = maxH;
  }
  const out = { rows, height };
  if (posterCache.size > 200) posterCache.clear();
  posterCache.set(key, out);
  return out;
}

function currentLine(lines, ts, tail) {
  const i = lastStarted(lines, ts);
  for (let j = i; j >= 0 && j > i - 4; j--) if (ts < lines[j].end + tail) return lines[j];
  return null;
}

function drawPoster(ctx, W, H, lines, s0, ts, beat, styleOf = () => s0) {
  const line = currentLine(lines, ts, 0.2);
  if (!line) return;
  const s = styleOf(line);
  const next = lines[lastStarted(lines, ts) + 1];
  const endAt = Math.min(line.end + 0.2, next ? next.start : Infinity);
  const out = clamp((endAt - ts) / 0.2, 0, 1);
  if (out <= 0) return;
  const lay = posterLayout(ctx, line, s, W, H);
  const times = wordTimes(line);
  const cx = (W * (s.x ?? 50)) / 100;
  const cy = (H * s.y) / 100;
  const fx = s0.fx; // effect settings (lyricfx.js) come from the shared style
  const pulse = 1 + 0.025 * fxv(fx, 'pulse') * (beat || 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  let y = -lay.height / 2;
  let lastRowBottom = 0;
  let lastRowWidth = 0;
  for (const row of lay.rows) {
    const base = y + row.size * 0.8;
    const x0 = -row.width / 2;
    for (const w of row.words) {
      const t0 = times[w.index] ? times[w.index].start : line.start;
      const life = ts - t0;
      if (life < 0) continue;
      const k = clamp(life / 0.14, 0, 1);
      const sc = 1.7 - 0.7 * outBack(k);
      const shake = life < 0.18 ? (rnd(Math.floor(ts * 60 * fxv(fx, 'slamSpeed')) + w.index) - 0.5) * row.size * 0.06 * fxv(fx, 'slamShake') : 0;
      ctx.save();
      ctx.globalAlpha *= clamp(life / 0.06, 0, 1) * out;
      ctx.translate(x0 + w.dx + w.width / 2 + shake, base - row.size * 0.35);
      ctx.rotate(w.rot);
      ctx.scale(sc, sc);
      ctx.font = fontOf(row.size, s.font, 900);
      const tx = -w.width / 2;
      const ty = row.size * 0.35;
      if (w.outline) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = Math.max(1.5, row.size * 0.035);
        ctx.strokeText(w.text, tx, ty);
      } else {
        if ((s.outlineWidth || 0) > 0) {
          ctx.strokeStyle = s.outline;
          ctx.lineWidth = row.size * s.outlineWidth * 0.1;
          ctx.strokeText(w.text, tx, ty);
        }
        ctx.fillStyle = w.accent ? s.highlight : s.color;
        ctx.fillText(w.text, tx, ty);
      }
      ctx.restore();
    }
    y += row.size * 0.92;
    lastRowBottom = base + row.size * 0.12;
    lastRowWidth = row.width;
  }
  // a bar that fills as the line plays
  const prog = clamp((ts - line.start) / Math.max(0.1, line.end - line.start), 0, 1);
  ctx.globalAlpha *= out;
  ctx.fillStyle = s.highlight;
  const barH = Math.max(3, (W * s.size) / 100 * 0.08);
  ctx.fillRect(-lastRowWidth / 2, lastRowBottom, lastRowWidth * prog, barH);
  ctx.restore();
}

// ------------------------------------------------------------ C: 3D word tunnel

function drawTunnel(ctx, W, H, lines, s, ts, beat, styleOf = () => s) {
  const cx = (W * (s.x ?? 50)) / 100;
  const cy = (H * s.y) / 100;
  const i = lastStarted(lines, ts);
  const lo = Math.max(0, i - 1);
  const hi = Math.min(lines.length - 1, i + 2);
  // only draw while lyrics are near
  const near = lines.slice(lo, hi + 1).some((l) => ts > l.start - 1.6 && ts < l.end + 0.6);
  if (!near) return;
  const G = glowPass(ctx, 0, 0, W, H, W * 0.02);
  const base = (W * s.size) / 100;

  // neon frames rushing toward the camera
  const N = 7;
  const frameA = clamp(Math.min(...lines.slice(lo, hi + 1).map((l) => Math.min((ts - (l.start - 1.6)) / 0.6, (l.end + 0.6 - ts) / 0.4))), 0, 1);
  ctx.save();
  ctx.lineJoin = 'round';
  for (let k = 0; k < N; k++) {
    const z = fract(k / N + ts * 0.32 * fxv(s.fx, 'tunnelSpeed'));
    const sc = 0.06 + z * z * 1.5;
    const a = Math.min(z / 0.25, 1) * (1 - Math.max(0, (z - 0.8) / 0.2)) * frameA * (0.55 + 0.45 * fxv(s.fx, 'pulse') * (beat || 0));
    if (a <= 0.01) continue;
    const w = W * 0.95 * sc;
    const h = W * 1.35 * sc;
    const lw = Math.max(1, W * 0.004 * (0.4 + sc));
    const r = w * 0.08;
    const rect = (c) => {
      c.beginPath();
      c.roundRect ? c.roundRect(cx - w / 2, cy - h / 2, w, h, r) : c.rect(cx - w / 2, cy - h / 2, w, h);
    };
    ctx.strokeStyle = rgba(s.highlight, a);
    ctx.lineWidth = lw;
    rect(ctx);
    ctx.stroke();
    G.add((g) => {
      g.strokeStyle = s.highlight;
      g.globalAlpha = a;
      g.lineWidth = lw * 4;
      rect(g);
      g.stroke();
    });
  }

  // words
  const items = [];
  for (let j = lo; j <= hi; j++) {
    const line = lines[j];
    const times = wordTimes(line);
    const seed = hashStr(line.id || line.text);
    times.forEach((w, wi) => {
      const lead = 1.1;
      const holdEnd = Math.max(w.end, times[wi + 1] ? times[wi + 1].start : line.end) + 0.05;
      let z;
      let alpha;
      let m = 1; // how far from the centre the word sits; the word being sung glides to the middle
      if (ts < w.start - lead) return;
      if (ts < w.start) {
        const u = (ts - (w.start - lead)) / lead;
        z = 1 + 7 * (1 - u) * (1 - u);
        alpha = 0.15 + 0.85 * u;
      } else if (ts < holdEnd) {
        z = 1 - 0.12 * clamp((ts - w.start) / Math.max(0.05, holdEnd - w.start), 0, 1);
        alpha = 1;
        m = 1 - 0.9 * smooth(clamp((ts - w.start) / 0.15, 0, 1));
      } else if (ts < holdEnd + 0.3) {
        const u = (ts - holdEnd) / 0.3;
        z = 0.88 - 0.6 * u;
        alpha = 1 - u;
        m = 0.1 + 0.9 * u;
      } else return;
      const ang = rnd(seed * 53 + wi) * Math.PI * 2;
      const ox = Math.cos(ang) * W * 0.3 * m;
      const oy = Math.sin(ang) * W * 0.3 * m;
      const ls = styleOf(line);
      items.push({ text: caseOf(ls, w.word), z, alpha, ox, oy, current: ts >= w.start && ts < holdEnd, ls });
    });
  }
  items.sort((a, b) => b.z - a.z);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const it of items) {
    const size = (base * 1.25) / it.z;
    if (size > W * 0.9) continue;
    const x = cx + it.ox / it.z;
    const y = cy + it.oy / it.z;
    ctx.font = fontOf(size, it.ls.font, 900);
    ctx.globalAlpha = it.alpha;
    ctx.strokeStyle = it.ls.highlight;
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.strokeText(it.text, x, y);
    ctx.fillStyle = it.ls.color;
    ctx.fillText(it.text, x, y);
    if (it.current) {
      const font = ctx.font;
      const a = it.alpha;
      G.add((g) => {
        g.font = font;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.globalAlpha = a;
        g.strokeStyle = it.ls.highlight;
        g.lineWidth = size * 0.12;
        g.strokeText(it.text, x, y);
      });
    }
  }
  ctx.globalAlpha = 1;
  G.flush(0.9);
  ctx.restore();
}

// ------------------------------------------------------------ D: horizontal ticker

const tickerWidths = new Map();
/** The pixel width of a line of the band in its font (cached: measuring every line every frame is wasted work). */
function tickerWidth(ctx, font, text) {
  const key = `${font}|${text}`;
  let w = tickerWidths.get(key);
  if (w === undefined) {
    if (tickerWidths.size > 600) tickerWidths.clear();
    w = ctx.measureText(text).width;
    tickerWidths.set(key, w);
  }
  return w;
}

/**
 * All the lyrics in one band, lines side by side with a small diamond between, crawling right to left across the
 * frame (a news ticker). The band's dark strip uses the lyric style's box colour and opacity. The line being sung is
 * in the highlight colour. The crawl speed is locked to the tempo (one line per bar, `extra.grid` = the lyric tempo
 * grid) or set by hand; either way it is a function of song time only, so the preview and every export agree.
 * shortcut: the band does not follow the sung times (a line is not under the same spot when it is sung), and a very
 * long line crawls fast when locked to the tempo; upgrade by pinning each line to its start time if wanted.
 */
function drawTicker(ctx, W, H, lines, s, ts, beat, styleOf, extra = {}) {
  const size = (W * s.size) / 100;
  const gap = size * 1.8 * fxv(s.fx, 'tickerGap');
  const y = (H * s.y) / 100;
  const widths = [];
  const looks = lines.map((l) => styleOf(l));
  lines.forEach((l, i) => {
    const f = fontOf(size, looks[i].font);
    ctx.font = f;
    widths.push(tickerWidth(ctx, f, caseOf(looks[i], l.text)));
  });
  const { total } = tickerLayout(widths, gap);
  const speed = fxv(s.fx, 'tickerSpeed');
  const first = lines[0].start;
  let offset;
  let t0 = first;
  if (Math.round(fxv(s.fx, 'tickerLock'))) {
    const c = tickerLines(ts, first, extra.grid || null, speed);
    t0 = c.t0;
    offset = tickerOffset(c.k, widths, gap);
  } else {
    offset = tickerHandOffset(ts - first, W, speed);
  }
  if (!(ts >= t0) || offset <= 0) return;
  const x0 = W - offset;
  if (x0 + total < 0) return;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.textAlign = 'left';
  // the band's strip, fading in with the first line and out when the last one has gone by
  ctx.globalAlpha = clamp(offset / (W * 0.15), 0, 1) * clamp((x0 + total) / (W * 0.15), 0, 1);
  ctx.fillStyle = rgba(s.boxColor, s.boxOpacity ?? 0.6);
  ctx.fillRect(0, y - size * 1.05, W, size * 2.1);
  ctx.beginPath();
  ctx.rect(0, y - size * 1.05, W, size * 2.1);
  ctx.clip();
  let x = x0;
  lines.forEach((l, i) => {
    const w = widths[i];
    if (x < W && x + w > 0) {
      const ls = looks[i];
      ctx.font = fontOf(size, ls.font);
      const text = caseOf(ls, l.text);
      if ((ls.outlineWidth || 0) > 0) {
        ctx.strokeStyle = ls.outline;
        ctx.lineWidth = size * ls.outlineWidth * 0.12;
        ctx.strokeText(text, x, y);
      } else if (ls.shadow !== false) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = size * 0.1;
        ctx.strokeText(text, x, y);
      }
      ctx.fillStyle = ts >= l.start && ts <= l.end ? ls.highlight : ls.color;
      ctx.fillText(text, x, y);
    }
    // the diamond between this line and the next
    const dx = x + w + gap / 2;
    if (i < lines.length - 1 && dx > -size && dx < W + size) {
      const r = size * 0.16;
      ctx.fillStyle = s.highlight;
      ctx.beginPath();
      ctx.moveTo(dx, y - r);
      ctx.lineTo(dx + r, y);
      ctx.lineTo(dx, y + r);
      ctx.lineTo(dx - r, y);
      ctx.closePath();
      ctx.fill();
    }
    x += w + gap;
  });
  ctx.restore();
}

const DRAW = { sheet: drawSheet, poster: drawPoster, tunnel: drawTunnel, ticker: drawTicker };

/** Draw the lyrics with a whole-song display. `ts` is song time. Returns false for the one-line display. */
export function drawLyricDisplay(ctx, W, H, lyrics, s, ts, beat = 0, theme = null, extra = {}) {
  const fn = DRAW[s.display];
  if (!fn) return false;
  const lines = sorted(lyrics || []);
  // each line can carry its own look (font, colours, case); the layout stays the shared one
  const styleOf = (line) => {
    const ls = lineStyle(s, line, theme);
    return ls === s ? s : { ...s, font: ls.font, color: ls.color, highlight: ls.highlight, outline: ls.outline, outlineWidth: ls.outlineWidth, uppercase: ls.uppercase, size: ls.size };
  };
  if (lines.length) fn(ctx, W, H, lines, s, ts, beat, styleOf, extra);
  return true;
}
