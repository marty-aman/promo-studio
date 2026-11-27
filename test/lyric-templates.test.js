// The lyric-video song templates (Blood Slam Cards, Glow Slam One-Word, Stage Footage Cinematic, Cover Art Sheet)
// and the Section looks switch: looks, effect settings, animation ids, the song part and the end card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { songTemplateReady, applySongTemplate, keyWord, oneWordLines, bloodBackdrop, BLOOD_BACKDROPS } from '../js/songtemplates.js';
import { sectionKind, sectionLooksState, setSectionLooks, partSections } from '../js/songpart.js';
import { themeById } from '../js/lookthemes.js';
import { lineStyle } from '../js/linestyle.js';
import { newProject } from '../js/state.js';

const audio = { id: 'song', name: 'Static Bloom.wav', kind: 'audio', duration: 180, envelope: Float32Array.from({ length: 18000 }, () => 0.3), envRate: 100 };
const beats = { bpm: 120, period: 0.5, beats: Array.from({ length: 360 }, (_, i) => i * 0.5) };
const SECTIONS = [
  { id: 'i', label: 'Intro', start: 0, end: null },
  { id: 'a', label: 'Verse 1', start: 10, end: null },
  { id: 'b', label: 'Chorus 1', start: 42, end: null },
  { id: 'c', label: 'Verse 2', start: 64, end: null },
  { id: 'k', label: 'Breakdown', start: 90, end: null },
  { id: 'e', label: 'Chorus 2', start: 110, end: null },
  { id: 'o', label: 'Outro', start: 130, end: null },
];
// timed lyrics: one line every 4 s from 2 s, with word times on the chorus lines
const LINES = Array.from({ length: 40 }, (_, i) => {
  const t = 2 + i * 4;
  const text = t >= 42 && t < 60 ? 'Burn the whole world down' : `Walking line number ${i}`;
  const words = t >= 42 && t < 60 ? text.split(' ').map((w, k) => ({ w, t: +(t + k * 0.6).toFixed(2) })) : undefined;
  return { t, end: t + 3.6, text, ...(words ? { words } : {}) };
});
const timing = { lines: LINES, offset: 0, source: 'auto', savedAt: '2026-11-20T00:00:00.000Z' };
const song = (extra = {}) => ({ id: 'sb', title: 'Static Bloom', lyrics: LINES.map((l) => l.text).join('\n'), lyricTiming: timing, releaseDate: '', instrumental: false, sections: SECTIONS, ...extra });
const video = { rec: { id: 'mv', kind: 'video', name: 'mv.mp4', duration: 240 }, offset: 1.5 };
const footage = [1, 2].map((i) => ({ id: `f${i}`, kind: 'video', name: `f${i}.mp4`, duration: 40 }));
const ctxOf = (extra = {}) => ({ song: song(), band: 'Arc Flash', audio, beats, video: null, footage: [], parts: [], cover: 'cov', coverRec: { id: 'cov', kind: 'image', name: 'cover.jpg' }, hasLyrics: false, today: '2026-11-23', ...extra });
const several = { kind: 'several', ids: ['k', 'b'], join: { kind: 'fade', fade: 0.3 } };
const oneSection = { kind: 'one', ids: ['c'] };
const contentLen = (d) => +(d.duration - d.endCard.duration).toFixed(2);

test('section kinds and the Blood Slam backdrop for each', () => {
  assert.equal(sectionKind('Chorus 2'), 'chorus');
  assert.equal(sectionKind('Pre-chorus'), 'prechorus');
  assert.equal(sectionKind('Breakdown'), 'breakdown');
  assert.equal(sectionKind('Outro'), 'outro');
  assert.equal(sectionKind('Something'), '');
  assert.equal(bloodBackdrop('Chorus 1'), 'red');
  assert.equal(bloodBackdrop('Breakdown'), 'ash');
  assert.equal(bloodBackdrop('Bridge'), 'ash');
  assert.equal(bloodBackdrop('Verse 2'), 'black');
  assert.equal(bloodBackdrop(null, 'red'), 'red');
  assert.equal(keyWord('I am the fire'), 3);
  assert.equal(keyWord('Burn the whole world down'), 2);
  assert.equal(keyWord('Burn'), -1);
});

