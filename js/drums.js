// Drum chart layer: hits from a Guitar Pro drum track or detected from a drum stem,
// drawn as scrolling lanes, a falling "highway", or a circle that sweeps once per bar.
import { timedBeats } from './tab.js';
import { energyEnvelope } from './core.js';

export const LANES = [
  { id: 'crash', label: 'Crash', color: '#ff8c42' },
  { id: 'ride', label: 'Ride', color: '#5eead4' },
  { id: 'hihat', label: 'Hi-hat', color: '#4dd2ff' },
  { id: 'tom', label: 'Toms', color: '#a78bfa' },
  { id: 'snare', label: 'Snare', color: '#ffd400' },
  { id: 'kick', label: 'Kick', color: '#ff4d6d' },
];

/** General MIDI drum number -> lane id (null for sounds we do not chart). */
export function midiToLane(m) {
  if (m === 35 || m === 36) return 'kick';
  if (m >= 37 && m <= 40) return 'snare';
  if (m === 42 || m === 44 || m === 46) return 'hihat';
  if ([41, 43, 45, 47, 48, 50].includes(m)) return 'tom';
  if ([49, 52, 55, 57].includes(m)) return 'crash';
  if ([51, 53, 59].includes(m)) return 'ride';
  return null;
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
  const fade = Math.min(1, (t - (layer.start || 0)) / 0.3, (end - t) / 0.3);
  const dt = (songTime - layer.offset) * (layer.tempoScale || 1);
  const lanes = data.lanes.length ? data.lanes : ['kick', 'snare', 'hihat'];
  const color = (id) => (layer.colors && layer.colors[id]) || (LANES.find((l) => l.id === id) || {}).color || '#fff';
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
