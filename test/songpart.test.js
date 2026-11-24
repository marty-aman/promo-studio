// Song part: entire song, one section, several sections (joined, reordered, repeated, crossfaded) or a range.
// Range math, section joins, the song-time mapping that keeps lyrics in time, the music video offset, captions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { partSections, partRanges, partLayout, describePart, applySongPart, linesInParts, usableChoice, defaultPicture } from '../js/songpart.js';
import { timelineToSong, songToTimeline, songOffsetAt, hasSongParts, activeLyric } from '../js/core.js';
import { applySongTemplate } from '../js/songtemplates.js';
import { newProject } from '../js/state.js';

const audio = { id: 'song', name: 'Static Bloom.wav', kind: 'audio', duration: 180, envelope: Float32Array.from({ length: 18000 }, () => 0.3), envRate: 100 };
const mv = { id: 'mv', name: 'video.mp4', kind: 'video', duration: 200 };
const SECTIONS = [
  { id: 'i', label: 'Intro', start: 0, end: null },
  { id: 'v', label: 'Verse', start: 10, end: null },
  { id: 'c', label: 'Chorus', start: 40, end: null },
  { id: 'v2', label: 'Verse', start: 60, end: null },
  { id: 'c2', label: 'Chorus', start: 90, end: 110 },
];
const song = (extra = {}) => ({ id: 'sb', title: 'Static Bloom', lyrics: '', instrumental: false, sections: SECTIONS, ...extra });
const ctxOf = (extra = {}) => ({ song: song(), audio, beats: null, video: { rec: mv, offset: 2.5 }, footage: [], coverRec: null, ...extra });
const secs = partSections(song(), 180);

test('partSections: ends filled, repeats numbered, open last one runs to the song end', () => {
  assert.deepEqual(secs.map((s) => [s.label, s.start, s.end]), [['Intro', 0, 10], ['Verse 1', 10, 40], ['Chorus 1', 40, 60], ['Verse 2', 60, 90], ['Chorus 2', 90, 110]]);
});

test('partRanges: entire song, one section, a custom range, errors', () => {
  assert.deepEqual(partRanges({ kind: 'all' }, secs, 180), [{ from: 0, to: 180, label: 'Entire song' }]);
  assert.deepEqual(partRanges({ kind: 'one', ids: ['c'] }, secs, 180), [{ from: 40, to: 60, label: 'Chorus 1' }]);
  assert.deepEqual(partRanges({ kind: 'range', from: 12.5, to: 300 }, secs, 180).map((r) => [r.from, r.to]), [[12.5, 180]]);
  assert.throws(() => partRanges({ kind: 'range', from: 20, to: 20.5 }, secs, 180), /at least 1 second/);
  assert.throws(() => partRanges({ kind: 'one', ids: [] }, secs, 180), /Pick a section/);
  assert.throws(() => partRanges({ kind: 'several', ids: ['nope'] }, secs, 180), /Tick at least one/);
});

test('section joins: back-to-back sections merge, gaps stay, repeats and reorder keep play order', () => {
  assert.deepEqual(partRanges({ kind: 'several', ids: ['v', 'c'] }, secs, 180), [{ from: 10, to: 60, label: 'Verse 1 + Chorus 1' }]);
  assert.deepEqual(partRanges({ kind: 'several', ids: ['c', 'c2'] }, secs, 180).map((r) => r.label), ['Chorus 1', 'Chorus 2']);
  assert.deepEqual(partRanges({ kind: 'several', ids: ['c2', 'i', 'c2'] }, secs, 180).map((r) => [r.from, r.to]), [[90, 110], [0, 10], [90, 110]]);
});

