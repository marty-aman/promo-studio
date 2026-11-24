// Templates built for a part of the song (entire song, one section, several sections, a custom range): each song
// template's range, the lyrics that land in it, layer offsets, the end card; Suggested takes, themes and look
// templates keep the part; the default part; hand-edit fingerprint; saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { templatePart, defaultTemplatePart, editSignature, partSections, applySongPart } from '../js/songpart.js';
import { applySongTemplate, songTemplateReady } from '../js/songtemplates.js';
import { applyTakePart } from '../js/suggest.js';
import { applyTheme, THEMES } from '../js/themes.js';
import { applyTemplate } from '../js/templates.js';
import { songToTimeline, timelineToSong, hasSongParts } from '../js/core.js';
import { newProject, normalizeProject } from '../js/state.js';

const audio = { id: 'song', name: 'Static Bloom.wav', kind: 'audio', duration: 180, envelope: Float32Array.from({ length: 18000 }, () => 0.3), envRate: 100 };
const beats = { bpm: 120, period: 0.5, beats: Array.from({ length: 360 }, (_, i) => i * 0.5) };
const mv = { id: 'mv', kind: 'video', name: 'mv.mp4', duration: 240 };
const footage = [1, 2, 3].map((i) => ({ id: `f${i}`, kind: 'video', name: `f${i}.mp4`, duration: 30 }));
const SECTIONS = [
  { id: 'i', label: 'Intro', start: 0, end: null },
  { id: 'v', label: 'Verse', start: 10, end: null },
  { id: 'c', label: 'Chorus', start: 40, end: null },
  { id: 'v2', label: 'Verse', start: 60, end: null },
  { id: 'c2', label: 'Chorus', start: 90, end: 110 },
];
const timing = { lines: [{ t: 12, text: 'first verse' }, { t: 41, text: 'chorus one' }, { t: 45, text: 'chorus one b' }, { t: 61, text: 'second verse' }, { t: 91, text: 'chorus two' }, { t: 105, text: 'chorus two b' }, { t: 150, text: 'outro' }], offset: 0, source: 'tap', savedAt: '2026-11-20T00:00:00.000Z' };
const song = (extra = {}) => ({ id: 'sb', title: 'Static Bloom', lyrics: 'first verse\nchorus one', lyricTiming: timing, releaseDate: '', instrumental: false, sections: SECTIONS, ...extra });
const game = [{ instrument: 'guitar', source: 'tab', mediaId: 'tab', track: 0, label: 'Guitar', from: 'x' }, { instrument: 'drums', source: 'stem', mediaId: 's1', track: 0, label: 'Drums', from: 'y' }];
const ctxOf = (extra = {}) => ({ song: song(), band: 'Arc Flash', audio, beats, video: { rec: mv, offset: 2.5 }, footage, parts: game, cover: 'cov', coverRec: { id: 'cov', kind: 'image', name: 'cover.jpg' }, hasLyrics: false, today: '2026-11-23', ...extra });
const J = { kind: 'cut' };
const ONE = { kind: 'one', ids: ['c'], join: J };
const SEVERAL = { kind: 'several', ids: ['c', 'c2'], join: J };
const ALL = { kind: 'all', ids: [], join: J };
const RANGE = { kind: 'range', ids: [], from: 30, to: 50, join: J };

const content = (d) => d.duration - (d.endCard.enabled ? d.endCard.duration : 0);
/** Timeline times of the first and last lyric line heard in the edit (song time mapped through its parts). */
function firstLast(d) {
  const heard = d.lyrics
    .map((l) => ({ l, t: songToTimeline(l.start, d.song) }))
    .filter(({ l, t }) => t >= 0 && t < content(d) - 0.05 && Math.abs(timelineToSong(t, d.song) - l.start) < 0.01)
    .map(({ t }) => +t.toFixed(2))
    .sort((a, b) => a - b);
  return [heard[0], heard[heard.length - 1]];
}
const build = (id, part, extra = {}) => {
  const d = newProject();
  applySongTemplate(d, id, ctxOf({ part, ...extra }));
  return d;
};

