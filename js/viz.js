// Audio-reactive visualizer layer. Each layer listens to one audio file (a stem such as drums
// or bass, or the song itself). Analysis is done once up front, so preview and export match.
import { clamp, noise, energyEnvelope } from './core.js';
import { detectOnsets } from './drums.js';
import { REAL_STYLES, REAL_DRAW } from './vizreal.js';

export const VIZ_STYLES = [
  ['ripple', 'Water ripple', 'Rings that bend the picture on every hit (great for drums)'],
  ['electric', 'Electricity', 'Lightning that crackles with the level (great for bass)'],
  ['bars', 'Spectrum bars', 'Classic frequency bars'],
  ['circle', 'Circular spectrum', 'Bars around a circle; works over cover art'],
  ['wave', 'Waveform', 'Oscilloscope line of the actual sound'],
  ['particles', 'Particles', 'Sparks burst out on every hit'],
  ['glow', 'Glow pulse', 'The whole frame glows with the level (vocals, pads)'],
  ['rings', 'Speaker rings', 'Concentric rings pump with the level'],
  ...REAL_STYLES,
];

export const BLENDS = [
  ['screen', 'Screen (light only)'],
  ['source-over', 'Normal'],
  ['lighter', 'Add (brightest)'],
  ['overlay', 'Overlay'],
  ['multiply', 'Multiply'],
  ['difference', 'Difference'],
];

export function defaultVizLayer() {
  return {
    source: 'song',
    offset: 0,
    style: 'ripple',
    color: '#4dd2ff',
    color2: '#ffffff',
    intensity: 0.7,
    sensitivity: 0.5,
    x: 50,
    y: 50,
    size: 70,
    opacity: 1,
    blend: 'screen',
    scatter: false,
    playAudio: false,
    classic: true, // realistic styles: real-world colours (themes switch this off)
    start: 0,
    end: null,
  };
}

// ------------------------------------------------------------ analysis

const FPS = 30;
const NBANDS = 16;
const N = 1024;

/** In-place radix-2 FFT on re/im arrays of length N. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Log-spaced band edges (FFT bin indexes) from 40 Hz to 11 kHz. */
export function bandEdges(sampleRate, n = N, bands = NBANDS) {
  const lo = 40;
  const hi = Math.min(11000, sampleRate / 2 - 1);
  const edges = [];
  for (let b = 0; b <= bands; b++) {
    const f = lo * Math.pow(hi / lo, b / bands);
    edges.push(Math.max(1, Math.min(n / 2, Math.round((f / sampleRate) * n))));
  }
  return edges;
}

function percentile(arr, p) {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0;
}

/**
 * Analyse mono samples: { fps, frames, level[frames] 0..1, bands[frames*16] 0..1,
 * env100 (for onsets), wave (4 kHz), waveRate, duration }.
 */
export function analyseSamples(mono, sampleRate) {
  const duration = mono.length / sampleRate;
  const frames = Math.max(1, Math.ceil(duration * FPS));
  const hop = sampleRate / FPS;
  const level = new Float32Array(frames);
  const bands = new Float32Array(frames * NBANDS);
  const edges = bandEdges(sampleRate);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (let f = 0; f < frames; f++) {
    const c = Math.round(f * hop);
    let sum = 0;
    const h0 = Math.max(0, Math.round(c - hop / 2));
    const h1 = Math.min(mono.length, Math.round(c + hop / 2));
    for (let i = h0; i < h1; i++) sum += mono[i] * mono[i];
    level[f] = Math.sqrt(sum / Math.max(1, h1 - h0));
    for (let i = 0; i < N; i++) {
      const s = c - N / 2 + i;
      re[i] = s >= 0 && s < mono.length ? mono[s] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < NBANDS; b++) {
      let m = 0;
      for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) m = Math.max(m, Math.hypot(re[k], im[k]));
      bands[f * NBANDS + b] = m;
    }
  }
  // normalise: level by its 97th percentile, each band by its own 97th percentile (log-compressed)
  const lv = percentile(level, 0.97) || 1;
  for (let f = 0; f < frames; f++) level[f] = clamp(level[f] / lv, 0, 1.2);
  for (let b = 0; b < NBANDS; b++) {
    const col = new Float32Array(frames);
    for (let f = 0; f < frames; f++) col[f] = Math.log1p(bands[f * NBANDS + b] * 50);
    const top = percentile(col, 0.97) || 1;
    for (let f = 0; f < frames; f++) bands[f * NBANDS + b] = clamp(col[f] / top, 0, 1.2);
  }
  const waveRate = 4000;
  const step = sampleRate / waveRate;
  const wave = new Float32Array(Math.floor(mono.length / step));
  for (let i = 0; i < wave.length; i++) wave[i] = mono[Math.floor(i * step)];
  return { fps: FPS, frames, level, bands, nbands: NBANDS, env100: energyEnvelope(mono, sampleRate, 100), wave, waveRate, duration, onsetCache: new Map() };
}

