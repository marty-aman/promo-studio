// The Chorus promo song template: the first Chorus section, 15–30 s, footage / music video / cover cut on the beat,
// the chorus lyrics on top, the end card last.
import test from 'node:test';
import assert from 'node:assert/strict';
import { songTemplateReady, applySongTemplate, firstChorus, chorusWindow, chorusLines } from '../js/songtemplates.js';
import { newProject } from '../js/state.js';

const audio = { id: 'song', name: 'Static Bloom.wav', kind: 'audio', duration: 180, envelope: Float32Array.from({ length: 18000 }, () => 0.3), envRate: 100 };
const beats = { bpm: 120, period: 0.5, beats: Array.from({ length: 360 }, (_, i) => i * 0.5) };
const LYRICS = 'Walking down the line\nNothing on my mind\n\n[Chorus]\nBurn it down\nI am the fire\nBurn it down\n\nSecond verse here\nStill walking\n\n[Chorus]\nBurn it down\nI am the fire\nBurn it down';
const song = (extra = {}) => ({ id: 'sb', title: 'Static Bloom', lyrics: LYRICS, releaseDate: '', instrumental: false, sections: [{ id: 'a', label: 'Verse 1', start: 0, end: null }, { id: 'b', label: 'Chorus 1', start: 42, end: null }, { id: 'c', label: 'Verse 2', start: 64, end: null }], ...extra });
const ctxOf = (extra = {}) => ({ song: song(), band: 'Arc Flash', audio, beats, video: null, footage: [], parts: [], cover: 'cov', coverRec: { id: 'cov', kind: 'image', name: 'cover.jpg' }, hasLyrics: false, today: '2026-11-23', ...extra });

test('firstChorus and chorusWindow: the first Chorus, held to 15–30 s', () => {
  assert.equal(firstChorus(song(), 180).start, 42);
  assert.equal(firstChorus(song({ sections: [{ id: 'x', label: 'Verse', start: 0, end: null }] }), 180), null);
  assert.deepEqual(chorusWindow({ start: 42, end: 64 }, 180), { start: 42, len: 22 });
  assert.deepEqual(chorusWindow({ start: 42, end: 50 }, 180), { start: 42, len: 15 });
  assert.deepEqual(chorusWindow({ start: 42, end: 100 }, 180), { start: 42, len: 30 });
  assert.deepEqual(chorusWindow({ start: 170, end: 180 }, 180), { start: 170, len: 10 }); // the song ends first
});

test('chorusLines: a [Chorus] header, else the repeated stanza, else the first', () => {
  assert.deepEqual(chorusLines(LYRICS), { lines: ['Burn it down', 'I am the fire', 'Burn it down'], how: 'header' });
  assert.deepEqual(chorusLines('a\nb\n\nhook line\nhook two\n\nc\nd\n\nhook line\nhook two').lines, ['hook line', 'hook two']);
  assert.equal(chorusLines('a\nb\n\nc').how, 'first');
  assert.deepEqual(chorusLines('').lines, []);
});

test('ready: says what it uses, or offers to detect sections first', () => {
  const r = songTemplateReady('st-chorus', ctxOf());
  assert.ok(r.ok);
  assert.match(r.uses[0], /Chorus 1 0:42–1:04 \(22 s\)/);
  assert.match(r.uses[1], /cover art/);
  assert.match(r.uses[2], /chorus lines/);
  const none = songTemplateReady('st-chorus', ctxOf({ song: song({ sections: [] }) }));
  assert.ok(!none.ok && none.detect);
  assert.match(none.missing, /no Chorus section yet/);
  assert.match(songTemplateReady('st-chorus', ctxOf({ coverRec: null })).missing, /footage, the music video or cover art/);
});

test('with footage: cut on the beat over the chorus, chorus lyrics spread over it, end card last', () => {
  const clips = [1, 2, 3].map((i) => ({ id: `c${i}`, kind: 'video', name: `c${i}.mp4`, duration: 30 }));
  const d = newProject();
  const facts = applySongTemplate(d, 'st-chorus', ctxOf({ footage: clips }));
  assert.equal(d.song.offset, 42);
  assert.equal(d.duration, +(22 + d.endCard.duration).toFixed(2));
  assert.ok(d.clips.length >= 8, `${d.clips.length} cuts`);
  assert.ok(d.clips.every((c) => ['c1', 'c2', 'c3'].includes(c.mediaId)));
  assert.ok(d.clips.slice(1).every((c) => c.transition.type === 'none'));
  assert.deepEqual(d.lyrics.map((l) => l.text), ['Burn it down', 'I am the fire', 'Burn it down']);
  assert.ok(d.lyrics[0].start >= 42 && d.lyrics[2].end <= 64);
  assert.ok(d.endCard.enabled && d.endCard.title === 'Static Bloom');
  assert.equal(d.template, 'st-chorus');
  assert.match(facts[0], /22 s of Chorus 1 from 0:42/);
});

test('with the music video: the same moment, in pieces on the beat; timed lyrics win', () => {
  const v = { id: 'mv', kind: 'video', name: 'mv.mp4', duration: 240 };
  const timing = { lines: [{ t: 10, text: 'Walking down the line' }, { t: 42.5, text: 'Burn it down' }, { t: 45, text: 'I am the fire' }], offset: 0, source: 'tap', savedAt: '2026-11-20T00:00:00.000Z' };
  const d = newProject();
  applySongTemplate(d, 'st-chorus', ctxOf({ video: { rec: v, offset: 8 }, song: song({ lyricTiming: timing }) }));
  assert.equal(d.clips[0].in, 50); // song 0:42 is 0:50 in the video
  assert.ok(d.clips.length > 3 && d.clips.every((c) => c.mediaId === 'mv'));
  for (let i = 1; i < d.clips.length; i++) assert.ok(Math.abs(d.clips[i].in - (d.clips[i - 1].in + d.clips[i - 1].duration)) < 0.01, 'pieces follow on');
  assert.equal(d.lyricsFrom.source, 'timing');
  assert.equal(d.lyrics.find((l) => l.text === 'Burn it down').start, 42.5);
});

test('the song’s plain lyrics already laid out from 0:00 in the edit give way to the chorus lines', () => {
  const d = newProject();
  d.lyrics = ['Walking down the line', 'Nothing on my mind', 'Burn it down', 'I am the fire', 'Burn it down'].map((text, i) => ({ id: `l${i}`, text, start: 0.5 + i * 10, end: 10 + i * 10 }));
  d.lyricsFrom = { mediaId: 'song', source: 'manager', title: 'Static Bloom' };
  applySongTemplate(d, 'st-chorus', ctxOf());
  assert.deepEqual(d.lyrics.map((l) => l.text), ['Burn it down', 'I am the fire', 'Burn it down']);
  assert.ok(d.lyrics[0].start >= 42);
});

test('with only the cover, and an instrumental song', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-chorus', ctxOf({ song: song({ instrumental: true }) }));
  assert.ok(d.clips.length >= 1 && d.clips.every((c) => c.mediaId === 'cov' && c.kind === 'image'));
  assert.equal(d.lyrics.length, 0);
  assert.ok(facts.some((f) => /cover art/.test(f)) && facts.some((f) => /instrumental/.test(f)));
  assert.throws(() => applySongTemplate(newProject(), 'st-chorus', ctxOf({ song: song({ sections: [] }) })), /no Chorus/);
});
