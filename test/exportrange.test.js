// Export range: range maths, saved-project defaults, caption shifting and the engine's range playback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRange, setRangeSide, shiftCues, cleanRange, toFrame, MIN_RANGE } from '../js/exportrange.js';
import { newProject, normalizeProject } from '../js/state.js';

const P = (extra = {}) => ({ duration: 30, ...extra });

test('no range, null range and an old save all mean the whole edit', () => {
  for (const p of [P(), P({ exportRange: null }), P({ exportRange: { start: null, end: null } })]) {
    const r = resolveRange(p);
    assert.deepEqual([r.start, r.end, r.length, r.whole, r.error], [0, 30, 30, true, '']);
  }
  assert.equal(resolveRange(P({ exportRange: null })).set, false);
});

test('a range is clamped to the edit and follows the edit length for an open side', () => {
  assert.deepEqual(resolveRange(P({ exportRange: { start: 5, end: null } })).length, 25);
  const r = resolveRange(P({ exportRange: { start: -4, end: 99 } }));
  assert.deepEqual([r.start, r.end, r.whole], [0, 30, true]);
  assert.equal(resolveRange({ duration: 10, exportRange: { start: 5, end: 40 } }).end, 10);
});

test('start at or after the end, or under the minimum, is an error', () => {
  assert.match(resolveRange(P({ exportRange: { start: 20, end: 10 } })).error, /not after the start/);
  assert.match(resolveRange(P({ exportRange: { start: 10, end: 10.2 } })).error, /at least 0.5/);
  assert.equal(resolveRange(P({ exportRange: { start: 10, end: 10.5 } })).error, '');
  // the edit got shorter than the saved start
  assert.ok(resolveRange({ duration: 8, exportRange: { start: 12, end: null } }).error);
});

test('setRangeSide sets, clamps, refuses tiny ranges and goes back to null when it covers the edit', () => {
  const d = P();
  assert.equal(setRangeSide(d, 'start', 5), '');
  assert.equal(setRangeSide(d, 'end', 20.004), '');
  assert.deepEqual(d.exportRange, { start: 5, end: toFrame(20.004) });
  assert.match(setRangeSide(d, 'start', 19.9), /at least 0.5/);
  assert.match(setRangeSide(d, 'end', 5.2), /at least 0.5/);
  assert.equal(d.exportRange.start, 5); // refused changes leave the draft alone
  assert.equal(setRangeSide(d, 'start', 99), 'The start must be at least 0.5 seconds before the end (20.00).');
  assert.equal(setRangeSide(d, 'end', 99), '');
  assert.deepEqual(d.exportRange, { start: 5, end: null });
  assert.equal(setRangeSide(d, 'start', 0), '');
  assert.equal(d.exportRange, null);
  assert.equal(setRangeSide(d, 'start', 4), '');
  assert.equal(setRangeSide(d, 'start', null), '');
  assert.equal(d.exportRange, null);
  assert.equal(MIN_RANGE, 0.5);
});

test('values snap to a frame at 30 fps', () => {
  assert.equal(toFrame(1.02), 1.033);
  assert.equal(toFrame(2), 2);
});

test('shiftCues keeps overlapping cues, moves them to start at 0 and trims the ends', () => {
  const cues = [{ start: 0, end: 4, text: 'a' }, { start: 4, end: 8, text: 'b' }, { start: 9, end: 12, text: 'c' }, { start: 20, end: 22, text: 'd' }];
  assert.deepEqual(shiftCues(cues, 3, 10), [{ start: 0, end: 1, text: 'a' }, { start: 1, end: 5, text: 'b' }, { start: 6, end: 7, text: 'c' }]);
  assert.deepEqual(shiftCues(cues, 0, 30), cues);
  assert.deepEqual(shiftCues(cues, 12, 20), []);
});

test('old saves load as the whole edit; a saved range survives normalizeProject', () => {
  assert.equal(newProject().exportRange, null);
  const old = { ...newProject() };
  delete old.exportRange;
  assert.equal(normalizeProject(old).exportRange, null);
  assert.deepEqual(normalizeProject({ ...newProject(), exportRange: { start: 2, end: 9 } }).exportRange, { start: 2, end: 9 });
  assert.equal(normalizeProject({ ...newProject(), exportRange: 'junk' }).exportRange, null);
  assert.equal(cleanRange({ exportRange: { start: -1, end: 4 } }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeProject({ ...newProject(), exportRange: { start: 2, end: null } }))).exportRange, { start: 2, end: null });
});
