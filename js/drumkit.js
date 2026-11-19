// The drum kit's shared layout, the realistic "Stage" finish, and drumsticks that swing to each
// hit. drums.js works out what was hit when; this file only draws.
import { glowPass } from './canvasfx.js';

export const KIT_FINISHES = [
  ['neon', 'Neon glow'],
  ['stage', 'Stage (realistic)'],
];
// Shell wraps for the Stage finish.
export const KIT_WRAPS = [
  ['black', 'Black sparkle', { kind: 'sparkle', base: '#17171d', fleck: '#d8dce8', reso: '#0c0c0e', ink: '#f2f2f2' }],
  ['wine', 'Wine red sparkle', { kind: 'sparkle', base: '#5c0d1d', fleck: '#ffb0bc', reso: '#0c0c0e', ink: '#f2f2f2' }],
  ['ocean', 'Ocean blue sparkle', { kind: 'sparkle', base: '#0d2a5c', fleck: '#a8d0ff', reso: '#0c0c0e', ink: '#f2f2f2' }],
  ['maple', 'Natural maple', { kind: 'wood', base: '#b77b3c', grain: '#7a4618', reso: '#efe9dc', ink: '#141414' }],
  ['walnut', 'Dark walnut', { kind: 'wood', base: '#5b3720', grain: '#2a170a', reso: '#0c0c0e', ink: '#f2f2f2' }],
  ['pearl', 'White pearl', { kind: 'pearl', base: '#e9e5dc', sheen: '#c4cde0', reso: '#efe9dc', ink: '#141414' }],
];
export const wrapOf = (id) => (KIT_WRAPS.find(([k]) => k === id) || KIT_WRAPS[0])[2];

const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
export const rgba = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
};
export const mixHex = (a, b, k) => {
  const p = (h) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
    return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [255, 255, 255];
  };
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Where every piece sits in the layer's box. U is the kit's size unit. Rack toms are placed just
 * above the kick's hoop so they never overlap it.
 */
export function kitLayout(bx, by, bw, bh) {
  const U = Math.min(bw * 0.75, bh * 1.6);
  const cx = bx + bw / 2;
  const P = (fx, fy) => [cx + (fx - 0.5) * U * 1.25, by + bh * fy];
  const [kx, ky] = P(0.5, 0.7);
  const kr = U * 0.2;
  const kTop = ky - kr * 1.06;
  const tomY = Math.max(by + bh * 0.2, Math.min(by + bh * 0.3, kTop - U * (0.09 + 0.032 + 0.012)));
  const piece = (x, y, rx, ry, depth) => ({ x, y, rx, ry, depth });
  return {
    U,
    cx,
    floor: by + bh * 0.95,
    kick: { x: kx, y: ky, r: kr, top: kTop },
    toms: [piece(P(0.38, 0)[0], tomY, U * 0.075, U * 0.03, U * 0.085), piece(P(0.62, 0)[0], tomY, U * 0.08, U * 0.032, U * 0.09), piece(...P(0.8, 0.56), U * 0.1, U * 0.04, U * 0.17)],
    snare: piece(...P(0.22, 0.58), U * 0.095, U * 0.036, U * 0.06),
    hihat: { x: P(0.05, 0.42)[0], y: P(0.05, 0.42)[1], r: U * 0.1 },
    crash: { x: P(0.14, 0.2)[0], y: P(0.14, 0.2)[1], r: U * 0.15, tilt: -12 },
    ride: { x: P(0.88, 0.22)[0], y: P(0.88, 0.22)[1], r: U * 0.16, tilt: 10 },
  };
}

/** Where a stick tip lands for a lane (tom hits use the tom piece). */
export function strikePoint(L, lane, tomPiece = 0) {
  if (lane === 'snare') return [L.snare.x + L.snare.rx * 0.15, L.snare.y];
  if (lane === 'hihat') return [L.hihat.x + L.hihat.r * 0.45, L.hihat.y - L.U * 0.01];
  if (lane === 'crash') return [L.crash.x + L.crash.r * 0.55, L.crash.y + L.crash.r * 0.1];
  if (lane === 'ride') return [L.ride.x - L.ride.r * 0.45, L.ride.y - L.ride.r * 0.08];
  if (lane === 'tom') {
    const t = L.toms[Math.max(0, Math.min(2, tomPiece))];
    return [t.x, t.y];
  }
  return null;
}
export const HANDS = { left: ['hihat', 'snare'], right: ['ride', 'crash', 'tom'] };
const smooth = (k) => k * k * (3 - 2 * k);

