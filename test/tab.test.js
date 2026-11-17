import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTabBytes, tabTracks, tuningNames, playbackOrder, buildTabTimeline } from '../js/tab.js';

const fixture = new URL('./fixtures/spark-riff.gp', import.meta.url);

test('tuningNames labels standard and drop tunings', () => {
  assert.deepEqual(tuningNames([64, 59, 55, 50, 45, 40]), ['e', 'B', 'G', 'D', 'A', 'E']);
  assert.deepEqual(tuningNames([64, 59, 55, 50, 45, 38]), ['E', 'B', 'G', 'D', 'A', 'D']);
});

test('playbackOrder expands repeats', () => {
  const b = (o = {}) => ({ isRepeatStart: false, repeatCount: 0, alternateEndings: 0, ...o });
  assert.deepEqual(playbackOrder([b(), b({ isRepeatStart: true }), b({ repeatCount: 2 }), b()]), [0, 1, 2, 1, 2, 3]);
  assert.deepEqual(playbackOrder([b({ repeatCount: 3 }), b()]), [0, 0, 0, 1]); // repeat from the top
});

test('playbackOrder handles first/second endings', () => {
  const b = (o = {}) => ({ isRepeatStart: false, repeatCount: 0, alternateEndings: 0, ...o });
  const bars = [b({ isRepeatStart: true }), b(), b({ alternateEndings: 1, repeatCount: 2 }), b({ alternateEndings: 2 }), b()];
  assert.deepEqual(playbackOrder(bars), [0, 1, 2, 0, 1, 3, 4]);
});

test('parses a Guitar Pro file and times notes with tempo changes', async () => {
  const score = await parseTabBytes(readFileSync(fixture));
  const tracks = tabTracks(score);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].strings, 6);
  const tl = buildTabTimeline(score, 0);
  assert.deepEqual(tl.tuning, ['e', 'B', 'G', 'D', 'A', 'E']);
  // 4/4 bars: two at 120 BPM (2 s each), then 140 BPM (12/7 s each)
  assert.deepEqual(tl.bars.map((b) => +b.time.toFixed(3)), [0, 2, 4, +(4 + 12 / 7).toFixed(3)]);
  assert.ok(Math.abs(tl.duration - (4 + 24 / 7)) < 1e-6);
  // first riff: eighth notes on the low E string (bottom line = 5)
  assert.deepEqual(tl.events.slice(0, 3).map((e) => [e.time, e.notes[0].line, e.notes[0].fret]), [[0, 5, 0], [0.25, 5, 3], [0.5, 5, 5]]);
  // sixteenths at 140 BPM in bar 3 on the high e string (top line = 0)
  const bar3 = tl.events.filter((e) => e.bar === 2);
  assert.ok(Math.abs(bar3[1].time - bar3[0].time - 60 / 140 / 4) < 1e-3);
  assert.equal(bar3[0].notes[0].line, 0);
  // the final chords have three notes
  assert.equal(tl.events[tl.events.length - 1].notes.length, 3);
});