test('templatePart: none for the template’s own pick, a layout for a part, an error for a bad one', () => {
  assert.equal(templatePart(null, ctxOf()), null);
  assert.equal(templatePart({ kind: 'own' }, ctxOf()), null);
  assert.deepEqual(templatePart(ONE, ctxOf()).parts.map((q) => [q.from, q.to, q.at]), [[40, 60, 0]]);
  const s = templatePart(SEVERAL, ctxOf());
  assert.deepEqual([s.parts.map((q) => q.at), s.length], [[0, 20], 40]);
  assert.throws(() => templatePart({ kind: 'one', ids: [] }, ctxOf()), /Pick a section/);
});

test('Music video + lyrics: own pick unchanged; one section, several, entire song and a range each set length, sync and lyrics', () => {
  const own = build('st-mv', null);
  assert.ok(content(own) > 14 && content(own) <= 15); // its 15 s hook, as before
  assert.equal(own.songPart.byTemplate, 'st-mv');

  const one = build('st-mv', ONE);
  assert.equal(one.song.offset, 40);
  assert.ok(!hasSongParts(one.song));
  assert.equal(content(one), 20);
  assert.deepEqual(one.clips.map((c) => [c.in, c.duration]), [[42.5, 20]]); // the music video in sync (+2.5 s)
  assert.deepEqual(firstLast(one), [1, 5]);
  assert.deepEqual([one.songPart.kind, one.songPart.template, one.songPart.byTemplate], ['one', 'st-mv', undefined]);
  assert.equal(one.template, 'st-mv');
  assert.ok(one.endCard.enabled && one.endCard.title === 'Static Bloom');

  const sev = build('st-mv', SEVERAL);
  assert.ok(hasSongParts(sev.song));
  assert.equal(content(sev), 40);
  assert.deepEqual(sev.clips.map((c) => [c.in, c.duration]), [[42.5, 20], [92.5, 20]]);
  assert.ok(sev.clips.every((c) => c.kenBurns && c.kenBurns.toZoom === 1.06)); // the template's own look on each piece
  assert.deepEqual(firstLast(sev), [1, 35]); // 41 → 0:01, 105 → 20 + 15

  const all = build('st-mv', ALL);
  assert.equal(all.song.offset, 0);
  assert.equal(content(all), 180);
  assert.deepEqual(firstLast(all), [12, 150]);
  assert.equal(all.clips[0].in, 2.5);

  const rng = build('st-mv', RANGE);
  assert.equal(rng.song.offset, 30);
  assert.equal(content(rng), 20);
  assert.deepEqual(firstLast(rng), [11, 15]);
});

test('Raw footage + lyrics: the take is cut for the part; several sections get footage per part', () => {
  const one = build('st-footage', ONE);
  assert.equal(one.song.offset, 40);
  assert.equal(content(one), 20);
  assert.ok(one.clips.every((c) => c.mediaId.startsWith('f')));
  assert.ok(Math.abs(one.clips.reduce((a, c) => a + c.duration, 0) - one.duration) < 0.6);
  const sev = build('st-footage', SEVERAL);
  assert.ok(hasSongParts(sev.song));
  assert.equal(content(sev), 40);
  assert.ok(Math.abs(sev.clips.reduce((a, c) => a + c.duration, 0) - 40) < 0.01);
  assert.deepEqual(firstLast(sev), [1, 35]);
});

test('Chorus promo: its own chorus by default; any part you pick, even without a Chorus section', () => {
  const own = build('st-chorus', null);
  assert.equal(own.song.offset, 40);
  assert.equal(content(own), 20);
  const c2 = build('st-chorus', { kind: 'one', ids: ['c2'], join: J });
  assert.equal(c2.song.offset, 90);
  assert.deepEqual(firstLast(c2), [1, 15]);
  const noChorus = ctxOf({ song: song({ sections: [{ id: 'v', label: 'Verse', start: 10, end: 40 }] }) });
  assert.ok(!songTemplateReady('st-chorus', noChorus).ok);
  assert.ok(songTemplateReady('st-chorus', { ...noChorus, part: RANGE }).ok);
  const d = newProject();
  applySongTemplate(d, 'st-chorus', { ...noChorus, part: RANGE });
  assert.equal(d.song.offset, 30);
  assert.equal(content(d), 20);
  assert.deepEqual(firstLast(d), [11, 15]); // the song's timed lyrics, not the chorus stanza
  const sev = build('st-chorus', SEVERAL);
  assert.ok(hasSongParts(sev.song));
  assert.ok(sev.clips.every((c) => c.effects && c.effects.beatPulse === 0.35));
});

