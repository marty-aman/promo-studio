// Guitar Pro tab layer: parse with alphaTab (lazy-loaded), lay the notes out on a tempo-mapped
// timeline (repeats and alternate endings expanded), and draw a scrolling tab staff on the canvas.

const TICKS_PER_QUARTER = 960;
import { TAB_FANCY } from './tabviz.js';
export const TAB_EXTENSIONS = /\.(gp|gp3|gp4|gp5|gpx|gp7|gp8|musicxml|mxl|xml)$/i;

let alphaTabPromise = null;
function alphaTab() {
  alphaTabPromise ||= import('../vendor/alphatab/alphaTab.core.min.mjs');
  return alphaTabPromise;
}

/** Parse Guitar Pro (or MusicXML) bytes into an alphaTab Score. */
export async function parseTabBytes(bytes) {
  const at = await alphaTab();
  const settings = new at.Settings();
  return at.importer.ScoreLoader.loadScoreFromBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), settings);
}

/** Tracks that have a fretted staff (skips drums and piano-only staves). */
export function tabTracks(score) {
  return score.tracks
    .map((tr, index) => {
      const staff = tr.staves.find((s) => !s.isPercussion && s.tuning && s.tuning.length > 0);
      return staff ? { index, name: tr.name || `Track ${index + 1}`, strings: staff.tuning.length, tuning: tuningNames(staff.tuning) } : null;
    })
    .filter(Boolean);
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// interval sets (semitones above the root) -> suffix; checked in this order
const CHORD_SHAPES = [
  [[0, 4, 7], ''],
  [[0, 3, 7], 'm'],
  [[0, 7], '5'],
  [[0, 4, 7, 10], '7'],
  [[0, 3, 7, 10], 'm7'],
  [[0, 4, 7, 11], 'maj7'],
  [[0, 2, 7], 'sus2'],
  [[0, 5, 7], 'sus4'],
  [[0, 5, 7, 10], '7sus4'],
  [[0, 2, 4, 7], 'add9'],
  [[0, 2, 3, 7], 'm(add9)'],
  [[0, 4, 7, 9], '6'],
  [[0, 3, 7, 9], 'm6'],
  [[0, 3, 6], 'dim'],
  [[0, 3, 6, 9], 'dim7'],
  [[0, 3, 6, 10], 'm7b5'],
  [[0, 4, 8], 'aug'],
  [[0, 4, 7, 10, 2], '9'],
  [[0, 3, 7, 10, 2], 'm9'],
];

/**
 * Name the chord formed by MIDI pitches, e.g. [40, 47, 52, 55, 59, 64] -> "Em".
 * Tries the lowest note as the root first, then the others (giving slash chords like "C/G").
 * Returns null for single notes and shapes it doesn't know.
 */
export function chordName(pitches) {
  const ps = (pitches || []).filter((m) => Number.isFinite(m));
  if (ps.length < 2) return null;
  const pcs = [...new Set(ps.map((m) => ((m % 12) + 12) % 12))];
  if (pcs.length < 2) return null;
  const bass = ((Math.min(...ps) % 12) + 12) % 12;
  const roots = [bass, ...pcs.filter((p) => p !== bass)];
  for (const root of roots) {
    const iv = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    const hit = CHORD_SHAPES.find(([set]) => set.length === iv.length && [...set].sort((a, b) => a - b).every((x, i) => x === iv[i]));
    if (hit) return CHORD_ROOTS[root] + hit[1] + (root === bass ? '' : `/${CHORD_ROOTS[bass]}`);
  }
  return null;
}

/** A track that looks like a bass: named "bass", or 4-5 strings. */
export function isBassTrack(track) {
  return !!track && (/bass/i.test(track.name || '') || (track.strings >= 4 && track.strings <= 5));
}
/** MIDI tuning (highest string first) -> labels like ["e","B","G","D","A","E"]. */
export function tuningNames(tuning) {
  const names = tuning.map((m) => NAMES[((m % 12) + 12) % 12]);
  const low = names[names.length - 1];
  if (names[0] === low) names[0] = names[0].toLowerCase();
  return names;
}

/**
 * Bar playback order with repeats and alternate endings expanded.
 * bars: [{ isRepeatStart, repeatCount, alternateEndings }]
 */
export function playbackOrder(bars, limit = 4000) {
  const order = [];
  let i = 0;
  let repeatStart = 0;
  let pass = 1;
  let justJumped = false;
  while (i < bars.length && order.length < limit) {
    const mb = bars[i];
    if (mb.isRepeatStart && !justJumped) {
      repeatStart = i;
      pass = 1;
    }
    justJumped = false;
    if (mb.alternateEndings && !(mb.alternateEndings & (1 << (pass - 1)))) {
      // this ending is for another pass; skip it unless it closes the repeat on the last pass
      i += 1;
      continue;
    }
    order.push(i);
    if (mb.repeatCount > 0 && pass < mb.repeatCount) {
      pass += 1;
      i = repeatStart;
      justJumped = true;
      continue;
    }
    if (mb.repeatCount > 0) {
      pass = 1;
      repeatStart = i + 1;
    }
    i += 1;
  }
  return order;
}

/** Seconds for `ticks` inside a bar that starts at `bpm` and has tempo changes `autos` [{ratio, bpm}]. */
function barTiming(barTicks, startBpm, autos) {
  const segs = [];
  let bpm = startBpm;
  let lastTick = 0;
  for (const a of [...autos].sort((x, y) => x.ratio - y.ratio)) {
    const tick = Math.round(a.ratio * barTicks);
    if (tick > lastTick) segs.push({ from: lastTick, to: tick, bpm });
    bpm = a.bpm;
    lastTick = Math.max(lastTick, tick);
  }
  segs.push({ from: lastTick, to: barTicks, bpm });
  const secPerTick = (b) => 60 / (b * TICKS_PER_QUARTER);
  const at = (tick) => {
    let s = 0;
    for (const seg of segs) {
      if (tick <= seg.from) break;
      s += (Math.min(tick, seg.to) - seg.from) * secPerTick(seg.bpm);
    }
    return s;
  };
  return { at, endBpm: bpm, duration: at(barTicks) };
}

/**
 * Walk one staff in playback order (repeats expanded, tempo changes applied) and report each
 * sounding beat with its time. Shared by the guitar tab and the drum chart.
 * Returns { staff, bars: [{time, duration, index}], beats: [{time, dur, bar, beat}], duration }.
 */
export function timedBeats(score, staff) {
  const masterBars = score.masterBars;
  const order = playbackOrder(masterBars);
  let bpm = score.tempo || 120;
  let time = 0;
  const bars = [];
  const beats = [];
  for (const mbIndex of order) {
    const mb = masterBars[mbIndex];
    const ticks = mb.calculateDuration();
    const autos = (mb.tempoAutomations || (mb.tempoAutomation ? [mb.tempoAutomation] : [])).map((a) => ({ ratio: a.ratioPosition || 0, bpm: a.value }));
    const timing = barTiming(ticks, bpm, autos);
    bars.push({ time, duration: timing.duration, index: mbIndex });
    const bar = staff.bars[mbIndex];
    if (bar) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          if (beat.isEmpty || beat.isRest || !beat.notes.length) continue;
          const start = time + timing.at(beat.playbackStart);
          const end = time + timing.at(Math.min(ticks, beat.playbackStart + beat.playbackDuration));
          beats.push({ time: +start.toFixed(4), dur: +Math.max(0.03, end - start).toFixed(4), bar: mbIndex, beat });
        }
      }
    }
    time += timing.duration;
    bpm = timing.endBpm;
  }
  beats.sort((a, b) => a.time - b.time);
  return { bars, beats, duration: time };
}

