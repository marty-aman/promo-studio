// Stem to tab: the notes Basic Pitch hears in a guitar or bass stem (js/ai/basicpitch.js) become a draft
// Tab Studio track and MIDI notes. Pure and unit tested:
//  - cleanNotes: drop very short or quiet notes and overtones, merge duplicates, keep the instrument's range,
//    one note at a time for single-note parts
//  - snapToGrid + layoutBars: place the notes on the song's beat grid (1/8, 1/16, 1/8 triplets, or 1/32 "off")
//  - chooseFrets: a playable string and fret for every note and chord (low frets, little hand movement,
//    chords on neighbouring strings)
//  - modelToMidi: a Tab Studio model (with your corrections) as a .mid for the MIDI notes and game layers
// note = { start, dur, pitch, amp } (seconds, MIDI, 0..1); vel is added by cleanNotes.
import { barQuarters, notePitch, schedule, TUNINGS } from './tabedit.js';
import { writeMidi } from './midi.js';

export const GRIDS = [
  ['16', '1/16 notes'],
  ['8', '1/8 notes'],
  ['8t', '1/8 triplets'],
  ['off', 'Off (keep timing, 1/32)'],
];
const PER_QUARTER = { 8: 2, 16: 4, '8t': 3, off: 8 };

/** Stem parts that can become a tab, and the part each starts as. */
export const TAB_ROLES = { guitar: 'lead', bass: 'bass', keys: 'lead', other: 'lead' };
export const PARTS = [
  ['lead', 'Single notes (lead, riff, melody)'],
  ['rhythm', 'Chords (rhythm guitar)'],
  ['bass', 'Bass (single notes)'],
];

/**
 * The tuning to start with for a part, from the song's "Key / tuning" text ("E minor, drop D", "7-string").
 * Returns a key of TUNINGS.
 */
export function tuningFor(part, text = '') {
  const s = ` ${String(text || '').toLowerCase()} `;
  if (part === 'bass') {
    if (/5[- ]?string|low b|\bb standard/.test(s)) return 'Bass 5 · Standard B';
    if (/drop ?d\b/.test(s)) return 'Bass · Drop D';
    return 'Bass · Standard E';
  }
  if (/7[- ]?string/.test(s)) return 'Guitar 7 · Standard B';
  if (/drop ?c\b/.test(s)) return 'Guitar · Drop C';
  if (/drop ?b\b/.test(s)) return 'Guitar · Drop B (7-string feel on 6)';
  if (/drop ?d\b/.test(s)) return 'Guitar · Drop D';
  if (/\bd (standard|std)\b/.test(s)) return 'Guitar · D standard';
  return 'Guitar · Standard E';
}

/**
 * Pitches the instrument can play: the lowest open string to the highest string's 24th fret (standard guitar
 * E2–E6, bass E1–G4; drop tunings reach lower).
 */
export const playableRange = (tuning, maxFret = 24) => [Math.min(...tuning), Math.max(...tuning) + maxFret];

/**
 * Join notes that a window boundary cut in two: a note ending within `tol` s of a seam and a note of the same
 * pitch starting within `tol` s after it become one.
 */
export function joinAtSeams(notes, seams, tol = 0.035) {
  if (!seams.length) return notes.slice();
  const out = notes.slice().sort((a, b) => a.start - b.start);
  for (const seam of seams) {
    for (const a of out) {
      if (a.gone || Math.abs(a.start + a.dur - seam) > tol) continue;
      const b = out.find((x) => !x.gone && x !== a && x.pitch === a.pitch && x.start >= seam - tol && x.start <= seam + tol);
      if (!b) continue;
      a.dur = b.start + b.dur - a.start;
      a.amp = Math.max(a.amp, b.amp);
      b.gone = true;
    }
  }
  return out.filter((x) => !x.gone);
}

const OVERTONES = [12, 19, 24, 28, 31, 36]; // 2nd to 6th and 8th harmonic, in semitones
const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/**
 * Clean up raw notes. Options: range [low, high] (MIDI), minDur (s), minAmp (0..1, absolute), relAmp (share of
 * the loud notes' level), mono (one note at a time: single-note parts). Returns notes sorted by start, each with
 * vel (1–127), and stats { kept, short, quiet, range, overtones, merged }.
 */
