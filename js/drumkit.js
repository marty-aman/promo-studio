// The drum kit's shared layout and its drawn finishes: Stage (realistic, with a choice of shell
// wrap) and four metal ones built on the same kit: Inferno, Thunder, Frostbite and Steel & spikes.
// drums.js works out what was hit when; this file only draws.
import { glowPass } from './canvasfx.js';

export const KIT_FINISHES = [
  ['neon', 'Neon glow'],
  ['stage', 'Stage (realistic)'],
  ['inferno', 'Inferno: fire and embers'],
  ['thunder', 'Thunder: lightning strikes'],
  ['frostbite', 'Frostbite: black metal frost'],
  ['steel', 'Steel & spikes: industrial'],
  ['blackout', 'Blackout: all black and grey'],
];
/** Finishes that default to a double bass drum setup. */
export const METAL_FINISHES = new Set(['inferno', 'thunder', 'frostbite', 'steel', 'blackout']);
export const kitDoubleKick = (layer) => layer.doubleKick ?? METAL_FINISHES.has(layer.kitFinish);

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

/**
 * How each drawn finish looks: the shell wrap, hardware, heads, cymbals, the light, and an
 * effect drawn behind (back) and in front of (front) the kit.
 */
const LOOKS = {
  stage: { hardware: 'chrome', heads: 'coated', cymbals: 'bronze', light: '#fff0dc', rug: '#46282a' },
  inferno: { wrap: { kind: 'char', base: '#140806', crack: '#ff5a14', reso: '#0a0605', ink: '#ff7a2a' }, hardware: 'black', heads: 'dark', cymbals: 'dark', light: '#ff6a2a', rug: '#3a1206', fx: 'fire' },
  thunder: { wrap: { kind: 'sparkle', base: '#0a1024', fleck: '#8cc4ff', reso: '#06080f', ink: '#bfe0ff' }, hardware: 'chrome', heads: 'coated', cymbals: 'bronze', light: '#9cc0ff', rug: '#141a2c', fx: 'lightning' },
  frostbite: { wrap: { kind: 'frost', base: '#0c0e13', crystal: '#e6f2ff', reso: '#0a0b0e', ink: '#eef6ff' }, hardware: 'chrome', heads: 'white', cymbals: 'silver', light: '#cfe4ff', rug: '#1a1f28', fx: 'frost' },
  steel: { wrap: { kind: 'brushed', base: '#6d727c', reso: '#111214', ink: '#e8e8e8' }, hardware: 'black', heads: 'dark', cymbals: 'dark', light: '#ffd49a', rug: '#26221c', fx: 'sparks', spikes: true },
  // all black and grey: satin black shells, black hardware, grey heads, smoked cymbals, grey light
  blackout: { wrap: { kind: 'matte', base: '#1b1b1d', reso: '#0d0d0e', ink: '#a8a8ad' }, hardware: 'black', heads: 'grey', cymbals: 'smoke', light: '#bdbdc2', rug: '#1c1c1e', fx: 'haze', glow: '#b8b8be' },
};
export const lookOf = (finish) => LOOKS[finish] || LOOKS.stage;

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
 * Where every piece sits in the layer's box. U is the kit's size unit. Rack toms sit just above the
 * kick hoop(s). With `doubleKick` there are two smaller kicks side by side and the snare and floor
 * tom move out a little.
 */
export function kitLayout(bx, by, bw, bh, { doubleKick = false, has = () => true } = {}) {
  const U = Math.min(bw * 0.75, bh * 1.6);
  const cx = bx + bw / 2;
  const P = (fx, fy) => [cx + (fx - 0.5) * U * 1.25, by + bh * fy];
  const ky = by + bh * 0.7;
  const kr = doubleKick ? U * 0.165 : U * 0.2;
  const kicks = doubleKick ? [-1, 1].map((s) => ({ x: cx + s * U * 0.175, y: ky, r: kr, top: ky - kr * 1.06 })) : [{ x: cx, y: ky, r: kr, top: ky - kr * 1.06 }];
  const kTop = kicks[0].top;
  const tomY = Math.max(by + bh * 0.2, Math.min(by + bh * 0.3, kTop - U * (0.09 + 0.032 + 0.012)));
  const piece = (x, y, rx, ry, depth) => ({ x, y, rx, ry, depth });
  // with only one rack tom it sits in the middle, over the kick(s)
  const oneRack = has('tom1') !== has('tom2');
  const rackX = (fx) => (oneRack ? cx : P(fx, 0)[0]);
  return {
    U,
    cx,
    bw,
    doubleKick,
    has,
    floor: by + bh * 0.95,
    kicks,
    kick: { x: cx, y: ky, r: kr, top: kTop },
    toms: [piece(rackX(0.38), tomY, U * 0.075, U * 0.03, U * 0.085), piece(rackX(0.62), tomY, U * 0.08, U * 0.032, U * 0.09), piece(...P(doubleKick ? 0.85 : 0.8, 0.56), U * 0.1, U * 0.04, U * 0.17)],
    snare: piece(...P(doubleKick ? 0.18 : 0.22, 0.58), U * 0.095, U * 0.036, U * 0.06),
    hihat: { x: P(0.05, 0.42)[0], y: P(0.05, 0.42)[1], r: U * 0.1 },
    crash: { x: P(0.14, 0.2)[0], y: P(0.14, 0.2)[1], r: U * 0.15, tilt: -12 },
    crash2: { x: P(0.7, 0.11)[0], y: P(0.7, 0.11)[1], r: U * 0.135, tilt: 8 },
    china: { x: P(0.3, 0.1)[0], y: P(0.3, 0.1)[1], r: U * 0.12, tilt: -6 },
    ride: { x: P(0.9, 0.27)[0], y: P(0.9, 0.27)[1], r: U * 0.16, tilt: 10 },
  };
}

