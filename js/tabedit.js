// Tab Studio's song model: load from a Guitar Pro score, edit it, and save it back as a Guitar Pro 7
// file through alphaTab (model -> AlphaTex -> alphaTab score -> GP7 bytes).
//
// model = { title, tempo, ts: [num, den], tempos: { barIndex: bpm } (tempo changes at the bar start),
//           tempoMid?: { barIndex: [[position 0..1 in the bar, bpm]] } (tempo changes later in the bar),
//           tsBars?: { barIndex: [num, den] } (time signature changes),
//           marks?: { barIndex: { ro, rc, ae, sec: { m, t }, dirs: [direction], pickup } } (repeat open/close count,
//                   alternate endings bit mask, section, D.C./D.S./Coda/Fine, pickup bar), tracks: [track],
//           importNotes?: [{ kind: 'skipped' | 'guessed' | 'changed', text, bars }] (what loading left out) }
// track = { id, name, kind: 'fretted' | 'drums', tuning: [midi, high string first] (fretted only), capo?,
//           srcIndex?: track number in the Guitar Pro file, stemId?: media id of the stem it was transcribed from, bars: [bar] }
// bar   = { beats: [beat] }
// beat  = { dur: 1|2|4|8|16|32|64, dot: 0|1|2 (or bool), tu?: n, tuD?: d (n in the time of d), grace?: 'before' | 'on',
//           tp?: tremolo picking (number of slashes 1-5), tap?, chord?, txt?, rest: bool, notes: [note] }
// note  = fretted: { s: string (1 = highest), f: fret, tech: { h, sl (slide type), b (true or bend values), v, pm, x, g,
//                    t (tied), lr (let ring), hm (harmonic type), lht (left-hand tap) } }
//         drums:   { m: GM drum number }
import { uid } from './core.js';
import { playbackOrder } from './tab.js';

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

/** The usual "n in the time of d" for an n-tuplet: 3 in 2, 5/6/7 in 4, 9..15 in 8. */
const tupletDen = (n) => (n === 3 ? 2 : 2 ** Math.floor(Math.log2(n)));
/** Length of a beat in quarter notes (grace notes take no time in the bar). */
export const beatQuarters = (b) => (b.grace ? 0 : (4 / b.dur) * (b.dot === 2 ? 1.75 : b.dot ? 1.5 : 1) * (b.tu ? (b.tuD || tupletDen(b.tu)) / b.tu : 1));
/** AlphaTex beat effects for length and the beat's own marks: dots, tuplet, grace, tremolo picking, tap, chord, text. */
const lenFx = (b) => {
  const fx = [];
  if (b.dot) fx.push(b.dot === 2 ? 'dd' : 'd');
  if (b.tu) fx.push(b.tu === 3 && (b.tuD || 2) === 2 ? 'tu 3' : `tu (${b.tu} ${b.tuD || tupletDen(b.tu)})`);
  if (b.grace) fx.push(b.grace === 'on' ? 'gr ob' : 'gr');
  if (b.tp) fx.push(`tp ${Math.max(1, Math.min(5, Math.round(b.tp)))}`);
  if (b.tap) fx.push('tt');
  if (b.chord) fx.push(`ch ${texString(b.chord)}`);
  if (b.txt) fx.push(`txt ${texString(b.txt)}`);
  if (b._tempo) fx.push(`tempo ${+b._tempo.toFixed(2)}`);
  return fx.length ? `{${fx.join(' ')}}` : '';
};
/** How many quarter notes a bar holds. */
export const barQuarters = (ts) => (ts[0] * 4) / ts[1];
export const barFill = (bar) => bar.beats.reduce((s, b) => s + beatQuarters(b), 0);
/** The time signature of bar `bi`: the last change at or before it (model.tsBars), else the song's. */
export function tsAt(model, bi) {
  let ts = model.ts;
  let at = -1;
  for (const [k, v] of Object.entries(model.tsBars || {})) {
    const i = Number(k);
    if (i <= bi && i > at) {
      at = i;
      ts = v;
    }
  }
  return ts;
}
/** Quarter notes bar `bi` lasts: its time signature, or what a pickup bar (marks.pickup) really holds. */
export function barLen(model, bi) {
  const m = model.marks && model.marks[bi];
  if (m && m.pickup) {
    const fills = model.tracks.map((t) => (t.bars[bi] ? barFill(t.bars[bi]) : 0));
    const f = Math.max(0, ...fills);
    if (f > 0) return f;
  }
  return barQuarters(tsAt(model, bi));
}

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

