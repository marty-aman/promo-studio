// Tab from stems: turn an isolated stem into a Tab Studio track you can then fix by hand.
//  - single-note parts (bass, lead guitar): YIN pitch tracking -> notes -> quantised to the beat ->
//    strings and frets picked to keep the hand in one position
//  - chords (rhythm guitar): pitch-class energy per beat -> chord name -> a power-chord shape on the
//    low strings (exact voicings can't be heard reliably from a mixed stem)
//  - drums: kick / snare / hi-hat onsets (the drum chart's detector) -> a percussion track
// Accuracy is best on a clean, isolated stem. Everything here is pure except decodeStem().
import { fft } from './viz.js';
import { energyEnvelope, detectBeats } from './core.js';
import { emptyBeat, barQuarters, TUNINGS } from './tabedit.js';

export const TRANSCRIBE_KINDS = [
  ['bass', 'Bass line (single notes)'],
  ['lead', 'Lead guitar / riff (single notes)'],
  ['rhythm', 'Rhythm guitar (chords → power chords)'],
  ['drums', 'Drums (kick, snare, hi-hat)'],
];

export const midiOf = (f) => 69 + 12 * Math.log2(f / 440);

// ------------------------------------------------------------ pitch

/**
 * YIN fundamental estimate for one frame. Returns { freq, conf } (conf 0..1, 0 = unvoiced).
 * https://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf
 */