/**
 * Flatten one track into timed events.
 * Returns { strings, tuning, bars: [{time, duration, index}], events: [{time, dur, notes:[{line, fret, ...}]}], duration, tempo }.
 */
export function buildTabTimeline(score, trackIndex = 0) {
  const track = score.tracks[trackIndex] || score.tracks[0];
  const staff = track.staves.find((s) => !s.isPercussion && s.tuning && s.tuning.length) || track.staves[0];
  const strings = staff.tuning.length || 6;
  const { bars, beats, duration } = timedBeats(score, staff);
  const tuningMidi = [...staff.tuning];
  const capo = staff.capo || 0;
  const events = beats.map(({ time, dur, bar, beat }) => ({
    time,
    dur,
    bar,
    palmMute: !!beat.isPalmMute,
    chord: (beat.chord && beat.chord.name) || chordName(beat.notes.filter((n) => !n.isDead).map((n) => (tuningMidi[strings - n.string] ?? NaN) + capo + n.fret)),
    notes: beat.notes.map((n) => ({
      line: Math.max(0, Math.min(strings - 1, strings - n.string)),
      fret: n.fret,
      tie: !!n.isTieDestination,
      dead: !!n.isDead,
      ghost: !!n.isGhost,
      harmonic: !!(n.harmonicType && n.harmonicType > 0),
      hammer: !!n.isHammerPullOrigin,
      slide: !!(n.slideOutType && n.slideOutType > 0),
      bend: !!(n.hasBend || (n.bendPoints && n.bendPoints.length)),
      vibrato: !!(n.vibrato && n.vibrato > 0),
      palmMute: !!n.isPalmMute || !!beat.isPalmMute,
    })),
  }));
  return { name: track.name, strings, tuning: tuningNames(staff.tuning), tuningMidi, bars, events, duration, tempo: score.tempo };
}