const durOf = (d) => (DURATIONS.includes(d) || d === 64 ? d : d > 64 ? 64 : 4);
const TPQ = 960; // alphaTab ticks per quarter note
// alphaTab enums used below (model.GraceType, model.HarmonicType, model.SlideOutType)
const GRACE = { 1: 'on', 2: 'before', 3: 'before' };
export const HARMONICS = { 1: ['nh', 'N.H.'], 2: ['ah', 'A.H.'], 3: ['ph', 'P.H.'], 4: ['th', 'T.H.'], 5: ['sh', 'S.H.'] };
export const SLIDES = { 1: 'ss', 2: 'sl', 3: 'sou', 4: 'sod', 5: 'psd', 6: 'psu' };
export const DIRECTIONS = ['Fine', 'Segno', 'SegnoSegno', 'Coda', 'DoubleCoda', 'DaCapo', 'DaCapoAlCoda', 'DaCapoAlDoubleCoda', 'DaCapoAlFine', 'DalSegno', 'DalSegnoAlCoda', 'DalSegnoAlDoubleCoda', 'DalSegnoAlFine', 'DalSegnoSegno', 'DalSegnoSegnoAlCoda', 'DalSegnoSegnoAlDoubleCoda', 'DalSegnoSegnoAlFine', 'DaCoda', 'DaDoubleCoda'];
export const DIRECTION_LABELS = ['Fine', 'Segno', 'Segno segno', 'Coda', 'Double coda', 'D.C.', 'D.C. al Coda', 'D.C. al Double Coda', 'D.C. al Fine', 'D.S.', 'D.S. al Coda', 'D.S. al Double Coda', 'D.S. al Fine', 'D.S.S.', 'D.S.S. al Coda', 'D.S.S. al Double Coda', 'D.S.S. al Fine', 'To Coda', 'To Double Coda'];

/** Plain lengths (no tuplets) in ticks, longest first: [ticks, dur, dot]. */
const PLAIN = [];
for (const d of [1, 2, 4, 8, 16, 32, 64]) for (const dot of [2, 1, 0]) PLAIN.push([((4 / d) * (dot === 2 ? 1.75 : dot ? 1.5 : 1)) * TPQ, d, dot]);
PLAIN.sort((a, b) => b[0] - a[0]);
/** Split `ticks` into written lengths (plain, or one triplet length). Null when it can't be written. */
function lengthsFor(ticks) {
  for (const [t, dur, dot] of PLAIN) if (Math.abs(t - ticks) < 1) return [{ dur, dot }];
  for (const d of [1, 2, 4, 8, 16, 32, 64]) if (Math.abs(((4 / d) * TPQ * 2) / 3 - ticks) < 1) return [{ dur: d, dot: 0, tu: 3, tuD: 2 }];
  const out = [];
  let left = ticks;
  while (left > 1 && out.length < 16) {
    const p = PLAIN.find(([t]) => t <= left + 1);
    if (!p) return null;
    out.push({ dur: p[1], dot: p[2] });
    left -= p[0];
  }
  return left > 1 ? null : out;
}

/** The model's note for an alphaTab note. */
function noteOf(n, b, drums, arts, strings) {
  if (drums) {
    const a = arts[n.percussionArticulation];
    return { m: a ? a.outputMidiNumber : n.percussionArticulation };
  }
  const tech = {};
  if (n.isHammerPullOrigin) tech.h = true;
  if (n.slideOutType > 0) tech.sl = n.slideOutType;
  if (n.hasBend || (n.bendPoints && n.bendPoints.length)) tech.b = n.bendPoints && n.bendPoints.length ? n.bendPoints.map((p) => [p.offset, p.value]) : true; // [offset 0-60, quarter tones]
  if (n.vibrato > 0) tech.v = true;
  if (n.isPalmMute || b.isPalmMute) tech.pm = true;
  if (n.isDead) tech.x = true;
  if (n.isGhost) tech.g = true;
  if (n.isTieDestination) tech.t = true;
  if (n.isLetRing) tech.lr = true;
  if (n.harmonicType > 0 && HARMONICS[n.harmonicType]) tech.hm = n.harmonicType;
  if (n.isLeftHandTapped) tech.lht = true;
  return { s: strings - n.string + 1, f: n.fret, tech };
}

