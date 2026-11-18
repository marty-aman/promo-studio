// Tab Studio's song model: load from a Guitar Pro score, edit it, and save it back as a Guitar Pro 7
// file through alphaTab (model -> AlphaTex -> alphaTab score -> GP7 bytes).
//
// model = { title, tempo, ts: [num, den], tempos: { barIndex: bpm } (tempo changes), tracks: [track] }
// track = { id, name, kind: 'fretted' | 'drums', tuning: [midi, high string first] (fretted only),
//           stemId?: media id of the stem it was transcribed from, bars: [bar] }
// bar   = { beats: [beat] }
// beat  = { dur: 1|2|4|8|16|32, dot: bool, rest: bool, notes: [note] }
// note  = fretted: { s: string (1 = highest), f: fret, tech: { h, sl, b, v, pm, x, g } }
//         drums:   { m: GM drum number }
import { uid } from './core.js';

export const DURATIONS = [1, 2, 4, 8, 16, 32];
export const TECHS = [
  ['h', 'Hammer-on / pull-off', 'H'],
  ['sl', 'Slide', 'S'],
  ['b', 'Bend (full)', 'B'],
  ['v', 'Vibrato', 'V'],
  ['pm', 'Palm mute', 'P'],
  ['x', 'Dead note', 'X'],
  ['g', 'Ghost note', 'G'],
];
export const DRUM_PIECES = [
  [36, 'Kick'], [38, 'Snare'], [42, 'Hi-hat closed'], [46, 'Hi-hat open'], [44, 'Hi-hat pedal'],
  [48, 'High tom'], [45, 'Mid tom'], [41, 'Floor tom'], [49, 'Crash'], [51, 'Ride'], [53, 'Ride bell'], [57, 'Crash 2'],
];
export const TUNINGS = {
  'Guitar · Standard E': [64, 59, 55, 50, 45, 40],
  'Guitar · Drop D': [64, 59, 55, 50, 45, 38],
  'Guitar · Drop C': [62, 57, 53, 48, 43, 36],
  'Guitar · D standard': [62, 57, 53, 48, 43, 38],
  'Guitar · Drop B (7-string feel on 6)': [61, 56, 52, 47, 42, 35],
  'Guitar 7 · Standard B': [64, 59, 55, 50, 45, 40, 35],
  'Bass · Standard E': [43, 38, 33, 28],
  'Bass · Drop D': [43, 38, 33, 26],
  'Bass 5 · Standard B': [43, 38, 33, 28, 23],
};

const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
/** MIDI -> AlphaTex pitch name (e4, a#2…). */
export const texPitch = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** Length of a beat in quarter notes. */
export const beatQuarters = (b) => (4 / b.dur) * (b.dot ? 1.5 : 1);
/** How many quarter notes a bar holds. */
export const barQuarters = (ts) => (ts[0] * 4) / ts[1];
export const barFill = (bar) => bar.beats.reduce((s, b) => s + beatQuarters(b), 0);

export const emptyBeat = (dur = 4) => ({ dur, dot: false, rest: true, notes: [] });
export function emptyBar(ts) {
  // fill with quarter rests (or eighths for x/8 meters)
  const q = barQuarters(ts);
  const dur = ts[1] >= 8 ? 8 : 4;
  return { beats: Array.from({ length: Math.round(q / (4 / dur)) }, () => emptyBeat(dur)) };
}

export function newTrack(kind, { name, tuning, bars = 4, ts = [4, 4] } = {}) {
  return {
    id: uid('trk'),
    name: name || (kind === 'drums' ? 'Drums' : 'Guitar'),
    kind,
    tuning: kind === 'drums' ? null : tuning || TUNINGS['Guitar · Standard E'].slice(),
    bars: Array.from({ length: bars }, () => emptyBar(ts)),
  };
}

export function newSong({ title = 'New tab', tempo = 120, ts = [4, 4] } = {}) {
  return { title, tempo, ts, tempos: {}, tracks: [newTrack('fretted', { name: 'Guitar', ts })] };
}

// ------------------------------------------------------------ load from alphaTab

const durOf = (d) => (DURATIONS.includes(d) ? d : d > 32 ? 32 : 4);