test('partLayout: crossfades overlap by the fade, held under half the shortest part; hard cuts butt', () => {
  const r = [{ from: 40, to: 60 }, { from: 90, to: 110 }];
  const f = partLayout(r, { kind: 'fade', fade: 0.3 });
  assert.deepEqual(f.parts.map((q) => q.at), [0, 19.7]);
  assert.equal(f.length, 39.7);
  const c = partLayout(r, { kind: 'cut' });
  assert.deepEqual([c.parts[1].at, c.length, c.fade], [20, 40, 0]);
  assert.equal(partLayout([{ from: 0, to: 1 }, { from: 5, to: 30 }], { kind: 'fade', fade: 2 }).fade, 0.5);
  assert.equal(partLayout([{ from: 3, to: 9 }]).fade, 0);
  assert.ok(!describePart({ kind: 'one', ids: [] }, secs, 180).ok);
});

test('song-time mapping with parts: timeline <-> song per part, gaps go to the next part, lyrics land in each part', () => {
  const song2 = { offset: 40, parts: [{ from: 40, to: 60, at: 0 }, { from: 90, to: 110, at: 20 }] };
  assert.ok(hasSongParts(song2));
  assert.equal(timelineToSong(5, song2), 45);
  assert.equal(timelineToSong(25, song2), 95);
  assert.equal(songToTimeline(95, song2), 25);
  assert.equal(songToTimeline(70, song2), 20); // cut out: at the start of the next part
  assert.equal(songOffsetAt(25, song2), 70);
  const lyrics = [{ id: 'a', start: 41, end: 44, text: 'chorus one' }, { id: 'b', start: 70, end: 73, text: 'verse two' }, { id: 'c', start: 91, end: 94, text: 'chorus two' }];
  assert.equal(activeLyric(lyrics, timelineToSong(2, song2)).id, 'a');
  assert.equal(activeLyric(lyrics, timelineToSong(22, song2)).id, 'c');
  // moving song.offset (Find the hook, a template) goes back to one stretch
  assert.ok(!hasSongParts({ ...song2, offset: 12 }));
  assert.equal(timelineToSong(5, { ...song2, offset: 12 }), 17);
  // one stretch is unchanged
  assert.equal(timelineToSong(3, { offset: 10 }), 13);
  assert.equal(songToTimeline(13, { offset: 10 }), 3);
});

test('apply one section: song stretch, length + end card, the music video in sync with its saved offset', () => {
  const d = newProject();
  const facts = applySongPart(d, { kind: 'one', ids: ['c'] }, ctxOf());
  assert.equal(d.song.offset, 40);
  assert.ok(!d.song.parts);
  assert.equal(d.duration, 20 + d.endCard.duration);
  assert.equal(d.clips.length, 1);
  assert.equal(d.clips[0].in, 42.5);
  assert.equal(d.clips[0].duration, 20);
  assert.ok(d.clips[0].songPart);
  assert.equal(d.songPart.kind, 'one');
  assert.match(facts.join(' '), /Chorus 1, 0:40–1:00/);
  assert.match(facts.join(' '), /saved offset 2.5/);
});

test('apply several sections: parts on the song, one clip per part in sync, crossfaded joins', () => {
  const d = newProject();
  applySongPart(d, { kind: 'several', ids: ['c', 'c2'], join: { kind: 'fade', fade: 0.3 } }, ctxOf());
  assert.deepEqual(d.song.parts, [{ from: 40, to: 60, at: 0 }, { from: 90, to: 110, at: 19.7 }]);
  assert.deepEqual(d.song.join, { kind: 'fade', fade: 0.3 });
  assert.deepEqual(d.clips.map((c) => [c.in, c.duration, c.transition.type]), [[42.5, 19.7, 'fade'], [92.5, 20, 'crossfade']]);
  assert.equal(d.duration, +(39.7 + d.endCard.duration).toFixed(3));
  // each clip lines up with the song at its own place on the timeline
  assert.equal(songOffsetAt(19.7, d.song) + 19.7 + 2.5, d.clips[1].in);
});