/** A model beat for an alphaTab beat (length as written). */
function beatOf(b, drums, arts, strings) {
  const beat = { dur: durOf(b.duration), dot: Math.min(2, b.dots || 0), rest: b.isRest || !b.notes.length, notes: [] };
  if (b.hasTuplet && b.tupletNumerator > 1 && !(b.tupletNumerator === 1 && b.tupletDenominator === 1)) {
    beat.tu = b.tupletNumerator;
    beat.tuD = b.tupletDenominator;
  }
  if (b.graceType && GRACE[b.graceType]) beat.grace = GRACE[b.graceType];
  if (b.isTremolo && b.tremoloPicking && b.tremoloPicking.marks > 0) beat.tp = b.tremoloPicking.marks; // tremolo picking: 1-5 slashes
  if (b.tap) beat.tap = true;
  if (b.chord && b.chord.name) beat.chord = b.chord.name;
  if (b.text) beat.txt = b.text;
  if (!beat.rest) beat.notes = b.notes.map((n) => noteOf(n, b, drums, arts, strings));
  return beat;
}

/**
 * The bar's voices as one line of beats. One voice: its beats as written. Several (e.g. drum hands and
 * feet): every beat that starts at the same time is joined, and each beat lasts until the next start.
 * Returns null when the gaps can't be written as note lengths (the caller keeps voice 1).
 */
function mergeVoices(voices, drums, arts, strings, barTicks) {
  const starts = new Map();
  const graces = new Map();
  for (const v of voices)
    for (const b of v.beats) {
      if (b.isEmpty && !b.isRest) continue;
      if (b.graceType) {
        if (!graces.has(b.displayStart)) graces.set(b.displayStart, []);
        graces.get(b.displayStart).push(b);
        continue;
      }
      if (!starts.has(b.displayStart)) starts.set(b.displayStart, []);
      starts.get(b.displayStart).push(b);
    }
  const keys = [...starts.keys()].sort((a, b) => a - b);
  const end = Math.max(barTicks, ...voices.flatMap((v) => v.beats.map((b) => b.displayStart + b.displayDuration)));
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const at = keys[i];
    const len = (i + 1 < keys.length ? keys[i + 1] : end) - at;
    const group = starts.get(at);
    // the beat as written when one voice alone starts here with this length
    const same = group.find((b) => Math.abs(b.displayDuration - len) < 1);
    for (const g of graces.get(at) || []) out.push(beatOf(g, drums, arts, strings));
    const notes = group.filter((b) => !b.isRest).flatMap((b) => b.notes.map((n) => noteOf(n, b, drums, arts, strings)));
    const sounding = group.filter((b) => !b.isRest && b.notes.length);
    const first = sounding[0] || group[0];
    const pieces = same ? [beatOf(same, drums, arts, strings)] : (lengthsFor(len) || []).map((l) => ({ ...l, rest: true, notes: [] }));
    if (!pieces.length) return null;
    pieces[0].rest = !notes.length;
    pieces[0].notes = drums ? [...new Map(notes.map((n) => [n.m, n])).values()] : [...new Map(notes.map((n) => [n.s, n])).values()];
    if (first && !same) {
      const own = beatOf(first, drums, arts, strings);
      for (const k of ['tp', 'tap', 'chord', 'txt']) if (own[k]) pieces[0][k] = own[k];
    }
    out.push(...pieces);
  }
  return out;
}

/**
 * alphaTab Score -> model. Written bars in order: repeats, endings, jumps and sections are kept as bar
 * marks (model.marks) and played in order by schedule(). model.importNotes lists what was skipped or
 * guessed, for the Import check note.
 */