/** alphaTab Score -> model. Written bars in order (repeats are not expanded). */
export function fromScore(score) {
  const mb0 = score.masterBars[0];
  const model = { title: score.title || 'Tab', tempo: Math.round(score.tempo || 120), ts: [mb0 ? mb0.timeSignatureNumerator : 4, mb0 ? mb0.timeSignatureDenominator : 4], tempos: {}, tracks: [] };
  score.masterBars.forEach((mb, i) => {
    const autos = mb.tempoAutomations || (mb.tempoAutomation ? [mb.tempoAutomation] : []);
    const a = autos[0];
    if (a && i > 0 && Math.round(a.value) !== model.tempo) model.tempos[i] = Math.round(a.value);
  });
  score.tracks.forEach((tr) => {
    const staff = tr.staves.find((s) => s.isPercussion) || tr.staves.find((s) => s.tuning && s.tuning.length) || tr.staves[0];
    if (!staff) return;
    const drums = !!staff.isPercussion;
    const arts = tr.percussionArticulations || [];
    const strings = drums ? 0 : staff.tuning.length;
    const track = { id: uid('trk'), name: tr.name || (drums ? 'Drums' : 'Track'), kind: drums ? 'drums' : 'fretted', tuning: drums ? null : [...staff.tuning], bars: [] };
    for (const bar of staff.bars) {
      const v = bar.voices[0];
      const beats = (v ? v.beats : []).filter((b) => !b.isEmpty || b.isRest).map((b) => {
        const beat = { dur: durOf(b.duration), dot: (b.dots || 0) > 0, rest: b.isRest || !b.notes.length, notes: [] };
        if (!beat.rest) {
          beat.notes = b.notes.map((n) => {
            if (drums) {
              const a = arts[n.percussionArticulation];
              return { m: a ? a.outputMidiNumber : n.percussionArticulation };
            }
            const tech = {};
            if (n.isHammerPullOrigin) tech.h = true;
            if (n.slideOutType > 0) tech.sl = true;
            if (n.hasBend || (n.bendPoints && n.bendPoints.length)) tech.b = true;
            if (n.vibrato > 0) tech.v = true;
            if (n.isPalmMute || b.isPalmMute) tech.pm = true;
            if (n.isDead) tech.x = true;
            if (n.isGhost) tech.g = true;
            return { s: strings - n.string + 1, f: n.fret, tech };
          });
        }
        return beat;
      });
      track.bars.push({ beats: beats.length ? beats : emptyBar(model.ts).beats });
    }
    model.tracks.push(track);
  });
  return model;
}

// ------------------------------------------------------------ save

const texString = (s) => `"${String(s || '').replace(/["\\]/g, '')}"`;

function texFretted(beat) {
  if (beat.rest || !beat.notes.length) return `r.${beat.dur}${beat.dot ? '{d}' : ''}`;
  const notes = beat.notes
    .slice()
    .sort((a, b) => a.s - b.s)
    .map((n) => {
      const fx = [];
      if (n.tech.h) fx.push('h');
      if (n.tech.sl) fx.push('sl');
      if (n.tech.b) fx.push('b (0 4)');
      if (n.tech.v) fx.push('v');
      if (n.tech.pm) fx.push('pm');
      if (n.tech.g) fx.push('g');
      return `${n.tech.x ? 'x' : Math.max(0, Math.round(n.f))}.${n.s}${fx.length ? `{${fx.join(' ')}}` : ''}`;
    });
  const body = notes.length === 1 ? notes[0] : `(${notes.join(' ')})`;
  return `${body}.${beat.dur}${beat.dot ? '{d}' : ''}`;
}

/** Drum beats use ":dur" prefixes and bare GM numbers; a dotted beat becomes the beat plus a rest. */
function texDrumBar(bar) {
  const out = [];
  let cur = 0;
  const push = (dur, body) => {
    if (dur !== cur) {
      out.push(`:${dur}`);
      cur = dur;
    }
    out.push(body);
  };
  for (const b of bar.beats) {
    const body = b.rest || !b.notes.length ? 'r' : b.notes.length === 1 ? String(b.notes[0].m) : `(${b.notes.map((n) => n.m).join(' ')})`;
    push(b.dur, body);
    if (b.dot && b.dur < 32) push(b.dur * 2, 'r');
  }
  return out.join(' ');
}

const barHead = (model, i) => `${i === 0 ? `\\ts ${model.ts[0]} ${model.ts[1]} ` : ''}${model.tempos && model.tempos[i] ? `\\tempo ${Math.round(model.tempos[i])} ` : ''}`;

/** model -> AlphaTex source. */
export function toAlphaTex(model) {
  const lines = [`\\title ${texString(model.title)} \\tempo ${Math.round(model.tempo)} .`];
  model.tracks.forEach((t) => {
    if (t.kind === 'drums') {
      lines.push(`\\track ${texString(t.name)} \\instrument percussion`);
      lines.push(t.bars.map((bar, i) => `${barHead(model, i)}${texDrumBar(bar)}`).join(' | ') + ' |');
    } else {
      lines.push(`\\track ${texString(t.name)}`);
      lines.push(`\\tuning (${t.tuning.map(texPitch).join(' ')})`);
      lines.push(t.bars.map((bar, i) => `${barHead(model, i)}${bar.beats.map(texFretted).join(' ')}`).join(' | ') + ' |');
    }
  });
  return lines.join('\n');
}

