import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FPS, frameIndex, frameDigits, clockTime, secFrame, parseSeek } from '../js/timecode.js';
import { formatTime } from '../js/core.js';

test('the player runs at the same 30 fps as the frame step', () => {
  assert.equal(FPS, 30);
});

test('clock time matches the app m:ss.cc format under an hour', () => {
  for (const s of [0, 0.5, 9.99, 12.5, 59.999, 61.25, 600, 3599.99]) assert.equal(clockTime(s), formatTime(s), String(s));
  assert.equal(clockTime(12.5), '0:12.50');
  assert.equal(clockTime(59.999), '0:59.99');
  assert.equal(clockTime(61.25), '1:01.25');
});

test('clock time shows hours from one hour on', () => {
  assert.equal(clockTime(3600), '1:00:00.00');
  assert.equal(clockTime(3725.5), '1:02:05.50');
  assert.equal(clockTime(36000 + 59 * 60 + 59.99), '10:59:59.99');
});

test('negative, missing and junk times show as zero', () => {
  for (const v of [-1, -0.01, undefined, null, NaN, 'x']) {
    assert.equal(clockTime(v), '0:00.00');
    assert.equal(secFrame(v), '0.00');
  }
});

test('seconds.frame at 30 fps', () => {
  assert.equal(secFrame(0), '0.00');
  assert.equal(secFrame(12.5), '12.15');
  assert.equal(secFrame(1 / 30), '0.01');
  assert.equal(secFrame(0.1), '0.03'); // 0.1 × 30 is 2.9999… in floating point
  assert.equal(secFrame(3725.5), '3725.15');
});

test('the frame rolls over to the next second, never showing frame 30', () => {
  assert.equal(secFrame(29 / 30), '0.29');
  assert.equal(secFrame(30 / 30), '1.00');
  assert.equal(secFrame(0.99999), '0.29');
  for (let f = 0; f < 300; f++) {
    const [s, fr] = secFrame(f / 30).split('.').map(Number);
    assert.equal(s * 30 + fr, f, `frame ${f}`);
    assert.ok(fr < 30);
  }
});

test('other frame rates pad to their own digits', () => {
  assert.equal(frameDigits(24), 2);
  assert.equal(frameDigits(10), 1);
  assert.equal(frameDigits(120), 3);
  assert.equal(secFrame(1.5, 24), '1.12');
  assert.equal(secFrame(23 / 24, 24), '0.23');
  assert.equal(secFrame(1, 24), '1.00');
  assert.equal(secFrame(59 / 60, 60), '0.59');
  assert.equal(secFrame(2 + 5 / 120, 120), '2.005');
  assert.equal(secFrame(0.5, 10), '0.5');
  assert.equal(frameIndex(1, 25), 25);
});

test('the seek box reads seconds.frame', () => {
  assert.equal(parseSeek('12.15'), 12.5);
  assert.equal(parseSeek(' 12.15 '), 12.5);
  assert.equal(parseSeek('12'), 12);
  assert.equal(parseSeek('12s'), 12);
  assert.equal(parseSeek('0.29'), 29 / 30);
  assert.equal(parseSeek('3.5'), 3 + 5 / 30); // frame 5, not half a second
  assert.ok(Number.isNaN(parseSeek('12.30')), 'frame 30 does not exist at 30 fps');
  assert.equal(parseSeek('1.12', 24), 1.5);
  assert.ok(Number.isNaN(parseSeek('1.24', 24)));
});

test('the seek box reads clock times', () => {
  assert.equal(parseSeek('1:02'), 62);
  assert.equal(parseSeek('0:12.50'), 12.5);
  assert.equal(parseSeek('1:02:05.50'), 3725.5);
  assert.equal(parseSeek('90:00'), 5400, 'minutes past 59 are fine without an hour part');
  assert.equal(parseSeek('0:00.01'), 0, 'snaps down to a frame');
  assert.ok(Number.isNaN(parseSeek('1:60')));
  assert.ok(Number.isNaN(parseSeek('1:60:00')));
});

test('the seek box refuses junk and negatives', () => {
  for (const v of ['', '  ', 'abc', '-1', '-0.05', '1.2.3', '1::2', ':30', '1:2:3:4', null, undefined]) assert.ok(Number.isNaN(parseSeek(v)), String(v));
});

test('what the readout shows parses back to the same frame', () => {
  for (const s of [0, 1 / 30, 0.1, 12.5, 59.98, 61.25, 3725.5]) {
    const back = parseSeek(secFrame(s));
    assert.equal(frameIndex(back), frameIndex(s), String(s));
    assert.equal(frameIndex(parseSeek(clockTime(s))), frameIndex(Math.floor(s * 100 + 1e-6) / 100), `clock ${s}`);
  }
});
