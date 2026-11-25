// Export Song sections: each section exports from its own place on the edit's timeline (se1-section-export).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionOnTimeline } from '../js/manager/releases.js';
import { songToTimeline, timelineToSong } from '../js/core.js';
import { applyBatchItem, mvClip } from '../js/batch.js';

const intro = { start: 0, end: 22 };
const verse = { start: 22, end: 45 };
const chorus = { start: 45, end: 60 };

test('a whole-song edit: each section is its own stretch of the timeline', () => {
  const song = { offset: 0 };
  assert.deepEqual(sectionOnTimeline(intro, song, 60), { from: 0, to: 22 });
  assert.deepEqual(sectionOnTimeline(verse, song, 60), { from: 22, to: 45 });
});

test('a song offset (number or song object) moves every section by it, the same way', () => {
  assert.deepEqual(sectionOnTimeline(verse, 10, 60), { from: 12, to: 35 });
  assert.deepEqual(sectionOnTimeline(verse, { offset: 10 }, 60), { from: 12, to: 35 });
  assert.equal(sectionOnTimeline(intro, { offset: 30 }, 60), null); // before the edit's 0:00
  assert.deepEqual(sectionOnTimeline(chorus, { offset: 0 }, 50), { from: 45, to: 50 }); // clipped to the edit
});

test('a several-sections edit (Chorus then Intro): each section maps to where its part plays', () => {
  const song = { offset: 45, parts: [{ from: 45, to: 60, at: 0 }, { from: 0, to: 22, at: 15 }] };
  assert.deepEqual(sectionOnTimeline(chorus, song, 37), { from: 0, to: 15 });
  assert.deepEqual(sectionOnTimeline(intro, song, 37), { from: 15, to: 37 });
  // the range agrees with the player's own mapping both ways
  const r = sectionOnTimeline(intro, song, 37);
  assert.equal(timelineToSong(r.from, song), intro.start);
  assert.ok(Math.abs(timelineToSong(r.to - 0.001, song) - (intro.end - 0.001)) < 1e-6);
  assert.equal(songToTimeline(intro.start, song), r.from);
});

test('a section without an end, or of no length, has no range', () => {
  assert.equal(sectionOnTimeline({ start: 5, end: null }, { offset: 0 }, 60), null);
  assert.equal(sectionOnTimeline({ start: 5, end: 5 }, { offset: 0 }, 60), null);
});

test('mvClip is the music video clip Batch export uses', () => {
  const d = { song: { offset: 0 }, endCard: { enabled: true, duration: 3 }, clips: [] };
  applyBatchItem(d, { songOffset: 22, mvIn: 22 }, { len: 23, mvId: 'mv', mvDuration: 60 });
  assert.deepEqual(d.clips, [mvClip('mv', 22, 23, 0)]);
  assert.equal(d.duration, 26);
  assert.equal(d.song.offset, 22);
  assert.equal(mvClip('mv', 1, 2.345).duration, 2.35);
});