export async function analyseAudioBlob(blob) {
  const sr = 22050;
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const audio = await new Ctx(1, 2, sr).decodeAudioData((await blob.arrayBuffer()).slice(0));
  let mono = audio.getChannelData(0);
  if (audio.numberOfChannels > 1) {
    const r = audio.getChannelData(1);
    mono = mono.map((v, i) => (v + r[i]) / 2);
  }
  // decodeAudioData resamples to the context rate
  return analyseSamples(mono, audio.sampleRate);
}

export function onsetsFor(feat, sensitivity) {
  const key = Math.round(sensitivity * 20);
  if (!feat.onsetCache.has(key)) feat.onsetCache.set(key, detectOnsets(feat.env100, 100, { sensitivity, minGap: 0.08 }));
  return feat.onsetCache.get(key);
}

function frameAt(feat, ts) {
  return clamp(Math.floor(ts * feat.fps), 0, feat.frames - 1);
}
/** Smoothed level (attack fast, release slow) so visuals do not flicker. */
function levelAt(feat, ts) {
  if (ts < 0 || ts > feat.duration) return 0;
  const f = frameAt(feat, ts);
  let v = feat.level[f];
  for (let k = 1; k <= 4; k++) v = Math.max(v, feat.level[Math.max(0, f - k)] * (1 - k * 0.18));
  return v;
}
function bandsAt(feat, ts) {
  const f = frameAt(feat, ts);
  const out = new Float32Array(feat.nbands);
  if (ts < 0 || ts > feat.duration) return out;
  for (let b = 0; b < feat.nbands; b++) {
    let v = feat.bands[f * feat.nbands + b];
    for (let k = 1; k <= 3; k++) v = Math.max(v, (feat.bands[Math.max(0, f - k) * feat.nbands + b] || 0) * (1 - k * 0.22));
    out[b] = v;
  }
  return out;
}

// ------------------------------------------------------------ drawing

const rgba = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
};

let snap = null;
function snapshot(ctx, W, H) {
  snap ||= document.createElement('canvas');
  if (snap.width !== W || snap.height !== H) {
    snap.width = W;
    snap.height = H;
  }
  const g = snap.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.drawImage(ctx.canvas, 0, 0, W, H);
  return snap;
}