export function cleanNotes(raw, { range = [0, 127], minDur = 0.05, minAmp = 0.15, relAmp = 0.3, mono = false, overtoneRatio = 0.65 } = {}) {
  const stats = { kept: 0, short: 0, quiet: 0, range: 0, overtones: 0, merged: 0 };
  const loud = quantile(raw.map((n) => n.amp), 0.9);
  let notes = [];
  for (const n of raw) {
    if (n.pitch < range[0] || n.pitch > range[1]) stats.range++;
    else if (n.dur < minDur) stats.short++;
    else if (n.amp < minAmp || n.amp < loud * relAmp) stats.quiet++;
    else notes.push({ ...n });
  }
  // overtones: a quieter note an octave, a twelfth… above a louder note that starts with it and overlaps it
  notes.sort((a, b) => b.amp - a.amp);
  const kept = [];
  for (const n of notes) {
    // in a single-note part, a much quieter overtone that pops up while the note rings is one too
    const base = kept.find((b) => OVERTONES.includes(n.pitch - b.pitch) && n.start < b.start + b.dur - 0.03 && n.start > b.start - 0.08 && (Math.abs(n.start - b.start) < 0.08 ? n.amp < b.amp * overtoneRatio : mono && n.amp < b.amp * 0.5));
    if (base) stats.overtones++;
    else kept.push(n);
  }
  // duplicates: the same pitch heard twice at once (overlapping) is one note
  kept.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  notes = [];
  for (const n of kept) {
    const prev = notes.findLast((p) => p.pitch === n.pitch);
    if (prev && n.start < prev.start + prev.dur - 0.01) {
      prev.dur = Math.max(prev.dur, n.start + n.dur - prev.start);
      prev.amp = Math.max(prev.amp, n.amp);
      stats.merged++;
    } else notes.push(n);
  }
  if (mono) {
    // notes that start together: keep the loudest (the lower one when about as loud: overtones read higher)
    const out = [];
    for (const n of notes) {
      const last = out[out.length - 1];
      if (last && n.start - last.start < 0.04) {
        const better = n.amp > last.amp * 1.2 || (n.amp >= last.amp * 0.8 && n.pitch < last.pitch);
        stats.merged++;
        if (better) out[out.length - 1] = n;
        continue;
      }
      out.push(n);
    }
    // a note stops where the next one starts
    for (let i = 0; i + 1 < out.length; i++) out[i].dur = Math.max(0.02, Math.min(out[i].dur, out[i + 1].start - out[i].start));
    notes = out;
  }
  for (const n of notes) n.vel = Math.max(1, Math.min(127, Math.round(n.amp * 127)));
  stats.kept = notes.length;
  return { notes, stats };
}

/**
 * Snap notes to the beat grid. grid: '16' | '8' | '8t' | 'off'. bpm and firstBeat (a beat's time in the song) come
 * from the song's detected beats. Returns { origin (song time of bar 1), perQuarter, slots: [{ slot, until,
 * pitches, vel }] } where a slot is one grid step from bar 1. Notes that start in the same step form a chord.
 */
export function snapToGrid(notes, { bpm, firstBeat = 0, ts = [4, 4], grid = '16' }) {
  let perQuarter = PER_QUARTER[grid] || 4;
  const Q = barQuarters(ts);
  if (perQuarter === 3 && !Number.isInteger(Q)) perQuarter = 4; // shortcut: triplets need whole beats in the bar (not 7/8)
  const spq = 60 / bpm;
  const slotLen = spq / perQuarter;
  const barLen = Q * spq;
  const sorted = notes.slice().sort((a, b) => a.start - b.start);
  const first = sorted.length ? sorted[0].start : firstBeat;
  // bar 1 starts on the bar line at or before the first note
  let origin = firstBeat;
  while (origin > first + slotLen / 2) origin -= barLen;
  while (origin + barLen <= first - slotLen / 2) origin += barLen;
  const map = new Map();
  for (const n of sorted) {
    const a = Math.max(0, Math.round((n.start - origin) / slotLen));
    const b = Math.max(a + 1, Math.round((n.start + n.dur - origin) / slotLen));
    const s = map.get(a);
    if (s) {
      if (!s.pitches.includes(n.pitch)) s.pitches.push(n.pitch);
      s.until = Math.max(s.until, b);
      s.vel = Math.max(s.vel, n.vel || 100);
    } else map.set(a, { slot: a, until: b, pitches: [n.pitch], vel: n.vel || 100 });
  }
  const slots = [...map.values()].sort((x, y) => x.slot - y.slot);
  // legato: a note that stops just short of the next one (within a dotted eighth) lasts until it; a plucked note
  // fades under the detector before the player lets go
  const reach = Math.round(perQuarter * 0.75);
  slots.forEach((s, k) => {
    const next = slots[k + 1];
    if (next && next.slot - s.until <= reach) s.until = next.slot;
    if (next) s.until = Math.min(s.until, next.slot);
    s.pitches.sort((a, b) => a - b);
  });
  return { origin: +origin.toFixed(3), perQuarter, slots };
}