export function fromScore(score) {
  const mb0 = score.masterBars[0];
  const model = { title: score.title || 'Tab', tempo: Math.round(score.tempo || 120), ts: [mb0 ? mb0.timeSignatureNumerator : 4, mb0 ? mb0.timeSignatureDenominator : 4], tempos: {}, tsBars: {}, marks: {}, tracks: [], importNotes: [] };
  const notes = new Map(); // text -> bars it applies to
  const note = (kind, text, bar) => {
    const key = `${kind}|${text}`;
    if (!notes.has(key)) notes.set(key, { kind, text, bars: [] });
    if (bar != null && !notes.get(key).bars.includes(bar + 1)) notes.get(key).bars.push(bar + 1);
  };
  let ts = model.ts;
  let bpmNow = model.tempo;
  score.masterBars.forEach((mb, i) => {
    // tempo changes: at the bar start in model.tempos, later in the bar in model.tempoMid ([[position 0..1, bpm]])
    const autos = [...(mb.tempoAutomations || (mb.tempoAutomation ? [mb.tempoAutomation] : []))].sort((x, y) => (x.ratioPosition || 0) - (y.ratioPosition || 0));
    for (const a of autos) {
      const r = a.ratioPosition || 0;
      if (r <= 0.001) {
        if (i > 0 && Math.abs(a.value - bpmNow) > 1e-6) model.tempos[i] = +a.value.toFixed(3);
      } else {
        (model.tempoMid ||= {})[i] ||= [];
        model.tempoMid[i].push([+r.toFixed(6), +a.value.toFixed(3)]);
      }
      bpmNow = a.value;
    }
    const bts = [mb.timeSignatureNumerator, mb.timeSignatureDenominator];
    if (i > 0 && (bts[0] !== ts[0] || bts[1] !== ts[1])) model.tsBars[i] = bts;
    ts = bts;
    const m = {};
    if (mb.isRepeatStart) m.ro = true;
    if (mb.repeatCount > 0) m.rc = mb.repeatCount;
    if (mb.alternateEndings) m.ae = mb.alternateEndings;
    if (mb.section) m.sec = { m: mb.section.marker || '', t: mb.section.text || '' };
    if (mb.directions && mb.directions.size) m.dirs = [...mb.directions].filter((d) => DIRECTIONS[d]);
    if (mb.isAnacrusis) m.pickup = true;
    if (Object.keys(m).length) model.marks[i] = m;
  });
  score.tracks.forEach((tr, srcIndex) => {
    const staff = tr.staves.find((s) => s.isPercussion) || tr.staves.find((s) => s.tuning && s.tuning.length) || null;
    if (!staff) {
      note('skipped', `Track “${tr.name || srcIndex + 1}” has no tab or drum staff (piano, vocals…), so Tab Studio leaves it out`);
      return;
    }
    if (tr.staves.length > 1) note('skipped', `“${tr.name}” has ${tr.staves.length} staves: Tab Studio shows the first tab or drum staff`);
    const drums = !!staff.isPercussion;
    const arts = tr.percussionArticulations || [];
    const strings = drums ? 0 : staff.tuning.length;
    const track = { id: uid('trk'), srcIndex, name: tr.name || (drums ? 'Drums' : 'Track'), kind: drums ? 'drums' : 'fretted', tuning: drums ? null : [...staff.tuning], bars: [] };
    if (!drums && staff.capo) track.capo = staff.capo;
    staff.bars.forEach((bar, bi) => {
      const mb = score.masterBars[bi];
      const barTicks = mb ? mb.calculateDuration() : 3840;
      const voices = bar.voices.filter((v) => !v.isEmpty);
      let beats = null;
      if (bar.simileMark) note('guessed', `“${track.name}”: simile (%) bars are filled with the bar they repeat`, bi);
      if (voices.length > 1) {
        beats = mergeVoices(voices, drums, arts, strings, barTicks);
        if (beats) note('changed', `“${track.name}” has ${voices.length} voices: Tab Studio joins them into one line (saving keeps one voice)`, bi);
        else note('skipped', `“${track.name}”: voice 2 could not be joined with voice 1, so only voice 1 is shown`, bi);
      }
      if (!beats) {
        const v = voices[0] || bar.voices[0];
        beats = (v ? v.beats : []).filter((b) => !b.isEmpty || b.isRest).map((b) => beatOf(b, drums, arts, strings));
      }
      // simile bars: copy the bar they repeat (as alphaTab and Guitar Pro play them)
      if (bar.simileMark && !beats.some((b) => !b.rest)) {
        const back = bar.simileMark === 1 ? 1 : 2;
        const src = track.bars[bi - back];
        if (src) beats = JSON.parse(JSON.stringify(src.beats));
      }
      for (const b of beats) {
        if (b.tu && !(b.tu === 3 && (b.tuD || 2) === 2)) note('ok', `Tuplets other than triplets (${b.tu}:${b.tuD || tupletDen(b.tu)}) are kept`, bi);
        if (b.grace) note('ok', 'Grace notes are kept (they take no time in the bar)', bi);
        for (const n of b.notes) if (n.tech && bendIsUnusual(n.tech.b)) note('changed', 'Bends with several ups and downs are saved as one bend to their highest point', bi);
      }
      for (const v of voices)
        for (const b of v.beats) {
          if (b.hasWhammyBar) note('skipped', 'Whammy bar dives are not kept when you save from Tab Studio (the video tab marks them)', bi);
          for (const n of b.notes) {
            if (n.isTrill) note('skipped', 'Trills are shown as the main note', bi);
            if (n.isStaccato || n.accentuated) note('skipped', 'Staccato and accents are not kept when you save from Tab Studio', bi);
            if (n.slideInType > 0) note('skipped', 'Slides into a note (from below or above) are not kept when you save from Tab Studio', bi);
          }
          if (b.brushType) note('skipped', 'Strums (brush up/down) play as one chord', bi);
        }
      track.bars.push({ beats: beats.length ? beats : emptyBar(tsAt(model, bi)).beats });
    });
    if (drums) {
      const missing = new Set();
      for (const bar of track.bars) for (const b of bar.beats) for (const n of b.notes) if (!DRUM_PIECES.some((p) => p[0] === n.m)) missing.add(n.m);
      if (missing.size) note('ok', `“${track.name}” uses drum sounds outside the usual kit (MIDI ${[...missing].sort((a, b) => a - b).join(', ')}); each gets its own row`);
    }
    model.tracks.push(track);
  });
  // bars past a voice's time signature (Guitar Pro allows them): kept, and flagged red as before
  model.tracks.forEach((t) =>
    t.bars.forEach((bar, bi) => {
      if (barFill(bar) > barLen(model, bi) + 1e-6) note('guessed', `“${t.name}” has bars longer than their time signature (Guitar Pro allows this): they are kept and shown in red`, bi);
    }),
  );
  model.importNotes = [...notes.values()].filter((n) => n.kind !== 'ok');
  if (!Object.keys(model.tsBars).length) delete model.tsBars;
  if (!Object.keys(model.marks).length) delete model.marks;
  return model;
}