test('Rhythm game: highways keep their song offset; the dimmed music video plays per part; end card after the part', () => {
  const one = build('st-game', ONE);
  assert.equal(one.song.offset, 40);
  assert.equal(content(one), 20);
  const highways = one.layers.filter((l) => l.type === 'game');
  assert.equal(highways.length, 2);
  assert.ok(highways.every((l) => l.offset === 0)); // charts start with the song: at 0:00 of the video they are 40 s in
  assert.equal(timelineToSong(0, one.song), 40);
  assert.equal(one.clips[0].in, 42.5);
  const sev = build('st-game', SEVERAL);
  assert.deepEqual(sev.clips.map((c) => c.in), [42.5, 92.5]);
  assert.ok(sev.clips.every((c) => c.filter.adjust.brightness === 0.45));
  assert.equal(timelineToSong(25, sev.song), 95);
  assert.equal(sev.duration, 40 + sev.endCard.duration); // the end card starts where the part ends
  const noVideo = build('st-game', SEVERAL, { video: null });
  assert.equal(noVideo.clips.length, 0);
  assert.equal(noVideo.layers.find((l) => l.type === 'game').backdrop, 'arena');
});

test('Suggested takes: cut for the part, several sections join; the own hook when none is picked', () => {
  const inv = { song: audio, beats, clips: footage, sources: [], lyrics: 0 };
  const take = { id: 't1', template: 'spotlight', title: 'Spotlight', hookLen: 15, beatsPerCut: 4 };
  const d = newProject();
  applyTakePart(d, take, { inv }, ONE, ctxOf());
  assert.equal(d.song.offset, 40);
  assert.equal(content(d), 20);
  assert.equal(d.songPart.kind, 'one');
  const s = newProject();
  const facts = applyTakePart(s, take, { inv }, SEVERAL, ctxOf());
  assert.ok(hasSongParts(s.song));
  assert.equal(content(s), 40);
  assert.match(facts[0], /the part you picked/);
  const o = newProject();
  applyTakePart(o, take, { inv }, null, ctxOf());
  assert.equal(content(o), 15);
});

test('themes and look templates keep the edit’s song part; new layers start at its song moment', () => {
  const d = newProject();
  applySongPart(d, SEVERAL, { ...ctxOf(), picture: 'video' });
  const before = JSON.stringify([d.song, d.duration]);
  applyTheme(d, THEMES[0].id, { motion: true });
  applyTemplate(d, 'spotlight', []);
  assert.equal(JSON.stringify([d.song, d.duration]), before);
  assert.equal(+timelineToSong(0, d.song).toFixed(3), 40); // what a new tab, drum, MIDI or game layer gets as its offset
});

test('defaultTemplatePart: your Song part, else the remembered one, else each template’s own pick', () => {
  const secs = partSections(song(), 180);
  assert.deepEqual(defaultTemplatePart(null, null, secs, 180), { kind: 'own' });
  assert.deepEqual(defaultTemplatePart(null, ALL, secs, 180), { kind: 'own' }); // Entire song changes nothing
  assert.deepEqual(defaultTemplatePart({ ...ONE, byTemplate: 'st-mv' }, null, secs, 180), { kind: 'own' });
  assert.equal(defaultTemplatePart(null, SEVERAL, secs, 180).kind, 'several');
  assert.deepEqual(defaultTemplatePart({ ...ONE, same: true }, SEVERAL, secs, 180).ids, ['c']);
  assert.deepEqual(defaultTemplatePart(null, { kind: 'one', ids: ['gone'] }, secs, 180), { kind: 'own' });
});

test('hand edits change the fingerprint; the template part survives a save and older saves load unchanged', () => {
  const d = build('st-mv', SEVERAL);
  const sig = editSignature(d);
  assert.equal(editSignature(structuredClone(d)), sig);
  d.clips[0].zoom = 1.3;
  assert.notEqual(editSignature(d), sig);
  const back = normalizeProject(JSON.parse(JSON.stringify(d)));
  assert.deepEqual([back.songPart.template, back.songPart.kind, back.song.parts.length], ['st-mv', 'several', 2]);
  const old = normalizeProject({ ...newProject(), songPart: { songId: 'sb', kind: 'range', from: 5, to: 20, byTemplate: 'st-mv' } });
  assert.deepEqual(old.songPart, { songId: 'sb', kind: 'range', from: 5, to: 20, byTemplate: 'st-mv' });
});