test('ready: what each template uses, or what it still needs', () => {
  for (const id of ['st-bloodslam', 'st-glowslam', 'st-stage', 'st-coversheet']) {
    const r = songTemplateReady(id, ctxOf({ video }));
    assert.ok(r.ok, id);
    assert.ok(r.uses.length >= 2, id);
  }
  assert.match(songTemplateReady('st-bloodslam', ctxOf()).uses[0], /Chorus 1 0:42–1:04/);
  assert.match(songTemplateReady('st-bloodslam', ctxOf({ song: song({ sections: [] }) })).uses[0], /No Chorus section yet/);
  assert.match(songTemplateReady('st-bloodslam', ctxOf({ song: song({ instrumental: true }) })).missing, /instrumental/);
  assert.match(songTemplateReady('st-glowslam', ctxOf({ song: song({ lyrics: '', lyricTiming: null }) })).missing, /Add the lyrics/);
  assert.match(songTemplateReady('st-stage', ctxOf()).missing, /music video or raw footage/);
  assert.match(songTemplateReady('st-coversheet', ctxOf({ coverRec: null })).missing, /cover art/);
  assert.match(songTemplateReady('st-stage', ctxOf({ video })).uses[1], /saved sync \(1.5 s\)/);
  // Glow Slam: the chorus has word times; a verse part does not, so it says so and offers Auto-sync
  const chorus = songTemplateReady('st-glowslam', ctxOf());
  assert.ok(!chorus.autosync);
  assert.ok(chorus.uses.some((u) => /Saved word times on/.test(u)));
  const verse = songTemplateReady('st-glowslam', ctxOf({ part: oneSection }));
  assert.ok(verse.ok && verse.autosync);
  assert.ok(verse.uses.some((u) => /No saved word times/.test(u)));
});

test('Blood Slam Cards: the chorus by default, red backdrop, Blood & Ash, key words, chorus flash, drop end card', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-bloodslam', ctxOf({ footage }));
  assert.equal(d.song.offset, 42);
  assert.equal(contentLen(d), 22);
  assert.equal(d.songPart.byTemplate, 'st-bloodslam');
  assert.ok(d.clips.length >= 1 && d.clips.every((c) => c.grade && c.grade.shadows === BLOOD_BACKDROPS.red.grade.shadows));
  const blood = themeById('bloodash');
  assert.equal(d.lyricStyle.font, 'Bebas Neue');
  assert.equal(d.lyricStyle.uppercase, true);
  assert.equal(d.lyricStyle.animation, blood.fields.animation);
  assert.equal(d.lyricStyle.color, blood.fields.color);
  assert.equal(d.lyricStyle.fx.shake, blood.fx.shake);
  assert.equal(d.lyricStyle.fx.shakeBeat, true);
  assert.equal(d.lyricStyle.display, 'line');
  const inPart = d.lyrics.filter((l) => l.end > 42 && l.start < 64);
  assert.ok(inPart.length >= 4);
  assert.ok(inPart.every((l) => l.emph && l.emph.slam), 'a key word in every line slams');
  assert.ok(inPart.filter((l) => l.text.startsWith('Burn')).every((l) => l.emph.words[0].w === 'whole'));
  assert.ok(inPart.every((l) => l.style && l.style.hit === 'line'), 'chorus lines flash on their first word');
  assert.equal(lineStyle(d.lyricStyle, inPart[0]).hit, 'line');
  assert.ok(d.endCard.enabled && d.endCard.animation === 'drop' && d.endCard.title === 'Static Bloom');
  assert.equal(d.template, 'st-bloodslam');
  assert.ok(facts.some((f) => /key words? slam/.test(f)));
  assert.match(facts[facts.length - 1], /Ends on the end card/);
});