export function yin(frame, sr, fmin = 35, fmax = 1200, threshold = 0.15) {
  const maxLag = Math.min(Math.floor(sr / fmin), Math.floor(frame.length / 2));
  const minLag = Math.max(2, Math.floor(sr / fmax));
  const W = frame.length - maxLag;
  if (W < 16) return { freq: 0, conf: 0 };
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = frame[i] - frame[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const c = new Float32Array(maxLag + 1);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (c[t] < threshold) {
      while (t + 1 <= maxLag && c[t + 1] < c[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // no dip under the threshold: take the global minimum if it is reasonably low
    let best = minLag;
    for (let t = minLag; t <= maxLag; t++) if (c[t] < c[best]) best = t;
    if (c[best] > 0.35) return { freq: 0, conf: 0 };
    tau = best;
  }
  // parabolic interpolation
  const a = c[tau - 1] ?? c[tau];
  const b = c[tau];
  const e = c[tau + 1] ?? c[tau];
  const den = a - 2 * b + e;
  const shift = den > 0 ? (0.5 * (a - e)) / den : 0;
  return { freq: sr / (tau + Math.max(-0.5, Math.min(0.5, shift))), conf: Math.max(0, 1 - b) };
}

/** Pitch track: frames of { t, midi (float or NaN), conf, rms } every `hop` samples. */
export function pitchTrack(samples, sr, { win = 2048, hop = 256, fmin = 35, fmax = 1200 } = {}) {
  const out = [];
  for (let i = 0; i + win <= samples.length; i += hop) {
    const frame = samples.subarray(i, i + win);
    let e = 0;
    for (let k = 0; k < win; k++) e += frame[k] * frame[k];
    const rms = Math.sqrt(e / win);
    const { freq, conf } = rms > 1e-4 ? yin(frame, sr, fmin, fmax) : { freq: 0, conf: 0 };
    out.push({ t: (i + win / 2) / sr, midi: freq ? midiOf(freq) : NaN, conf, rms });
  }
  return out;
}

/**
 * Pitch frames -> notes [{ start, end, midi }]. A note starts on a jump in loudness or a stable change
 * of pitch, and ends when the sound stops or another note starts.
 */
export function segmentNotes(frames, { minDur = 0.06, gate = 0.12 } = {}) {
  if (!frames.length) return [];
  const peak = Math.max(...frames.map((f) => f.rms)) || 1;
  const voiced = (f) => f.conf > 0.6 && f.rms > peak * gate && Number.isFinite(f.midi);
  const dt = frames.length > 1 ? frames[1].t - frames[0].t : 0.01;
  const notes = [];
  let cur = null;
  const close = (end) => {
    if (cur && end - cur.start >= minDur) {
      const ms = cur.midis.slice().sort((a, b) => a - b);
      notes.push({ start: cur.start, end, midi: Math.round(ms[Math.floor(ms.length / 2)]) });
    }
    cur = null;
  };
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!voiced(f)) {
      close(f.t);
      continue;
    }
    const m = Math.round(f.midi);
    // a fresh attack: louder than the quietest of the last few frames (catches repeated notes)
    const recent = frames.slice(Math.max(0, i - 4), i).map((g) => g.rms);
    const attack = recent.length >= 2 && f.rms > Math.min(...recent) * 1.35 && f.rms > peak * 0.2 && f.rms >= (frames[i - 1] ? frames[i - 1].rms : 0);
    if (cur) {
      const curMidi = Math.round(cur.midis[cur.midis.length - 1]);
      // a different pitch held for 3 frames, or a fresh attack, starts a new note
      const changed = m !== curMidi && frames.slice(i, i + 3).every((g) => voiced(g) && Math.round(g.midi) === m);
      if (changed || (attack && f.t - cur.start > minDur)) {
        close(f.t - dt / 2);
        cur = { start: f.t - dt / 2, midis: [f.midi] };
        continue;
      }
      // ignore octave flips (a common pitch-tracker error)
      if (Math.abs(f.midi - cur.midis[cur.midis.length - 1]) < 1.5) cur.midis.push(f.midi);
    } else cur = { start: f.t - dt / 2, midis: [f.midi] };
  }
  close(frames[frames.length - 1].t + dt / 2);
  return notes;
}

// ------------------------------------------------------------ frets

/**
 * Pick a string and fret for each pitch (Viterbi): low frets and a steady hand position cost less.
 * tuning: MIDI, high string first. Returns [{ s, f }] (s = 1 for the highest string) or null for
 * notes the instrument can't play.
 */
export function assignFrets(midis, tuning, { maxFret = 22 } = {}) {
  const opts = midis.map((m) => {
    const o = [];
    tuning.forEach((open, i) => {
      const f = m - open;
      if (f >= 0 && f <= maxFret) o.push({ s: i + 1, f });
    });
    return o;
  });
  const cost = (o) => (o.f === 0 ? 0 : 0.2 + o.f * 0.05);
  const move = (a, b) => {
    if (b.f === 0 || a.f === 0) return 0.3;
    const d = Math.abs(a.f - b.f);
    return (d <= 3 ? d * 0.15 : 0.45 + (d - 3) * 0.5) + Math.abs(a.s - b.s) * 0.05;
  };
  const out = new Array(midis.length).fill(null);
  let i = 0;
  while (i < midis.length) {
    if (!opts[i].length) {
      i++;
      continue;
    }
    // a run of playable notes
    let j = i;
    while (j < midis.length && opts[j].length) j++;
    const score = [opts[i].map(cost)];
    const back = [opts[i].map(() => -1)];
    for (let k = i + 1; k < j; k++) {
      const sc = [];
      const bk = [];
      opts[k].forEach((o) => {
        let best = Infinity;
        let arg = 0;
        opts[k - 1].forEach((p, pi) => {
          const v = score[k - 1 - i][pi] + move(p, o);
          if (v < best) {
            best = v;
            arg = pi;
          }
        });
        sc.push(best + cost(o));
        bk.push(arg);
      });
      score.push(sc);
      back.push(bk);
    }
    let arg = score[score.length - 1].indexOf(Math.min(...score[score.length - 1]));
    for (let k = j - 1; k >= i; k--) {
      out[k] = opts[k][arg];
      arg = back[k - i][arg];
    }
    i = j;
  }
  return out;
}

// ------------------------------------------------------------ rhythm

/** Split `slots` sixteenths starting at slot `pos` (within a bar) into note values that keep alignment. */
export function splitSlots(pos, slots) {
  const out = [];
  const vals = [[16, 1], [12, 2, true], [8, 2], [6, 4, true], [4, 4], [3, 8, true], [2, 8], [1, 16]]; // [sixteenths, dur, dotted]
  // halves and wholes start on a beat; quarters and dotted values may start on any eighth
  // (syncopation); eighths and sixteenths anywhere
  const align = (n) => (n >= 8 ? 4 : n >= 3 ? 2 : 1);
  while (slots > 0) {
    const v = vals.find(([n]) => n <= slots && pos % align(n) === 0) || [1, 16];
    out.push({ slots: v[0], dur: v[1], dot: !!v[2] });
    pos += v[0];
    slots -= v[0];
  }
  return out;
}

/**
 * Quantise timed events to a sixteenth-note grid and lay them out as bars of beats.
 * events: [{ start, end, notes: [...] }] (song seconds). grid: { bpm, firstBeat, ts }.
 * Returns { bars: [{ beats }], offset } where offset is the song time of bar 1.
 */
export function quantizeToBars(events, { bpm, firstBeat = 0, ts = [4, 4], maxBars = 400 }) {
  const spq = 60 / bpm;
  const slotLen = spq / 4;
  const perBar = Math.round(barQuarters(ts) * 4);
  // bar 1 starts on the first downbeat at or before the first note
  const first = events.length ? events[0].start : firstBeat;
  let origin = firstBeat;
  const barLen = perBar * slotLen;
  while (origin > first + slotLen / 2) origin -= barLen;
  while (origin + barLen <= first - slotLen / 2) origin += barLen;
  const slotsMap = new Map(); // slot -> { notes, until }
  for (const e of events) {
    const a = Math.max(0, Math.round((e.start - origin) / slotLen));
    const b = Math.max(a + 1, Math.round((e.end - origin) / slotLen));
    const prev = slotsMap.get(a);
    if (prev) {
      prev.notes.push(...e.notes);
      prev.until = Math.max(prev.until, b);
    } else slotsMap.set(a, { notes: [...e.notes], until: b });
  }
  const starts = [...slotsMap.keys()].sort((x, y) => x - y);
  // legato: a note that stops just short of the next one (within a dotted eighth) lasts until it;
  // a plucked note fades below the detector well before the player lets go
  starts.forEach((s, k) => {
    const next = starts[k + 1];
    const e = slotsMap.get(s);
    if (next != null && next - e.until <= 3) e.until = next;
  });
  const lastSlot = starts.length ? Math.max(...starts.map((s) => slotsMap.get(s).until)) : perBar;
  const nBars = Math.min(maxBars, Math.max(1, Math.ceil(lastSlot / perBar)));
  const bars = Array.from({ length: nBars }, () => ({ beats: [] }));
  const place = (slot, len, notes) => {
    // never cross a bar line: split at bars (the second part becomes a rest; ties aren't modelled)
    let first = true;
    while (len > 0) {
      const bi = Math.floor(slot / perBar);
      if (bi >= nBars) return;
      const pos = slot % perBar;
      const n = Math.min(len, perBar - pos);
      for (const piece of splitSlots(pos, n)) {
        bars[bi].beats.push({ dur: piece.dur, dot: piece.dot, rest: !first || !notes.length, notes: first && notes.length ? notes.map((x) => ({ ...x, tech: { ...(x.tech || {}) } })) : [] });
        first = false;
      }
      slot += n;
      len -= n;
    }
  };
  let cursor = 0;
  starts.forEach((s, k) => {
    if (s > cursor) place(cursor, s - cursor, []);
    const next = k + 1 < starts.length ? starts[k + 1] : nBars * perBar;
    const len = Math.max(1, Math.min(slotsMap.get(s).until, next) - s);
    place(s, len, slotsMap.get(s).notes);
    cursor = s + len;
  });
  if (cursor < nBars * perBar) place(cursor, nBars * perBar - cursor, []);
  for (const bar of bars) if (!bar.beats.length) bar.beats.push(emptyBeat(1));
  return { bars, offset: +origin.toFixed(3) };
}

// ------------------------------------------------------------ chords

const CHORD_T = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['5', [0, 7]],
];
const PC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Pitch-class energy (12 bins) of a frame. */
export function chroma(frame, sr) {
  let n = 1;
  while (n < frame.length) n <<= 1;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < frame.length; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame.length - 1)));
  fft(re, im);
  const c = new Float32Array(12);
  for (let k = 1; k < n / 2; k++) {
    const f = (k * sr) / n;
    if (f < 70 || f > 2000) continue;
    const mag = Math.hypot(re[k], im[k]);
    c[(((Math.round(midiOf(f)) % 12) + 12) % 12)] += mag;
  }
  return c;
}

