import test from 'node:test';
import assert from 'node:assert/strict';
import { layerSpan } from '../js/clipplace.js';

test('a stock clip on its own layer starts at the playhead and runs its whole length', () => {
  assert.deepEqual(layerSpan(3.25, 8, 30), { start: 3.25, duration: 8, trimmed: false });
});

test('a clip longer than what is left of the edit is cut at the end of the edit', () => {
  assert.deepEqual(layerSpan(25, 12, 30), { start: 25, duration: 5, trimmed: true });
});

test('a playhead at or past the end steps back so the clip still shows', () => {
  const r = layerSpan(30, 10, 30);
  assert.equal(r.start, 29.8);
  assert.equal(r.duration, 0.2);
  assert.equal(r.trimmed, true);
  assert.equal(layerSpan(99, 10, 30).start, 29.8);
});

test('unknown file length uses 5 s, a negative playhead starts at 0', () => {
  assert.deepEqual(layerSpan(-2, 0, 20), { start: 0, duration: 5, trimmed: false });
  assert.deepEqual(layerSpan(0, undefined, 20), { start: 0, duration: 5, trimmed: false });
  assert.deepEqual(layerSpan(0, Infinity, 20), { start: 0, duration: 5, trimmed: false });
});