let atPromise = null;
const alphaTab = () => (atPromise ||= import('../vendor/alphatab/alphaTab.core.min.mjs'));

/** model -> Guitar Pro 7 bytes (Uint8Array). Throws with the parser's first message on bad input. */
export async function toGpBytes(model) {
  const at = await alphaTab();
  const settings = new at.Settings();
  const imp = new at.importer.AlphaTexImporter();
  imp.initFromString(toAlphaTex(model), settings);
  let score;
  try {
    score = imp.readScore();
  } catch (e) {
    const items = [...((e.semanticDiagnostics && e.semanticDiagnostics.items) || []), ...((e.parserDiagnostics && e.parserDiagnostics.items) || [])].filter((d) => d.severity > 0);
    throw new Error(items.length ? `Could not save the tab: ${items[0].message}` : `Could not save the tab: ${e.message}`);
  }
  return new at.exporter.Gp7Exporter().export(score, settings);
}

// ------------------------------------------------------------ edits (all mutate the model in place)

const clampFret = (f) => Math.max(0, Math.min(24, Math.round(f)));
export const beatAt = (track, bi, ki) => track.bars[bi] && track.bars[bi].beats[ki];

/** Set the fret on string `s` at a beat (adds the note; turns a rest into a note). */
export function setFret(track, bi, ki, s, fret) {
  const b = beatAt(track, bi, ki);
  if (!b || track.kind !== 'fretted' || s < 1 || s > track.tuning.length) return;
  const n = b.notes.find((x) => x.s === s);
  if (n) n.f = clampFret(fret);
  else b.notes.push({ s, f: clampFret(fret), tech: {} });
  b.rest = false;
}

/** Remove the note on string `s` (or the drum piece `m`); an empty beat becomes a rest. */
export function clearNote(track, bi, ki, key) {
  const b = beatAt(track, bi, ki);
  if (!b) return;
  b.notes = b.notes.filter((n) => (track.kind === 'drums' ? n.m !== key : n.s !== key));
  if (!b.notes.length) b.rest = true;
}

export function toggleDrum(track, bi, ki, m) {
  const b = beatAt(track, bi, ki);
  if (!b || track.kind !== 'drums') return;
  if (b.notes.some((n) => n.m === m)) clearNote(track, bi, ki, m);
  else {
    b.notes.push({ m });
    b.rest = false;
  }
}

export function toggleTech(track, bi, ki, s, key) {
  const b = beatAt(track, bi, ki);
  const n = b && b.notes.find((x) => x.s === s);
  if (!n) return false;
  n.tech[key] = !n.tech[key];
  if (!n.tech[key]) delete n.tech[key];
  return true;
}

/** Change a beat's length; returns false when the bar would overflow. */
export function setDuration(track, bi, ki, dur, ts) {
  const bar = track.bars[bi];
  const b = bar && bar.beats[ki];
  if (!b || !DURATIONS.includes(dur)) return false;
  const before = { dur: b.dur };
  b.dur = dur;
  if (barFill(bar) > barQuarters(ts) + 1e-9) {
    b.dur = before.dur;
    return false;
  }
  return true;
}

export function toggleDot(track, bi, ki, ts) {
  const bar = track.bars[bi];
  const b = bar && bar.beats[ki];
  if (!b) return false;
  b.dot = !b.dot;
  if (barFill(bar) > barQuarters(ts) + 1e-9) {
    b.dot = false;
    return false;
  }
  return true;
}

export function toggleRest(track, bi, ki) {
  const b = beatAt(track, bi, ki);
  if (!b) return;
  b.rest = !b.rest;
  if (b.rest) b.notes = [];
}

/** Insert a beat after `ki` (same length), or split the beat when the bar is full. Returns its index. */
export function insertBeat(track, bi, ki, ts) {
  const bar = track.bars[bi];
  if (!bar) return ki;
  const cur = bar.beats[ki] || bar.beats[bar.beats.length - 1];
  const room = barQuarters(ts) - barFill(bar);
  let dur = cur ? cur.dur : 4;
  if (room + 1e-9 < 4 / dur && cur && cur.dur < 32) {
    // no room: split the current beat in two
    cur.dur *= 2;
    cur.dot = false;
    dur = cur.dur;
  } else if (room + 1e-9 < 4 / dur) return ki;
  bar.beats.splice(ki + 1, 0, emptyBeat(dur));
  return ki + 1;
}

export function deleteBeat(track, bi, ki) {
  const bar = track.bars[bi];
  if (!bar || bar.beats.length <= 1) {
    if (bar) bar.beats[0] = emptyBeat(bar.beats[0] ? bar.beats[0].dur : 4);
    return 0;
  }
  bar.beats.splice(ki, 1);
  return Math.min(ki, bar.beats.length - 1);
}

