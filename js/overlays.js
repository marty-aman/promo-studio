// Phantom phone UI for the preview: where TikTok, Instagram Reels and YouTube Shorts put their
// buttons, captions and nav bars on a 9:16 video, and what Spotify's Now Playing view covers on a Canvas. Approximate generic layouts drawn as
// see-through ghosts (no brand logos). Preview only, never exported.

export const PLATFORM_OVERLAYS = [
  ['off', 'Off'],
  ['tiktok', 'TikTok'],
  ['reels', 'Instagram Reels'],
  ['shorts', 'YouTube Shorts'],
  ['spotify', 'Spotify Canvas'],
];

// 24x24 stroke icons (Lucide-style paths)
const ICON = {
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
  comment: 'M7.9 20A9 9 0 1 0 4 16.1L2 22z',
  bookmark: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  share: 'M14 4l7 7-7 7v-4c-5 0-8.5 1.5-11 5 1-5 4-10 11-11z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  more: 'M12 12h.01M19 12h.01M5 12h.01',
  thumbUp: 'M7 10v12M15 5.9L14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z',
  thumbDown: 'M17 14V2M9 18.1L10 14H4.2a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.6 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z',
  remix: 'M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-4.3-4.3',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  home: 'M3 10l9-7 9 7v11h-6v-7H9v7H3z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  plusBox: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 8v8M8 12h8',
  inbox: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  play: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10 8l6 4-6 4z',
  shorts: 'M15 3l-8 4.5a4 4 0 0 0 0 7L9 16l-2 1a4 4 0 0 0 4 7l8-4.5a4 4 0 0 0 0-7L17 11l2-1a4 4 0 0 0-4-7zM10 9.5v5l4-2.5z',
  subs: 'M3 8h18v13H3zM6 4h12M8 1h8M10 11.5v6l5-3z',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  live: 'M2 7h20v10H2zM6 10v4h2M11 10v4M14 10l1.5 4 1.5-4',
  plus: 'M12 5v14M5 12h14',
  back: 'M19 12H5M12 19l-7-7 7-7',
};
const paths = {};
const path = (n) => (paths[n] ||= new Path2D(ICON[n]));

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

