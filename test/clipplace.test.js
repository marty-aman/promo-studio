import test from 'node:test';
import assert from 'node:assert/strict';
import { placeIn, placeOnPoint, pointToDirection, directionToPoint } from '../js/clipplace.js';
import { syncPoint } from '../js/clipsync.js';

// a 3:30 music video, a 4:00 song, a main-lane clip at 0:00 running 6 s
const main = { in: 0, duration: 6, speed: 1, start: 0, layer: false, songOffset: 0, songLen: 240, fileLen: 210 };
const back = (r) => syncPoint({ in: r.in }, r.start, r.songOffset);

test('a video with an intro: the clip plays from that far in, with no note', () => {
  const r = placeOnPoint(12, main);
  assert.equal(r.in, 12);
  assert.equal(r.duration, 6);
  assert.equal(r.songOffset, 0);
  assert.equal(r.note, '');
  assert.equal(back(r), 12);
});

test('a clip that runs to the end of the file still moves: it gets shorter instead of snapping back to 0', () => {
  const whole = { ...main, duration: 210 };
  const r = placeOnPoint(12, whole);
  assert.equal(r.in, 12);
  assert.equal(r.duration, 198);
  assert.match(r.note, /ends where the video ends/);
  // a nudge on the shortened clip moves it, both ways
  assert.equal(placeIn(12.5, { ...whole, ...r }).in, 12.5);
  assert.equal(placeIn(11.5, { ...whole, ...r }).in, 11.5);
});

test('a video that starts after the song, main lane: in stays 0 and the song plays from further in', () => {
  const r = placeOnPoint(-2.8, main);
  assert.equal(r.in, 0);
  assert.equal(r.songOffset, 2.8);
  assert.match(r.note, /song now plays from 0:02\.8/);
  assert.equal(back(r), -2.8);
  // the song already starts later in the edit: only the difference is added
  const r2 = placeOnPoint(-2.8, { ...main, songOffset: 30 });
  assert.equal(r2.in, 27.2);
  assert.equal(r2.songOffset, 30);
  assert.equal(r2.note, '');
});

test('a video that starts after the song, overlay layer: the clip starts later on its layer', () => {
  const r = placeOnPoint(-3, { ...main, layer: true, start: 1 });
  assert.equal(r.in, 0);
  assert.equal(r.start, 3);
  assert.equal(r.songOffset, 0);
  assert.match(r.note, /2\.00 s later on its layer/);
  assert.equal(back(r), -3);
});

test('limits come with a message, not a silent reset', () => {
  const past = placeIn(500, main);
  assert.equal(past.in, 209.8);
  assert.equal(past.duration, 0.2);
  assert.match(past.note, /past the end/);
  const tooLate = placeOnPoint(-300, main);
  assert.equal(tooLate.songOffset, 239);
  assert.match(tooLate.note, /too far into the song/);
  assert.equal(placeIn(NaN, main).in, 0);
});

test('a faster clip: the gap is in timeline seconds', () => {
  const r = placeIn(-4, { ...main, speed: 2, layer: true, start: 0 });
  assert.equal(r.start, 2);
  assert.equal(r.in, 0);
});

test('the before/after box reads and writes the same sync point', () => {
  assert.deepEqual(pointToDirection(12.5), { dir: 'before', sec: 12.5 });
  assert.deepEqual(pointToDirection(-2.8), { dir: 'after', sec: 2.8 });
  assert.deepEqual(pointToDirection(0.001), { dir: 'together', sec: 0 });
  assert.equal(directionToPoint('before', 12.5), 12.5);
  assert.equal(directionToPoint('after', 2.8), -2.8);
  assert.equal(directionToPoint('after', -2.8), -2.8);
  assert.equal(directionToPoint('together', 9), 0);
});