export function drawViz(ctx, W, H, layer, feat, t, songTime, visibleEnd) {
  if (!feat) return;
  const end = layer.end ?? visibleEnd;
  if (t < (layer.start || 0) || t >= end) return;
  const fade = Math.min(1, (t - (layer.start || 0)) / 0.3, (end - t) / 0.3);
  const ts = songTime - (layer.offset || 0);
  const I = layer.intensity ?? 0.7;
  const cx = (W * layer.x) / 100;
  const cy = (H * layer.y) / 100;
  const S = (W * layer.size) / 100;
  const lvl = levelAt(feat, ts);
  const frame = Math.floor(t * 30);
  ctx.save();
  ctx.globalAlpha *= Math.max(0, fade) * (layer.opacity ?? 1);
  ctx.globalCompositeOperation = layer.blend || 'screen';

  switch (layer.style) {
    case 'ripple': {
      const life = 1.6;
      const ons = onsetsFor(feat, layer.sensitivity ?? 0.5);
      const recent = [];
      for (let i = ons.length - 1; i >= 0 && ons[i].time > ts - life; i--) if (ons[i].time <= ts) recent.push([ons[i], i]);
      if (recent.length) {
        const src = snapshot(ctx, W, H);
        for (const [o, i] of recent) {
          const age = (ts - o.time) / life;
          const px = layer.scatter ? W * (0.15 + 0.7 * noise(i * 3.1)) : cx;
          const py = layer.scatter ? H * (0.15 + 0.7 * noise(i * 7.7)) : cy;
          const r = (S / 2) * Math.pow(age, 0.6) + 2;
          const band = Math.max(4, S * 0.08 * (1 - age));
          const amp = (0.6 + 0.4 * o.strength) * (1 - age) * I;
          // refraction: the picture inside the ring is magnified a little
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath();
          ctx.arc(px, py, r + band, 0, Math.PI * 2);
          ctx.arc(px, py, Math.max(0, r - band), 0, Math.PI * 2, true);
          ctx.clip();
          const z = 1 + 0.05 * amp;
          ctx.globalAlpha = Math.min(1, amp * 1.2) * fade;
          ctx.drawImage(src, px - px * z, py - py * z, W * z, H * z);
          ctx.restore();
          ctx.strokeStyle = rgba(layer.color, 0.55 * amp);
          ctx.lineWidth = Math.max(1, band * 0.35);
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = rgba(layer.color2, 0.35 * amp);
          ctx.lineWidth = Math.max(1, band * 0.12);
          ctx.beginPath();
          ctx.arc(px, py, r * 0.82, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'electric': {
      const bolts = Math.round(2 + lvl * I * 8);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = S * 0.06;
      const step = Math.floor(frame / 2); // re-roll the shape 15 times a second
      for (let b = 0; b < bolts; b++) {
        if (lvl < 0.12 && b > 0) break;
        const a0 = noise(step * 13 + b) * Math.PI * 2;
        const len = (S / 2) * (0.35 + 0.75 * lvl);
        let x = cx;
        let y = cy;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const segs = 9;
        for (let s = 1; s <= segs; s++) {
          const a = a0 + (noise(step * 31 + b * 7 + s) - 0.5) * 1.4;
          x += (Math.cos(a) * len) / segs;
          y += (Math.sin(a) * len) / segs;
          ctx.lineTo(x, y);
          if (s === 5 && noise(step + b * 3) > 0.5) {
            // a short fork
            ctx.moveTo(x, y);
            const fa = a + 0.9;
            ctx.lineTo(x + Math.cos(fa) * len * 0.25, y + Math.sin(fa) * len * 0.25);
            ctx.moveTo(x, y);
          }
        }
        ctx.strokeStyle = rgba(layer.color, Math.min(1, 0.55 + lvl));
        ctx.lineWidth = Math.max(2, S * 0.016 * (0.6 + lvl));
        ctx.stroke();
        ctx.strokeStyle = rgba(layer.color2, Math.min(1, 0.3 + lvl));
        ctx.lineWidth = Math.max(1, S * 0.004);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.25);
      g.addColorStop(0, rgba(layer.color2, 0.5 * lvl * I));
      g.addColorStop(1, rgba(layer.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - S, cy - S, S * 2, S * 2);
      break;
    }
    case 'bars': {
      const b = bandsAt(feat, ts);
      const n = b.length;
      const w = S;
      const h = S * 0.35;
      const x0 = cx - w / 2;
      const gap = w * 0.012;
      const bw = w / n - gap;
      const grad = ctx.createLinearGradient(0, cy, 0, cy - h);
      grad.addColorStop(0, layer.color);
      grad.addColorStop(1, layer.color2);
      ctx.fillStyle = grad;
      for (let i = 0; i < n; i++) {
        const v = Math.min(1, b[i] * (0.6 + I * 0.6));
        const bh = Math.max(2, v * h);
        ctx.fillRect(x0 + i * (bw + gap), cy - bh, bw, bh);
        ctx.globalAlpha *= 0.35;
        ctx.fillRect(x0 + i * (bw + gap), cy, bw, bh * 0.4); // reflection
        ctx.globalAlpha /= 0.35;
      }
      break;
    }
    case 'circle': {
      const b = bandsAt(feat, ts);
      const rays = 72;
      const r0 = S * 0.22 * (1 + 0.06 * lvl);
      ctx.lineCap = 'round';
      for (let i = 0; i < rays; i++) {
        const half = rays / 2;
        const idx = i < half ? i : rays - 1 - i; // mirror for symmetry
        const fpos = (idx / half) * (b.length - 1);
        const v = b[Math.floor(fpos)] * (1 - (fpos % 1)) + (b[Math.min(b.length - 1, Math.ceil(fpos))] || 0) * (fpos % 1);
        const len = S * 0.22 * Math.min(1.2, v * (0.5 + I * 0.7));
        const a = -Math.PI / 2 + (i / rays) * Math.PI * 2;
        ctx.strokeStyle = i % 2 ? layer.color : layer.color2;
        ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * r0) / rays) * 0.55);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len + 1), cy + Math.sin(a) * (r0 + len + 1));
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(layer.color2, 0.7);
      ctx.lineWidth = Math.max(1, S * 0.006);
      ctx.beginPath();
      ctx.arc(cx, cy, r0 * 0.96, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'wave': {
      const span = 0.06; // seconds of audio across the width
      const n = 240;
      const w = S;
      const amp = S * 0.18 * (0.6 + I);
      const c0 = Math.floor((ts - span / 2) * feat.waveRate);
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = Math.max(1.5, S * 0.006);
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = S * 0.03;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const k = c0 + Math.floor((i / n) * span * feat.waveRate);
        const v = k >= 0 && k < feat.wave.length ? feat.wave[k] : 0;
        const x = cx - w / 2 + (w * i) / (n - 1);
        const y = cy - v * amp * 2.2;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = rgba(layer.color2, 0.6);
      ctx.lineWidth = Math.max(1, S * 0.002);
      ctx.shadowBlur = 0;
      ctx.stroke();
      break;
    }
    case 'particles': {
      const life = 1.3;
      const ons = onsetsFor(feat, layer.sensitivity ?? 0.5);
      for (let i = ons.length - 1; i >= 0 && ons[i].time > ts - life; i--) {
        const o = ons[i];
        if (o.time > ts) continue;
        const age = ts - o.time;
        const k = age / life;
        const ox = layer.scatter ? W * (0.15 + 0.7 * noise(i * 2.3)) : cx;
        const oy = layer.scatter ? H * (0.15 + 0.7 * noise(i * 5.9)) : cy;
        const count = Math.round(14 + 26 * o.strength * I);
        for (let p = 0; p < count; p++) {
          const a = noise(i * 97 + p) * Math.PI * 2;
          const sp = (S * 0.6) * (0.3 + 0.7 * noise(i * 31 + p * 7));
          const x = ox + Math.cos(a) * sp * (1 - Math.pow(1 - k, 2));
          const y = oy + Math.sin(a) * sp * (1 - Math.pow(1 - k, 2)) + S * 0.15 * k * k;
          ctx.fillStyle = p % 3 ? rgba(layer.color, 1 - k) : rgba(layer.color2, 1 - k);
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, S * 0.008 * (1 - k * 0.6)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'glow': {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * (0.4 + layer.size / 200));
      g.addColorStop(0, rgba(layer.color2, 0.0));
      g.addColorStop(0.5, rgba(layer.color, 0.25 * lvl * I));
      g.addColorStop(1, rgba(layer.color, 0.75 * lvl * I));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'rings': {
      const rings = 4;
      for (let r = 0; r < rings; r++) {
        const rad = (S / 2) * ((r + 1) / rings) * (1 + 0.12 * lvl * I * (1 - r / rings));
        ctx.strokeStyle = r % 2 ? rgba(layer.color2, 0.5 * (0.4 + lvl)) : rgba(layer.color, 0.7 * (0.4 + lvl));
        ctx.lineWidth = Math.max(2, S * 0.012 * (1 + lvl));
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(layer.color, 0.25 + 0.4 * lvl);
      ctx.beginPath();
      ctx.arc(cx, cy, (S / 2) * 0.14 * (1 + 0.4 * lvl), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      if (REAL_DRAW[layer.style]) REAL_DRAW[layer.style](ctx, W, H, layer, feat, ts, { cx, cy, S, I, lvl, onsetsFor });
  }
  ctx.restore();
}
