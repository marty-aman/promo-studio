// Stem to tab: clean-up, grid snapping, fret choosing, tunings and MIDI output (no model needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNotes, snapToGrid, chooseFrets, joinAtSeams, tuningFor, playableRange, notesToTrack, modelToMidi, GRIDS } from '../js/stemtab.js';
import { TUNINGS, barFill, barQuarters, emptyBar } from '../js/tabedit.js';
import { parseMidi } from '../js/midi.js';

const n = (start, pitch, dur = 0.3, amp = 0.8) => ({ start, pitch, dur, amp });
const STD = TUNINGS['Guitar · Standard E'];

test('tuning comes from the song key text', () => {
  assert.equal(tuningFor('guitar', 'E minor, drop D'), 'Guitar · Drop D');
  assert.equal(tuningFor('guitar', 'Drop C'), 'Guitar · Drop C');
  assert.equal(tuningFor('guitar', '7-string, B standard'), 'Guitar 7 · Standard B');
  assert.equal(tuningFor('guitar', ''), 'Guitar · Standard E');
  assert.equal(tuningFor('bass', 'drop D'), 'Bass · Drop D');
  for (const k of ['Guitar · Drop D', 'Guitar · Drop C', 'Guitar 7 · Standard B', 'Bass · Standard E']) assert.ok(TUNINGS[k], k);
});

test('playable range: guitar E2-E6, bass E1-G4, lower for drop tunings', () => {
  assert.deepEqual(playableRange(STD), [40, 88]);
  assert.deepEqual(playableRange(TUNINGS['Bass · Standard E']), [28, 67]);
  assert.ok(playableRange(TUNINGS['Guitar · Drop C'])[0] < 40);
});

test('clean-up drops short, quiet and out-of-range notes, overtones and duplicates', () => {
  const raw = [n(0, 40), n(0.5, 43, 0.01), n(1, 45, 0.3, 0.02), n(1.5, 30), n(2, 45), n(2, 57, 0.3, 0.3), n(3, 47, 0.3), n(3.1, 47, 0.3)];
  const { notes, stats } = cleanNotes(raw, { range: [40, 88] });
  assert.deepEqual(notes.map((x) => [x.start, x.pitch]), [[0, 40], [2, 45], [3, 47]]);
  assert.equal(stats.short, 1);
  assert.equal(stats.quiet, 1);
  assert.equal(stats.range, 1);
  assert.equal(stats.overtones, 1);
  assert.equal(stats.merged, 1);
  assert.ok(notes.every((x) => x.vel >= 1 && x.vel <= 127));
});

test('single-note parts keep one note at a time', () => {
  const { notes } = cleanNotes([n(0, 45, 0.5, 0.9), n(0.01, 52, 0.5, 0.3), n(0.5, 47, 0.5, 0.8)], { mono: true, range: [40, 88] });
  assert.deepEqual(notes.map((x) => x.pitch), [45, 47]);
});

test('a note cut by a window edge is joined', () => {
  const j = joinAtSeams([n(0.5, 45, 1.5), n(2.0, 45, 1), n(2.0, 50, 0.2)], [2.0]);
  assert.equal(j.length, 2);
  const a = j.find((x) => x.pitch === 45);
  assert.ok(Math.abs(a.dur - 2.5) < 1e-6);
});

test('snap to the grid: 16ths, triplets, off', () => {
  // 120 BPM: a quarter = 0.5 s. First beat at 1.0 s.
  const notes = [n(1.0, 40), n(1.26, 43), n(1.5, 45), n(1.52, 47)];
  const s16 = snapToGrid(notes, { bpm: 120, firstBeat: 1, grid: '16' });
  assert.equal(s16.perQuarter, 4);
  assert.ok(Math.abs(s16.origin - 1) < 1e-6);
  assert.deepEqual(s16.slots.map((x) => x.slot), [0, 2, 4]);
  assert.deepEqual(s16.slots[2].pitches.slice().sort(), [45, 47]); // two notes in one step = a chord
  const tr = snapToGrid([n(1.0, 40), n(1.1667, 43), n(1.3333, 45)], { bpm: 120, firstBeat: 1, grid: '8t' });
  assert.equal(tr.perQuarter, 3);
  assert.deepEqual(tr.slots.map((x) => x.slot), [0, 1, 2]);
  assert.equal(snapToGrid(notes, { bpm: 120, firstBeat: 1, grid: 'off' }).perQuarter, 8);
  assert.deepEqual(GRIDS.map((g) => g[0]), ['16', '8', '8t', 'off']);
});