// ------------------------------------------------------------ bars

const TPQ = 24; // ticks per quarter: 32nds (3) and triplet eighths (8) both fit
// [ticks, dur, dot]
const VALUES = [[96, 1, false], [72, 2, true], [48, 2, false], [36, 4, true], [24, 4, false], [18, 8, true], [12, 8, false], [9, 16, true], [6, 16, false], [3, 32, false]];
// halves and wholes start on a beat, quarters and dotted eighths on an eighth, the rest anywhere on their own grid
const alignOf = (n) => (n >= 48 ? 24 : n >= 18 ? 12 : n >= 9 ? 6 : 3);

/** Split `len` ticks starting at tick `pos` of a bar into note values that keep the beat readable. */
export function splitTicks(pos, len) {
  const out = [];
  while (len >= 3) {
    const v = VALUES.find(([n]) => n <= len && pos % alignOf(n) === 0) || VALUES[VALUES.length - 1];
    out.push({ ticks: v[0], dur: v[1], dot: v[2] });
    pos += v[0];
    len -= v[0];
  }
  return out;
}

const beat = (dur, dot, notes, tu = 0) => ({ dur, dot, rest: !notes.length, notes: notes.map((n) => ({ ...n, tech: { ...(n.tech || {}) } })), ...(tu ? { tu } : {}) });

/**
 * Lay snapped slots out as bars of beats. `slots[i].notes` are the tab notes ({ s, f, tech }) for that slot.
 * Straight grids write plain values; on the triplet grid a beat with a note off the beat becomes three triplet
 * eighths (beat.tu = 3). Ties aren't modelled: a note that crosses a bar line stops there.
 */
export function layoutBars(slots, { perQuarter, ts = [4, 4], maxBars = 400 }) {
  const barTicks = Math.round(barQuarters(ts) * TPQ);
  const tps = TPQ / perQuarter;
  const triplet = perQuarter === 3;
  const pieces = []; // { tick, len, notes } or { tick, len, beats } (a triplet beat)
  const list = slots.filter((s) => s.notes && s.notes.length);
  if (!triplet) {
    list.forEach((s, k) => {
      const end = Math.min(s.until, k + 1 < list.length ? list[k + 1].slot : Infinity);
      pieces.push({ tick: s.slot * tps, len: Math.max(1, end - s.slot) * tps, notes: s.notes });
    });
  } else {
    const byQ = new Map();
    for (const s of list) {
      const q = Math.floor(s.slot / 3);
      if (!byQ.has(q)) byQ.set(q, []);
      byQ.get(q).push(s);
    }
    const qs = [...byQ.keys()].sort((a, b) => a - b);
    qs.forEach((q, k) => {
      const inQ = byQ.get(q);
      const nextQ = k + 1 < qs.length ? qs[k + 1] : Infinity;
      if (inQ.length === 1 && inQ[0].slot % 3 === 0) {
        // on the beat only: a plain quarter, half…, held for whole beats
        const s = inQ[0];
        const beats = Math.max(1, Math.min(nextQ - q, Math.round(s.until / 3) - q));
        pieces.push({ tick: q * TPQ, len: beats * TPQ, notes: s.notes });
        return;
      }
      const beats = [];
      for (let j = 0; j < 3; ) {
        const s = inQ.find((x) => x.slot % 3 === j);
        if (!s) {
          beats.push(beat(8, false, [], 3));
          j++;
          continue;
        }
        const nextJ = inQ.map((x) => x.slot % 3).filter((x) => x > j).sort((a, b) => a - b)[0] ?? 3;
        const len = Math.max(1, Math.min(nextJ, s.until - q * 3) - j);
        // two triplet eighths' worth is a triplet quarter
        if (len >= 2) {
          beats.push(beat(4, false, s.notes, 3));
          j += 2;
        } else {
          beats.push(beat(8, false, s.notes, 3));
          j += 1;
        }
      }
      pieces.push({ tick: q * TPQ, len: TPQ, beats });
    });
  }
  const lastTick = pieces.length ? Math.max(...pieces.map((p) => p.tick + p.len)) : barTicks;
  const nBars = Math.min(maxBars, Math.max(1, Math.ceil(lastTick / barTicks)));
  const bars = Array.from({ length: nBars }, () => ({ beats: [] }));
  const place = (tick, len, notes) => {
    let first = true;
    while (len > 0) {
      const bi = Math.floor(tick / barTicks);
      if (bi >= nBars) return;
      const pos = tick % barTicks;
      const n = Math.min(len, barTicks - pos);
      for (const v of splitTicks(pos, n)) {
        bars[bi].beats.push(beat(v.dur, v.dot, first ? notes : []));
        first = false;
      }
      tick += n;
      len -= n;
    }
  };
  let cursor = 0;
  for (const p of pieces) {
    if (p.tick < cursor) continue; // shortcut: an overlap the grid can't show is dropped
    if (p.tick >= nBars * barTicks) break;
    if (p.tick > cursor) place(cursor, p.tick - cursor, []);
    if (p.beats) bars[Math.floor(p.tick / barTicks)].beats.push(...p.beats);
    else place(p.tick, p.len, p.notes);
    cursor = p.tick + p.len;
  }
  if (cursor < nBars * barTicks) place(cursor, nBars * barTicks - cursor, []);
  return bars;
}

