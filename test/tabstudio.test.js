import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTabBytes, buildTabTimeline } from '../js/tab.js';
import { drumTimelineFromScore } from '../js/drums.js';
import * as E from '../js/tabedit.js';
import * as X from '../js/transcribe.js';

const fixture = (n) => parseTabBytes(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

/** What a player hears: per track, sorted notes at each time. */
function sound(score) {
  return score.tracks.map((tr, i) => {
    if (tr.staves[0].isPercussion) return drumTimelineFromScore(score, i).hits.map((h) => `${h.time.toFixed(2)}${h.lane}`).join(',');
    return buildTabTimeline(score, i).events.map((e) => `${e.time.toFixed(2)}:${e.notes.map((n) => `${n.line}/${n.fret}${n.bend ? 'b' : ''}`).sort().join('+')}`).join(',');
  });
}

test('Guitar Pro files round-trip through the editor model unchanged', async () => {
  for (const f of ['spark-band.gp', 'spark-drums.gp', 'spark-riff.gp']) {
    const a = await fixture(f);
    const model = E.fromScore(a);
    const b = await parseTabBytes(await E.toGpBytes(model));
    assert.deepEqual(sound(b), sound(a), f);
  }
  const riff = E.fromScore(await fixture('spark-riff.gp'));
  assert.deepEqual(riff.tempos, { 2: 140 }, 'tempo change kept');
});

test('edits: frets, techniques, lengths, rests, beats and bars', async () => {
  const m = E.newSong({ tempo: 100 });
  const t = m.tracks[0];
  assert.equal(t.bars.length, 4);
  assert.equal(E.barFill(t.bars[0]), 4);
  E.setFret(t, 0, 0, 6, 3);
  E.setFret(t, 0, 0, 5, 5);
  E.setFret(t, 0, 0, 6, 30); // clamped to 24
  assert.deepEqual(t.bars[0].beats[0].notes.map((n) => [n.s, n.f]), [[6, 24], [5, 5]]);
  assert.ok(E.toggleTech(t, 0, 0, 5, 'pm'));
  assert.equal(E.toggleTech(t, 0, 1, 5, 'pm'), false, 'no note there');
  // a full bar refuses a longer beat
  assert.equal(E.setDuration(t, 0, 0, 2, m.ts), false);
  assert.ok(E.setDuration(t, 0, 0, 8, m.ts));
  assert.equal(E.barFill(t.bars[0]), 3.5);
  const k = E.insertBeat(t, 0, 0, m.ts);
  assert.equal(k, 1);
  assert.equal(t.bars[0].beats[1].dur, 8);
  assert.equal(E.barFill(t.bars[0]), 4);
  // full bar: insert splits the beat
  E.insertBeat(t, 0, 2, m.ts);
  assert.equal(E.barFill(t.bars[0]), 4);
  assert.ok(!E.toggleDot(t, 0, 0, m.ts), 'no room for a dot');
  E.clearNote(t, 0, 0, 6);
  E.clearNote(t, 0, 0, 5);
  assert.ok(t.bars[0].beats[0].rest);
  m.tempos = { 2: 140 };
  E.insertBars(m, 0, 2);
  assert.equal(t.bars.length, 6);
  assert.deepEqual(m.tempos, { 4: 140 });
  E.deleteBar(m, 1);
  assert.deepEqual(m.tempos, { 3: 140 });
  // short bars are reported and padded
  t.bars[0].beats = [E.emptyBeat(4)];
  assert.ok(E.checkModel(m).some((i) => i.short));
  E.padBar(t.bars[0], m.ts);
  assert.equal(E.barFill(t.bars[0]), 4);
  // drums
  m.tracks.push(E.newTrack('drums', { bars: t.bars.length }));
  const d = m.tracks[1];
  E.toggleDrum(d, 0, 0, 36);
  E.toggleDrum(d, 0, 0, 42);
  E.toggleDrum(d, 0, 0, 42);
  assert.deepEqual(d.bars[0].beats[0].notes, [{ m: 36 }]);
  d.bars[0].beats[1].dot = true; // dotted drum beat becomes beat + rest in the file
  d.bars[0].beats.splice(2, 1, E.emptyBeat(8));
  assert.equal(E.barFill(d.bars[0]), 4);
  const back = await parseTabBytes(await E.toGpBytes(m));
  assert.equal(back.tracks.length, 2);
  assert.equal(back.tracks[1].staves[0].isPercussion, true);
  assert.equal(drumTimelineFromScore(back, 1).hits[0].lane, 'kick');
  // tuning names and AlphaTex escapes
  assert.equal(E.texPitch(64), 'e4');
  assert.equal(E.texPitch(35), 'b1');
  m.title = 'He said "hi"';
  assert.ok(E.toAlphaTex(m).startsWith('\\title "He said hi"'));
});

test('playback schedule follows tempo changes', () => {
  const m = E.newSong({ tempo: 120 });
  m.tracks[0].bars.forEach((bar) => (bar.beats[0].rest = false, bar.beats[0].notes = [{ s: 1, f: 0, tech: {} }]));
  m.tempos = { 2: 60 };
  const { events, duration, bars } = E.schedule(m);
  assert.deepEqual(events.map((e) => e.time), [0, 2, 4, 8]);
  assert.equal(duration, 12);
  assert.equal(bars[2].bpm, 60);
  // bar 3 starts at 4 s at 60 BPM: one quarter = 1 s
  assert.deepEqual(E.beatAtTime(m, 0, 4.5), { bar: 2, beat: 0 });
  assert.deepEqual(E.beatAtTime(m, 0, 5.1), { bar: 2, beat: 1 });
  assert.equal(E.notePitch({ tuning: [64, 59, 55, 50, 45, 40] }, { s: 6, f: 5 }), 45);
});

// ---- transcription on synthetic stems
const sr = 22050;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function pluck(notes, secs) {
  const out = new Float32Array(Math.ceil(secs * sr));
  for (const { t, d, midis } of notes) {
    for (const m of midis) {
      const f = hz(m);
      const s0 = Math.round(t * sr);
      for (let i = 0; i < d * sr && s0 + i < out.length; i++) {
        const x = i / sr;
        out[s0 + i] += 0.25 * (Math.sin(2 * Math.PI * f * x) + 0.5 * Math.sin(4 * Math.PI * f * x) + 0.3 * Math.sin(6 * Math.PI * f * x)) * Math.exp(-x * 3) * Math.min(1, i / 40);
      }
    }
  }
  return out;
}
const played = (tr) => tr.bars.flatMap((b) => b.beats).filter((b) => !b.rest).map((b) => b.notes.map((n) => E.notePitch(tr, n)).sort((a, b) => a - b).join('+'));

test('YIN finds the pitch of a low bass note and a guitar note', () => {
  for (const m of [28, 40, 64, 76]) {
    const frame = pluck([{ t: 0, d: 0.3, midis: [m] }], 0.3).subarray(2000, 2000 + 2048);
    const { freq, conf } = X.yin(frame, sr, 30, 1400);
    assert.ok(Math.abs(X.midiOf(freq) - m) < 0.3, `${m}: ${X.midiOf(freq)}`);
    assert.ok(conf > 0.8);
  }
  assert.equal(X.yin(new Float32Array(2048), sr).freq, 0, 'silence');
});

test('bass stem -> notes on the beat, repeated notes kept, held notes as quarters', () => {
  const midis = [40, 40, 43, 45, 47, 45, 43, 40, 45, 45, 48, 50];
  const notes = [];
  let t = 0.5;
  midis.forEach((m, i) => {
    const d = i % 4 === 3 ? 0.5 : 0.25;
    notes.push({ t, d: d * 0.95, midis: [m] });
    t += d;
  });
  const r = X.transcribeSamples(pluck(notes, t + 1), sr, 'bass', { bpm: 120, firstBeat: 0.5, ts: [4, 4] });
  assert.deepEqual(played(r.track).map(Number), midis);
  assert.equal(r.offset, 0.5);
  const durs = r.track.bars.flatMap((b) => b.beats).filter((b) => !b.rest).map((b) => b.dur);
  assert.deepEqual(durs, [8, 8, 8, 4, 8, 8, 8, 4, 8, 8, 8, 4]);
  for (const bar of r.track.bars) assert.equal(E.barFill(bar), 4);
});

test('lead stem: sixteenths and frets that stay in position', () => {
  const midis = [64, 67, 69, 71, 69, 67, 64, 62, 64, 76, 74, 71];
  const notes = midis.map((m, i) => ({ t: 0.5 + i * 0.125, d: 0.12, midis: [m] }));
  const r = X.transcribeSamples(pluck(notes, 3), sr, 'lead', { bpm: 120, firstBeat: 0.5, ts: [4, 4] });
  assert.deepEqual(played(r.track).map(Number), midis);
  const frets = r.track.bars.flatMap((b) => b.beats).filter((b) => !b.rest).map((b) => b.notes[0].f);
  assert.ok(Math.max(...frets) <= 12);
});

test('rhythm stem -> chord names and power-chord shapes', () => {
  const prog = [[40, 47, 52], [43, 47, 50, 55], [45, 52, 57, 60]];
  const notes = [];
  let t = 0.5;
  prog.forEach((ch) => {
    for (let k = 0; k < 4; k++) {
      notes.push({ t, d: 0.48, midis: ch });
      t += 0.5;
    }
  });
  const r = X.transcribeSamples(pluck(notes, t + 0.5), sr, 'rhythm', { bpm: 120, firstBeat: 0.5, ts: [4, 4] });
  assert.deepEqual(r.stats.chords, ['E5', 'G', 'Am']);
  const shapes = played(r.track);
  assert.equal(shapes[0], '40+47+52', 'E5 = E B E');
  assert.ok(shapes.includes('43+50+55'), 'G5 shape');
  assert.ok(shapes.includes('45+52+57'), 'A5 shape');
  // power chords in drop D and on a 4-string bass tuning stay playable
  assert.deepEqual(X.powerChord(2, E.TUNINGS['Guitar · Drop D']).map((n) => [n.s, n.f]), [[6, 0], [5, 0], [4, 0]]);
  assert.deepEqual(X.powerChord(4, E.TUNINGS['Guitar · Standard E']).map((n) => [n.s, n.f]), [[6, 0], [5, 2], [4, 2]]);
});

test('drum hits -> a percussion track on the grid', async () => {
  const hits = [];
  for (let b = 0; b < 8; b++) {
    hits.push({ time: 1 + b * 0.5, lane: b % 2 ? 'snare' : 'kick' });
    hits.push({ time: 1 + b * 0.5 + 0.004, lane: 'hihat' });
    hits.push({ time: 1.25 + b * 0.5, lane: 'hihat' });
  }
  const r = X.drumsToTrack(hits, { bpm: 120, firstBeat: 1, ts: [4, 4] });
  assert.equal(r.track.kind, 'drums');
  assert.equal(r.offset, 1);
  const beats = r.track.bars[0].beats;
  assert.deepEqual(beats.map((b) => b.dur), [8, 8, 8, 8, 8, 8, 8, 8]);
  assert.deepEqual(beats[0].notes.map((n) => n.m).sort(), [36, 42]);
  assert.deepEqual(beats[1].notes.map((n) => n.m), [42]);
  const m = { title: 'd', tempo: 120, ts: [4, 4], tempos: {}, tracks: [{ id: 'x', ...r.track }] };
  const back = await parseTabBytes(await E.toGpBytes(m));
  assert.equal(drumTimelineFromScore(back, 0).hits.filter((h) => h.lane === 'snare').length, 4);
});

test('quantiser: syncopation, bar lines and fret choice', () => {
  assert.deepEqual(X.splitSlots(2, 4), [{ slots: 4, dur: 4, dot: false }], 'syncopated quarter');
  assert.deepEqual(X.splitSlots(0, 6), [{ slots: 6, dur: 4, dot: true }]);
  assert.deepEqual(X.splitSlots(1, 3).map((x) => x.slots), [2, 1], 'an eighth may start off the beat');
  assert.deepEqual(X.splitSlots(2, 8).map((x) => x.slots), [6, 2], 'a half note waits for a beat');
  // a note crossing the bar line is cut there and the next bar starts with a rest
  const q = X.quantizeToBars([{ start: 1.5, end: 2.5, notes: [{ s: 1, f: 0 }] }], { bpm: 120, firstBeat: 0, ts: [4, 4] });
  assert.equal(q.bars.length, 2);
  for (const bar of q.bars) assert.equal(E.barFill(bar), 4);
  // fret choice keeps the hand still: an A-minor pentatonic run stays around the 5th fret
  const run = [57, 60, 62, 64, 67, 69];
  const fr = X.assignFrets(run, E.TUNINGS['Guitar · Standard E']);
  assert.ok(fr.every((x) => x && x.f <= 8), JSON.stringify(fr));
  assert.equal(X.assignFrets([20], E.TUNINGS['Guitar · Standard E'])[0], null, 'too low for guitar');
});