// ------------------------------------------------------------ drawing

export function defaultTabLayer() {
  return {
    mediaId: null,
    track: 0,
    offset: 0, // song time (s) where the tab's first beat plays
    tempoScale: 1,
    start: 0, // visible from (timeline s)
    end: null, // visible until (timeline s); null = until the end card
    mode: 'scroll', // scroll | bars
    window: 2.5, // seconds visible in scroll mode
    playhead: 25, // % of the width
    barsPerPage: 2,
    x: 50,
    y: 30,
    width: 92,
    height: 16, // % of frame height for the staff box
    bg: '#000000',
    bgOpacity: 0.55,
    lineColor: '#ffffff',
    numColor: '#ffffff',
    hiColor: '#ffd400',
    showTuning: true,
    showMarks: true,
    font: 'Inter',
    style: 'tab', // tab | highway | neck | strings (see TAB_STYLES)
    showChords: true,
    showStrip: true, // light-up neck: strip of upcoming notes
  };
}

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

function rgba(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(0,0,0,${a})`;
}

/** Binary search: index of the first event with time >= t. */
function firstAtOrAfter(events, t) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Draw the tab layer. `tl` is the built timeline, `t` timeline time, `songTime` song time,
 * `visibleEnd` the default end (start of the end card).
 */
export function drawTab(ctx, W, H, layer, tl, t, songTime, visibleEnd) {
  if (!tl) return;
  const end = layer.end ?? visibleEnd;
  if (t < (layer.start || 0) || t >= end) return;
  const fade = Math.min(1, (t - (layer.start || 0)) / 0.3, (end - t) / 0.3);
  const tabT = (songTime - layer.offset) * (layer.tempoScale || 1);
  if (TAB_FANCY[layer.style]) {
    ctx.save();
    ctx.globalAlpha *= Math.max(0, fade);
    TAB_FANCY[layer.style](ctx, W, H, layer, tl, tabT);
    ctx.restore();
    return;
  }
  const bw = (W * layer.width) / 100;
  const bh = (H * layer.height) / 100;
  const bx = (W * layer.x) / 100 - bw / 2;
  const by = (H * layer.y) / 100 - bh / 2;
  const padX = bw * 0.03;
  const labelW = layer.showTuning ? bh * 0.16 : 0;
  const top = by + bh * 0.16;
  const bottom = by + bh * 0.84;
  const gap = (bottom - top) / Math.max(1, tl.strings - 1);
  const fontPx = Math.max(6, gap * 0.82);
  const left = bx + padX + labelW;
  const right = bx + bw - padX;

  ctx.save();
  ctx.globalAlpha *= Math.max(0, fade);
  ctx.fillStyle = rgba(layer.bg, layer.bgOpacity);
  rrect(ctx, bx, by, bw, bh, bh * 0.08);
  ctx.fill();

  // strings
  ctx.strokeStyle = rgba(layer.lineColor, 0.55);
  ctx.lineWidth = Math.max(1, gap * 0.05);
  for (let s = 0; s < tl.strings; s++) {
    const y = top + s * gap;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  if (layer.showTuning) {
    ctx.fillStyle = rgba(layer.lineColor, 0.8);
    ctx.font = `700 ${Math.round(fontPx * 0.75)}px ${layer.font}, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    tl.tuning.forEach((n, s) => ctx.fillText(n, bx + padX + labelW / 2, top + s * gap));
  }

  // map tab time -> x
  let xOf;
  let from;
  let to;
  let cursorX = null;
  if (layer.mode === 'bars') {
    const per = Math.max(1, layer.barsPerPage || 2);
    let bi = tl.bars.findIndex((b) => tabT >= b.time && tabT < b.time + b.duration);
    if (bi < 0) bi = tabT < 0 ? 0 : tl.bars.length - 1;
    const page = Math.floor(bi / per) * per;
    const pageBars = tl.bars.slice(page, page + per);
    if (!pageBars.length) {
      ctx.restore();
      return;
    }
    from = pageBars[0].time;
    to = pageBars[pageBars.length - 1].time + pageBars[pageBars.length - 1].duration;
    const inner = (right - left) * 0.96;
    const x0 = left + (right - left) * 0.02;
    xOf = (time) => x0 + ((time - from) / (to - from)) * inner;
    if (tabT >= from && tabT <= to) cursorX = xOf(tabT);
  } else {
    const pxPerSec = (right - left) / Math.max(0.5, layer.window || 4);
    const playX = left + ((right - left) * (layer.playhead ?? 25)) / 100;
    xOf = (time) => playX + (time - tabT) * pxPerSec;
    from = tabT - (playX - left) / pxPerSec - 0.5;
    to = tabT + (right - playX) / pxPerSec + 0.5;
    cursorX = playX;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, by, right - left, bh);
  ctx.clip();

  // bar lines
  ctx.strokeStyle = rgba(layer.lineColor, 0.35);
  for (const b of tl.bars) {
    if (b.time < from - 0.1 || b.time > to + 0.1) continue;
    const x = xOf(b.time);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  // notes
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let i = firstAtOrAfter(tl.events, from - 2); i < tl.events.length; i++) {
    const ev = tl.events[i];
    if (ev.time > to) break;
    const x = xOf(ev.time);
    const active = tabT >= ev.time && tabT < ev.time + Math.max(ev.dur, 0.12);
    const played = tabT >= ev.time + ev.dur;
    if (ev.palmMute && layer.showMarks) {
      ctx.fillStyle = rgba(layer.numColor, 0.75);
      ctx.font = `700 ${Math.round(fontPx * 0.55)}px ${layer.font}, system-ui, sans-serif`;
      ctx.fillText('PM', x, by + bh * 0.08);
    }
    for (const n of ev.notes) {
      const y = top + n.line * gap;
      let label = n.dead ? 'x' : String(n.fret);
      if (n.harmonic) label = `<${label}>`;
      if (n.ghost || n.tie) label = `(${label})`;
      const scale = active ? 1.25 : 1;
      ctx.font = `700 ${Math.round(fontPx * scale)}px ${layer.font}, system-ui, sans-serif`;
      // knock the string line out behind the number
      ctx.strokeStyle = rgba(layer.bg, Math.min(1, layer.bgOpacity + 0.35));
      ctx.lineWidth = fontPx * 0.35;
      ctx.strokeText(label, x, y);
      if (active) {
        ctx.shadowColor = layer.hiColor;
        ctx.shadowBlur = fontPx * 0.6;
      }
      ctx.fillStyle = active ? layer.hiColor : rgba(layer.numColor, played && layer.mode !== 'bars' ? 0.55 : 1);
      ctx.fillText(label, x, y);
      ctx.shadowBlur = 0;
      if (layer.showMarks) {
        const w = ctx.measureText(label).width;
        ctx.font = `700 ${Math.round(fontPx * 0.6)}px ${layer.font}, system-ui, sans-serif`;
        ctx.fillStyle = rgba(layer.numColor, 0.8);
        const mark = n.hammer ? 'h' : n.slide ? '/' : n.bend ? '↗' : n.vibrato ? '~' : '';
        if (mark) ctx.fillText(mark, x + w / 2 + fontPx * 0.35, y - gap * 0.35);
      }
    }
  }
  ctx.restore();

  // cursor
  if (cursorX != null) {
    ctx.strokeStyle = layer.hiColor;
    ctx.lineWidth = Math.max(1.5, gap * 0.09);
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.moveTo(cursorX, by + bh * 0.06);
    ctx.lineTo(cursorX, by + bh * 0.94);
    ctx.stroke();
  }
  ctx.restore();
}