// ------------------------------------------------------------ frets

const fretCost = (f) => (f === 0 ? 0 : 0.2 + f * 0.05);

/** Every way to play a set of pitches on distinct strings (pitches no string reaches are left out). */
function shapes(pitches, tuning, maxFret, limit = 400) {
  const out = [];
  const playable = pitches.filter((p) => tuning.some((o) => p - o >= 0 && p - o <= maxFret));
  const used = new Set();
  const cur = [];
  const walk = (i) => {
    if (out.length >= limit) return;
    if (i === playable.length) {
      if (cur.length) out.push(cur.slice());
      return;
    }
    tuning.forEach((open, si) => {
      const f = playable[i] - open;
      if (f < 0 || f > maxFret || used.has(si)) return;
      used.add(si);
      cur.push({ s: si + 1, f });
      walk(i + 1);
      cur.pop();
      used.delete(si);
    });
  };
  walk(0);
  // more pitches than strings: play the lowest ones
  if (!out.length && playable.length > tuning.length) return shapes(playable.slice(0, tuning.length), tuning, maxFret, limit);
  return out;
}

function shapeInfo(sh) {
  const fretted = sh.filter((n) => n.f > 0).map((n) => n.f);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const strings = sh.map((n) => n.s).sort((a, b) => a - b);
  const gaps = strings[strings.length - 1] - strings[0] + 1 - strings.length; // strings skipped inside the chord
  const cost = sh.reduce((c, n) => c + fretCost(n.f), 0) + span * 0.1 + Math.max(0, span - 3) * 1.2 + gaps * 0.5;
  const pos = fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : null;
  const str = strings.reduce((a, b) => a + b, 0) / strings.length;
  return { notes: sh, cost, pos, str };
}

function moveCost(a, b) {
  if (a.pos == null || b.pos == null) return 0.3; // open strings give the hand time to move
  const d = Math.abs(a.pos - b.pos);
  return (d <= 3 ? d * 0.15 : 0.45 + (d - 3) * 0.5) + Math.abs(a.str - b.str) * 0.05;
}

/**
 * Strings and frets for a run of chords (each a list of MIDI pitches; one pitch is a single note), chosen
 * together (Viterbi): low frets, a steady hand position, chords within a 4-fret stretch on neighbouring strings.
 * tuning: MIDI, high string first (s = 1 is the highest). Returns, per chord, [{ s, f }] ([] when nothing fits).
 */