/** The tom lanes in kit order: high, mid, floor. */
export const KIT_TOMS = ['tom1', 'tom2', 'floor'];

/** Where a hit lands on a piece (kick hits use their kick number on a double bass kit). */
export function strikePoint(L, lane, piece = 0) {
  if (lane === 'snare') return [L.snare.x + L.snare.rx * 0.15, L.snare.y];
  if (lane === 'hihat') return [L.hihat.x + L.hihat.r * 0.45, L.hihat.y - L.U * 0.01];
  if (lane === 'crash') return [L.crash.x + L.crash.r * 0.55, L.crash.y + L.crash.r * 0.1];
  if (lane === 'crash2') return [L.crash2.x - L.crash2.r * 0.5, L.crash2.y + L.crash2.r * 0.08];
  if (lane === 'china') return [L.china.x + L.china.r * 0.5, L.china.y + L.china.r * 0.06];
  if (lane === 'ride') return [L.ride.x - L.ride.r * 0.45, L.ride.y - L.ride.r * 0.08];
  const ti = KIT_TOMS.indexOf(lane);
  if (ti >= 0 || lane === 'tom') {
    const t = L.toms[ti >= 0 ? ti : Math.max(0, Math.min(2, piece))];
    return [t.x, t.y];
  }
  if (lane === 'kick') {
    const k = L.kicks[Math.max(0, Math.min(L.kicks.length - 1, piece))];
    return [k.x, k.y];
  }
  return null;
}

// ------------------------------------------------------------ materials

const metal = (ctx, kind, x0, y0, x1, y1) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = kind === 'black' ? ['#8d919c', '#1c1d21', '#5a5e68', '#0d0e10', '#3f424a'] : ['#f6f7fb', '#8a8f9c', '#e4e7ee', '#5d616c', '#c9ccd6'];
  stops.forEach((c, i) => g.addColorStop(i / 4, c));
  return g;
};

