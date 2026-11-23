import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapBars, clampZoom, nextSpeed, loopPosition, readGesture } from '../js/tablayout.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('wrapBars: bars flow into lines that fit, and full lines line up on the right edge', () => {
  // each bar: 4 beats of 40 px -> 12 + 160 + 4 = 176 px natural
  const bars = Array.from({ length: 7 }, () => [40, 40, 40, 40]);
  const { lines, bars: out } = wrapBars(bars, 400, { gutter: 44, right: 8 });
  // 348 px available: 1 bar per line would leave a lot; 2 bars (352) do not fit, so 1 bar per line, ragged
  assert.equal(lines.length, 7);
  const wide = wrapBars(bars, 800, { gutter: 44, right: 8 }); // 748 available -> 4 bars (704) per line
  assert.deepEqual(wide.lines.map((l) => l.bars.length), [4, 3]);
  const first = wide.lines[0];
  const lastBar = wide.bars[first.bars.at(-1)];
  near(lastBar.x + lastBar.w, 800 - 8, 'a full line reaches the right margin');
  assert.equal(wide.lines[1].scale, 1, 'the last line is not stretched');
  assert.equal(out[3].line, 3);
  // beats sit inside their bar, in order
  for (const b of wide.bars) {
    assert.ok(b.beats[0].x > b.x);
    for (let i = 1; i < b.beats.length; i++) near(b.beats[i].x, b.beats[i - 1].x + b.beats[i - 1].w, 'beats touch');
  }
});

test('wrapBars: a bar wider than the screen gets its own line and is squeezed to fit', () => {
  const bars = [[40, 40], Array.from({ length: 16 }, () => 41), [40, 40]];
  const { lines, bars: out } = wrapBars(bars, 390, { gutter: 44, right: 8 });
  assert.deepEqual(lines.map((l) => l.bars), [[0], [1], [2]]);
  assert.ok(lines[1].scale < 1);
  near(out[1].x + out[1].w, 390 - 8, 'the squeezed bar ends at the right margin');
  assert.equal(out[1].x, 44);
});

test('wrapBars: a line is not stretched far past its natural width', () => {
  // a small bar followed by one that needs a line of its own: the small bar stays its natural size
  const { lines, bars: out } = wrapBars([[30], Array.from({ length: 12 }, () => 40)], 500);
  assert.equal(lines[0].scale, 1);
  assert.equal(out[0].w, 12 + 30 + 4);
});

test('wrapBars: 240 bars lay out quickly', () => {
  const bars = Array.from({ length: 240 }, (_, i) => Array.from({ length: 4 + (i % 9) }, () => 34));
  const t = performance.now();
  for (let k = 0; k < 50; k++) wrapBars(bars, 390);
  assert.ok(performance.now() - t < 200);
  const { bars: out } = wrapBars(bars, 390);
  assert.equal(out.filter(Boolean).length, 240);
});

test('zoom, speed and loop helpers', () => {
  assert.equal(clampZoom(5), 2.2);
  assert.equal(clampZoom(0.1), 0.6);
  assert.equal(clampZoom('x'), 1);
  assert.equal(nextSpeed(1), 1.25);
  assert.equal(nextSpeed(1.25), 0.5);
  assert.equal(nextSpeed(0.3), 0.5);
  assert.equal(loopPosition(5, 2, 4, true), 3);
  assert.equal(loopPosition(5, 2, 4, false), 7);
  assert.equal(loopPosition(1, 2, 2, true), 3, 'an empty loop just runs on');
});

test('readGesture: taps, long presses and swipes', () => {
  assert.deepEqual(readGesture(3, -4, 120), { kind: 'tap', step: 0 });
  assert.deepEqual(readGesture(3, 2, 700), { kind: 'long', step: 0 });
  assert.deepEqual(readGesture(-60, 10, 200), { kind: 'swipe', step: 1 });
  assert.deepEqual(readGesture(70, 5, 200), { kind: 'swipe', step: -1 });
  assert.deepEqual(readGesture(-200, 20, 300), { kind: 'swipe', step: 2 });
  assert.equal(readGesture(30, 120, 300).kind, 'none', 'a mostly vertical move is a scroll');
});