/** Best chord for a chroma vector: { root (0-11), quality ('', 'm', '5'), name, score } or null. */
export function matchChord(c) {
  const total = c.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let best = null;
  for (let r = 0; r < 12; r++) {
    for (const [q, iv] of CHORD_T) {
      const inS = iv.reduce((s, x) => s + c[(r + x) % 12], 0);
      // reward chord tones, penalise strong tones outside the chord; triads must earn their third
      const score = inS / total - (q === '5' ? 0.12 : 0) - (q !== '5' && c[(r + iv[1]) % 12] < c[r] * 0.25 ? 1 : 0);
      if (!best || score > best.score) best = { root: r, quality: q, score };
    }
  }
  return best && best.score > 0.45 ? { ...best, name: PC[best.root] + best.quality } : null;
}

/** A power-chord shape (root, fifth, octave) for pitch class `root` on the lowest strings of `tuning`. */
export function powerChord(root, tuning) {
  const n = tuning.length;
  for (const low of [n, n - 1]) {
    const open = tuning[low - 1];
    const f = (((root - open) % 12) + 12) % 12;
    if (f > 9 && low === n) continue; // too high up the neck: use the next string
    const base = open + f;
    // fifth and octave on the next strings up, whatever the tuning (drop D, G-B major third...)
    const notes = [{ s: low, f, tech: {} }];
    for (const [s, pitch] of [[low - 1, base + 7], [low - 2, base + 12]]) {
      if (s < 1) continue;
      const fr = pitch - tuning[s - 1];
      if (fr >= 0 && fr <= 22) notes.push({ s, f: fr, tech: {} });
    }
    return notes;
  }
  return [{ s: n, f: 0, tech: {} }];
}

