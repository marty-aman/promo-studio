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

// ---- section time fields: parseTimeIn / formatTimeIn / timeHint / stepTime
import { parseTimeIn, formatTimeIn, timeHint, stepTime, cleanFormat, TIME_FORMATS } from '../js/timecode.js';

test('each format reads its own spelling of 83.5 s', () => {
  assert.equal(parseTimeIn('1:23.50', 'clock').sec, 83.5);
  assert.equal(parseTimeIn('1:23.5', 'clock').sec, 83.5);
  assert.equal(parseTimeIn('01:23.50', 'clock').sec, 83.5);
  assert.equal(parseTimeIn('83.15', 'frames').sec, 83.5);
  assert.equal(parseTimeIn('83.5', 'seconds').sec, 83.5);
  assert.equal(parseTimeIn('1:23', 'seconds').sec, 83);
});

test('a colon is always a clock time; s and f suffixes force a format', () => {
  for (const f of ['clock', 'frames', 'seconds']) {
    assert.equal(parseTimeIn('1:23.50', f).sec, 83.5, f);
    assert.equal(parseTimeIn('83.5s', f).sec, 83.5, f);
    assert.equal(parseTimeIn('83.15f', f).sec, 83.5, f);
    assert.equal(parseTimeIn('83', f).sec, 83, f);
  }
  assert.equal(parseTimeIn('1:02:03', 'frames').sec, 3723);
  assert.equal(parseTimeIn('1:02:03.50', 'clock').sec, 3723.5);
  assert.equal(parseTimeIn('1:02:03.25', 'clock').sec, 3723 + 8 / 30); // snapped to the nearest frame
  assert.equal(parseTimeIn('1:02:03.25', 'seconds').sec, 3723.25); // plain seconds are not snapped
});

test('83.15 is a frame only in Seconds.frames; elsewhere it is decimal seconds', () => {
  assert.equal(parseTimeIn('83.15', 'frames').sec, 83.5);
  assert.equal(parseTimeIn('83.15', 'seconds').sec, 83.15);
  assert.equal(parseTimeIn('83.15', 'clock').sec, Math.round(83.15 * 30) / 30); // snapped to a frame
});

test('frames must be under the fps; bad text is refused with a message', () => {
  assert.match(parseTimeIn('83.30', 'frames').error, /0 to 29/);
  assert.equal(parseTimeIn('83.29', 'frames').sec, 83 + 29 / 30);
  assert.equal(parseTimeIn('2.24', 'frames', 25).sec, 2 + 24 / 25);
  assert.match(parseTimeIn('2.25', 'frames', 25).error, /0 to 24/);
  for (const bad of ['abc', '1:61', '1:2:3:4', '-5', '1:60:00', '1..2', '.5']) for (const f of ['clock', 'frames', 'seconds']) assert.ok(parseTimeIn(bad, f).error, `${bad} ${f}`);
  assert.deepEqual(parseTimeIn('  ', 'clock'), { sec: null });
});

test('round trips: what a field shows reads back as the same time', () => {
  const frames = [0, 1, 29, 30, 31, 2505, 2509, 107999, 108000, 108001, 30 * 3725 + 7];
  for (const f of ['clock', 'frames', 'seconds']) {
    for (const n of frames) {
      const sec = n / 30;
      const back = parseTimeIn(formatTimeIn(sec, f), f).sec;
      if (f === 'seconds') assert.ok(Math.abs(back - sec) < 0.0006, `${f} ${n}`); // 3 decimals
      else assert.equal(frameIndex(back), n, `${f} frame ${n}`);
    }
  }
});

test('formats at 0, at a frame rollover and over an hour', () => {
  assert.equal(formatTimeIn(0, 'clock'), '0:00.00');
  assert.equal(formatTimeIn(0, 'frames'), '0.00');
  assert.equal(formatTimeIn(0, 'seconds'), '0');
  assert.equal(formatTimeIn(29 / 30, 'frames'), '0.29');
  assert.equal(formatTimeIn(1, 'frames'), '1.00');
  assert.equal(formatTimeIn(3723.5, 'clock'), '1:02:03.50');
  assert.equal(formatTimeIn(3723.5, 'frames'), '3723.15');
  assert.equal(formatTimeIn(3723.5, 'seconds'), '3723.5');
  assert.equal(formatTimeIn(83.5, 'nonsense'), '1:23.50'); // unknown format = clock
  assert.equal(cleanFormat('frames'), 'frames');
  assert.equal(cleanFormat(null), 'clock');
  assert.equal(TIME_FORMATS.length, 3);
});

test('the hint shows the other format', () => {
  assert.equal(timeHint(83.5, 'clock'), '83.15 sec.frame');
  assert.equal(timeHint(83.5, 'frames'), '1:23.50');
  assert.equal(timeHint(83.5, 'seconds'), '1:23.50 · 83.15 sec.frame');
});

test('nudges step a frame (0.1 s in plain seconds, a second with Shift) and roll over', () => {
  assert.equal(formatTimeIn(stepTime(29 / 30, 'frames', 1), 'frames'), '1.00');
  assert.equal(formatTimeIn(stepTime(1, 'frames', -1), 'frames'), '0.29');
  assert.equal(stepTime(0, 'clock', -1), 0);
  assert.equal(stepTime(83.5, 'frames', 1, true), 84.5);
  assert.equal(stepTime(83.5, 'seconds', 1), 83.6);
  assert.equal(stepTime(0.05, 'seconds', -1), 0);
  assert.equal(formatTimeIn(stepTime(3599 + 29 / 30, 'clock', 1), 'clock'), '1:00:00.00');
});

test('the seek box still reads seconds.frame and clock times as before', () => {
  assert.equal(parseSeek('12.15'), 12.5);
  assert.equal(parseSeek('1:02.50'), 62.5);
  assert.ok(Number.isNaN(parseSeek('12.30')));
});
