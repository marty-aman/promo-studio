// Drum chart layer: hits from a Guitar Pro drum track or detected from a drum stem,
// drawn as scrolling lanes, a falling "highway", or a circle that sweeps once per bar.
import { timedBeats } from './tab.js';
import { glowPass, frost } from './canvasfx.js';
import { energyEnvelope } from './core.js';
import { kitLayout, drawStageKit, kitDoubleKick, KIT_TOMS } from './drumkit.js';

export const LANES = [
  { id: 'china', label: 'China', color: '#f472b6' },
  { id: 'crash', label: 'Crash 1', color: '#ff8c42' },
  { id: 'crash2', label: 'Crash 2', color: '#fbbf24' },
  { id: 'ride', label: 'Ride', color: '#5eead4' },
  { id: 'hihat', label: 'Hi-hat', color: '#4dd2ff' },
  { id: 'tom1', label: 'High tom', color: '#c4b5fd' },
  { id: 'tom2', label: 'Mid tom', color: '#a78bfa' },
  { id: 'floor', label: 'Floor tom', color: '#818cf8' },
  { id: 'snare', label: 'Snare', color: '#ffd400' },
  { id: 'kick', label: 'Kick', color: '#ff4d6d' },
];
/** Lanes added later take the colour a project already set for the lane they came from. */
export const LANE_FALLBACK = { tom1: 'tom', tom2: 'tom', floor: 'tom', crash2: 'crash', china: 'crash' };
export const TOM_LANES = ['tom1', 'tom2', 'floor'];
export const CYMBAL_LANES = ['china', 'crash', 'crash2', 'ride'];

/** General MIDI drum number -> lane id (null for sounds we do not chart). */
export function midiToLane(m) {
  if (m === 35 || m === 36) return 'kick';
  if (m >= 37 && m <= 40) return 'snare';
  if (m === 42 || m === 44 || m === 46) return 'hihat';
  if (m === 48 || m === 50) return 'tom1'; // high and high-mid tom
  if (m === 45 || m === 47) return 'tom2'; // low-mid and low tom
  if (m === 41 || m === 43) return 'floor'; // low and high floor tom
  if (m === 49) return 'crash';
  if (m === 57 || m === 55) return 'crash2'; // crash 2 (and the splash)
  if (m === 52) return 'china';
  if ([51, 53, 59].includes(m)) return 'ride';
  return null;
}

/**
 * The lanes a lane-based style draws: the whole kit (so every drum and cymbal has its place) for a
 * Guitar Pro chart, or only the lanes that have hits for a drum stem (which only finds kick, snare
 * and hi-hat). `layer.allLanes` overrides.
 */
export function chartLanes(layer, data) {
  const all = layer.allLanes ?? layer.source !== 'audio';
  if (all) return LANES.map((l) => l.id);
  return data.lanes.length ? data.lanes : ['kick', 'snare', 'hihat'];
}

export function laneColorOf(layer, id) {
  const c = layer.colors || {};
  return c[id] || (LANE_FALLBACK[id] && c[LANE_FALLBACK[id]]) || (LANES.find((l) => l.id === id) || {}).color || '#ffffff';
}

export function drumTracks(score) {
  return score.tracks
    .map((tr, index) => (tr.staves.some((s) => s.isPercussion) ? { index, name: tr.name || `Drums ${index + 1}` } : null))
    .filter(Boolean);
}

/** Hits from a Guitar Pro percussion track: { hits:[{time, lane, vel}], bars, duration, lanes, tempo }. */
export function drumTimelineFromScore(score, trackIndex) {
  const track = score.tracks[trackIndex];
  const staff = track.staves.find((s) => s.isPercussion) || track.staves[0];
  const arts = track.percussionArticulations || [];
  const { bars, beats, duration } = timedBeats(score, staff);
  const hits = [];
  for (const b of beats) {
    for (const n of b.beat.notes) {
      const a = arts[n.percussionArticulation];
      const midi = a ? a.outputMidiNumber : n.percussionArticulation;
      const lane = midiToLane(midi);
      if (lane) hits.push({ time: b.time, lane, vel: n.isGhost ? 0.5 : 1 });
    }
  }
  return finish(hits, bars, duration, score.tempo);
}

function finish(hits, bars, duration, tempo) {
  hits.sort((a, b) => a.time - b.time);
  const present = new Set(hits.map((h) => h.lane));
  return { hits, bars, duration, tempo, lanes: LANES.filter((l) => present.has(l.id)).map((l) => l.id) };
}

/**
 * Onset picking on an energy envelope: positive flux above an adaptive threshold
 * (local mean * k + global floor), at least `minGap` seconds apart.
 */
export function detectOnsets(env, rate, { sensitivity = 0.5, minGap = 0.09 } = {}) {
  const n = env.length;
  const flux = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) {
    flux[i] = Math.max(0, env[i] - env[i - 1]);
    mean += flux[i];
  }
  mean /= Math.max(1, n - 1);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, flux[i]);
  const k = 1.4 + (1 - sensitivity) * 2.6; // higher sensitivity -> lower threshold
  const win = Math.max(1, Math.round(rate * 0.25));
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    let local = 0;
    let c = 0;
    for (let j = Math.max(0, i - win); j < Math.min(n, i + win); j++) {
      local += flux[j];
      c++;
    }
    local /= c;
    const thr = Math.max(local * k, mean * 2, peak * (0.12 - sensitivity * 0.08));
    const t = i / rate;
    if (flux[i] > thr && t - last >= minGap) {
      out.push({ time: +t.toFixed(3), strength: Math.min(1, flux[i] / (peak || 1)) });
      last = t;
    }
  }
  return out;
}

/** Split a drum stem into kick / snare / hi-hat bands and detect hits in each (browser only). */
export async function drumHitsFromAudio(blob, { sensitivity = 0.5 } = {}) {
  const buf = await blob.arrayBuffer();
  const sr = 22050;
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const audio = await new Ctx(1, 2, sr).decodeAudioData(buf.slice(0));
  const band = async (type, freq, q) => {
    const ctx = new Ctx(1, Math.ceil(audio.duration * sr), sr);
    const src = ctx.createBufferSource();
    src.buffer = audio;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    src.connect(f).connect(ctx.destination);
    src.start();
    const out = await ctx.startRendering();
    return energyEnvelope(out.getChannelData(0), sr, 100);
  };
  const [kick, snare, hihat] = await Promise.all([band('lowpass', 120), band('bandpass', 1800, 0.9), band('highpass', 7000)]);
  const kicks = detectOnsets(kick, 100, { sensitivity, minGap: 0.1 });
  const hats = detectOnsets(hihat, 100, { sensitivity, minGap: 0.06 });
  const snares = cleanBleed(detectOnsets(snare, 100, { sensitivity, minGap: 0.1 }), [hats, kicks]);
  const hits = [
    ...kicks.map((o) => ({ time: o.time, lane: 'kick', vel: o.strength })),
    ...snares.map((o) => ({ time: o.time, lane: 'snare', vel: o.strength })),
    ...hats.map((o) => ({ time: o.time, lane: 'hihat', vel: o.strength })),
  ];
  return finish(hits, null, audio.duration, null);
}

/**
 * Cymbals and kicks leak into the snare band. Drop a snare onset when it lands within 30 ms of an
 * onset in another band and is clearly weaker than the strong snare hits.
 */