test('Blood Slam Cards over several sections: ash for the breakdown, red for the chorus, the part kept', () => {
  const d = newProject();
  applySongTemplate(d, 'st-bloodslam', ctxOf({ video, part: several }));
  assert.equal(d.song.parts.length, 2);
  assert.deepEqual(d.song.parts.map((q) => q.from), [90, 42]);
  assert.equal(d.songPart.kind, 'several');
  assert.equal(d.songPart.template, 'st-bloodslam');
  assert.deepEqual(d.clips.map((c) => (c.grade ? c.grade.shadows || 'ash' : 'black')), ['ash', BLOOD_BACKDROPS.red.grade.shadows]);
  // the music video at the same moment as the sound
  assert.equal(d.clips[0].in, 90 + 1.5);
  assert.equal(d.clips[1].transition.type, 'crossfade');
  const lines = d.lyrics.filter((l) => l.style && l.style.hit === 'line');
  assert.ok(lines.length && lines.every((l) => l.start >= 41 && l.start < 64), 'only chorus lines flash');
  assert.ok(d.endCard.enabled);
  assert.equal(d.duration, +(d.songPart.length + d.endCard.duration).toFixed(3));
});

test('Glow Slam One-Word: one word per line on its saved times, tracking + ghost echo + flash, glow viz, zoom end card', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-glowslam', ctxOf());
  const words = d.lyrics.filter((l) => l.start >= 42 && l.start < 64);
  assert.ok(words.length >= 20);
  assert.ok(words.every((l) => !/\s/.test(l.text)), 'one word a line');
  assert.equal(words[0].text, 'Burn');
  assert.equal(words[0].start, 42);
  assert.equal(words[1].start, 42.6);
  assert.equal(d.lyricStyle.animation, 'tracking');
  assert.equal(d.lyricStyle.hit, 'line');
  assert.equal(d.lyricStyle.echo, 'behind');
  assert.equal(d.lyricStyle.font, 'Montserrat');
  assert.equal(d.lyricStyle.color, themeById('hellfire').fields.color);
  assert.ok(d.lyricStyle.fx.echoAmt > 1 && d.lyricStyle.fx.trackAmt > 1);
  const viz = d.layers.filter((l) => l.type === 'viz' && l.visible);
  assert.equal(viz.length, 1);
  assert.equal(viz[0].style, 'glow');
  assert.equal(d.endCard.animation, 'zoom');
  // the line that runs from the verse into the chorus has no word times, the chorus lines do
  assert.ok(facts.some((f) => /1 of them have no saved word times/.test(f)));
  // applying again does not add a second visualizer
  applySongTemplate(d, 'st-glowslam', ctxOf({ look: 'neon' }));
  assert.equal(d.layers.filter((l) => l.type === 'viz').length, 1);
  assert.equal(d.lyricStyle.color, themeById('neonpink').fields.color);
});

test('Glow Slam on a part with no word times: even shares, and it says to Auto-sync', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-glowslam', ctxOf({ part: oneSection }));
  assert.equal(d.song.offset, 64);
  assert.ok(facts.some((f) => /no saved word times.*Auto-sync/.test(f)));
  const r = oneWordLines([{ id: 'x', text: 'one two', start: 10, end: 12 }], [{ from: 0, to: 20 }]);
  assert.equal(r.lyrics.length, 2);
  assert.equal(r.timed, 0);
  assert.equal(r.lyrics[1].end, 12);
  assert.ok(r.lyrics[0].end === r.lyrics[1].start);
});

test('Stage Footage Cinematic: the music video on its saved sync, letterbox, lower-third serif, vinyl end card', () => {
  const d = newProject();
  applySongTemplate(d, 'st-stage', ctxOf({ video }));
  assert.equal(d.clips.length, 1);
  assert.equal(d.clips[0].mediaId, 'mv');
  assert.equal(d.clips[0].in, +(d.song.offset + 1.5).toFixed(3));
  assert.equal(contentLen(d), 15);
  assert.ok(d.look.letterbox > 0 && d.look.vignette > 0 && d.look.grain > 0);
  assert.equal(d.lyricStyle.font, 'Playfair Display');
  assert.equal(d.lyricStyle.animation, 'tracking');
  assert.equal(d.lyricStyle.echo, 'trail');
  assert.equal(d.lyricStyle.uppercase, false);
  assert.ok(d.lyricStyle.y >= 70 && d.lyricStyle.size < 6);
  assert.equal(d.endCard.animation, 'vinyl');
  const f = newProject();
  applySongTemplate(f, 'st-stage', ctxOf({ footage, look: 'frostbite', part: several }));
  assert.equal(f.lyricStyle.font, 'Georgia');
  assert.equal(f.lyricStyle.color, themeById('frostbite').fields.color);
  assert.ok(f.clips.length > 2 && f.clips.every((c) => c.mediaId.startsWith('f')));
  assert.equal(f.song.parts.length, 2);
});