/** "bars 3, 4, 5, 9" -> "bars 3–5, 9" (for the Import check). */
export function barList(bars) {
  const s = [...bars].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.length > 8 ? `${out.slice(0, 8).join(', ')}…` : out.join(', ');
}

// ------------------------------------------------------------ save

// eslint-disable-next-line no-control-regex
const texString = (s) => `"${String(s || '').replace(/["\\\u0000-\u001f]/g, '')}"`;

/**
 * A bend as AlphaTex `b` values. alphaTab's Guitar Pro 7 writer keeps only the usual shapes (bend, release,
 * bend and release, pre-bend…), so the shape is reduced to its turning points; other shapes become a plain
 * bend to their highest point. tech.b: true (a full bend) or [[offset 0-60, quarter tones], …].
 */
export function bendValues(b) {
  if (!Array.isArray(b) || b.length < 2) return [0, 4];
  const vals = [];
  for (const p of b) {
    const v = Math.round(Array.isArray(p) ? p[1] : p);
    if (vals[vals.length - 1] !== v) vals.push(v);
  }
  if (vals.length === 1) return [vals[0], vals[0]]; // pre-bend held
  if (vals.length === 2) return vals; // bend or release
  if (vals.length === 3 && vals[0] < vals[1] && vals[2] < vals[1]) return [vals[0], vals[1], vals[1], vals[2]]; // bend and release
  return [vals[0], Math.max(...vals)];
}
/** True when the bend's shape is not one bendValues() keeps exactly. */
const bendIsUnusual = (b) => Array.isArray(b) && b.length > 1 && (() => {
  const vals = [];
  for (const p of b) {
    const v = Math.round(p[1]);
    if (vals[vals.length - 1] !== v) vals.push(v);
  }
  return vals.length > 3 || (vals.length === 3 && !(vals[0] < vals[1] && vals[2] < vals[1]));
})();

function texFretted(beat) {
  if (beat.rest || !beat.notes.length) return `r.${beat.dur}${lenFx(beat)}`;
  const notes = beat.notes
    .slice()
    .sort((a, b) => a.s - b.s)
    .map((n) => {
      const fx = [];
      if (n.tech.h) fx.push('h');
      if (n.tech.sl) fx.push(SLIDES[n.tech.sl] || 'sl');
      if (n.tech.b) fx.push(`b (${bendValues(n.tech.b).join(' ')})`);
      if (n.tech.v) fx.push('v');
      if (n.tech.pm) fx.push('pm');
      if (n.tech.g) fx.push('g');
      if (n.tech.lr) fx.push('lr');
      if (n.tech.hm && HARMONICS[n.tech.hm]) fx.push(HARMONICS[n.tech.hm][0]);
      if (n.tech.lht) fx.push('lht');
      const fret = n.tech.t ? '-' : n.tech.x ? 'x' : Math.max(0, Math.round(n.f));
      return `${fret}.${n.s}${fx.length ? `{${fx.join(' ')}}` : ''}`;
    });
  const body = notes.length === 1 ? notes[0] : `(${notes.join(' ')})`;
  return `${body}.${beat.dur}${lenFx(beat)}`;
}