export function cleanBleed(snares, others, window = 0.03) {
  if (!snares.length) return snares;
  const strong = [...snares].map((s) => s.strength).sort((a, b) => b - a);
  const ref = strong[Math.floor(strong.length * 0.1)] || strong[0];
  const near = (t) => others.some((list) => list.some((o) => Math.abs(o.time - t) <= window));
  return snares.filter((s) => !(near(s.time) && s.strength < ref * 0.55));
}

export function defaultDrumLayer() {
  return {
    source: 'gp', // gp | audio
    mediaId: null,
    track: 0,
    sensitivity: 0.5,
    offset: 0,
    tempoScale: 1,
    start: 0,
    end: null,
    style: 'lanes', // lanes | highway | circle
    window: 2.2,
    playhead: 22,
    x: 50,
    y: 24,
    width: 92,
    height: 18,
    bg: '#000000',
    bgOpacity: 0.55,
    colors: Object.fromEntries(LANES.map((l) => [l.id, l.color])),
    showLabels: true,
  };
}

// ------------------------------------------------------------ drawing

const rgba = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
};
/** Mix two #rrggbb colours (k = 0 gives a, 1 gives b). */
const mixHex = (a, b, k) => {
  const p = (h) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
    return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [255, 255, 255];
  };
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};
function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function first(hits, t) {
  let lo = 0;
  let hi = hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Bar span containing time t: from the file's bars, else 4 beats of the song tempo, else 2 s. */
function barAt(data, t, beatPeriod) {
  if (data.bars && data.bars.length) {
    const b = data.bars.find((x) => t >= x.time && t < x.time + x.duration) || (t < 0 ? data.bars[0] : data.bars[data.bars.length - 1]);
    return { start: b.time, dur: b.duration };
  }
  const len = beatPeriod ? beatPeriod * 4 : 2;
  const start = Math.floor(t / len) * len;
  return { start, dur: len };
}

export function drawDrums(ctx, W, H, layer, data, t, songTime, visibleEnd, beatPeriod) {
  if (!data || !data.hits.length) return;
  const end = layer.end ?? visibleEnd;
  if (t < (layer.start || 0) || t >= end) return;
  if (FANCY[layer.style]) {
    const fade = Math.min(1, (t - (layer.start || 0)) / 0.3, (end - t) / 0.3);
    const dt = (songTime - layer.offset) * (layer.tempoScale || 1);
    // tab time at which this layer appeared, for the combo counter
    const shownFrom = (songTime - (t - (layer.start || 0)) - layer.offset) * (layer.tempoScale || 1);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, fade);
    FANCY[layer.style](ctx, W, H, layer, data, dt, { beatPeriod, shownFrom });
    ctx.restore();
    return;
  }
  const fade = Math.min(1, (t - (layer.start || 0)) / 0.3, (end - t) / 0.3);
  const dt = (songTime - layer.offset) * (layer.tempoScale || 1);
  const lanes = chartLanes(layer, data);
  const color = (id) => laneColorOf(layer, id);
  const label = (id) => (LANES.find((l) => l.id === id) || {}).label || id;

  const bw = (W * layer.width) / 100;
  const bh = (H * layer.height) / 100;
  const bx = (W * layer.x) / 100 - bw / 2;
  const by = (H * layer.y) / 100 - bh / 2;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, fade);
  if (layer.style !== 'circle') {
    ctx.fillStyle = rgba(layer.bg, layer.bgOpacity);
    rrect(ctx, bx, by, bw, bh, Math.min(bw, bh) * 0.08);
    ctx.fill();
  }
  const near = (h) => Math.abs(dt - h.time) < 0.09;
  const fontPx = Math.max(7, Math.min(bw, bh) * 0.07);

  if (layer.style === 'highway') {
    // perspective highway: lanes widen towards the strike line at the bottom
    const strikeY = by + bh * 0.86;
    const topY = by + bh * 0.06;
    const topW = bw * 0.42;
    const botW = bw * 0.92;
    const cx = bx + bw / 2;
    const pad = lanes.filter((l) => l !== 'kick');
    const cols = Math.max(1, pad.length);
    const xAt = (frac, y) => {
      const p = (y - topY) / (strikeY - topY);
      const w = topW + (botW - topW) * p;
      return cx - w / 2 + w * frac;
    };
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, W * 0.002);
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(xAt(c / cols, topY), topY);
      ctx.lineTo(xAt(c / cols, strikeY), strikeY);
      ctx.stroke();
    }
    const win = layer.window || 2.2;
    const yOf = (time) => {
      const p = 1 - (time - dt) / win; // 0 at top, 1 at strike line
      return topY + (strikeY - topY) * Math.pow(Math.max(0, p), 1.6);
    };
    for (let i = first(data.hits, dt - 0.15); i < data.hits.length; i++) {
      const h = data.hits[i];
      if (h.time > dt + win) break;
      const y = yOf(h.time);
      const p = (y - topY) / (strikeY - topY);
      const scale = 0.45 + 0.55 * p;
      ctx.globalAlpha = Math.max(0, fade) * (h.time < dt ? Math.max(0, 1 - (dt - h.time) / 0.15) : 1);
      if (h.lane === 'kick') {
        ctx.fillStyle = color('kick');
        ctx.fillRect(xAt(0, y), y - bh * 0.008 * scale, xAt(1, y) - xAt(0, y), bh * 0.016 * scale + 1);
      } else {
        const c = pad.indexOf(h.lane);
        const x = xAt((c + 0.5) / cols, y);
        const r = ((botW / cols) * 0.32 * scale);
        ctx.fillStyle = color(h.lane);
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.08, r * 0.45, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = Math.max(0, fade);
    // strike targets
    pad.forEach((lane, c) => {
      const x = xAt((c + 0.5) / cols, strikeY);
      const r = (botW / cols) * 0.32;
      const lit = data.hits.some((h) => h.lane === lane && near(h));
      ctx.strokeStyle = color(lane);
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.ellipse(x, strikeY, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (lit) {
        ctx.save();
        ctx.shadowColor = color(lane);
        ctx.shadowBlur = r * 1.2;
        ctx.fillStyle = color(lane);
        ctx.fill();
        ctx.restore();
      }
      if (layer.showLabels) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        const laneW = botW / cols;
        let fs = Math.min(fontPx, laneW * 0.3);
        ctx.font = `700 ${Math.round(fs)}px Inter, system-ui, sans-serif`;
        while (fs > 6 && ctx.measureText(label(lane)).width > laneW * 0.9) {
          fs *= 0.9;
          ctx.font = `700 ${Math.round(fs)}px Inter, system-ui, sans-serif`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label(lane), x, strikeY + r * 0.6);
      }
    });
    if (lanes.includes('kick') && data.hits.some((h) => h.lane === 'kick' && near(h))) {
      ctx.fillStyle = rgba(color('kick'), 0.35);
      ctx.fillRect(xAt(0, strikeY), strikeY - bh * 0.03, botW, bh * 0.06);
    }
    ctx.restore();
    return;
  }

  if (layer.style === 'circle') {
    const cx = (W * layer.x) / 100;
    const cy = (H * layer.y) / 100;
    const R = Math.min(bw, bh) / 2;
    const bar = barAt(data, dt, beatPeriod);
    const phase = (dt - bar.start) / bar.dur;
    const rings = lanes.length;
    ctx.fillStyle = rgba(layer.bg, layer.bgOpacity);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    const ringR = (i) => R * (0.32 + (0.62 * (i + 0.5)) / rings);
    lanes.forEach((lane, i) => {
      ctx.strokeStyle = rgba(color(lane), 0.25);
      ctx.lineWidth = Math.max(1, R * 0.006);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR(i), 0, Math.PI * 2);
      ctx.stroke();
    });
    // beat ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let b = 0; b < 4; b++) {
      const a = -Math.PI / 2 + (b / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28);
      ctx.lineTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
      ctx.stroke();
    }
    for (let i = first(data.hits, bar.start - 1e-6); i < data.hits.length; i++) {
      const h = data.hits[i];
      if (h.time >= bar.start + bar.dur) break;
      const li = lanes.indexOf(h.lane);
      if (li < 0) continue;
      const a = -Math.PI / 2 + ((h.time - bar.start) / bar.dur) * Math.PI * 2;
      const played = h.time <= dt;
      const lit = near(h);
      const r = R * (lit ? 0.055 : 0.038);
      ctx.save();
      if (lit) {
        ctx.shadowColor = color(h.lane);
        ctx.shadowBlur = R * 0.12;
      }
      ctx.fillStyle = played ? color(h.lane) : rgba(color(h.lane), 0.45);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * ringR(li), cy + Math.sin(a) * ringR(li), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const ha = -Math.PI / 2 + phase * Math.PI * 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, R * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ha) * R * 0.24, cy + Math.sin(ha) * R * 0.24);
    ctx.lineTo(cx + Math.cos(ha) * R, cy + Math.sin(ha) * R);
    ctx.stroke();
    // centre pulses with the kick
    const kickNow = data.hits.find((h) => h.lane === 'kick' && dt >= h.time && dt - h.time < 0.25);
    const pulse = kickNow ? 1 - (dt - kickNow.time) / 0.25 : 0;
    ctx.fillStyle = rgba(color('kick'), 0.25 + 0.6 * pulse);
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.18 + 0.05 * pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // horizontal lanes (default)
  const labelW = layer.showLabels ? bw * 0.13 : 0;
  const left = bx + bw * 0.02 + labelW;
  const right = bx + bw * 0.98;
  const top = by + bh * 0.08;
  const rowH = (bh * 0.84) / lanes.length;
  const win = layer.window || 2.2;
  const playX = left + ((right - left) * (layer.playhead ?? 22)) / 100;
  const pps = (right - left) / win;
  lanes.forEach((lane, i) => {
    const y = top + rowH * (i + 0.5);
    ctx.strokeStyle = rgba(color(lane), 0.25);
    ctx.lineWidth = Math.max(1, rowH * 0.05);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    if (layer.showLabels) {
      ctx.fillStyle = color(lane);
      ctx.font = `700 ${Math.round(Math.min(fontPx, rowH * 0.5))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label(lane), bx + bw * 0.025, y);
    }
  });
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, by, right - left, bh);
  ctx.clip();
  if (data.bars) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    for (const b of data.bars) {
      const x = playX + (b.time - dt) * pps;
      if (x < left - 2 || x > right + 2) continue;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + rowH * lanes.length);
      ctx.stroke();
    }
  }
  for (let i = first(data.hits, dt - (playX - left) / pps - 0.2); i < data.hits.length; i++) {
    const h = data.hits[i];
    const x = playX + (h.time - dt) * pps;
    if (x > right + 10) break;
    const li = lanes.indexOf(h.lane);
    if (li < 0) continue;
    const y = top + rowH * (li + 0.5);
    const lit = near(h);
    const w = Math.max(rowH * 0.5, pps * 0.05);
    const hh = rowH * (lit ? 0.72 : 0.5);
    ctx.save();
    if (lit) {
      ctx.shadowColor = color(h.lane);
      ctx.shadowBlur = rowH * 0.9;
    }
    ctx.fillStyle = h.time < dt - 0.09 ? rgba(color(h.lane), 0.35) : color(h.lane);
    rrect(ctx, x - w / 2, y - hh / 2, w, hh, hh * 0.3);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, rowH * 0.06);
  ctx.beginPath();
  ctx.moveTo(playX, by + bh * 0.05);
  ctx.lineTo(playX, by + bh * 0.95);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------ fancy styles

export const DRUM_STYLES = [
  ['lanes', 'Scrolling lanes', 'Simple rows that scroll to a hit line'],
  ['highway', 'Highway', 'Notes fall down a road to a strike line'],
  ['circle', 'Circle', 'A hand sweeps once per bar'],
  ['neon', 'Neon highway', '3D glowing road, shockwaves, sparks and a combo counter'],
  ['kit', 'Light-up drum kit', 'A drum kit whose pieces glow, bounce and ripple when hit'],
  ['glass', 'Glass lanes', 'Frosted panel, gradient capsules, trails and hit bursts'],
];

/** Placement that suits each style when you switch to it. */
export const STYLE_PLACEMENT = {
  lanes: { y: 24, width: 92, height: 18 },
  highway: { y: 62, width: 70, height: 46 },
  circle: { y: 45, width: 70, height: 40 },
  neon: { y: 60, width: 84, height: 54 },
  kit: { y: 62, width: 88, height: 40 },
  glass: { y: 24, width: 92, height: 20 },
};

// Colours of the chart itself (backdrop, road, grid, glow). Themes set layer.chrome; these defaults are
// the original purple-night look.
export const DRUM_CHROME = { bg0: '#05030f', bg1: '#140a2e', bg2: '#230b3d', road: '#0a061e', grid: '#a078ff', glow: '#ff5ac8', edge: '#c8a0ff', shell: '#1e1830', kickShell: '#1e0e18' };
const chromeOf = (layer) => ({ ...DRUM_CHROME, ...(layer.chrome || {}) });

const laneColor = laneColorOf;
const laneLabel = (id) => (LANES.find((l) => l.id === id) || {}).label || id;
const fract = (x) => x - Math.floor(x);
const rnd = (n) => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);

/** Most recent hit per lane at or before dt (within `window` s): Map lane -> {time, index, vel}. */
function lastHits(data, dt, window = 0.8) {
  const out = new Map();
  for (let i = first(data.hits, dt + 1e-6) - 1; i >= 0; i--) {
    const h = data.hits[i];
    if (dt - h.time > window) break;
    if (!out.has(h.lane)) out.set(h.lane, { time: h.time, index: i, vel: h.vel ?? 1 });
  }
  return out;
}

function box(W, H, layer) {
  const bw = (W * layer.width) / 100;
  const bh = (H * layer.height) / 100;
  return { bw, bh, bx: (W * layer.x) / 100 - bw / 2, by: (H * layer.y) / 100 - bh / 2 };
}


// ---- A: neon highway
function drawNeon(ctx, W, H, layer, data, dt, { shownFrom }) {
  const { bw, bh, bx, by } = box(W, H, layer);
  const C = chromeOf(layer);
  const lanes = chartLanes(layer, data).filter((l) => l !== 'kick');
  const hasKick = chartLanes(layer, data).includes('kick');
  const cols = Math.max(1, lanes.length);
  const horizon = by + bh * 0.06;
  const strike = by + bh * 0.82;
  const cx = bx + bw / 2;
  const topW = bw * 0.16;
  const botW = bw * 0.96;
  const win = layer.window || 2.2;
  const persp = (p) => Math.pow(Math.max(0, Math.min(1, p)), 1.9); // 0 horizon -> 1 strike
  const yAt = (p) => horizon + (strike - horizon) * persp(p);
  const wAt = (y) => topW + (botW - topW) * ((y - horizon) / (strike - horizon));
  const xAt = (frac, y) => cx - wAt(y) / 2 + wAt(y) * frac;
  const pOf = (time) => 1 - (time - dt) / win;
  const unit = Math.min(bw, bh);
  const G = glowPass(ctx, bx, by, bw, bh, unit * 0.03);

  // backdrop: deep gradient, stars, horizon glow
  ctx.save();
  rrect(ctx, bx, by, bw, bh, unit * 0.06);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, rgba(C.bg0, layer.bgOpacity ?? 0.7));
  bg.addColorStop(0.6, rgba(C.bg1, layer.bgOpacity ?? 0.7));
  bg.addColorStop(1, rgba(C.bg2, layer.bgOpacity ?? 0.7));
  ctx.fillStyle = bg;
  ctx.fillRect(bx, by, bw, bh);
  for (let s = 0; s < 40; s++) {
    const sx = bx + rnd(s) * bw;
    const sy = by + rnd(s + 99) * bh * 0.35;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * Math.abs(Math.sin(dt * 2 + s))})`;
    ctx.fillRect(sx, sy, Math.max(1, unit * 0.004), Math.max(1, unit * 0.004));
  }
  const hg = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, bw * 0.5);
  hg.addColorStop(0, rgba(C.glow, 0.45));
  hg.addColorStop(1, rgba(C.glow, 0));
  ctx.fillStyle = hg;
  ctx.fillRect(bx, by, bw, bh * 0.5);

  // road surface + moving speed lines
  ctx.beginPath();
  ctx.moveTo(xAt(0, horizon), horizon);
  ctx.lineTo(xAt(1, horizon), horizon);
  ctx.lineTo(xAt(1, strike), strike);
  ctx.lineTo(xAt(0, strike), strike);
  ctx.closePath();
  ctx.fillStyle = rgba(C.road, 0.55);
  ctx.fill();
  ctx.strokeStyle = rgba(C.grid, 0.18);
  ctx.lineWidth = Math.max(1, unit * 0.003);
  const spacing = 0.25;
  for (let k = Math.ceil((dt - 0.2) / spacing); k * spacing < dt + win; k++) {
    const y = yAt(pOf(k * spacing));
    if (y < horizon || y > strike) continue;
    ctx.beginPath();
    ctx.moveTo(xAt(0, y), y);
    ctx.lineTo(xAt(1, y), y);
    ctx.stroke();
  }

  // glowing rails
  ctx.lineCap = 'round';
  for (let c = 0; c <= cols; c++) {
    const col = laneColor(layer, lanes[Math.min(cols - 1, c)] || 'snare');
    const g = ctx.createLinearGradient(0, horizon, 0, strike);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(1, rgba(col, 0.9));
    ctx.strokeStyle = g;
    const lw = Math.max(1.5, unit * (c === 0 || c === cols ? 0.008 : 0.005));
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(xAt(c / cols, horizon), horizon);
    ctx.lineTo(xAt(c / cols, strike), strike);
    ctx.stroke();
    G.add((gl) => {
      gl.strokeStyle = g;
      gl.lineWidth = lw * 3;
      gl.lineCap = 'round';
      gl.beginPath();
      gl.moveTo(xAt(c / cols, horizon), horizon);
      gl.lineTo(xAt(c / cols, strike), strike);
      gl.stroke();
    });
  }

  const recent = lastHits(data, dt, 0.5);
  // lane beams for fresh hits
  for (const [lane, hit] of recent) {
    const c = lanes.indexOf(lane);
    if (c < 0) continue;
    const e = Math.max(0, 1 - (dt - hit.time) / 0.35);
    const g = ctx.createLinearGradient(0, horizon, 0, strike);
    g.addColorStop(0, rgba(laneColor(layer, lane), 0));
    g.addColorStop(1, rgba(laneColor(layer, lane), 0.35 * e));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(xAt(c / cols, horizon), horizon);
    ctx.lineTo(xAt((c + 1) / cols, horizon), horizon);
    ctx.lineTo(xAt((c + 1) / cols, strike), strike);
    ctx.lineTo(xAt(c / cols, strike), strike);
    ctx.closePath();
    ctx.fill();
  }

  // notes, far to near, with comet tails
  const visible = [];
  for (let i = first(data.hits, dt - 0.05); i < data.hits.length; i++) {
    const h = data.hits[i];
    if (h.time > dt + win) break;
    visible.push(h);
  }
  for (let k = visible.length - 1; k >= 0; k--) {
    const h = visible[k];
    const y = yAt(pOf(h.time));
    const sc = 0.25 + 0.75 * ((y - horizon) / (strike - horizon));
    const col = laneColor(layer, h.lane);
    if (h.lane === 'kick') {
      ctx.fillStyle = rgba(col, 0.9);
      const th = Math.max(2, unit * 0.022 * sc);
      const kx0 = xAt(0.02, y);
      const kw = xAt(0.98, y) - kx0;
      ctx.fillRect(kx0, y - th / 2, kw, th);
      G.add((g) => {
        g.fillStyle = col;
        g.globalAlpha = 0.5 + 0.5 * sc;
        g.fillRect(kx0, y - th * 1.5, kw, th * 3);
      });
      continue;
    }
    const c = lanes.indexOf(h.lane);
    if (c < 0) continue;
    const x = xAt((c + 0.5) / cols, y);
    const rx = (wAt(y) / cols) * 0.34;
    const ry = rx * 0.42;
    // tail toward the horizon
    const tailY = yAt(pOf(h.time) - 0.12);
    const tg = ctx.createLinearGradient(0, tailY, 0, y);
    tg.addColorStop(0, rgba(col, 0));
    tg.addColorStop(1, rgba(col, 0.55));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.55, y);
    ctx.lineTo(xAt((c + 0.5) / cols, tailY) - rx * 0.2, tailY);
    ctx.lineTo(xAt((c + 0.5) / cols, tailY) + rx * 0.2, tailY);
    ctx.lineTo(x + rx * 0.55, y);
    ctx.closePath();
    ctx.fill();
    // glassy gem
    const gg = ctx.createRadialGradient(x - rx * 0.25, y - ry * 0.4, 0, x, y, rx);
    gg.addColorStop(0, '#ffffff');
    gg.addColorStop(0.35, col);
    gg.addColorStop(1, rgba(col, 0.6));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    G.add((g) => {
      g.fillStyle = col;
      g.globalAlpha = 0.4 + 0.6 * sc;
      g.beginPath();
      g.ellipse(x, y, rx * 1.35, ry * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    });
  }

  // strike bar, targets, shockwaves and sparks
  const kickHit = recent.get('kick');
  const kickE = kickHit ? Math.max(0, 1 - (dt - kickHit.time) / 0.3) : 0;
  if (hasKick) {
    const kc = laneColor(layer, 'kick');
    const sh = unit * (0.016 + 0.02 * kickE);
    ctx.fillStyle = rgba(kc, 0.55 + 0.45 * kickE);
    ctx.fillRect(xAt(0, strike), strike - unit * 0.008, botW, sh);
    G.add((g) => {
      g.fillStyle = kc;
      g.globalAlpha = 0.5 + 0.5 * kickE;
      const grow = unit * (0.02 + 0.06 * kickE);
      g.fillRect(xAt(0, strike), strike - unit * 0.008 - grow, botW, sh + grow * 2);
    });
  }
  lanes.forEach((lane, c) => {
    const x = xAt((c + 0.5) / cols, strike);
    const r = (botW / cols) * 0.34;
    const col = laneColor(layer, lane);
    const hit = recent.get(lane);
    const age = hit ? dt - hit.time : 9;
    const e = Math.max(0, 1 - age / 0.25);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, r * 0.14);
    const sr = 1 + 0.15 * e;
    ctx.beginPath();
    ctx.ellipse(x, strike, r * sr, r * 0.42 * sr, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (e > 0) {
      ctx.fillStyle = rgba(col, 0.6 * e);
      ctx.fill();
    }
    G.add((g) => {
      g.strokeStyle = col;
      g.fillStyle = col;
      g.globalAlpha = 0.45 + 0.55 * e;
      g.lineWidth = r * (0.3 + 0.3 * e);
      g.beginPath();
      g.ellipse(x, strike, r * sr, r * 0.42 * sr, 0, 0, Math.PI * 2);
      g.stroke();
      if (e > 0) {
        g.globalAlpha = e;
        g.fill();
      }
    });
    if (age < 0.45) {
      // shockwave
      const k = age / 0.45;
      ctx.strokeStyle = rgba(col, 0.8 * (1 - k));
      ctx.lineWidth = Math.max(1, r * 0.08 * (1 - k));
      ctx.beginPath();
      ctx.ellipse(x, strike, r * (1 + k * 1.8), r * 0.42 * (1 + k * 1.8), 0, 0, Math.PI * 2);
      ctx.stroke();
      // sparks
      for (let s = 0; s < 10; s++) {
        const a = -Math.PI * (0.1 + 0.8 * rnd(hit.index * 13 + s));
        const sp = r * (1.2 + 2.2 * rnd(hit.index * 7 + s));
        const sx = x + Math.cos(a) * sp * k;
        const sy = strike + Math.sin(a) * sp * k + r * 1.4 * k * k;
        ctx.fillStyle = rgba(s % 3 ? col : '#ffffff', 1 - k);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, r * 0.07 * (1 - k * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (layer.showLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      let fs = Math.min(unit * 0.045, r * 0.6);
      ctx.font = `800 ${Math.round(fs)}px Inter, system-ui, sans-serif`;
      while (fs > 6 && ctx.measureText(laneLabel(lane).toUpperCase()).width > r * 2) {
        fs *= 0.9;
        ctx.font = `800 ${Math.round(fs)}px Inter, system-ui, sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(laneLabel(lane).toUpperCase(), x, strike + r * 0.6);
    }
  });

  G.flush(0.85);

  // horizon fade so notes emerge from the haze
  const fg = ctx.createLinearGradient(0, horizon, 0, horizon + (strike - horizon) * 0.25);
  fg.addColorStop(0, rgba(C.bg0, 0.9));
  fg.addColorStop(1, rgba(C.bg0, 0));
  ctx.fillStyle = fg;
  ctx.fillRect(bx, horizon - 2, bw, (strike - horizon) * 0.25 + 2);

  // combo counter
  if (layer.showCombo !== false) {
    const combo = first(data.hits, dt + 1e-6) - first(data.hits, shownFrom);
    if (combo > 1) {
      const last = data.hits[first(data.hits, dt + 1e-6) - 1];
      const pulse = last ? Math.max(0, 1 - (dt - last.time) / 0.2) : 0;
      const fs = unit * 0.07 * (1 + 0.15 * pulse);
      ctx.font = `900 ${Math.round(fs)}px "Bebas Neue", Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const label = `×${combo} COMBO`;
      const ty = by + bh * 0.975;
      ctx.lineJoin = 'round';
      for (const [lw, a] of [[fs * 0.3, 0.18], [fs * 0.14, 0.35]]) {
        ctx.strokeStyle = rgba(C.glow, a);
        ctx.lineWidth = lw;
        ctx.strokeText(label, cx, ty);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, cx, ty);
    }
  }
  ctx.restore();
  ctx.strokeStyle = rgba(C.edge, 0.35);
  ctx.lineWidth = Math.max(1, unit * 0.004);
  rrect(ctx, bx, by, bw, bh, unit * 0.06);
  ctx.stroke();
}

// ---- B: light-up drum kit
function drawKit(ctx, W, H, layer, data, dt) {
  const { bw, bh, bx, by } = box(W, H, layer);
  // the hi-hat and ride reach ~0.66 U from the centre, so U <= 0.75 bw keeps the kit inside the box
  const U = Math.min(bw * 0.75, bh * 1.6);
  const cx = bx + bw / 2;
  const P = (fx, fy) => [cx + (fx - 0.5) * U * 1.25, by + bh * fy];
  ctx.save();
  if ((layer.bgOpacity ?? 0) > 0) {
    ctx.fillStyle = rgba(layer.bg, layer.bgOpacity);
    rrect(ctx, bx, by, bw, bh, Math.min(bw, bh) * 0.06);
    ctx.fill();
  }
  const recent = lastHits(data, dt, 0.8);
  const energy = (lane) => {
    const h = recent.get(lane);
    return h ? { e: Math.max(0, Math.exp(-(dt - h.time) * 7)), age: dt - h.time, hit: h } : { e: 0, age: 9, hit: null };
  };
  const L = kitLayout(bx, by, bw, bh, { doubleKick: kitDoubleKick(layer) });
  const colors = Object.fromEntries(LANES.map((l) => [l.id, laneColor(layer, l.id)]));
  if (layer.kitFinish && layer.kitFinish !== 'neon') {
    // double bass: kick hits alternate between the two kicks
    const kickHit = recent.get('kick');
    const kickPiece = kickHit ? kickHit.index % 2 : -1;
    const none = { e: 0, age: 9, hit: null };
    const hitOf = (lane, piece) => {
      if (lane === 'kick' && L.kicks.length > 1 && piece != null) return piece === kickPiece ? energy('kick') : none;
      return energy(lane);
    };
    drawStageKit(ctx, L, layer, hitOf, dt, colors);
  } else {
    // stands
    ctx.strokeStyle = 'rgba(200,200,220,0.35)';
    ctx.lineWidth = Math.max(1, U * 0.006);
    const stand = (x, y1, y2) => {
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();
    };
    const [crx, cry] = [L.crash.x, L.crash.y];
    const [rdx, rdy] = [L.ride.x, L.ride.y];
    const [hhx, hhy] = [L.hihat.x, L.hihat.y];
    stand(crx, cry, by + bh * 0.95);
    stand(rdx, rdy, by + bh * 0.95);
    stand(hhx, hhy, by + bh * 0.95);
    stand(L.crash2.x, L.crash2.y, by + bh * 0.95);
    stand(L.china.x, L.china.y, by + bh * 0.95);

    const G = glowPass(ctx, bx, by, bw, bh, U * 0.04);
    const glowEllipse = (x, y, rx, ry, rot, col, e) =>
      G.add((g) => {
        g.fillStyle = col;
        g.globalAlpha = 0.12 + 0.88 * e;
        g.beginPath();
        g.ellipse(x, y, rx * (1.1 + 0.25 * e), ry * (1.3 + 0.5 * e), rot, 0, Math.PI * 2);
        g.fill();
      });
    const ripple = (x, y, rx, ry, col, age) => {
      if (age > 0.5) return;
      const k = age / 0.5;
      ctx.strokeStyle = rgba(col, 0.8 * (1 - k));
      ctx.lineWidth = Math.max(1, U * 0.006 * (1 - k));
      ctx.beginPath();
      ctx.ellipse(x, y, rx * (1 + k * 0.9), ry * (1 + k * 0.9), 0, 0, Math.PI * 2);
      ctx.stroke();
    };
    const cymbal = (lane, x, y, rx, tilt) => {
      const { e, age } = energy(lane);
      const col = laneColor(layer, lane);
      const swing = e * 10 * Math.sin(age * 22);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((tilt + swing) * Math.PI) / 180);
      glowEllipse(x, y, rx, rx * 0.16, ((tilt + swing) * Math.PI) / 180, col, e);
      const g = ctx.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0, rgba(col, 0.35 + 0.5 * e));
      g.addColorStop(0.5, rgba('#ffffff', 0.25 + 0.6 * e));
      g.addColorStop(1, rgba(col, 0.35 + 0.5 * e));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, rx * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.5);
      ctx.beginPath();
      ctx.ellipse(0, -rx * 0.03, rx * 0.12, rx * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ripple(x, y, rx, rx * 0.16, col, age);
    };
    const METAL = '#c8ccd8';
    // A drum seen from the front and a little above: a lit cylinder (shell) with lugs, a hoop at
    // each end and the head on top. The shell takes a dark wrap tinted by the drum's colour.
    const drum = (lane, x, y, rx, ry, depth, e, age, label) => {
      const col = laneColor(layer, lane);
      const wrap = mixHex(chromeOf(layer).shell, col, 0.35);
      const s = 1 + 0.06 * e;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      // shell body: the sides plus the front half of the bottom edge
      const body = () => {
        ctx.beginPath();
        ctx.moveTo(-rx, 0);
        ctx.lineTo(-rx, depth);
        ctx.ellipse(0, depth, rx, ry, 0, Math.PI, 0, true);
        ctx.lineTo(rx, 0);
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI, false);
        ctx.closePath();
      };
      const sg = ctx.createLinearGradient(-rx, 0, rx, 0);
      sg.addColorStop(0, mixHex(wrap, '#000000', 0.55));
      sg.addColorStop(0.28, mixHex(wrap, '#ffffff', 0.28 + 0.3 * e));
      sg.addColorStop(0.42, wrap);
      sg.addColorStop(0.85, mixHex(wrap, '#000000', 0.35));
      sg.addColorStop(1, mixHex(wrap, '#000000', 0.6));
      ctx.fillStyle = sg;
      body();
      ctx.fill();
      // a thin sheen line down the shell, like a lacquered finish
      ctx.strokeStyle = rgba('#ffffff', 0.18 + 0.3 * e);
      ctx.lineWidth = Math.max(1, rx * 0.04);
      ctx.beginPath();
      ctx.moveTo(-rx * 0.45, ry * 0.9);
      ctx.lineTo(-rx * 0.45, depth + ry * 0.9);
      ctx.stroke();
      // lugs: small chrome blocks around the front of the shell
      const lugs = 5;
      for (let i = 0; i < lugs; i++) {
        const a = Math.PI * (0.12 + (0.76 * i) / (lugs - 1));
        const lx = -Math.cos(a) * rx;
        const ly = Math.sin(a) * ry;
        const w = Math.max(1.5, rx * 0.07 * Math.sin(a));
        const top = depth > ry * 2.2 ? depth * 0.22 : depth * 0.12;
        const len = depth > ry * 2.2 ? depth * 0.56 : depth * 0.76;
        ctx.fillStyle = rgba(METAL, 0.85);
        ctx.fillRect(lx - w / 2, ly + top, w, len);
        ctx.fillStyle = rgba('#ffffff', 0.5);
        ctx.fillRect(lx - w / 2, ly + top, Math.max(0.5, w * 0.35), len);
      }
      // outline in the drum's colour, brighter on a hit
      ctx.strokeStyle = rgba(col, 0.55 + 0.45 * e);
      ctx.lineWidth = Math.max(1.2, U * 0.005);
      body();
      ctx.stroke();
      // bottom hoop (front half)
      ctx.strokeStyle = rgba(METAL, 0.8);
      ctx.lineWidth = Math.max(1.5, ry * 0.22);
      ctx.beginPath();
      ctx.ellipse(0, depth, rx, ry, 0, 0, Math.PI);
      ctx.stroke();
      // head
      glowEllipse(x, y, rx * s, ry * s, 0, col, e);
      const hg = ctx.createRadialGradient(-rx * 0.3, -ry * 0.3, 0, 0, 0, rx);
      hg.addColorStop(0, rgba('#ffffff', 0.35 + 0.6 * e));
      hg.addColorStop(1, rgba(col, 0.3 + 0.6 * e));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // top hoop
      ctx.strokeStyle = rgba(METAL, 0.95);
      ctx.lineWidth = Math.max(1.5, ry * 0.26);
      ctx.stroke();
      ctx.strokeStyle = rgba(col, 0.5 + 0.5 * e);
      ctx.lineWidth = Math.max(1, ry * 0.1);
      ctx.stroke();
      if (label) {
        ctx.fillStyle = rgba('#ffffff', 0.7);
        ctx.font = `700 ${Math.round(U * 0.03)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, depth + ry + U * 0.04);
      }
      ctx.restore();
      ripple(x, y, rx, ry, col, age);
    };
    // hardware under the drums: a tripod for the snare, legs for the floor tom, arms for the rack toms
    const legs = (x, y0, y1, spread) => {
      ctx.strokeStyle = rgba(METAL, 0.45);
      ctx.lineWidth = Math.max(1, U * 0.006);
      ctx.beginPath();
      for (const k of [-1, 0, 1]) {
        ctx.moveTo(x + k * spread * 0.25, y0);
        ctx.lineTo(x + k * spread, y1);
      }
      ctx.stroke();
    };

    // hi-hat: two plates that clap shut on a hit
    {
      const { e, age } = energy('hihat');
      const col = laneColor(layer, 'hihat');
      const gap = U * (0.03 - 0.022 * e);
      for (const dy of [-gap / 2, gap / 2]) {
        ctx.save();
        ctx.translate(hhx, hhy + dy);
        glowEllipse(hhx, hhy + dy, U * 0.1, U * 0.016, 0, col, e);
        ctx.fillStyle = rgba(col, 0.35 + 0.55 * e);
        ctx.beginPath();
        ctx.ellipse(0, 0, U * 0.1, U * 0.016, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ripple(hhx, hhy, U * 0.1, U * 0.016, col, age);
    }
    cymbal('china', L.china.x, L.china.y, L.china.r, L.china.tilt);
    cymbal('crash2', L.crash2.x, L.crash2.y, L.crash2.r, L.crash2.tilt);
    cymbal('crash', crx, cry, L.crash.r, L.crash.tilt);
    cymbal('ride', rdx, rdy, L.ride.r, L.ride.tilt);


    // kick: front-facing bass drum with the band name
    {
      const { e, age } = energy('kick');
      const col = laneColor(layer, 'kick');
      const [kx, ky] = P(0.5, 0.7);
      const r = U * 0.2 * (1 + 0.05 * e);
      ctx.save();
      G.add((g) => {
        g.strokeStyle = col;
        g.globalAlpha = 0.2 + 0.8 * e;
        g.lineWidth = U * (0.03 + 0.04 * e);
        g.beginPath();
        g.arc(kx, ky, r, 0, Math.PI * 2);
        g.stroke();
      });
      // spurs: two legs that keep the kick from rolling
      ctx.strokeStyle = rgba(METAL, 0.55);
      ctx.lineWidth = Math.max(1.5, U * 0.008);
      ctx.beginPath();
      for (const k of [-1, 1]) {
        ctx.moveTo(kx + k * r * 0.8, ky + r * 0.45);
        ctx.lineTo(kx + k * r * 1.18, ky + r * 1.02);
      }
      ctx.stroke();
      // the shell, seen past the hoop: a darker ring with a lit top edge
      const wrap = mixHex(chromeOf(layer).kickShell, col, 0.3);
      const sh = ctx.createLinearGradient(kx, ky - r * 1.06, kx, ky + r * 1.06);
      sh.addColorStop(0, mixHex(wrap, '#ffffff', 0.3 + 0.2 * e));
      sh.addColorStop(0.5, wrap);
      sh.addColorStop(1, mixHex(wrap, '#000000', 0.5));
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(kx, ky, r * 1.06, 0, Math.PI * 2);
      ctx.fill();
      // front head
      ctx.fillStyle = rgba(chromeOf(layer).kickShell, 0.95);
      ctx.beginPath();
      ctx.arc(kx, ky, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // hoop: chrome with the kick's colour inside it
      ctx.lineWidth = Math.max(3, U * 0.014);
      ctx.strokeStyle = rgba(METAL, 0.9);
      ctx.beginPath();
      ctx.arc(kx, ky, r * 0.93, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, U * 0.006);
      ctx.strokeStyle = rgba(col, 0.7 + 0.3 * e);
      ctx.beginPath();
      ctx.arc(kx, ky, r * 0.88, 0, Math.PI * 2);
      ctx.stroke();
      // tension rods and claws around the hoop
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
        const c = Math.cos(a);
        const sn2 = Math.sin(a);
        ctx.strokeStyle = rgba(METAL, 0.85);
        ctx.lineWidth = Math.max(2, U * 0.01);
        ctx.beginPath();
        ctx.moveTo(kx + c * r * 0.91, ky + sn2 * r * 0.91);
        ctx.lineTo(kx + c * r * 1.05, ky + sn2 * r * 1.05);
        ctx.stroke();
      }
      const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, r);
      kg.addColorStop(0, rgba(col, 0.5 * e));
      kg.addColorStop(1, rgba(col, 0.08));
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.arc(kx, ky, r * 0.86, 0, Math.PI * 2);
      ctx.fill();
      if (layer.kickText) {
        let fs = r * 0.32;
        ctx.font = `900 ${Math.round(fs)}px "Bebas Neue", Impact, sans-serif`;
        while (fs > 6 && ctx.measureText(layer.kickText).width > r * 1.6) {
          fs *= 0.9;
          ctx.font = `900 ${Math.round(fs)}px "Bebas Neue", Impact, sans-serif`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba('#ffffff', 0.75 + 0.25 * e);
        ctx.fillText(layer.kickText.toUpperCase(), kx, ky);
        if (e > 0.02) {
          const font = ctx.font;
          G.add((g) => {
            g.font = font;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = col;
            g.globalAlpha = e;
            g.fillText(layer.kickText.toUpperCase(), kx, ky);
          });
        }
      }
      ctx.restore();
      ripple(kx, ky, r, r, col, age);
    }

    // rack toms sit on an arm from the top of the kick; snare and floor tom stand beside it
    const tomHits = KIT_TOMS.map((ln) => energy(ln));
    const tomE = (i) => tomHits[i].e;
    const tomAge = (i) => tomHits[i].age;
    const floor = by + bh * 0.95;
    const [kx0, ky0] = P(0.5, 0.7);
    const kTop = ky0 - U * 0.2 * 1.06;
    // just above the kick's hoop, never higher than the cymbals
    const tomY = Math.max(by + bh * 0.2, Math.min(by + bh * 0.3, kTop - U * (0.09 + 0.032 + 0.012)));
    const [t1x] = P(0.38, 0);
    const [t2x] = P(0.62, 0);
    const t1y = tomY;
    const t2y = tomY;
    {
      const kx = kx0;
      ctx.strokeStyle = rgba(METAL, 0.6);
      ctx.lineWidth = Math.max(1.5, U * 0.009);
      ctx.beginPath();
      ctx.moveTo(kx, kTop + U * 0.01);
      ctx.lineTo(kx, kTop - U * 0.03);
      ctx.lineTo(t1x, t1y + U * 0.1);
      ctx.moveTo(kx, kTop - U * 0.03);
      ctx.lineTo(t2x, t2y + U * 0.1);
      ctx.stroke();
    }
    drum('tom1', t1x, t1y, U * 0.075, U * 0.03, U * 0.085, tomE(0), tomAge(0));
    drum('tom2', t2x, t2y, U * 0.08, U * 0.032, U * 0.09, tomE(1), tomAge(1));
    const [ftx, fty] = P(0.8, 0.56);
    const ftD = U * 0.17;
    legs(ftx, fty + ftD, floor, U * 0.09);
    drum('floor', ftx, fty, U * 0.1, U * 0.04, ftD, tomE(2), tomAge(2), layer.showLabels ? 'TOMS' : '');
    const sn = energy('snare');
    const [snx, sny] = P(0.22, 0.58);
    const snD = U * 0.06;
    legs(snx, sny + snD + U * 0.04, floor, U * 0.08);
    ctx.strokeStyle = rgba(METAL, 0.45);
    ctx.lineWidth = Math.max(1, U * 0.006);
    ctx.beginPath();
    ctx.moveTo(snx, sny + snD + U * 0.04);
    ctx.lineTo(snx, sny + snD);
    ctx.stroke();
    drum('snare', snx, sny, U * 0.095, U * 0.036, snD, sn.e, sn.age, layer.showLabels ? 'SNARE' : '');

    G.flush(0.9);
  }

  // what's coming: a thin strip along the top
  {
    const y = by + bh * 0.04;
    const x0 = bx + bw * 0.06;
    const x1 = bx + bw * 0.94;
    const win = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    rrect(ctx, x0, y - U * 0.008, x1 - x0, U * 0.016, U * 0.008);
    ctx.fill();
    // Blackout keeps the strip in greys too: lighter for cymbals, darker for drums
    const mono = layer.kitFinish === 'blackout';
    const greyOf = (lane) => (['china', 'crash', 'crash2', 'ride', 'hihat'].includes(lane) ? '#d4d4d8' : lane === 'kick' ? '#6e6e74' : '#9e9ea4');
    for (let i = first(data.hits, dt); i < data.hits.length; i++) {
      const h = data.hits[i];
      if (h.time > dt + win) break;
      const x = x0 + ((h.time - dt) / win) * (x1 - x0);
      ctx.fillStyle = mono ? greyOf(h.lane) : laneColor(layer, h.lane);
      ctx.beginPath();
      ctx.arc(x, y, U * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 - 1, y - U * 0.018, Math.max(2, U * 0.005), U * 0.036);
  }
  ctx.restore();
}

// ---- C: glass lanes
function drawGlass(ctx, W, H, layer, data, dt, { beatPeriod }) {
  const { bw, bh, bx, by } = box(W, H, layer);
  const lanes = chartLanes(layer, data);
  const unit = Math.min(bw, bh);
  const radius = unit * 0.14;
  const G = glowPass(ctx, bx, by, bw, bh, unit * 0.05);
  // frosted backdrop: a blurred copy of what is under the panel
  ctx.save();
  rrect(ctx, bx, by, bw, bh, radius);
  ctx.clip();
  frost(ctx, bx, by, bw, bh, Math.max(2, Math.round(unit * 0.08)));
  const sheen = ctx.createLinearGradient(bx, by, bx, by + bh);
  sheen.addColorStop(0, `rgba(255,255,255,${0.16 + (layer.bgOpacity ?? 0.55) * 0.1})`);
  sheen.addColorStop(1, `rgba(255,255,255,${0.04 + (layer.bgOpacity ?? 0.55) * 0.05})`);
  ctx.fillStyle = sheen;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = rgba(layer.bg, (layer.bgOpacity ?? 0.55) * 0.5);
  ctx.fillRect(bx, by, bw, bh);

  const labelW = layer.showLabels ? bw * 0.14 : 0;
  const left = bx + bw * 0.03 + labelW;
  const right = bx + bw * 0.97;
  const top = by + bh * 0.1;
  const rowH = (bh * 0.8) / lanes.length;
  const win = layer.window || 2.2;
  const playX = left + ((right - left) * (layer.playhead ?? 22)) / 100;
  const pps = (right - left) / win;
  const xOf = (time) => playX + (time - dt) * pps;

  // beat / bar grid; the downbeat flashes as it crosses the hit line
  const barLen = (data.bars && data.bars.length && data.bars[0].duration) || (beatPeriod ? beatPeriod * 4 : 2);
  const beat = barLen / 4;
  for (let k = Math.floor((dt - win * 0.3) / beat); k * beat < dt + win; k++) {
    const x = xOf(k * beat);
    if (x < left || x > right) continue;
    const down = k % 4 === 0;
    const near = Math.max(0, 1 - Math.abs(x - playX) / (pps * 0.15));
    ctx.fillStyle = `rgba(255,255,255,${down ? 0.18 + 0.4 * near : 0.07})`;
    ctx.fillRect(x, top, Math.max(1, down ? unit * 0.008 : unit * 0.004), rowH * lanes.length);
  }

  lanes.forEach((lane, i) => {
    const y = top + rowH * (i + 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    rrect(ctx, left, y - rowH * 0.36, right - left, rowH * 0.72, rowH * 0.36);
    ctx.fill();
    if (layer.showLabels) {
      ctx.fillStyle = laneColor(layer, lane);
      ctx.font = `800 ${Math.round(Math.min(unit * 0.07, rowH * 0.42))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(laneLabel(lane).toUpperCase(), bx + bw * 0.03, y);
    }
  });

  // notes: gradient capsules sized by velocity, trails, fade-in on the right
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, by, right - left, bh);
  ctx.clip();
  for (let i = first(data.hits, dt - (playX - left) / pps - 0.3); i < data.hits.length; i++) {
    const h = data.hits[i];
    const x = xOf(h.time);
    if (x > right + 20) break;
    const li = lanes.indexOf(h.lane);
    if (li < 0) continue;
    const y = top + rowH * (li + 0.5);
    const col = laneColor(layer, h.lane);
    const vel = 0.55 + 0.45 * Math.min(1, h.vel ?? 1);
    const hh = rowH * 0.62 * vel;
    const w = Math.max(hh * 1.5, pps * 0.06);
    const passed = h.time < dt;
    const inFade = Math.min(1, (right - x) / ((right - left) * 0.2));
    ctx.globalAlpha = Math.max(0, inFade) * (passed ? Math.max(0.15, 1 - (dt - h.time) / 0.6) : 1);
    // trail (notes move left, so it streams to the right)
    const tg = ctx.createLinearGradient(x, 0, x + w * 2.4, 0);
    tg.addColorStop(0, rgba(col, 0.45));
    tg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = tg;
    rrect(ctx, x, y - hh * 0.3, w * 2.4, hh * 0.6, hh * 0.3);
    ctx.fill();
    const cg = ctx.createLinearGradient(0, y - hh / 2, 0, y + hh / 2);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.45, col);
    cg.addColorStop(1, rgba(col, 0.75));
    ctx.fillStyle = cg;
    rrect(ctx, x - w / 2, y - hh / 2, w, hh, hh / 2);
    ctx.fill();
    const a = ctx.globalAlpha;
    if (x > left && x < right) {
      G.add((g) => {
        g.globalAlpha = a * 0.8;
        g.fillStyle = col;
        rrect(g, x - w / 2, y - hh / 2, w, hh, hh / 2);
        g.fill();
      });
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // hit bursts at the line
  const recent = lastHits(data, dt, 0.35);
  for (const [lane, hit] of recent) {
    const li = lanes.indexOf(lane);
    if (li < 0) continue;
    const y = top + rowH * (li + 0.5);
    const k = (dt - hit.time) / 0.35;
    const col = laneColor(layer, lane);
    const rg = ctx.createRadialGradient(playX, y, 0, playX, y, rowH * (0.6 + k));
    rg.addColorStop(0, rgba(col, 0.7 * (1 - k)));
    rg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(playX - rowH * 2, y - rowH * 2, rowH * 4, rowH * 4);
    ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - k));
    ctx.lineWidth = Math.max(1, rowH * 0.05);
    ctx.beginPath();
    ctx.arc(playX, y, rowH * (0.3 + k * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  }
  // glowing hit line with diamond caps
  const hitLine = (c, lw) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(playX, top - rowH * 0.15);
    c.lineTo(playX, top + rowH * lanes.length + rowH * 0.15);
    c.stroke();
  };
  hitLine(ctx, Math.max(1.5, unit * 0.01));
  G.add((g) => {
    g.globalAlpha = 0.7;
    hitLine(g, unit * 0.025);
  });
  G.flush(0.9);
  ctx.fillStyle = '#ffffff';
  for (const yy of [top - rowH * 0.15, top + rowH * lanes.length + rowH * 0.15]) {
    ctx.beginPath();
    ctx.moveTo(playX, yy - unit * 0.025);
    ctx.lineTo(playX + unit * 0.02, yy);
    ctx.lineTo(playX, yy + unit * 0.025);
    ctx.lineTo(playX - unit * 0.02, yy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // glass edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, unit * 0.008);
  rrect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
  ctx.stroke();
}

const FANCY = { neon: drawNeon, kit: drawKit, glass: drawGlass };
