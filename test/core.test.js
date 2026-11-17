import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  parseTime,
  layoutClips,
  clipAt,
  splitClip,
  maxClipDuration,
  fadeGain,
  activeLyric,
  linesFromText,
  wordTimings,
  parseLRC,
  toLRC,
  shiftLyrics,
  tapStart,
  tapEnd,
  snap,
  computePeaks,
  energyEnvelope,
  findHook,
  detectBeats,
  beatCutPlan,
  ctaText,
  songToTimeline,
  timelineToSong,
} from '../js/core.js';

let n = 0;
const ids = () => `id${++n}`;

test('formatTime / parseTime round trip', () => {
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(75.5), '1:15.50');
  assert.equal(formatTime(9.99), '0:09.99');
  assert.equal(formatTime(61, false), '1:01');
  assert.equal(parseTime('1:15.50'), 75.5);
  assert.equal(parseTime('12.25'), 12.25);
  assert.ok(Number.isNaN(parseTime('abc')));
  for (const s of [0, 3.25, 59.99, 125.4]) assert.ok(Math.abs(parseTime(formatTime(s)) - s) < 0.011);
});

test('clips lay out sequentially and map to source time with speed', () => {
  const clips = [
    { id: 'a', in: 2, duration: 3, speed: 1 },
    { id: 'b', in: 10, duration: 4, speed: 2 },
  ];
  assert.deepEqual(layoutClips(clips).map((l) => [l.start, l.end]), [[0, 3], [3, 7]]);
  assert.equal(clipAt(clips, 1).sourceTime, 3);
  const hit = clipAt(clips, 5);
  assert.equal(hit.clip.id, 'b');
  assert.equal(hit.sourceTime, 14); // 10 + 2s local * 2x
  assert.equal(clipAt(clips, 7), null);
});

test('maxClipDuration respects in-point and speed', () => {
  assert.equal(maxClipDuration({ kind: 'video', in: 2, speed: 2 }, 12), 5);
  assert.equal(maxClipDuration({ kind: 'image', in: 0 }, Infinity), 600);
});

test('splitClip keeps total length and continuous source time', () => {
  const c = { id: 'a', kind: 'video', in: 1, duration: 4, speed: 2, transition: { type: 'fade', duration: 0.4 } };
  const [a, b] = splitClip(c, 1.5, () => 'b');
  assert.equal(a.duration + b.duration, 4);
  assert.equal(b.in, 4); // 1 + 1.5 * 2
  assert.equal(a.transition.type, 'fade');
  assert.equal(b.transition.type, 'none');
  assert.equal(splitClip(c, 0.01), null);
});

test('splitClip keeps Ken Burns motion continuous', () => {
  const c = { id: 'a', kind: 'image', in: 0, duration: 4, kenBurns: { fromZoom: 1, toZoom: 2, fromX: 0, toX: 1, fromY: 0, toY: 0 } };
  const [a, b] = splitClip(c, 1, () => 'b');
  assert.equal(a.kenBurns.toZoom, 1.25);
  assert.equal(b.kenBurns.fromZoom, 1.25);
  assert.equal(b.kenBurns.toZoom, 2);
});

test('fadeGain envelope', () => {
  assert.equal(fadeGain(-1, 0, 10, 1, 1), 0);
  assert.equal(fadeGain(0.5, 0, 10, 1, 1), 0.5);
  assert.equal(fadeGain(5, 0, 10, 1, 1), 1);
  assert.equal(fadeGain(9.75, 0, 10, 1, 1), 0.25);
});

test('lyrics are stored in song time and follow the song offset', () => {
  const song = { offset: 60 };
  assert.equal(songToTimeline(62, song), 2);
  assert.equal(timelineToSong(2, song), 62);
  const lyr = [
    { id: 'a', text: 'one', start: 61, end: 63 },
    { id: 'b', text: 'two', start: 62.5, end: 65 },
  ];
  assert.equal(activeLyric(lyr, 62).id, 'a');
  assert.equal(activeLyric(lyr, 62.7).id, 'b'); // later start wins on overlap
  assert.equal(activeLyric(lyr, 70), null);
});

test('linesFromText skips blanks and spaces lines', () => {
  const l = linesFromText('a\n\n b \nc', 1, 2, ids);
  assert.deepEqual(l.map((x) => x.text), ['a', 'b', 'c']);
  assert.deepEqual(l.map((x) => x.start), [1, 3, 5]);
});

test('wordTimings are character weighted and cover 0..1', () => {
  const w = wordTimings('I love rock');
  assert.equal(w.length, 3);
  assert.equal(w[0].start, 0);
  assert.equal(w[2].end, 1);
  assert.ok(w[1].end - w[1].start > w[0].end - w[0].start);
});

test('parseLRC handles multi-stamps, blank stamps and offset', () => {
  const lrc = `[ti:Song]\n[offset:+500]\n[00:10.00]First line\n[00:12.50][00:30.00]Chorus\n[00:15.00]\n[00:20.00]Last`;
  const l = parseLRC(lrc, ids);
  assert.deepEqual(l.map((x) => x.text), ['First line', 'Chorus', 'Last', 'Chorus']);
  assert.equal(l[0].start, 9.5);
  assert.equal(l[0].end, 12);
  assert.equal(l[1].end, 14.5); // closed by the blank stamp
  assert.equal(l[3].start, 29.5);
  assert.equal(l[3].end, 33.5); // last line gets 4s
});