export function chooseFrets(chords, tuning, { maxFret = 22, keep = 24 } = {}) {
  const opts = chords.map((ps) => shapes(ps, tuning, maxFret).map(shapeInfo).sort((a, b) => a.cost - b.cost).slice(0, keep));
  const out = chords.map(() => []);
  let i = 0;
  while (i < chords.length) {
    if (!opts[i].length) {
      i++;
      continue;
    }
    let j = i;
    while (j < chords.length && opts[j].length) j++;
    const score = [opts[i].map((o) => o.cost)];
    const back = [opts[i].map(() => -1)];
    for (let k = i + 1; k < j; k++) {
      const sc = [];
      const bk = [];
      for (const o of opts[k]) {
        let best = Infinity;
        let arg = 0;
        opts[k - 1].forEach((p, pi) => {
          const v = score[k - 1 - i][pi] + moveCost(p, o);
          if (v < best) (best = v), (arg = pi);
        });
        sc.push(best + o.cost);
        bk.push(arg);
      }
      score.push(sc);
      back.push(bk);
    }
    const last = score[score.length - 1];
    let arg = last.indexOf(Math.min(...last));
    for (let k = j - 1; k >= i; k--) {
      out[k] = opts[k][arg].notes.map((n) => ({ ...n }));
      arg = back[k - i][arg];
    }
    i = j;
  }
  return out;
}

// ------------------------------------------------------------ the whole draft

/**
 * Cleaned notes -> a draft Tab Studio track. opts: { tuning, name, bpm, firstBeat, ts, grid, stemId }.
 * Returns { track (no id), offset (song time of bar 1), stats: { notes, chords, skipped } }.
 */
export function notesToTrack(notes, { tuning, name = 'Guitar (draft from stem)', bpm = 120, firstBeat = 0, ts = [4, 4], grid = '16', stemId = null, maxBars = 400 } = {}) {
  const tun = (tuning || TUNINGS['Guitar · Standard E']).slice();
  const snapped = snapToGrid(notes, { bpm, firstBeat, ts, grid });
  const frets = chooseFrets(snapped.slots.map((s) => s.pitches), tun);
  let skipped = 0;
  const slots = snapped.slots.map((s, i) => {
    skipped += s.pitches.length - frets[i].length;
    return { ...s, notes: frets[i].map((n) => ({ ...n, tech: {} })) };
  });
  const bars = layoutBars(slots, { perQuarter: snapped.perQuarter, ts, maxBars });
  const played = slots.filter((s) => s.notes.length);
  return {
    track: { name, kind: 'fretted', tuning: tun, bars, draft: 'stem', ...(stemId ? { stemId } : {}) },
    offset: snapped.origin,
    stats: { notes: played.reduce((a, s) => a + s.notes.length, 0), chords: played.filter((s) => s.notes.length > 1).length, skipped },
  };
}

/**
 * A Tab Studio model as a standard MIDI file: one MIDI track per tab track (drums on channel 10), in seconds
 * from bar 1, so a MIDI notes layer with offset = model.offset lines up with the song. Dead notes are left out,
 * ghost notes are quiet. Returns Uint8Array, or null when there are no notes.
 */
export function modelToMidi(model, { ppq = 480 } = {}) {
  const bpm = model.tempo || 120;
  const perSec = (ppq * bpm) / 60; // shortcut: ticks follow seconds at the first tempo, so tempo changes keep time but not bar lines
  const { events } = schedule(model);
  const tracks = model.tracks.map((t, ti) => ({ name: t.name, ch: t.kind === 'drums' ? 9 : Math.min(8, ti), notes: [] }));
  for (const ev of events) {
    const t = model.tracks[ev.track];
    for (const n of ev.notes) {
      if (t.kind === 'drums') tracks[ev.track].notes.push({ tick: Math.round(ev.time * perSec), note: n.m, vel: 100, len: Math.round(ppq / 8) });
      else if (!(n.tech && n.tech.x)) tracks[ev.track].notes.push({ tick: Math.round(ev.time * perSec), note: notePitch(t, n), vel: n.tech && n.tech.g ? 50 : 100, len: Math.max(1, Math.round(ev.dur * perSec * 0.95)) });
    }
  }
  const used = tracks.filter((t) => t.notes.length);
  return used.length ? writeMidi(used, { ppq, bpm }) : null;
}