/** Drum beats use ":dur" prefixes and bare GM numbers. */
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
    push(b.dur, `${body}${lenFx(b)}`);
  }
  return out.join(' ');
}

/** Bar metadata: time signature changes, tempo changes, repeats, endings, sections, jumps, pickup. */
function barHead(model, i) {
  const out = [];
  const ts = model.tsBars && model.tsBars[i];
  if (i === 0) out.push(`\\ts ${model.ts[0]} ${model.ts[1]}`);
  else if (ts) out.push(`\\ts ${ts[0]} ${ts[1]}`);
  if (model.tempos && model.tempos[i]) out.push(`\\tempo ${Math.round(model.tempos[i])}`);
  const m = model.marks && model.marks[i];
  if (m) {
    if (m.pickup) out.push('\\ac');
    if (m.sec) out.push(`\\section ${m.sec.m ? `${texString(m.sec.m)} ` : ''}${texString(m.sec.t || m.sec.m || 'Section')}`);
    if (m.ro) out.push('\\ro');
    if (m.ae) out.push(`\\ae (${[0, 1, 2, 3, 4, 5, 6, 7].filter((k) => m.ae & (1 << k)).map((k) => k + 1).join(' ')})`);
    if (m.rc) out.push(`\\rc ${m.rc}`);
    for (const d of m.dirs || []) if (DIRECTIONS[d]) out.push(`\\jump ${DIRECTIONS[d]}`);
  }
  return out.length ? `${out.join(' ')} ` : '';
}

/**
 * Where each mid-bar tempo change (model.tempoMid) is written: on the beat, in any track, that starts nearest
 * to it. Returns Map "track|bar" -> Map(beat index -> bpm).
 */
function midTempoPlaces(model) {
  const out = new Map();
  for (const [k, list] of Object.entries(model.tempoMid || {})) {
    const bi = Number(k);
    const len = barLen(model, bi);
    for (const [r, bpm] of list) {
      let best = null;
      model.tracks.forEach((t, ti) => {
        const bar = t.bars[bi];
        if (!bar) return;
        let q = 0;
        bar.beats.forEach((b, ki) => {
          // shortcut: a change can only sit on a beat; the bar's first beat would make it a bar-start change
          if (q > 1e-9 || r <= 0) {
            const d = Math.abs(q - r * len);
            if (!best || d < best.d - 1e-9) best = { d, ti, ki };
          }
          q += beatQuarters(b);
        });
      });
      if (!best) continue;
      const key = `${best.ti}|${bi}`;
      if (!out.has(key)) out.set(key, new Map());
      out.get(key).set(best.ki, bpm);
    }
  }
  return out;
}

/** The bar's beats with the mid-bar tempo changes placed on them (see midTempoPlaces). */
function withMidTempos(places, ti, bar, bi) {
  const at = places.get(`${ti}|${bi}`);
  if (!at) return bar;
  return { ...bar, beats: bar.beats.map((b, k) => (at.has(k) ? { ...b, _tempo: at.get(k) } : b)) };
}