test('toLRC -> parseLRC round trip keeps timing and gaps', () => {
  const src = [
    { id: 'a', text: 'Hello', start: 5, end: 7 },
    { id: 'b', text: 'World', start: 7, end: 9.5 },
    { id: 'c', text: 'Again', start: 12, end: 14 },
  ];
  const back = parseLRC(toLRC(src, { title: 'T', artist: 'A' }), ids);
  assert.deepEqual(back.map((x) => [x.text, x.start, x.end]), [
    ['Hello', 5, 7],
    ['World', 7, 9.5],
    ['Again', 12, 14],
  ]);
});

test('shiftLyrics never goes below zero', () => {
  const s = shiftLyrics([{ id: 'a', text: 'x', start: 0.2, end: 1 }], -1);
  assert.equal(s[0].start, 0);
  assert.equal(s[0].end, 0.8);
});

test('tap-sync: each tap starts the next line and closes the previous one', () => {
  let lyr = linesFromText('one\ntwo\nthree', 0, 10, ids);
  let cur = 0;
  ({ lyrics: lyr, cursor: cur } = tapStart(lyr, cur, 1.0));
  ({ lyrics: lyr, cursor: cur } = tapStart(lyr, cur, 3.2));
  assert.equal(lyr[0].start, 1);
  assert.equal(lyr[0].end, 3.2);
  assert.equal(lyr[1].start, 3.2);
  ({ lyrics: lyr } = tapEnd(lyr, cur, 4.5));
  assert.equal(lyr[1].end, 4.5);
  ({ lyrics: lyr, cursor: cur } = tapStart(lyr, cur, 6));
  assert.equal(lyr[1].end, 4.5); // gap kept
  assert.equal(lyr[2].start, 6);
  assert.equal(cur, 3);
  // tapping past the last line is a no-op
  assert.equal(tapStart(lyr, cur, 9).cursor, 3);
});

test('snap picks the nearest candidate within threshold', () => {
  assert.equal(snap(1.03, [0, 1, 2], 0.1), 1);
  assert.equal(snap(1.5, [0, 1, 2], 0.1), 1.5);
});

test('computePeaks / energyEnvelope basics', () => {
  const s = new Float32Array(1000).map((_, i) => (i < 500 ? 0.5 : -0.25));
  const p = computePeaks(s, 2);
  assert.equal(p[1], 0.5);
  assert.equal(p[2], -0.25);
  const env = energyEnvelope(new Float32Array(44100).fill(0.5), 44100, 100);
  assert.equal(env.length, 100);
  assert.ok(Math.abs(env[3] - 0.5) < 1e-6);
});

test('findHook finds the loudest window', () => {
  const rate = 10;
  const env = new Float32Array(600).fill(0.1); // 60s
  for (let i = 300; i < 450; i++) env[i] = 1; // loud from 30s to 45s
  assert.equal(findHook(env, rate, 15, 60), 30);
  assert.equal(findHook(env, rate, 120, 60), 0);
});

test('detectBeats recovers tempo from a synthetic click track', () => {
  const rate = 100;
  for (const bpm of [90, 120, 150]) {
    const env = new Float32Array(rate * 20).fill(0.05);
    const period = 60 / bpm;
    for (let t = 0.37; t < 20; t += period) {
      const i = Math.round(t * rate);
      env[i] = 1;
      env[i + 1] = 0.6;
    }
    const res = detectBeats(env, rate);
    assert.ok(res, `no result for ${bpm}`);
    assert.ok(Math.abs(res.bpm - bpm) / bpm < 0.04, `expected ~${bpm}, got ${res.bpm}`);
    assert.ok(Math.abs(res.beats[0] - (0.37 % period)) < 0.03, `phase off for ${bpm}: ${res.beats[0]}`);
  }
});

test('beatCutPlan fills the duration and cycles media', () => {
  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  const plan = beatCutPlan(['a', 'b'], beats, 2, 4.2);
  assert.deepEqual(plan.map((p) => p.mediaId), ['a', 'b', 'a', 'b', 'a']);
  assert.ok(Math.abs(plan.reduce((s, p) => s + p.duration, 0) - 4.2) < 1e-6);
  assert.equal(plan[0].duration, 1);
});

test('ctaText date and countdown tokens', () => {
  const now = new Date(2026, 10, 17); // Nov 17
  assert.equal(ctaText('OUT {date}', '2026-11-21', now), 'OUT NOV 21');
  assert.equal(ctaText('{countdown}', '2026-11-21', now), 'OUT IN 4 DAYS');
  assert.equal(ctaText('{countdown}', '2026-11-18', now), 'OUT TOMORROW');
  assert.equal(ctaText('{countdown}', '2026-11-10', now), 'OUT NOW');
  assert.equal(ctaText('OUT NOW {date}', '', now), 'OUT NOW');
});

import { beatEnvelope, noise } from '../js/core.js';

test('beatEnvelope peaks on beats and decays between them', () => {
  const beats = [1, 1.5, 2, 2.5];
  assert.equal(beatEnvelope(beats, 0.5), 0); // before the first beat
  assert.equal(beatEnvelope(beats, 1.5), 1);
  assert.ok(beatEnvelope(beats, 1.6) < beatEnvelope(beats, 1.55));
  assert.ok(Math.abs(beatEnvelope(beats, 2.1) - Math.exp(-0.9)) < 1e-9);
  assert.equal(beatEnvelope(null, 1.0), 1); // 120 BPM fallback grid
});

test('noise is deterministic and in 0..1', () => {
  assert.equal(noise(42), noise(42));
  for (let i = 0; i < 100; i++) {
    const v = noise(i);
    assert.ok(v >= 0 && v < 1);
  }
});