/**
 * One stick's pose { grip: [x, y], tip: [x, y] }. The grip sits above and inside the piece and the
 * stick turns around it, so a lift raises the tip. Down on the piece at a hit, lifting after it,
 * coming down just before the next one, and resting over `rest` when the hand is idle.
 * `last` and `next` are { lane, time, index }.
 */
export function stickPose(L, last, next, dt, rest) {
  const pose = (h, lift) => {
    const T = strikePoint(L, h.lane, h.index % 3);
    if (!T) return null;
    const s = T[0] < L.cx ? 1 : -1;
    // cymbals sit high, so the hand reaches across to them; drums are hit from above
    const cym = h.lane === 'crash' || h.lane === 'ride';
    const grip = cym ? [T[0] + s * L.U * 0.27, T[1] - L.U * 0.1] : [T[0] + s * L.U * 0.13, T[1] - L.U * 0.27];
    const th = s * (cym ? 0.3 : 0.65) * lift;
    const vx = T[0] - grip[0];
    const vy = T[1] - grip[1];
    return { grip, tip: [grip[0] + vx * Math.cos(th) - vy * Math.sin(th), grip[1] + vx * Math.sin(th) + vy * Math.cos(th)] };
  };
  const mix = (a, b, k) => ({ grip: [a.grip[0] + (b.grip[0] - a.grip[0]) * k, a.grip[1] + (b.grip[1] - a.grip[1]) * k], tip: [a.tip[0] + (b.tip[0] - a.tip[0]) * k, a.tip[1] + (b.tip[1] - a.tip[1]) * k] });
  const recent = last && dt - last.time < 0.6 ? last : null;
  const lifted = (recent && pose(recent, 1)) || pose(rest, 1);
  if (next && next.time - dt < 0.16) {
    const k = smooth(Math.max(0, Math.min(1, 1 - (next.time - dt) / 0.16)));
    const to = pose(next, 0);
    return to ? mix(lifted, to, k) : lifted;
  }
  if (recent) return pose(recent, smooth(Math.max(0, Math.min(1, (dt - recent.time) / 0.28))));
  return lifted;
}
/** Where an idle hand rests: the left over the snare, the right over the floor tom. */
export const REST = { left: { lane: 'snare', index: 0 }, right: { lane: 'tom', index: 2 } };