/** model -> AlphaTex source. */
export function toAlphaTex(model) {
  const lines = [`\\title ${texString(model.title)} \\tempo ${Math.round(model.tempo)} .`];
  const places = midTempoPlaces(model);
  model.tracks.forEach((t, ti) => {
    const barsOf = () => t.bars.map((bar, bi) => withMidTempos(places, ti, bar, bi));
    if (t.kind === 'drums') {
      lines.push(`\\track ${texString(t.name)} \\instrument percussion`);
      lines.push(barsOf().map((bar, i) => `${barHead(model, i)}${texDrumBar(bar)}`).join(' | ') + ' |');
    } else {
      lines.push(`\\track ${texString(t.name)}`);
      lines.push(`\\tuning (${t.tuning.map(texPitch).join(' ')})${t.capo ? ` \\capo ${t.capo}` : ''}`);
      lines.push(barsOf().map((bar, i) => `${barHead(model, i)}${bar.beats.map(texFretted).join(' ')}`).join(' | ') + ' |');
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
    const all = [e, e.inner, e.cause].filter(Boolean);
    const items = all.flatMap((x) => ['lexerDiagnostics', 'parserDiagnostics', 'semanticDiagnostics'].flatMap((k) => (x[k] && x[k].items) || [])).filter((d) => d.severity > 0).sort((a, b) => b.severity - a.severity); // errors first
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

/** Fill a short bar with rests up to the time signature (`ts`, or a length in quarter notes). */
export function padBar(bar, ts) {
  let room = (Array.isArray(ts) ? barQuarters(ts) : ts) - barFill(bar);
  for (const d of [1, 2, 4, 8, 16, 32]) {
    while (room + 1e-9 >= 4 / d) {
      bar.beats.push(emptyBeat(d));
      room -= 4 / d;
    }
  }
}

/** Shift everything kept per bar (tempo and time signature changes, repeat and section marks): `n` bars added after `at` (n > 0), or bar `at` removed (n = -1, its own entries already deleted). */
function shiftBarMaps(model, at, n) {
  for (const key of ['tempos', 'tempoMid', 'tsBars', 'marks']) {
    if (!model[key]) continue;
    const next = {};
    for (const [k, v] of Object.entries(model[key])) {
      const i = Number(k);
      if (i <= at) next[i] = v;
      else if (n > 0 || i > at - n - 1) next[i + n] = v;
    }
    model[key] = next;
  }
}

/** Add `n` empty bars to every track after bar `at` (so tracks stay aligned), in that bar's time signature. */
export function insertBars(model, at, n = 1) {
  const ts = tsAt(model, at);
  for (const t of model.tracks) for (let i = 0; i < n; i++) t.bars.splice(at + 1, 0, emptyBar(ts));
  shiftBarMaps(model, at, n);
}

export function deleteBar(model, at) {
  if (model.tracks[0].bars.length <= 1) return;
  // a time signature change on the removed bar moves to the bar that takes its place
  const ts = model.tsBars && model.tsBars[at];
  const tempo = model.tempos && model.tempos[at];
  for (const t of model.tracks) t.bars.splice(at, 1);
  if (model.marks) delete model.marks[at];
  if (model.tsBars) delete model.tsBars[at];
  if (model.tempos) delete model.tempos[at];
  if (model.tempoMid) delete model.tempoMid[at];
  shiftBarMaps(model, at, -1);
  if (ts && model.tsBars && !model.tsBars[at] && at < model.tracks[0].bars.length) model.tsBars[at] = ts;
  if (tempo && model.tempos && !model.tempos[at] && at < model.tracks[0].bars.length) model.tempos[at] = tempo;
}

/** Make all tracks the same number of bars (the longest). */
export function alignTracks(model) {
  const n = Math.max(1, ...model.tracks.map((t) => t.bars.length));
  for (const t of model.tracks) while (t.bars.length < n) t.bars.push(emptyBar(tsAt(model, t.bars.length)));
}

/** Problems that would make the file wrong: [{ track, bar, message }]. */
export function checkModel(model) {
  const out = [];
  model.tracks.forEach((t) =>
    t.bars.forEach((bar, bi) => {
      const q = barLen(model, bi);
      const f = barFill(bar);
      if (f > q + 1e-9) out.push({ track: t.name, bar: bi + 1, message: `bar ${bi + 1} of ${t.name} is too long` });
      else if (f < q - 1e-9) out.push({ track: t.name, bar: bi + 1, message: `bar ${bi + 1} of ${t.name} is short (rests will be added)`, short: true });
    }),
  );
  return out;
}

// ------------------------------------------------------------ playback

/** Pitch (MIDI) of a fretted note (the capo raises every string). */
export const notePitch = (track, n) => track.tuning[n.s - 1] + (track.capo || 0) + n.f;

/** Bars in the order they play: repeats, alternate endings and jumps (model.marks) followed, as in the video. */
export function playOrder(model) {
  const count = Math.max(0, ...model.tracks.map((t) => t.bars.length));
  if (!model.marks || !Object.keys(model.marks).length) return Array.from({ length: count }, (_, i) => i);
  const bars = Array.from({ length: count }, (_, i) => {
    const m = model.marks[i] || {};
    return { isRepeatStart: !!m.ro, repeatCount: m.rc || 0, alternateEndings: m.ae || 0, directions: m.dirs || null };
  });
  return playbackOrder(bars);
}

/**
 * Start time and tempo of every bar, following tempo changes (also mid-bar ones, model.tempoMid) and time
 * signature changes. `bars[i]` is where written bar i first plays; `plays` lists every bar as it plays,
 * repeats included, each with `at(q)`: seconds from the bar start to quarter note q.
 */
export function barTimes(model) {
  const count = Math.max(0, ...model.tracks.map((t) => t.bars.length));
  const startBpm = [];
  let bpm = model.tempo || 120;
  for (let i = 0; i < count; i++) {
    if (model.tempos && model.tempos[i]) bpm = model.tempos[i];
    startBpm.push(bpm);
    const mid = model.tempoMid && model.tempoMid[i];
    if (mid && mid.length) bpm = mid[mid.length - 1][1];
  }
  const timing = (i) => {
    const len = barLen(model, i);
    const segs = [];
    let from = 0;
    let b = startBpm[i];
    for (const [r, v] of (model.tempoMid && model.tempoMid[i]) || []) {
      const q = r * len;
      if (q > from) segs.push({ from, to: q, spq: 60 / Math.max(20, b) });
      from = Math.max(from, q);
      b = v;
    }
    segs.push({ from, to: Infinity, spq: 60 / Math.max(20, b) });
    const at = (q) => {
      let s = 0;
      for (const g of segs) {
        if (q <= g.from) break;
        s += (Math.min(q, g.to) - g.from) * g.spq;
      }
      return s;
    };
    return { at, len: at(len) };
  };
  const plays = [];
  const bars = new Array(count);
  let time = 0;
  for (const i of playOrder(model)) {
    const spq = 60 / Math.max(20, startBpm[i]);
    const { at, len } = timing(i);
    plays.push({ bar: i, time, spq, bpm: startBpm[i], len, at });
    if (!bars[i]) bars[i] = { time, spq, bpm: startBpm[i] };
    time += len;
  }
  // bars that never play (an ending that is skipped) sit at the end
  for (let i = 0; i < count; i++) if (!bars[i]) bars[i] = { time, spq: 60 / Math.max(20, startBpm[i]), bpm: startBpm[i], unplayed: true };
  return { bars, plays, duration: time };
}

/**
 * Timed events for playback, MIDI and the cursor: [{ time, dur, bar, beat, track, notes }], plus bar times.
 * Tied notes are not played again; grace notes sound just before (or on) the beat they lead into.
 */
export function schedule(model) {
  const { bars, plays, duration } = barTimes(model);
  const events = [];
  const GRACE_S = 0.06;
  model.tracks.forEach((t, ti) => {
    for (const { bar: bi, time, at } of plays) {
      const bar = t.bars[bi];
      if (!bar) continue;
      let q = 0;
      bar.beats.forEach((b, ki) => {
        const len = beatQuarters(b);
        const notes = t.kind === 'drums' ? b.notes : b.notes.filter((n) => !(n.tech && n.tech.t));
        if (!b.rest && notes.length) {
          const start = time + at(q);
          if (b.grace) events.push({ time: b.grace === 'on' ? start : Math.max(0, start - GRACE_S), dur: GRACE_S, bar: bi, beat: ki, track: ti, notes, grace: true });
          else events.push({ time: start, dur: at(q + len) - at(q), bar: bi, beat: ki, track: ti, notes });
        }
        q += len;
      });
    }
  });
  events.sort((a, b) => a.time - b.time);
  return { events, bars, plays, duration };
}

/** The beat a time falls in for one track: { bar, beat } (clamped). Follows repeats. */
export function beatAtTime(model, ti, time) {
  const { plays } = barTimes(model);
  const t = model.tracks[ti];
  if (!plays.length) return { bar: 0, beat: 0 };
  let p = 0;
  while (p < plays.length - 1 && plays[p + 1].time <= time) p++;
  const bi = Math.min(plays[p].bar, t.bars.length - 1);
  const into = time - plays[p].time;
  const beats = t.bars[bi].beats;
  let q = 0;
  for (let k = 0; k < beats.length; k++) {
    if (beats[k].grace) continue;
    q += beatQuarters(beats[k]);
    if (into < plays[p].at(q) - 1e-9) return { bar: bi, beat: k };
  }
  return { bar: bi, beat: beats.length - 1 };
}