/** Fill a short bar with rests up to the time signature. */
export function padBar(bar, ts) {
  let room = barQuarters(ts) - barFill(bar);
  for (const d of [1, 2, 4, 8, 16, 32]) {
    while (room + 1e-9 >= 4 / d) {
      bar.beats.push(emptyBeat(d));
      room -= 4 / d;
    }
  }
}

/** Add `n` empty bars to every track after bar `at` (so tracks stay aligned). */
/** Shift tempo changes when bars are added (n > 0) or removed (n < 0) at `at`. */
function shiftTempos(model, at, n) {
  const next = {};
  for (const [k, v] of Object.entries(model.tempos || {})) {
    const i = Number(k);
    if (i <= at) next[i] = v;
    else if (n > 0 || i > at - n - 1) next[i + n] = v;
  }
  model.tempos = next;
}

export function insertBars(model, at, n = 1) {
  for (const t of model.tracks) for (let i = 0; i < n; i++) t.bars.splice(at + 1, 0, emptyBar(model.ts));
  shiftTempos(model, at, n);
}

export function deleteBar(model, at) {
  if (model.tracks[0].bars.length <= 1) return;
  for (const t of model.tracks) t.bars.splice(at, 1);
  const tempos = {};
  for (const [k, v] of Object.entries(model.tempos || {})) {
    const i = Number(k);
    if (i < at) tempos[i] = v;
    else if (i > at) tempos[i - 1] = v;
  }
  model.tempos = tempos;
}

/** Make all tracks the same number of bars (the longest). */
export function alignTracks(model) {
  const n = Math.max(1, ...model.tracks.map((t) => t.bars.length));
  for (const t of model.tracks) while (t.bars.length < n) t.bars.push(emptyBar(model.ts));
}

/** Problems that would make the file wrong: [{ track, bar, message }]. */
export function checkModel(model) {
  const out = [];
  const q = barQuarters(model.ts);
  model.tracks.forEach((t) =>
    t.bars.forEach((bar, bi) => {
      const f = barFill(bar);
      if (f > q + 1e-9) out.push({ track: t.name, bar: bi + 1, message: `bar ${bi + 1} of ${t.name} is too long` });
      else if (f < q - 1e-9) out.push({ track: t.name, bar: bi + 1, message: `bar ${bi + 1} of ${t.name} is short (rests will be added)`, short: true });
    }),
  );
  return out;
}

// ------------------------------------------------------------ playback

/** Pitch (MIDI) of a fretted note. */
export const notePitch = (track, n) => track.tuning[n.s - 1] + n.f;

/**
 * Timed events for playback and the cursor: [{ time, dur, bar, beat, track, notes }], plus bar times.
 */
/** Start time and seconds-per-quarter of every bar, following tempo changes. */
export function barTimes(model) {
  const bars = Math.max(0, ...model.tracks.map((t) => t.bars.length));
  const out = [];
  let time = 0;
  let bpm = model.tempo || 120;
  for (let i = 0; i < bars; i++) {
    if (model.tempos && model.tempos[i]) bpm = model.tempos[i];
    const spq = 60 / Math.max(20, bpm);
    out.push({ time, spq, bpm });
    time += barQuarters(model.ts) * spq;
  }
  return { bars: out, duration: time };
}

export function schedule(model) {
  const { bars, duration } = barTimes(model);
  const events = [];
  model.tracks.forEach((t, ti) => {
    t.bars.forEach((bar, bi) => {
      const { time, spq } = bars[bi];
      let q = 0;
      bar.beats.forEach((b, ki) => {
        const dur = beatQuarters(b) * spq;
        if (!b.rest && b.notes.length) events.push({ time: time + q * spq, dur, bar: bi, beat: ki, track: ti, notes: b.notes });
        q += beatQuarters(b);
      });
    });
  });
  events.sort((a, b) => a.time - b.time);
  return { events, bars, duration };
}

/** The beat a time falls in for one track: { bar, beat } (clamped). */
export function beatAtTime(model, ti, time) {
  const { bars } = barTimes(model);
  const t = model.tracks[ti];
  let bi = 0;
  while (bi < t.bars.length - 1 && bars[bi + 1] && bars[bi + 1].time <= time) bi++;
  let q = (time - bars[bi].time) / bars[bi].spq;
  const beats = t.bars[bi].beats;
  for (let k = 0; k < beats.length; k++) {
    q -= beatQuarters(beats[k]);
    if (q < 1e-9) return { bar: bi, beat: k };
  }
  return { bar: bi, beat: beats.length - 1 };
}