test('Cover Art Sheet: the whole song as a scrolling sheet over the blurred cover, vinyl end card', () => {
  const d = newProject();
  applySongTemplate(d, 'st-coversheet', ctxOf());
  assert.equal(d.song.offset, 0);
  assert.equal(contentLen(d), 180);
  assert.equal(d.lyricStyle.display, 'sheet');
  assert.equal(d.clips.length, 1);
  assert.equal(d.clips[0].mediaId, 'cov');
  assert.ok(d.clips[0].filter.adjust.blur > 10);
  assert.equal(d.endCard.animation, 'vinyl');
  const p = newProject();
  applySongTemplate(p, 'st-coversheet', ctxOf({ part: several }));
  assert.equal(p.song.parts.length, 2);
  assert.equal(p.clips.length, 1);
  assert.equal(p.clips[0].duration, p.songPart.length);
});

test('a new template clears the old one’s automatic key words and chorus flash, never your own', () => {
  const d = newProject();
  applySongTemplate(d, 'st-bloodslam', ctxOf());
  const mine = d.lyrics.find((l) => l.start >= 42 && l.start < 64);
  mine.emph = { words: [{ i: 0, w: 'Burn' }] };
  mine.style = { hit: 'line', color: '#00ff00' };
  applySongTemplate(d, 'st-stage', ctxOf({ video }));
  assert.ok(!d.lyrics.some((l) => l.emph && l.emph.slam), 'automatic key words go');
  assert.ok(!d.lyrics.some((l) => l.style && JSON.stringify(l.style) === '{"hit":"line"}'), 'the template flash look goes');
  const kept = d.lyrics.find((l) => l.id === mine.id);
  assert.deepEqual(kept.emph, { words: [{ i: 0, w: 'Burn' }] });
  assert.equal(kept.style.color, '#00ff00');
});

test('Section looks: each line gets its section’s look for the chosen part, keeps its flash, and turns off again', () => {
  const ctx = ctxOf();
  const d = newProject();
  applySongTemplate(d, 'st-bloodslam', { ...ctx, part: { kind: 'range', from: 0, to: 140 } });
  const choice = { kind: 'range', from: 0, to: 140 };
  assert.equal(partSections(ctx.song, 180).length, 7);
  assert.equal(sectionLooksState(d, choice, ctx).on, false);
  const n = setSectionLooks(d, true, choice, ctx);
  assert.ok(n > 20);
  const at = (t) => d.lyrics.find((l) => Math.abs(l.start - t) < 0.01);
  assert.equal(at(2).style.preset, 'whisper');
  assert.equal(at(14).style.preset, 'clean');
  assert.equal(at(46).style.preset, 'scream');
  assert.equal(at(46).style.hit, 'line', 'the chorus flash stays');
  assert.equal(at(94).style.preset, 'breakdown');
  assert.equal(at(130).style.preset, 'whisper');
  assert.ok(!at(146).style || !at(146).style.preset, 'lines outside the part keep their look');
  assert.equal(sectionLooksState(d, choice, ctx).on, true);
  setSectionLooks(d, false, choice, ctx);
  assert.ok(!d.lyrics.some((l) => l.style && l.style.preset));
  assert.equal(at(46).style.hit, 'line');
  // a part of one section: only its lines
  const e = newProject();
  applySongTemplate(e, 'st-stage', ctxOf({ video, part: oneSection }));
  setSectionLooks(e, true, oneSection, ctx);
  const set = e.lyrics.filter((l) => l.style && l.style.preset);
  assert.ok(set.length >= 6 && set.every((l) => l.start >= 62 && l.start < 90));
  // a line is in the section it mostly sits in: 62–65.6 is mostly Chorus 1
  assert.deepEqual([...new Set(set.map((l) => l.style.preset))], ['scream', 'clean']);
});