// ------------------------------------------------------------ whole stems

/** Decode a stem to mono samples at `sr` (browser only). */
export async function decodeStem(blob, sr = 22050) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const audio = await new Ctx(1, 2, sr).decodeAudioData((await blob.arrayBuffer()).slice(0));
  const ctx = new Ctx(1, Math.max(1, Math.ceil(audio.duration * sr)), sr);
  const src = ctx.createBufferSource();
  src.buffer = audio;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return { samples: out.getChannelData(0), sr, duration: audio.duration };
}

/** Tempo and first beat from the stem itself, when the song's beats aren't known. */
export function gridFromSamples(samples, sr) {
  const env = energyEnvelope(samples, sr, 100);
  const b = detectBeats(env, 100);
  return b ? { bpm: b.bpm, firstBeat: b.beats[0] || 0 } : { bpm: 120, firstBeat: 0 };
}

/**
 * Transcribe mono samples. kind: 'bass' | 'lead' | 'rhythm'. grid: { bpm, firstBeat, ts }.
 * Returns { track (Tab Studio track without id), offset, stats }.
 */
export function transcribeSamples(samples, sr, kind, grid, { tuning } = {}) {
  const tun = tuning || (kind === 'bass' ? TUNINGS['Bass · Standard E'] : TUNINGS['Guitar · Standard E']).slice();
  const name = kind === 'bass' ? 'Bass (from stem)' : kind === 'lead' ? 'Lead (from stem)' : 'Rhythm (from stem)';
  if (kind === 'rhythm') {
    const spq = 60 / grid.bpm;
    const step = spq / 2; // listen per eighth note
    const win = Math.min(8192, Math.max(2048, Math.round(step * sr)));
    const env = energyEnvelope(samples, sr, 100);
    const peak = Math.max(...env) || 1;
    const events = [];
    let last = null;
    for (let t = grid.firstBeat % step; t + step <= samples.length / sr; t += step) {
      const loud = env[Math.min(env.length - 1, Math.round((t + step / 2) * 100))] || 0;
      if (loud < peak * 0.12) {
        last = null;
        continue;
      }
      const i0 = Math.round(t * sr);
      const ch = matchChord(chroma(samples.subarray(i0, Math.min(samples.length, i0 + win)), sr));
      if (!ch) continue;
      // a held chord extends; a new chord (or a fresh strum) starts a new beat
      const strum = env[Math.round(t * 100)] > (env[Math.max(0, Math.round(t * 100) - 3)] || 0) * 1.4;
      if (last && last.name === ch.name && !strum) last.end = t + step;
      else {
        last = { start: t, end: t + step, name: ch.name, notes: powerChord(ch.root + 48, tun) };
        events.push(last);
      }
    }
    const q = quantizeToBars(events, grid);
    return { track: { name, kind: 'fretted', tuning: tun, bars: q.bars }, offset: q.offset, stats: { notes: events.length, chords: [...new Set(events.map((e) => e.name))] } };
  }
  const frames = pitchTrack(samples, sr, { win: kind === 'bass' ? 2048 : 1024, hop: 256, fmin: kind === 'bass' ? 30 : 70, fmax: kind === 'bass' ? 400 : 1400 });
  const notes = segmentNotes(frames);
  const frets = assignFrets(notes.map((n) => n.midi), tun);
  const events = [];
  notes.forEach((n, i) => {
    if (frets[i]) events.push({ start: n.start, end: n.end, notes: [{ ...frets[i], tech: {} }] });
  });
  const q = quantizeToBars(events, grid);
  return { track: { name, kind: 'fretted', tuning: tun, bars: q.bars }, offset: q.offset, stats: { notes: events.length, skipped: notes.length - events.length } };
}

/** Drum hits [{ time, lane }] (from drumHitsFromAudio) -> a percussion track. */
export function drumsToTrack(hits, grid) {
  const GM = { kick: 36, snare: 38, hihat: 42, tom: 45, crash: 49, ride: 51 };
  const byTime = new Map();
  for (const h of hits) {
    const key = h.time.toFixed(3);
    if (!byTime.has(key)) byTime.set(key, { start: h.time, end: h.time + 0.05, notes: [] });
    const m = GM[h.lane];
    if (m && !byTime.get(key).notes.some((n) => n.m === m)) byTime.get(key).notes.push({ m });
  }
  const events = [...byTime.values()].sort((a, b) => a.start - b.start);
  const q = quantizeToBars(events, grid);
  // drum beats keep their hit; the rest of each slot is just time
  return { track: { name: 'Drums (from stem)', kind: 'drums', tuning: null, bars: q.bars }, offset: q.offset, stats: { notes: hits.length } };
}