/** Drawing kit bound to a frame size; coordinates are fractions of width (x, sizes) and height (y). */
function kit(ctx, W, H, alpha) {
  const ink = `rgba(255,255,255,${alpha})`;
  const faint = `rgba(255,255,255,${alpha * 0.45})`;
  const k = {
    icon(name, x, y, size = 0.075, fill = false) {
      const s = W * size;
      ctx.save();
      ctx.translate(W * x - s / 2, H * y - s / 2);
      ctx.scale(s / 24, s / 24);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ink;
      if (fill) {
        ctx.fillStyle = faint;
        ctx.fill(path(name));
      }
      ctx.stroke(path(name));
      ctx.restore();
    },
    count(x, y, w = 0.06) {
      // placeholder for "12.3K"-style counts
      const bw = W * w;
      const bh = W * 0.018;
      ctx.fillStyle = faint;
      roundRect(ctx, W * x - bw / 2, H * y - bh / 2, bw, bh, bh / 2);
      ctx.fill();
    },
    bar(x, y, w, hFrac = 0.022) {
      const bh = W * hFrac;
      ctx.fillStyle = faint;
      roundRect(ctx, W * x, H * y - bh / 2, W * w, bh, bh / 2);
      ctx.fill();
    },
    text(str, x, y, size = 0.038, { align = 'left', bold = true, color = ink } = {}) {
      ctx.font = `${bold ? '700 ' : ''}${Math.round(W * size)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(str, W * x, H * y);
    },
    circle(x, y, r, fill = false) {
      ctx.beginPath();
      ctx.arc(W * x, H * y, W * r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, W * 0.004);
      ctx.strokeStyle = ink;
      if (fill) {
        ctx.fillStyle = faint;
        ctx.fill();
      }
      ctx.stroke();
    },
    pill(str, x, y, { filled = false, size = 0.03 } = {}) {
      ctx.font = `700 ${Math.round(W * size)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(str).width;
      const pw = tw + W * size * 1.4;
      const ph = W * size * 1.8;
      roundRect(ctx, W * x, H * y - ph / 2, pw, ph, ph * 0.3);
      ctx.lineWidth = Math.max(1, W * 0.003);
      ctx.strokeStyle = ink;
      if (filled) {
        ctx.fillStyle = faint;
        ctx.fill();
      }
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, W * x + W * size * 0.7, H * y);
    },
    square(x, y, size) {
      const s = W * size;
      roundRect(ctx, W * x - s / 2, H * y - s / 2, s, s, s * 0.2);
      ctx.lineWidth = Math.max(1, W * 0.004);
      ctx.strokeStyle = ink;
      ctx.fillStyle = faint;
      ctx.fill();
      ctx.stroke();
    },
    navBar(top, icons) {
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.35})`;
      ctx.fillRect(0, H * top, W, H * (1 - top));
      ctx.fillStyle = faint;
      ctx.fillRect(0, H * top, W, Math.max(1, W * 0.002));
      const cy = top + (1 - top) * 0.42;
      icons.forEach(([name, label], i) => {
        const x = (i + 0.5) / icons.length;
        if (name === 'tiktokPlus') {
          const w = W * 0.11;
          const hh = W * 0.07;
          roundRect(ctx, W * x - w / 2, H * cy - hh / 2, w, hh, hh * 0.25);
          ctx.lineWidth = Math.max(1, W * 0.004);
          ctx.strokeStyle = ink;
          ctx.stroke();
          k.icon('plus', x, cy, 0.05);
        } else {
          k.icon(name, x, cy - (label ? 0.006 : 0), 0.06);
        }
        if (label) k.text(label, x, cy + 0.025, 0.022, { align: 'center', bold: false });
      });
    },
  };
  return k;
}

function clearArea(ctx, W, H, [x0, y0, x1, y1], alpha) {
  ctx.save();
  ctx.setLineDash([W * 0.015, W * 0.012]);
  ctx.lineWidth = Math.max(1, W * 0.003);
  ctx.strokeStyle = `rgba(120,255,170,${Math.min(1, alpha + 0.15)})`;
  ctx.strokeRect(W * x0, H * y0, W * (x1 - x0), H * (y1 - y0));
  ctx.setLineDash([]);
  ctx.font = `700 ${Math.round(W * 0.024)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = `rgba(120,255,170,${Math.min(1, alpha + 0.25)})`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('CLEAR AREA FOR TEXT', W * x0 + W * 0.015, H * y0 + W * 0.012);
  ctx.restore();
}

function tiktok(k) {
  // top bar
  k.icon('live', 0.07, 0.055, 0.07);
  k.text('Following', 0.38, 0.055, 0.04, { align: 'center', bold: false });
  k.text('For You', 0.62, 0.055, 0.04, { align: 'center' });
  k.bar(0.575, 0.075, 0.09, 0.008);
  k.icon('search', 0.93, 0.055, 0.07);
  // right rail
  k.circle(0.915, 0.5, 0.05, true);
  k.circle(0.915, 0.533, 0.018, true);
  [['heart', 0.585], ['comment', 0.665], ['bookmark', 0.74], ['share', 0.815]].forEach(([n, y]) => {
    k.icon(n, 0.915, y, 0.085, true);
    k.count(0.915, y + 0.036);
  });
  k.circle(0.915, 0.9, 0.045, true);
  k.circle(0.915, 0.9, 0.015);
  // caption block
  k.text('@yourband', 0.04, 0.82, 0.04);
  k.bar(0.04, 0.85, 0.66);
  k.bar(0.04, 0.875, 0.48);
  k.icon('music', 0.06, 0.905, 0.04);
  k.bar(0.1, 0.905, 0.42);
  k.navBar(0.935, [['home', 'Home'], ['users', 'Friends'], ['tiktokPlus', ''], ['inbox', 'Inbox'], ['user', 'Profile']]);
}

function reels(k) {
  k.text('Reels', 0.05, 0.055, 0.055, {});
  k.icon('camera', 0.93, 0.055, 0.075);
  [['heart', 0.6], ['comment', 0.675], ['send', 0.75]].forEach(([n, y]) => {
    k.icon(n, 0.925, y, 0.08);
    k.count(0.925, y + 0.034, 0.05);
  });
  k.icon('more', 0.925, 0.815, 0.08);
  k.square(0.925, 0.88, 0.075);
  k.circle(0.075, 0.82, 0.035, true);
  k.text('yourband', 0.13, 0.82, 0.036);
  k.pill('Follow', 0.36, 0.82, { size: 0.028 });
  k.bar(0.04, 0.855, 0.66);
  k.icon('music', 0.06, 0.888, 0.038);
  k.bar(0.1, 0.888, 0.34);
  k.navBar(0.94, [['home', ''], ['search', ''], ['plusBox', ''], ['play', ''], ['user', '']]);
}

function shorts(k) {
  k.icon('back', 0.06, 0.055, 0.07);
  k.icon('search', 0.78, 0.055, 0.07);
  k.icon('camera', 0.87, 0.055, 0.07);
  k.icon('more', 0.95, 0.055, 0.07);
  [['thumbUp', 0.53], ['thumbDown', 0.615], ['comment', 0.7], ['share', 0.785], ['remix', 0.865]].forEach(([n, y]) => {
    k.circle(0.925, y, 0.05, true);
    k.icon(n, 0.925, y, 0.06);
    k.count(0.925, y + 0.04, 0.055);
  });
  k.square(0.925, 0.925, 0.07);
  k.bar(0.04, 0.8, 0.7, 0.028);
  k.bar(0.04, 0.83, 0.5, 0.028);
  k.circle(0.07, 0.872, 0.03, true);
  k.text('@yourband', 0.115, 0.872, 0.034);
  k.pill('Subscribe', 0.42, 0.872, { filled: true, size: 0.028 });
  k.icon('music', 0.06, 0.908, 0.036);
  k.bar(0.1, 0.908, 0.38);
  k.navBar(0.945, [['home', 'Home'], ['shorts', 'Shorts'], ['plusBox', ''], ['subs', 'Subscriptions'], ['user', 'You']]);
}

/** Spotify's Now Playing view over a Canvas: header, then title, artist, progress and controls over the lower third. */
function spotify(k, ctx, W, H, alpha) {
  // the app darkens the top and bottom so its text stays readable
  const fade = (y0, y1, a0, a1) => {
    const g = ctx.createLinearGradient(0, H * y0, 0, H * y1);
    g.addColorStop(0, `rgba(0,0,0,${a0 * alpha})`);
    g.addColorStop(1, `rgba(0,0,0,${a1 * alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, H * y0, W, H * (y1 - y0));
  };
  fade(0, 0.14, 0.55, 0);
  fade(0.6, 1, 0, 0.75);
  k.icon('back', 0.07, 0.06, 0.07);
  k.text('PLAYING FROM ARTIST', 0.5, 0.05, 0.026, { align: 'center', bold: false });
  k.text('Your band', 0.5, 0.072, 0.032, { align: 'center' });
  k.icon('more', 0.93, 0.06, 0.07);
  k.text('Song title', 0.06, 0.765, 0.055);
  k.text('Artist name', 0.06, 0.795, 0.036, { bold: false });
  k.icon('plus', 0.92, 0.775, 0.075);
  k.circle(0.92, 0.775, 0.045);
  k.bar(0.06, 0.835, 0.88, 0.01);
  k.circle(0.32, 0.835, 0.016, true);
  k.count(0.09, 0.855, 0.06);
  k.count(0.91, 0.855, 0.06);
  k.icon('remix', 0.1, 0.905, 0.065);
  k.icon('back', 0.3, 0.905, 0.075);
  k.circle(0.5, 0.905, 0.085, true);
  k.icon('play', 0.5, 0.905, 0.07);
  k.icon('share', 0.7, 0.905, 0.075);
  k.icon('live', 0.9, 0.905, 0.06);
  k.icon('subs', 0.08, 0.965, 0.05);
  k.icon('send', 0.92, 0.965, 0.05);
}

const CLEAR = {
  spotify: [0.06, 0.12, 0.94, 0.7],
  tiktok: [0.04, 0.11, 0.83, 0.79],
  reels: [0.04, 0.1, 0.85, 0.79],
  shorts: [0.04, 0.1, 0.84, 0.77],
};

/** Draw the phantom UI for `platform` over a W x H frame. Only meaningful for 9:16. */
export function drawPlatformOverlay(ctx, W, H, platform, { opacity = 0.6, clear = true } = {}) {
  const draw = { tiktok, reels, shorts, spotify }[platform];
  if (!draw) return;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = W * 0.008;
  draw(kit(ctx, W, H, opacity), ctx, W, H, opacity);
  ctx.restore();
  if (clear) clearArea(ctx, W, H, CLEAR[platform], opacity);
}

export const overlaySupported = (aspect) => aspect === '9:16' || aspect === 'canvas';