/** The wrap on a shell, across a box of (x, y, w, h); the caller clips it to the shell. */
function paintWrap(ctx, wrap, x, y, w, h, seed, e, t) {
  const q0 = wrap.kind === 'pearl' ? 0.4 : 1;
  const sg = ctx.createLinearGradient(x, 0, x + w, 0);
  sg.addColorStop(0, mixHex(wrap.base, '#000000', 0.55 * q0));
  sg.addColorStop(0.3, mixHex(wrap.base, '#ffffff', wrap.kind === 'brushed' ? 0.45 : 0.18));
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
  } else if (wrap.kind === 'pearl') {
    for (let i = 0; i < 7; i++) {
      const px = x + rnd(seed + i) * w;
      const py = y + rnd(seed + i * 2) * h;
      const g = ctx.createRadialGradient(px, py, 0, px, py, w * (0.15 + 0.2 * rnd(i + 4)));
      g.addColorStop(0, rgba(wrap.sheen, 0.35));
      g.addColorStop(1, rgba(wrap.sheen, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  } else if (wrap.kind === 'char') {
    // charred shell with glowing cracks that flare on a hit
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let cx = x + rnd(seed + i * 4.1) * w;
      let cy = y + rnd(seed + i * 2.7) * h;
      const glow = 0.35 + 0.25 * Math.sin(t * 3 + i) + 0.6 * e;
      ctx.strokeStyle = rgba(mixHex(wrap.crack, '#ffd27a', 0.4 * e), Math.min(1, glow));
      ctx.lineWidth = Math.max(0.8, w * 0.008);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let k = 0; k < 5; k++) {
        cx += (rnd(seed + i * 9 + k) - 0.5) * w * 0.16;
        cy += rnd(seed + i * 7 + k * 3) * h * 0.2;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  } else if (wrap.kind === 'frost') {
    // frost crystals: little six-armed stars and scratches of rime
    ctx.lineWidth = Math.max(0.6, w * 0.004);
    const n = Math.round(Math.min(60, (w * h) / 160));
    for (let i = 0; i < n; i++) {
      const fx = x + rnd(seed + i * 1.3) * w;
      const fy = y + rnd(seed + i * 2.9) * h;
      const r = w * (0.012 + 0.03 * rnd(seed + i * 5.5));
      ctx.strokeStyle = rgba(wrap.crystal, 0.25 + 0.45 * rnd(i + 3) + 0.3 * e);
      ctx.beginPath();
      for (let a = 0; a < 3; a++) {
        const an = (a * Math.PI) / 3 + rnd(i) * 0.5;
        ctx.moveTo(fx - Math.cos(an) * r, fy - Math.sin(an) * r);
        ctx.lineTo(fx + Math.cos(an) * r, fy + Math.sin(an) * r);
      }
      ctx.stroke();
    }
    const rime = ctx.createLinearGradient(0, y + h * 0.7, 0, y + h);
    rime.addColorStop(0, rgba(wrap.crystal, 0));
    rime.addColorStop(1, rgba(wrap.crystal, 0.35));
    ctx.fillStyle = rime;
    ctx.fillRect(x, y, w, h);
  } else if (wrap.kind === 'matte') {
    // satin black: a faint fine grain, nothing shiny
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.025 + 0.03 * rnd(seed + i)})`;
      ctx.fillRect(x + rnd(seed + i * 1.7) * w, y, Math.max(0.6, w * 0.004), h);
    }
  } else if (wrap.kind === 'brushed') {
    // brushed steel: fine horizontal hairlines and rivet rows
    ctx.lineWidth = Math.max(0.5, h * 0.004);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = rnd(seed + i) > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      const yy = y + rnd(seed + i * 3.3) * h;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
    for (const fy of [0.16, 0.84]) {
      for (let i = 0; i < 9; i++) {
        const rx = x + w * (0.08 + (0.84 * i) / 8);
        const rr = Math.max(1, w * 0.012);
        const rg = ctx.createRadialGradient(rx - rr * 0.3, y + h * fy - rr * 0.3, 0, rx, y + h * fy, rr);
        rg.addColorStop(0, '#f2f3f6');
        rg.addColorStop(1, '#3a3d44');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(rx, y + h * fy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
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

const HEADS = {
  coated: ['#f4efe4', '#e2dbcc', '#bdb5a4', 'rgba(90,80,64,0.14)'],
  dark: ['#4a4744', '#242322', '#121212', 'rgba(255,255,255,0.06)'],
  white: ['#ffffff', '#eef3f8', '#c3ccd8', 'rgba(120,140,170,0.12)'],
  grey: ['#8e8e93', '#5c5c61', '#323235', 'rgba(0,0,0,0.12)'],
};
const CYMBALS = {
  bronze: ['#6e4a14', '#d9a64a', '#f2cf7a', '#b9822e', '#5c3c10', '#fbe3a2', '#9a6a22'],
  dark: ['#2e2210', '#7a5a2a', '#a8854a', '#5e4420', '#22180a', '#c9a15a', '#4a3416'],
  silver: ['#5c6470', '#c8ced8', '#f4f7fb', '#a4acb8', '#4a515c', '#ffffff', '#8a929e'],
  smoke: ['#151517', '#4a4a4f', '#7c7c82', '#36363a', '#111113', '#a2a2a8', '#2c2c30'],
};

// ------------------------------------------------------------ effects

/** Fire behind the kit: flame tongues along the floor that leap on kick hits. */
function fireBack(ctx, L, t, kickE) {
  const { U, cx, floor } = L;
  const span = Math.min(U * 1.7, L.bw * 0.96); // stay inside the layer's box
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // the floor glows under the fire: a soft oval, so it fades out on every side
  const fl = ctx.createRadialGradient(0, 0, 0, 0, 0, span / 2);
  fl.addColorStop(0, `rgba(255,140,40,${0.4 + 0.25 * kickE})`);
  fl.addColorStop(0.7, `rgba(255,100,20,${0.18 + 0.12 * kickE})`);
  fl.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.save();
  ctx.translate(cx, floor);
  ctx.scale(1, 0.12);
  ctx.fillStyle = fl;
  ctx.beginPath();
  ctx.arc(0, 0, span / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const n = 34;
  for (let i = 0; i < n; i++) {
    const x = cx + (i / (n - 1) - 0.5) * (span - U * 0.1);
    const edge = 1 - Math.abs(i / (n - 1) - 0.5) * 1.4;
    const flick = 0.55 + 0.45 * Math.sin(t * (5 + rnd(i) * 4) + i * 1.7) * Math.sin(t * 2.3 + i);
    const h = U * (0.16 + 0.22 * rnd(i * 3.1)) * Math.max(0.2, edge) * (0.75 + 0.35 * flick) * (1 + 1.3 * kickE);
    const w = U * (0.05 + 0.03 * rnd(i));
    const sway = Math.sin(t * 3 + i) * w * 0.6;
    const g = ctx.createLinearGradient(0, floor, 0, floor - h);
    g.addColorStop(0, 'rgba(255,230,150,0.55)');
    g.addColorStop(0.3, 'rgba(255,120,20,0.45)');
    g.addColorStop(0.75, 'rgba(200,30,0,0.22)');
    g.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, floor);
    ctx.quadraticCurveTo(x - w * 0.8 + sway * 0.5, floor - h * 0.55, x + sway, floor - h);
    ctx.quadraticCurveTo(x + w * 0.8 + sway * 0.5, floor - h * 0.55, x + w, floor);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
/** Embers drifting up in front of the kit. */
function embersFront(ctx, L, t, kickE) {
  const { U, cx, floor } = L;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const life = fract(rnd(i * 3.7) + t * (0.18 + 0.2 * rnd(i)));
    const x = cx + (rnd(i * 1.9) - 0.5) * Math.min(U * 1.6, L.bw * 0.96) + Math.sin(t * 2 + i) * U * 0.02;
    const y = floor - life * U * 0.95;
    const a = (1 - life) * (0.5 + 0.5 * kickE);
    ctx.fillStyle = `rgba(255,${Math.round(140 + 90 * (1 - life))},40,${a})`;
    const s = Math.max(1, U * 0.006 * (0.6 + rnd(i)));
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

/** A jagged bolt from the top of the kit down to a point, the same shape for the same hit. */
function bolt(ctx, x0, y0, x1, y1, seed, width, alpha) {
  const pts = [[x0, y0]];
  const n = 9;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    pts.push([x0 + (x1 - x0) * k + (rnd(seed + i * 7.3) - 0.5) * width * 14, y0 + (y1 - y0) * k]);
  }
  pts.push([x1, y1]);
  const stroke = (w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  stroke(width * 5, `rgba(90,150,255,${0.25 * alpha})`);
  stroke(width * 2.2, `rgba(150,200,255,${0.6 * alpha})`);
  stroke(width, `rgba(255,255,255,${alpha})`);
  // a branch off the middle
  const [bx, by] = pts[4];
  ctx.strokeStyle = `rgba(190,220,255,${0.6 * alpha})`;
  ctx.lineWidth = width * 0.8;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + (rnd(seed + 3) - 0.5) * width * 30, by + width * 18);
  ctx.stroke();
  ctx.restore();
}

/** Storm clouds over the kit that light up on cymbal and snare hits. */
function stormBack(ctx, L, t, flash) {
  const { U, cx } = L;
  const top = L.kick.top - U * 0.62;
  for (let i = 0; i < 9; i++) {
    const x = cx + (rnd(i * 2.1) - 0.5) * Math.min(U * 1.7, L.bw * 0.8) + Math.sin(t * 0.2 + i) * U * 0.04;
    const y = top + rnd(i * 4.3) * U * 0.12;
    const r = U * (0.18 + 0.12 * rnd(i));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${60 + 120 * flash},${70 + 130 * flash},${100 + 140 * flash},${0.3 + 0.3 * flash})`);
    g.addColorStop(1, 'rgba(20,24,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Fog rolling along the floor. */
function fogBack(ctx, L, t, k = 1) {
  const { U, cx, floor } = L;
  for (let i = 0; i < 8; i++) {
    const x = cx + (fract(rnd(i) + t * 0.03 * (rnd(i * 2) - 0.5)) - 0.5) * Math.min(U * 1.8, L.bw * 0.9);
    const y = floor - U * (0.02 + 0.08 * rnd(i * 3));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, U * 0.35);
    g.addColorStop(0, `rgba(210,225,245,${0.14 * k})`);
    g.addColorStop(1, 'rgba(210,225,245,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.28); // flatten the gradient with the ellipse so it fades out on every side
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, U * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
/** Snow falling in front of the kit. */
function snowFront(ctx, L, t, box) {
  const { U, cx } = L;
  ctx.save();
  for (let i = 0; i < 70; i++) {
    const life = fract(rnd(i * 5.1) + t * (0.06 + 0.06 * rnd(i)));
    const x = cx + (rnd(i * 1.3) - 0.5) * Math.min(U * 1.8, L.bw) + Math.sin(t * 0.8 + i) * U * 0.02;
    const y = box.top + life * (L.floor - box.top);
    const s = Math.max(1, U * 0.004 * (0.6 + rnd(i * 7)));
    ctx.fillStyle = `rgba(240,248,255,${0.35 + 0.4 * rnd(i * 9)})`;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Welding sparks thrown from a hit point. */
function sparks(ctx, x, y, age, seed, U) {
  if (age > 0.5) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const an = -Math.PI * (0.1 + 0.8 * rnd(seed + i));
    const v = U * (0.5 + 0.9 * rnd(seed + i * 3));
    const px = x + Math.cos(an) * v * age;
    const py = y + Math.sin(an) * v * age + U * 1.6 * age * age;
    const tail = 0.03;
    const qx = x + Math.cos(an) * v * (age - tail);
    const qy = y + Math.sin(an) * v * (age - tail) + U * 1.6 * (age - tail) ** 2;
    const a = 1 - age / 0.5;
    ctx.strokeStyle = `rgba(255,${Math.round(180 + 60 * a)},${Math.round(80 * a)},${a})`;
    ctx.lineWidth = Math.max(1, U * 0.004);
    ctx.beginPath();
    ctx.moveTo(age > tail ? qx : x, age > tail ? qy : y);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------ the drawn kit

/**
 * Draws the Stage finish or one of the metal finishes. `hit(lane, piece?)` gives { e, age, hit }
 * (e: 1 at a hit, fading out; hit.index is the hit's number, used to vary effects).
 */
export function drawStageKit(ctx, L, layer, hit, t, colors) {
  const look = lookOf(layer.kitFinish);
  const wrap = look.wrap || wrapOf(layer.kitWrap);
  const hw = look.hardware;
  const heads = HEADS[look.heads];
  const cyms = CYMBALS[look.cymbals];
  const U = L.U;
  const lw = (k) => Math.max(1, U * k);
  const boxTop = L.kick.top - U * 0.62;
  const kickE = Math.max(0, ...L.kicks.map((_, i) => hit('kick', L.kicks.length > 1 ? i : undefined).e));

  // rug, light and the effect behind the kit
  {
    const rg = ctx.createRadialGradient(L.cx, L.floor, 0, L.cx, L.floor, U * 0.75);
    rg.addColorStop(0, rgba(look.rug, 0.6));
    rg.addColorStop(0.7, rgba(look.rug, 0.35));
    rg.addColorStop(1, rgba(look.rug, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(L.cx, L.floor, U * 0.8, U * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    const sp = ctx.createRadialGradient(L.cx, L.kick.top - U * 0.3, 0, L.cx, L.kick.top - U * 0.3, U * 0.95);
    sp.addColorStop(0, rgba(look.light, 0.1 + 0.08 * kickE));
    sp.addColorStop(1, rgba(look.light, 0));
    ctx.fillStyle = sp;
    ctx.beginPath();
    ctx.arc(L.cx, L.kick.top - U * 0.3, U * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  const flash = Math.max(hit('crash').e, hit('crash2').e, hit('china').e, hit('ride').e * 0.5, hit('snare').e * 0.4);
  if (look.fx === 'fire') fireBack(ctx, L, t, kickE);
  if (look.fx === 'lightning') stormBack(ctx, L, t, flash);
  if (look.fx === 'frost') fogBack(ctx, L, t, 1.3);
  if (look.fx === 'sparks') fogBack(ctx, L, t, 0.6);
  if (look.fx === 'haze') fogBack(ctx, L, t, 0.9 + 0.6 * kickE);
  const G = glowPass(ctx, L.cx - U * 0.9, boxTop, U * 1.8, L.floor - boxTop + U * 0.1, U * 0.035);
  const glowCol = (lane) => look.glow || (look.fx === 'fire' ? '#ff6a1a' : look.fx === 'frost' ? '#cfe6ff' : look.fx === 'lightning' ? '#7ab4ff' : colors[lane]);

  // stands: tripods for the cymbals and the hi-hat (with its pedal)
  const tripod = (x, yTop, spread) => {
    ctx.strokeStyle = metal(ctx, hw, x - 2, 0, x + 2, 0);
    ctx.lineWidth = lw(0.007);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, L.floor - U * 0.07);
    ctx.stroke();
    ctx.strokeStyle = hw === 'black' ? '#4a4d55' : '#8b909c';
    ctx.lineWidth = lw(0.006);
    ctx.beginPath();
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(x, L.floor - U * 0.07);
      ctx.lineTo(x + k * spread, L.floor + (k === 0 ? U * 0.01 : 0));
    }
    ctx.stroke();
  };
  tripod(L.crash.x, L.crash.y, U * 0.07);
  const has = L.has;
  if (has('crash')) tripod(L.crash.x, L.crash.y, U * 0.07);
  if (has('crash2')) tripod(L.crash2.x, L.crash2.y, U * 0.06);
  if (has('china')) tripod(L.china.x, L.china.y, U * 0.06);
  if (has('ride')) tripod(L.ride.x, L.ride.y, U * 0.07);
  if (has('hihat')) {
    tripod(L.hihat.x, L.hihat.y, U * 0.06);
    ctx.fillStyle = '#2a2c33';
    ctx.beginPath();
    ctx.moveTo(L.hihat.x - U * 0.02, L.floor);
    ctx.lineTo(L.hihat.x + U * 0.06, L.floor - U * 0.02);
    ctx.lineTo(L.hihat.x + U * 0.065, L.floor);
    ctx.closePath();
    ctx.fill();
  }
  if (L.doubleKick && (has('tom1') || has('tom2'))) {
    // a centre stand carries the rack toms between the two kicks
    tripod(L.cx, L.toms[has('tom1') ? 0 : 1].y + L.toms[0].depth, U * 0.05);
  }

  // kick drums, front view
  const kickDrum = (k, i) => {
    const { e } = hit('kick', L.kicks.length > 1 ? i : undefined);
    const { x, y } = k;
    const r = k.r * (1 + 0.025 * e);
    ctx.strokeStyle = hw === 'black' ? '#5a5e68' : '#9aa0ad';
    ctx.lineWidth = lw(0.009);
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(x + s * r * 0.82, y + r * 0.45);
      ctx.lineTo(x + s * r * 1.2, L.floor);
    }
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 1.07, 0, Math.PI * 2);
    ctx.clip();
    paintWrap(ctx, wrap, x - r * 1.07, y - r * 1.07, r * 2.14, r * 2.14, 7 + i * 13, e, t);
    ctx.restore();
    ctx.lineWidth = lw(0.018);
    ctx.strokeStyle = metal(ctx, hw, x - r, y - r, x + r, y + r);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2 + Math.PI / 10;
      ctx.strokeStyle = metal(ctx, hw, x + Math.cos(a) * r - 2, 0, x + Math.cos(a) * r + 2, 0);
      ctx.lineWidth = lw(0.012);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
      ctx.lineTo(x + Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08);
      ctx.stroke();
    }
    if (look.spikes) {
      // chrome spikes around the hoop
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const w = r * 0.06;
        ctx.fillStyle = metal(ctx, 'chrome', x + c * r - w, y + s * r - w, x + c * r + w, y + s * r + w);
        ctx.beginPath();
        ctx.moveTo(x + c * r * 1.06 - s * w, y + s * r * 1.06 + c * w);
        ctx.lineTo(x + c * r * 1.3, y + s * r * 1.3);
        ctx.lineTo(x + c * r * 1.06 + s * w, y + s * r * 1.06 - c * w);
        ctx.closePath();
        ctx.fill();
      }
    }
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
    // band name: across one kick, or split over two
    const words = String(layer.kickText || '').toUpperCase().trim();
    const text = L.kicks.length > 1 ? (() => {
      const parts = words.split(/\s+/);
      if (parts.length > 1) {
        const half = Math.ceil(parts.length / 2);
        return i === 0 ? parts.slice(0, half).join(' ') : parts.slice(half).join(' ');
      }
      return i === 0 ? words : '';
    })() : words;
    if (text) {
      let fs = r * 0.36;
      const font = (px) => `900 ${Math.round(px)}px "Bebas Neue", Impact, sans-serif`;
      ctx.font = font(fs);
      while (fs > 6 && ctx.measureText(text).width > r * 1.5) {
        fs *= 0.9;
        ctx.font = font(fs);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = wrap.ink;
      ctx.fillText(text, x, y - r * 0.05);
      if (look.fx === 'fire' || look.fx === 'lightning') {
        const f = ctx.font;
        G.add((g) => {
          g.font = f;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = wrap.ink;
          g.globalAlpha = 0.5 + 0.5 * e;
          g.fillText(text, x, y - r * 0.05);
        });
      }
    }
    if (e > 0.02) {
      G.add((g) => {
        g.strokeStyle = glowCol('kick');
        g.globalAlpha = 0.7 * e;
        g.lineWidth = U * 0.03;
        g.beginPath();
        g.arc(x, y, r * 1.05, 0, Math.PI * 2);
        g.stroke();
      });
    }
  };
  L.kicks.forEach(kickDrum);

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
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / 5);
      const lx = -Math.cos(a) * rx * 0.98;
      const ly = Math.sin(a) * p.ry;
      const wv = Math.max(1.2, rx * 0.06 * Math.sin(a));
      ctx.fillStyle = metal(ctx, hw, lx - wv, 0, lx + wv, 0);
      ctx.fillRect(lx - wv / 2, ly + depth * 0.06, wv, depth * 0.88);
    }
    const hoop = (yy, half) => {
      ctx.strokeStyle = metal(ctx, hw, 0, yy - p.ry, 0, yy + p.ry);
      ctx.lineWidth = Math.max(1.5, p.ry * 0.3);
      ctx.beginPath();
      ctx.ellipse(0, yy, rx, p.ry, 0, 0, half ? Math.PI : Math.PI * 2);
      ctx.stroke();
    };
    hoop(depth, true);
    const hg = ctx.createRadialGradient(-rx * 0.25, -ry * 0.3, 0, 0, 0, rx);
    hg.addColorStop(0, mixHex(heads[0], '#ffffff', 0.4 * e));
    hg.addColorStop(0.75, heads[1]);
    hg.addColorStop(1, heads[2]);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = heads[3];
    ctx.beginPath();
    ctx.ellipse(rx * 0.08, 0, rx * 0.22, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e > 0.02) {
      ctx.strokeStyle = look.heads === 'dark' ? `rgba(255,255,255,${0.25 * e})` : `rgba(120,110,90,${0.4 * e})`;
      ctx.lineWidth = lw(0.003);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * (0.4 + 0.5 * (1 - e)), ry * (0.4 + 0.5 * (1 - e)), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    hoop(0, false);
    ctx.restore();
    if (e > 0.02) {
      G.add((g) => {
        g.fillStyle = glowCol(lane);
        g.globalAlpha = 0.55 * e;
        g.beginPath();
        g.ellipse(x, y, rx * 1.15, p.ry * 1.6, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
  };
  const tomE = (i) => hit(KIT_TOMS[i]).e;
  // tom mounts: arms from the kick (or the centre stand) to each rack tom that's in the kit
  const racks = [0, 1].filter((i) => has(KIT_TOMS[i]));
  if (racks.length) {
    const hubX = L.doubleKick ? L.cx : L.kick.x;
    const hubY = L.doubleKick ? L.toms[racks[0]].y + L.toms[racks[0]].depth + U * 0.02 : L.kick.top - U * 0.03;
    ctx.strokeStyle = metal(ctx, hw, hubX - 3, 0, hubX + 3, 0);
    ctx.lineWidth = lw(0.011);
    ctx.beginPath();
    if (!L.doubleKick) {
      ctx.moveTo(hubX, L.kick.top + U * 0.01);
      ctx.lineTo(hubX, hubY);
    }
    for (const i of racks) {
      const tm = L.toms[i];
      const side = tm.x < hubX - 1 ? 1 : tm.x > hubX + 1 ? -1 : 0;
      ctx.moveTo(hubX, hubY);
      ctx.lineTo(tm.x + side * U * 0.02, tm.y + tm.depth);
    }
    ctx.stroke();
  }
  if (has('tom1')) drum(L.toms[0], 'tom1', tomE(0), 11);
  if (has('tom2')) drum(L.toms[1], 'tom2', tomE(1), 23);
  const legs = (x, yTop, spread) => {
    ctx.strokeStyle = hw === 'black' ? '#5a5e68' : '#9aa0ad';
    ctx.lineWidth = lw(0.007);
    ctx.beginPath();
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(x + k * spread * 0.3, yTop);
      ctx.lineTo(x + k * spread, L.floor);
    }
    ctx.stroke();
  };
  const ft = L.toms[2];
  if (has('floor')) {
    legs(ft.x, ft.y + ft.depth * 0.6, U * 0.11);
    drum(ft, 'floor', tomE(2), 37);
  }
  const sn = L.snare;
  if (has('snare')) {
    legs(sn.x, sn.y + sn.depth + U * 0.05, U * 0.08);
    ctx.strokeStyle = metal(ctx, hw, sn.x - 3, 0, sn.x + 3, 0);
    ctx.lineWidth = lw(0.008);
    ctx.beginPath();
    ctx.moveTo(sn.x, sn.y + sn.depth + U * 0.05);
    ctx.lineTo(sn.x, sn.y + sn.depth);
    ctx.stroke();
    drum(sn, 'snare', hit('snare').e, 53);
  }

  // cymbals: lathe rings, a bell and a moving glint
  const cymbal = (c, lane, ryK = 0.17) => {
    const { e, age } = hit(lane);
    const wob = e * Math.sin(age * 24);
    const rot = ((c.tilt + wob * 9) * Math.PI) / 180;
    const ry = c.r * (ryK + 0.06 * wob);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-c.r, -ry, c.r, ry);
    g.addColorStop(0, cyms[0]);
    g.addColorStop(0.35, cyms[1]);
    g.addColorStop(0.5, mixHex(cyms[2], '#ffffff', 0.3 * e));
    g.addColorStop(0.65, cyms[3]);
    g.addColorStop(1, cyms[4]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, c.r, Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(0.5, c.r * 0.006);
    for (let i = 1; i < 14; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(40,30,10,0.22)' : 'rgba(255,240,200,0.16)';
      ctx.beginPath();
      ctx.ellipse(0, 0, (c.r * i) / 14, (Math.abs(ry) * i) / 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(30,20,8,0.8)';
    ctx.lineWidth = Math.max(1, c.r * 0.012);
    ctx.beginPath();
    ctx.ellipse(0, 0, c.r, Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    const bell = ctx.createRadialGradient(-c.r * 0.03, -ry * 0.4, 0, 0, -ry * 0.2, c.r * 0.2);
    bell.addColorStop(0, cyms[5]);
    bell.addColorStop(1, cyms[6]);
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.ellipse(0, -Math.abs(ry) * 0.15, c.r * 0.18, Math.abs(ry) * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    if (lane === 'china') {
      // a china's edge turns up: a raised outer band with a darker lip
      ctx.strokeStyle = cyms[3];
      ctx.lineWidth = Math.max(2, Math.abs(ry) * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, -Math.abs(ry) * 0.3, c.r * 0.96, Math.abs(ry) * 0.85, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
      ctx.strokeStyle = cyms[0];
      ctx.lineWidth = Math.max(1.5, Math.abs(ry) * 0.2);
      ctx.beginPath();
      ctx.ellipse(0, -Math.abs(ry) * 0.45, c.r * 0.98, Math.abs(ry) * 0.85, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
    }
    const gx = (-0.6 + 1.2 * Math.min(1, age / 0.5)) * c.r;
    ctx.fillStyle = `rgba(255,255,240,${0.15 + 0.55 * e})`;
    ctx.beginPath();
    ctx.ellipse(gx, -Math.abs(ry) * 0.2, c.r * 0.22, Math.abs(ry) * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (e > 0.02) {
      G.add((gg) => {
        gg.fillStyle = glowCol(lane);
        gg.globalAlpha = 0.45 * e;
        gg.beginPath();
        gg.ellipse(c.x, c.y, c.r * 1.05, c.r * 0.3, rot, 0, Math.PI * 2);
        gg.fill();
      });
    }
  };
  if (has('hihat')) {
    const { e } = hit('hihat');
    const gap = U * (0.03 - 0.024 * e);
    cymbal({ x: L.hihat.x, y: L.hihat.y + gap / 2, r: L.hihat.r, tilt: 0 }, 'hihat', 0.14);
    cymbal({ x: L.hihat.x, y: L.hihat.y - gap / 2, r: L.hihat.r, tilt: 0 }, 'hihat', 0.14);
  }
  if (has('china')) cymbal(L.china, 'china', 0.15);
  if (has('crash2')) cymbal(L.crash2, 'crash2');
  if (has('crash')) cymbal(L.crash, 'crash');
  if (has('ride')) cymbal(L.ride, 'ride', 0.16);
  G.flush(look.fx === 'fire' ? 1 : 0.8);

  // effects in front of the kit
  if (look.fx === 'fire') embersFront(ctx, L, t, kickE);
  if (look.fx === 'frost') snowFront(ctx, L, t, { top: boxTop });
  if (look.fx === 'lightning') {
    for (const lane of ['crash', 'crash2', 'china', 'snare', 'ride']) {
      const h = hit(lane);
      if (!h.hit || h.age > 0.16) continue;
      const [x, y] = strikePoint(L, lane);
      const a = 1 - h.age / 0.16;
      bolt(ctx, x + (rnd(h.hit.index) - 0.5) * U * 0.3, boxTop, x, y, h.hit.index * 17, Math.max(1, U * 0.005), a);
      ctx.fillStyle = `rgba(170,200,255,${0.12 * a})`;
      ctx.fillRect(L.cx - U, boxTop, U * 2, L.floor - boxTop);
    }
  }
  if (look.fx === 'sparks') {
    const fire = (lane, piece) => {
      const h = hit(lane, piece);
      if (!h.hit) return;
      const pt = strikePoint(L, lane, piece ?? 0);
      if (pt) sparks(ctx, pt[0], pt[1], h.age, h.hit.index * 31, U);
    };
    fire('snare');
    fire('crash');
    fire('crash2');
    fire('china');
    fire('ride');
    for (const t of KIT_TOMS) fire(t);
    if (L.kicks.length > 1) L.kicks.forEach((k, i) => fire('kick', i));
    else fire('kick');
  }
}