/** Two sticks, each from its grip (the drummer's hand, behind the kit) to its tip. */
export function drawSticks(ctx, L, poses, { neon = false, color = '#ffffff' } = {}) {
  for (const hand of ['left', 'right']) {
    const p = poses[hand];
    if (!p) continue;
    const { tip } = p;
    let dx = tip[0] - p.grip[0];
    let dy = tip[1] - p.grip[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const len = d * 1.25; // a little of the butt shows past the hand
    const bx = tip[0] - dx * len;
    const by = tip[1] - dy * len;
    const nx = -dy;
    const ny = dx;
    const w0 = L.U * 0.0085;
    const w1 = L.U * 0.0045;
    ctx.save();
    if (neon) {
      ctx.shadowColor = color;
      ctx.shadowBlur = L.U * 0.03;
    }
    const g = ctx.createLinearGradient(bx + nx * w0, by + ny * w0, bx - nx * w0, by - ny * w0);
    if (neon) {
      g.addColorStop(0, rgba(color, 0.9));
      g.addColorStop(1, rgba('#ffffff', 0.9));
    } else {
      g.addColorStop(0, '#f3dcae');
      g.addColorStop(0.5, '#d9b47a');
      g.addColorStop(1, '#9c7642');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx + nx * w0, by + ny * w0);
    ctx.lineTo(tip[0] + nx * w1, tip[1] + ny * w1);
    ctx.lineTo(tip[0] - nx * w1, tip[1] - ny * w1);
    ctx.lineTo(bx - nx * w0, by - ny * w0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(tip[0], tip[1], w1 * 1.5, w1 * 1.2, Math.atan2(dy, dx), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------ Stage finish

const chrome = (ctx, x0, y0, x1, y1) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f6f7fb');
  g.addColorStop(0.25, '#8a8f9c');
  g.addColorStop(0.5, '#e4e7ee');
  g.addColorStop(0.75, '#5d616c');
  g.addColorStop(1, '#c9ccd6');
  return g;
};

/** The wrap on a shell clipped to `path`, across a box of (x, y, w, h). */
function paintWrap(ctx, wrap, x, y, w, h, seed, e, t) {
  const q0 = wrap.kind === 'pearl' ? 0.4 : 1;
  const sg = ctx.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, mixHex(wrap.base, '#000000', 0.55 * q0));
  sg.addColorStop(0.3, mixHex(wrap.base, '#ffffff', 0.18));
  sg.addColorStop(0.45, wrap.base);
  sg.addColorStop(1, mixHex(wrap.base, '#000000', 0.6 * q0));
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, w, h);
  if (wrap.kind === 'wood') {
    ctx.lineWidth = Math.max(0.6, w * 0.006);
    for (let i = 0; i < 26; i++) {
      const gx = x + rnd(seed + i) * w;
      ctx.strokeStyle = rgba(wrap.grain, 0.18 + 0.3 * rnd(seed + i * 3));
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.bezierCurveTo(gx + w * 0.03 * (rnd(i + 5) - 0.5), y + h * 0.33, gx - w * 0.03 * (rnd(i + 9) - 0.5), y + h * 0.66, gx + w * 0.02 * (rnd(i + 2) - 0.5), y + h);
      ctx.stroke();
    }
  } else if (wrap.kind === 'sparkle') {
    const n = Math.round(Math.min(220, (w * h) / 40));
    for (let i = 0; i < n; i++) {
      const fx = rnd(seed + i * 1.7);
      const twinkle = 0.25 + 0.75 * fract(rnd(seed + i * 2.3) + t * (0.4 + rnd(i) * 0.8));
      const lit = Math.max(0, 1 - Math.abs(fx - 0.32) * 2.4); // flecks near the highlight shine most
      ctx.fillStyle = rgba(wrap.fleck, Math.min(1, (0.12 + 0.7 * lit) * twinkle + 0.5 * e * rnd(i + 11)));
      const s = Math.max(0.8, w * 0.007 * (0.5 + rnd(seed + i * 5)));
      ctx.fillRect(x + fx * w, y + rnd(seed + i * 3.1) * h, s, s);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const g = ctx.createRadialGradient(x + rnd(seed + i) * w, y + rnd(seed + i * 2) * h, 0, x + rnd(seed + i) * w, y + rnd(seed + i * 2) * h, w * (0.15 + 0.2 * rnd(i + 4)));
      g.addColorStop(0, rgba(wrap.sheen, 0.35));
      g.addColorStop(1, rgba(wrap.sheen, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  }
  // cylinder shading on top of the pattern (lighter on pearl so it stays white, not chrome)
  const q = wrap.kind === 'pearl' ? 0.45 : 1;
  const shade = ctx.createLinearGradient(x, 0, x + w, 0);
  shade.addColorStop(0, `rgba(0,0,0,${0.55 * q})`);
  shade.addColorStop(0.22, 'rgba(0,0,0,0)');
  shade.addColorStop(0.3, 'rgba(255,255,255,0.16)');
  shade.addColorStop(0.36, 'rgba(255,255,255,0)');
  shade.addColorStop(0.8, `rgba(0,0,0,${0.2 * q})`);
  shade.addColorStop(1, `rgba(0,0,0,${0.6 * q})`);
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
}

/**
 * The Stage finish. `hit(lane, tomPiece?)` gives { e, age } (e: 1 at a hit, fading out).
 * Returns nothing; draws into ctx inside the layer's box.
 */
export function drawStageKit(ctx, L, layer, hit, t, tips, colors) {
  const wrap = wrapOf(layer.kitWrap);
  const U = L.U;
  const lw = (k) => Math.max(1, U * k);
  // rug and a soft spotlight from above
  {
    const rg = ctx.createRadialGradient(L.cx, L.floor, 0, L.cx, L.floor, U * 0.75);
    rg.addColorStop(0, 'rgba(70,40,40,0.55)');
    rg.addColorStop(0.7, 'rgba(40,24,24,0.35)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(L.cx, L.floor, U * 0.78, U * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const k = hit('kick').e;
    const sp = ctx.createRadialGradient(L.cx, L.kick.top - U * 0.3, 0, L.cx, L.kick.top - U * 0.3, U * 0.95);
    sp.addColorStop(0, `rgba(255,240,220,${0.1 + 0.08 * k})`);
    sp.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = sp;
    ctx.beginPath();
    ctx.arc(L.cx, L.kick.top - U * 0.3, U * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  const G = glowPass(ctx, L.cx - U * 0.8, L.kick.top - U * 0.6, U * 1.6, L.floor - L.kick.top + U * 0.7, U * 0.035);

  // stands: tripods for the cymbals and the hi-hat (with its pedal)
  const tripod = (x, yTop, spread) => {
    ctx.strokeStyle = chrome(ctx, x - 2, 0, x + 2, 0);
    ctx.lineWidth = lw(0.007);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, L.floor - U * 0.07);
    ctx.stroke();
    ctx.strokeStyle = '#8b909c';
    ctx.lineWidth = lw(0.006);
    ctx.beginPath();
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(x, L.floor - U * 0.07);
      ctx.lineTo(x + k * spread, L.floor + (k === 0 ? U * 0.01 : 0));
    }
    ctx.stroke();
  };
  tripod(L.crash.x, L.crash.y, U * 0.07);
  tripod(L.ride.x, L.ride.y, U * 0.07);
  tripod(L.hihat.x, L.hihat.y, U * 0.06);
  ctx.fillStyle = '#2a2c33';
  ctx.beginPath();
  ctx.moveTo(L.hihat.x - U * 0.02, L.floor);
  ctx.lineTo(L.hihat.x + U * 0.06, L.floor - U * 0.02);
  ctx.lineTo(L.hihat.x + U * 0.065, L.floor);
  ctx.closePath();
  ctx.fill();

  // kick drum, front view
  {
    const { e } = hit('kick');
    const { x, y } = L.kick;
    const r = L.kick.r * (1 + 0.025 * e);
    ctx.strokeStyle = '#9aa0ad';
    ctx.lineWidth = lw(0.009);
    ctx.beginPath();
    for (const k of [-1, 1]) {
      ctx.moveTo(x + k * r * 0.82, y + r * 0.45);
      ctx.lineTo(x + k * r * 1.2, L.floor);
    }
    ctx.stroke();
    // shell ring past the hoop
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 1.07, 0, Math.PI * 2);
    ctx.clip();
    paintWrap(ctx, wrap, x - r * 1.07, y - r * 1.07, r * 2.14, r * 2.14, 7, e, t);
    ctx.restore();
    // hoop (wood-look inlay inside chrome) and claws
    ctx.lineWidth = lw(0.018);
    ctx.strokeStyle = chrome(ctx, x - r, y - r, x + r, y + r);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      ctx.strokeStyle = chrome(ctx, x + Math.cos(a) * r - 2, 0, x + Math.cos(a) * r + 2, 0);
      ctx.lineWidth = lw(0.012);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
      ctx.lineTo(x + Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08);
      ctx.stroke();
    }
    // resonant head with a port hole and the band name
    const hg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
    hg.addColorStop(0, mixHex(wrap.reso, '#ffffff', 0.14 + 0.1 * e));
    hg.addColorStop(1, mixHex(wrap.reso, '#000000', 0.25));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.91, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.arc(x + r * 0.45, y + r * 0.48, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,200,210,0.6)';
    ctx.lineWidth = lw(0.004);
    ctx.stroke();
    if (layer.kickText) {
      let fs = r * 0.32;
      const font = (px) => `900 ${Math.round(px)}px "Bebas Neue", Impact, sans-serif`;
      ctx.font = font(fs);
      while (fs > 6 && ctx.measureText(layer.kickText).width > r * 1.5) {
        fs *= 0.9;
        ctx.font = font(fs);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = wrap.ink;
      ctx.fillText(layer.kickText.toUpperCase(), x, y - r * 0.05);
    }
    if (e > 0.02) {
      G.add((g) => {
        g.strokeStyle = colors.kick;
        g.globalAlpha = 0.7 * e;
        g.lineWidth = U * 0.03;
        g.beginPath();
        g.arc(x, y, r * 1.05, 0, Math.PI * 2);
        g.stroke();
      });
    }
  }

  // drums seen from above-front
  const drum = (p, lane, e, seed) => {
    const { x, y, rx, depth } = p;
    const ry = p.ry * (1 - 0.12 * e); // the head flexes on a hit
    ctx.save();
    ctx.translate(x, y);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-rx, 0);
    ctx.lineTo(-rx, depth);
    ctx.ellipse(0, depth, rx, p.ry, 0, Math.PI, 0, true);
    ctx.lineTo(rx, 0);
    ctx.closePath();
    ctx.clip();
    paintWrap(ctx, wrap, -rx, 0, rx * 2, depth + p.ry, seed, e * 0.6, t);
    ctx.restore();
    // tube lugs with tension rods between the hoops
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / 5);
      const lx = -Math.cos(a) * rx * 0.98;
      const ly = Math.sin(a) * p.ry;
      const wv = Math.max(1.2, rx * 0.06 * Math.sin(a));
      ctx.fillStyle = chrome(ctx, lx - wv, 0, lx + wv, 0);
      ctx.fillRect(lx - wv / 2, ly + depth * 0.06, wv, depth * 0.88);
    }
    // hoops
    const hoop = (yy, half) => {
      ctx.strokeStyle = chrome(ctx, 0, yy - p.ry, 0, yy + p.ry);
      ctx.lineWidth = Math.max(1.5, p.ry * 0.3);
      ctx.beginPath();
      ctx.ellipse(0, yy, rx, p.ry, 0, 0, half ? Math.PI : Math.PI * 2);
      ctx.stroke();
    };
    hoop(depth, true);
    // coated head
    const hg = ctx.createRadialGradient(-rx * 0.25, -ry * 0.3, 0, 0, 0, rx);
    hg.addColorStop(0, mixHex('#f4efe4', '#ffffff', 0.4 * e));
    hg.addColorStop(0.75, '#e2dbcc');
    hg.addColorStop(1, '#bdb5a4');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // stick marks near the centre
    ctx.fillStyle = 'rgba(90,80,64,0.14)';
    ctx.beginPath();
    ctx.ellipse(rx * 0.08, 0, rx * 0.22, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e > 0.02) {
      ctx.strokeStyle = `rgba(120,110,90,${0.4 * e})`;
      ctx.lineWidth = lw(0.003);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * (0.4 + 0.5 * (1 - e)), ry * (0.4 + 0.5 * (1 - e)), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    hoop(0, false);
    ctx.restore();
    if (e > 0.02) {
      G.add((g) => {
        g.fillStyle = colors[lane];
        g.globalAlpha = 0.55 * e;
        g.beginPath();
        g.ellipse(x, y, rx * 1.15, p.ry * 1.6, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
  };
  const tomE = (i) => hit('tom', i).e;
  // tom mount from the kick
  ctx.strokeStyle = chrome(ctx, L.kick.x - 3, 0, L.kick.x + 3, 0);
  ctx.lineWidth = lw(0.011);
  ctx.beginPath();
  ctx.moveTo(L.kick.x, L.kick.top + U * 0.01);
  ctx.lineTo(L.kick.x, L.kick.top - U * 0.03);
  ctx.lineTo(L.toms[0].x + U * 0.02, L.toms[0].y + L.toms[0].depth);
  ctx.moveTo(L.kick.x, L.kick.top - U * 0.03);
  ctx.lineTo(L.toms[1].x - U * 0.02, L.toms[1].y + L.toms[1].depth);
  ctx.stroke();
  drum(L.toms[0], 'tom', tomE(0), 11);
  drum(L.toms[1], 'tom', tomE(1), 23);
  // floor tom legs and snare stand
  const legs = (x, yTop, spread) => {
    ctx.strokeStyle = '#9aa0ad';
    ctx.lineWidth = lw(0.007);
    ctx.beginPath();
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(x + k * spread * 0.3, yTop);
      ctx.lineTo(x + k * spread, L.floor);
    }
    ctx.stroke();
  };
  const ft = L.toms[2];
  legs(ft.x, ft.y + ft.depth * 0.6, U * 0.11);
  drum(ft, 'tom', tomE(2), 37);
  const sn = L.snare;
  legs(sn.x, sn.y + sn.depth + U * 0.05, U * 0.08);
  ctx.strokeStyle = chrome(ctx, sn.x - 3, 0, sn.x + 3, 0);
  ctx.lineWidth = lw(0.008);
  ctx.beginPath();
  ctx.moveTo(sn.x, sn.y + sn.depth + U * 0.05);
  ctx.lineTo(sn.x, sn.y + sn.depth);
  ctx.stroke();
  drum(sn, 'snare', hit('snare').e, 53);

  // cymbals: bronze with lathe rings, a bell and a moving glint
  const cymbal = (c, lane, ryK = 0.17) => {
    const { e, age } = hit(lane);
    const wob = e * Math.sin(age * 24);
    const rot = ((c.tilt + wob * 9) * Math.PI) / 180;
    const ry = c.r * (ryK + 0.06 * wob);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-c.r, -ry, c.r, ry);
    g.addColorStop(0, '#6e4a14');
    g.addColorStop(0.35, '#d9a64a');
    g.addColorStop(0.5, mixHex('#f2cf7a', '#ffffff', 0.3 * e));
    g.addColorStop(0.65, '#b9822e');
    g.addColorStop(1, '#5c3c10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, c.r, Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(0.5, c.r * 0.006);
    for (let i = 1; i < 14; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(80,50,10,0.22)' : 'rgba(255,230,170,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, 0, (c.r * i) / 14, (Math.abs(ry) * i) / 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60,36,8,0.8)';
    ctx.lineWidth = Math.max(1, c.r * 0.012);
    ctx.beginPath();
    ctx.ellipse(0, 0, c.r, Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    const bell = ctx.createRadialGradient(-c.r * 0.03, -ry * 0.4, 0, 0, -ry * 0.2, c.r * 0.2);
    bell.addColorStop(0, '#fbe3a2');
    bell.addColorStop(1, '#9a6a22');
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.ellipse(0, -Math.abs(ry) * 0.15, c.r * 0.18, Math.abs(ry) * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    // glint that slides across on a hit
    const gx = (-0.6 + 1.2 * Math.min(1, age / 0.5)) * c.r;
    ctx.fillStyle = `rgba(255,255,240,${0.15 + 0.55 * e})`;
    ctx.beginPath();
    ctx.ellipse(gx, -Math.abs(ry) * 0.2, c.r * 0.22, Math.abs(ry) * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (e > 0.02) {
      G.add((gg) => {
        gg.fillStyle = colors[lane];
        gg.globalAlpha = 0.45 * e;
        gg.beginPath();
        gg.ellipse(c.x, c.y, c.r * 1.05, c.r * 0.3, rot, 0, Math.PI * 2);
        gg.fill();
      });
    }
  };
  // hi-hat: two plates that close on a hit
  {
    const { e } = hit('hihat');
    const gap = U * (0.03 - 0.024 * e);
    cymbal({ x: L.hihat.x, y: L.hihat.y + gap / 2, r: L.hihat.r, tilt: 0 }, 'hihat', 0.14);
    cymbal({ x: L.hihat.x, y: L.hihat.y - gap / 2, r: L.hihat.r, tilt: 0 }, 'hihat', 0.14);
  }
  cymbal(L.crash, 'crash');
  cymbal(L.ride, 'ride', 0.16);
  G.flush(0.8);
  if (layer.sticks !== false) drawSticks(ctx, L, tips);
}