test('frets: every note is playable at its pitch, low frets, chords on neighbouring strings', () => {
  const fr = chooseFrets([[40], [43], [45], [52], [40, 47], [47, 52, 55]], STD);
  fr.forEach((chord, i) => assert.ok(chord.length >= 1, `slot ${i}`));
  const pitch = (x) => STD[x.s - 1] + x.f;
  assert.deepEqual(fr[0].map(pitch), [40]);
  assert.equal(fr[0][0].f, 0); // open low E, not 5th fret of the A string
  assert.deepEqual(fr[4].map(pitch).sort((a, b) => a - b), [40, 47]);
  const strings = fr[5].map((x) => x.s).sort((a, b) => a - b);
  assert.equal(strings[strings.length - 1] - strings[0], strings.length - 1, 'neighbouring strings');
  for (const chord of fr) for (const x of chord) assert.ok(x.f >= 0 && x.f <= 22);
  // a run in one hand position stays near itself
  const run = chooseFrets([[52], [53], [55], [57], [59]], STD).map((c) => c[0].f);
  assert.ok(Math.max(...run) - Math.min(...run) <= 5, JSON.stringify(run));
});

test('frets: drop D and 7-string reach notes standard tuning cannot', () => {
  const low = chooseFrets([[38]], STD);
  assert.equal(low[0].length, 0);
  const dropD = TUNINGS['Guitar · Drop D'];
  assert.equal(chooseFrets([[38]], dropD)[0][0].f, 0);
  const seven = TUNINGS['Guitar 7 · Standard B'];
  assert.equal(chooseFrets([[35]], seven)[0][0].f, 0);
});

test('draft track: bars are full, the grid choice sets the beat lengths, frets match the notes', () => {
  const notes = [n(0.5, 40, 0.2), n(0.75, 43, 0.2), n(1.0, 45, 0.45), n(1.5, 47, 0.2), n(2.5, 50, 0.4)];
  const res = notesToTrack(notes, { tuning: STD, bpm: 120, firstBeat: 0.5, grid: '16', stemId: 'm1' });
  assert.equal(res.track.draft, 'stem');
  assert.equal(res.track.stemId, 'm1');
  assert.equal(res.stats.notes, 5);
  for (const bar of res.track.bars) assert.ok(Math.abs(barFill(bar) - barQuarters([4, 4])) < 1e-9);
  const played = res.track.bars.flatMap((b) => b.beats).filter((b) => !b.rest);
  assert.deepEqual(played.map((b) => STD[b.notes[0].s - 1] + b.notes[0].f), [40, 43, 45, 47, 50]);
  const tr = notesToTrack([n(0, 40, 0.15), n(1 / 6, 43, 0.15), n(2 / 6, 45, 0.15)], { tuning: STD, bpm: 120, firstBeat: 0, grid: '8t' });
  const beats = tr.track.bars[0].beats.filter((b) => !b.rest);
  assert.ok(beats.every((b) => b.tu === 3), 'triplet beats are marked');
  assert.ok(Math.abs(barFill(tr.track.bars[0]) - 4) < 1e-9);
});

test('MIDI out: the model plays the same notes at the same times, dead notes left out', () => {
  const res = notesToTrack([n(0, 40, 0.4), n(0.5, 43, 0.4), n(1.0, 45, 0.4)], { tuning: STD, bpm: 120, firstBeat: 0, grid: '8' });
  const model = { title: 't', tempo: 120, ts: [4, 4], tempos: {}, offset: 0, tracks: [{ id: 'a', ...res.track }] };
  const bytes = modelToMidi(model);
  const midi = parseMidi(bytes);
  assert.deepEqual(midi.notes.map((x) => x.note ?? x.midi ?? x.pitch), [40, 43, 45]);
  assert.ok(Math.abs(midi.notes[1].time - 0.5) < 0.02, JSON.stringify(midi.notes[1]));
  assert.equal(modelToMidi({ ...model, tracks: [{ name: 'x', kind: 'fretted', tuning: STD, bars: [emptyBar([4, 4])] }] }), null);
});