test('lyric shift: saved timing comes in; lines in the parts counted; texts kept; captions move with the song', () => {
  const d = newProject();
  d.song = { mediaId: 'song', offset: 30, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
  d.texts = [
    { id: 't1', text: 'NEW SINGLE', start: 0, end: 3 },
    { id: 'cap', caption: true, text: 'spoken', start: 12, end: 14, words: [{ text: 'spoken', start: 12, end: 14 }] }, // song 42
    { id: 'gone', caption: true, text: 'cut', start: 1, end: 2 }, // song 31: outside the chorus
  ];
  const timing = { savedAt: '2026-11-20T00:00:00Z', lines: [{ text: 'burn it down', t: 41, end: 44 }, { text: 'verse', t: 70, end: 72 }] };
  const facts = applySongPart(d, { kind: 'one', ids: ['c'] }, ctxOf({ song: song({ lyricTiming: timing, lyrics: 'burn it down\nverse' }) }));
  assert.equal(d.lyricsFrom.source, 'timing');
  assert.equal(linesInParts(d.lyrics, [{ from: 40, to: 60 }]).length, 1);
  assert.match(facts.join(' '), /1 lyric line in this part/);
  assert.deepEqual(d.texts.map((t) => t.id), ['t1', 'cap']);
  const cap = d.texts.find((t) => t.id === 'cap');
  assert.deepEqual([cap.start, cap.end, cap.words[0].start], [2, 4, 2]); // song 42 is now 2 s in
  assert.match(facts.join(' '), /1 caption outside this part removed/);
});

test('keep your clips: they stay, the song’s music video among them goes back in sync; remembered choices', () => {
  const d = newProject();
  d.song = { mediaId: 'song', offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
  d.clips = [{ id: 'mine', mediaId: 'other', kind: 'video', in: 3, duration: 4, speed: 1 }, { id: 'mvc', mediaId: 'mv', kind: 'video', in: 0, duration: 10, speed: 1 }];
  assert.equal(defaultPicture(d, ctxOf()), 'keep');
  applySongPart(d, { kind: 'range', from: 50, to: 70 }, ctxOf({ picture: 'keep' }));
  assert.deepEqual(d.clips.map((c) => [c.id, c.in]), [['mine', 3], ['mvc', 56.5]]); // 50 + 4 s in + 2.5 offset
  assert.equal(usableChoice({ kind: 'one', ids: ['gone'] }, secs, 180), null);
  assert.deepEqual(usableChoice({ kind: 'several', ids: ['c', 'x', 'c2'] }, secs, 180).ids, ['c', 'c2']);
});

test('songs with no video: footage on the beat or the cover; templates go back to one stretch', () => {
  const foot = [{ id: 'f1', kind: 'video', duration: 30 }, { id: 'f2', kind: 'video', duration: 30 }];
  const d = newProject();
  applySongPart(d, { kind: 'several', ids: ['c', 'c2'], join: { kind: 'cut' } }, ctxOf({ video: null, footage: foot, beats: { bpm: 120, period: 0.5, beats: Array.from({ length: 360 }, (_, i) => i * 0.5) } }));
  assert.ok(d.clips.length > 4);
  assert.equal(+d.clips.reduce((a, c) => a + c.duration, 0).toFixed(3), 40);
  const d2 = newProject();
  applySongPart(d2, { kind: 'all' }, ctxOf({ video: null, coverRec: { id: 'cov', kind: 'image' } }));
  assert.deepEqual(d2.clips.map((c) => [c.kind, c.duration]), [['image', 180]]);
  // a template after several parts plays one stretch again
  applySongTemplate(d, 'st-chorus', { song: song(), band: 'B', audio, beats: null, video: null, footage: foot, parts: [], cover: null, coverRec: null, hasLyrics: false, today: '2026-11-24' });
  assert.ok(!d.song.parts && !hasSongParts(d.song));
  assert.equal(d.songPart.byTemplate, 'st-chorus');
  assert.equal(d.songPart.from, 40);
});
