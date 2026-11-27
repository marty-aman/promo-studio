// Lyric-video templates, batch 2: Scream/Clean Split, Tour Ticker, Ash Dissolve and Ransom Note Zine.
// They store look values (no template ids beyond project.template), keep the Part of the song, end on the end card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { songTemplateReady, applySongTemplate, SONG_TEMPLATES, SPLIT_LOOKS, ZINE_RED, vocalOf } from '../js/songtemplates.js';
import { sectionLooksState, setSectionLooks } from '../js/songpart.js';
import { lineStyle } from '../js/linestyle.js';
import { newProject, normalizeProject } from '../js/state.js';
import { cleanLyricAnimations } from '../js/lyricanim.js';

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
const LINES = Array.from({ length: 40 }, (_, i) => {
  const t = 2 + i * 4;
  return { t, end: t + 3.6, text: t >= 42 && t < 60 ? 'Burn the whole world down' : `Walking line number ${i}` };
});
const timing = { lines: LINES, offset: 0, source: 'auto', savedAt: '2026-11-20T00:00:00.000Z' };
const song = (extra = {}) => ({ id: 'sb', title: 'Static Bloom', lyrics: LINES.map((l) => l.text).join('\n'), lyricTiming: timing, releaseDate: '', instrumental: false, sections: SECTIONS, ...extra });
const video = { rec: { id: 'mv', kind: 'video', name: 'mv.mp4', duration: 240 }, offset: 1.5 };
const footage = [1, 2].map((i) => ({ id: `f${i}`, kind: 'video', name: `f${i}.mp4`, duration: 40 }));
const ctxOf = (extra = {}) => ({ song: song(), band: 'Arc Flash', audio, beats, video: null, footage: [], parts: [], cover: 'cov', coverRec: { id: 'cov', kind: 'image', name: 'cover.jpg' }, hasLyrics: false, today: '2026-11-23', ...extra });
const several = { kind: 'several', ids: ['k', 'b'], join: { kind: 'fade', fade: 0.3 } };
const oneSection = { kind: 'one', ids: ['c'] };
const IDS = ['st-screamclean', 'st-tourticker', 'st-ashdissolve', 'st-ransom'];
const inRange = (d, a, b) => d.lyrics.filter((l) => l.end > a && l.start < b);

test('batch 2 cards: lyric templates, stand-ins named in the blurb, ready texts', () => {
  for (const id of IDS) {
    const t = SONG_TEMPLATES.find((x) => x.id === id);
    assert.ok(t && t.lyric, id);
    assert.match(t.blurb, /Stand-in/, `${id} names its stand-in`);
    const r = songTemplateReady(id, ctxOf());
    assert.ok(r.ok && r.uses.length >= 2, id);
    assert.match(songTemplateReady(id, ctxOf({ song: song({ instrumental: true }) })).missing, /instrumental/);
    assert.match(songTemplateReady(id, ctxOf({ song: song({ lyrics: '', lyricTiming: null }) })).missing, /Add the lyrics/);
  }
  assert.match(songTemplateReady('st-screamclean', ctxOf()).uses[0], /Verse 1 into Chorus 1 0:32–1:02/);
  assert.match(songTemplateReady('st-ashdissolve', ctxOf()).uses[0], /Outro 2:10–2:35/);
  assert.match(songTemplateReady('st-tourticker', ctxOf()).uses[0], /Chorus 1 0:42–1:04/);
  assert.match(songTemplateReady('st-screamclean', ctxOf({ song: song({ sections: [] }) })).uses[1], /alternate/);
  assert.match(songTemplateReady('st-ashdissolve', ctxOf({ song: song({ sections: [] }) })).uses[0], /No intro, outro or verse/);
});

test('Scream/Clean Split: screamed lines left, clean lines right, by section; kept part, end card', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-screamclean', ctxOf({ footage }));
  assert.equal(d.template, 'st-screamclean');
  assert.equal(d.songPart.byTemplate, 'st-screamclean');
  assert.equal(vocalOf('Chorus 2'), 'scream');
  assert.equal(vocalOf('Breakdown'), 'scream');
  assert.equal(vocalOf('Verse 1'), 'clean');
  assert.equal(vocalOf(null), null);
  const lines = d.lyrics.filter((l) => l.end > d.song.offset && l.start < d.song.offset + d.songPart.length);
  assert.ok(lines.length >= 5);
  const chorus = lines.filter((l) => l.start >= 42 && l.end <= 64);
  const verse = lines.filter((l) => l.end <= 41);
  assert.ok(chorus.length && verse.length);
  assert.ok(chorus.every((l) => l.style.preset === 'scream' && l.style.side === 'left' && l.style.hit === 'line'));
  assert.ok(verse.every((l) => l.style.preset === 'clean' && l.style.side === 'right'));
  assert.equal(lineStyle(d.lyricStyle, chorus[0]).font, 'Bebas Neue');
  assert.equal(lineStyle(d.lyricStyle, verse[0]).font, 'Montserrat');
  assert.equal(lineStyle(d.lyricStyle, chorus[0]).fx.shakeBeat, true);
  assert.ok(!lineStyle(d.lyricStyle, verse[0]).fx || !lineStyle(d.lyricStyle, verse[0]).fx.shake, 'clean lines do not shake');
  assert.ok(d.clips.length && d.clips.every((c) => c.filter.adjust.brightness < 0.5));
  assert.ok(d.endCard.enabled && d.endCard.animation === 'glitch' && d.endCard.title === 'Static Bloom');
  assert.ok(facts.some((f) => /screamed lines? on the left/.test(f)));
  assert.match(facts[facts.length - 1], /Ends on the end card/);
  // the look values are saved with the project and load back unchanged
  const back = normalizeProject(JSON.parse(JSON.stringify(d)));
  assert.equal(back.lyrics.find((l) => l.id === chorus[0].id).style.side, 'left');
  assert.deepEqual(cleanLyricAnimations(JSON.parse(JSON.stringify(d))).lyrics.find((l) => l.id === chorus[0].id).style.side, 'left');
});

test('Scream/Clean Split: your own looks stay, no sections alternate two by two, the Section looks switch layers on top', () => {
  const d = newProject();
  applySongTemplate(d, 'st-screamclean', ctxOf());
  const mine = d.lyrics.find((l) => l.start === 34);
  mine.style = { color: '#00ff00' };
  // re-apply: its own marks go and come back, the line you styled stays as it was
  applySongTemplate(d, 'st-screamclean', ctxOf());
  assert.deepEqual(d.lyrics.find((l) => l.id === mine.id).style, { color: '#00ff00' });
  assert.ok(d.lyrics.find((l) => l.start === 38).style.preset);
  // another template takes the split looks away
  applySongTemplate(d, 'st-stage', ctxOf({ video }));
  assert.ok(!d.lyrics.some((l) => l.style && (l.style.preset === 'scream' || l.style.preset === 'clean') && JSON.stringify(l.style) === JSON.stringify(SPLIT_LOOKS[l.style.preset])));
  // no sections: alternate
  const e = newProject();
  applySongTemplate(e, 'st-screamclean', ctxOf({ song: song({ sections: [] }) }));
  const set = e.lyrics.filter((l) => l.style && l.style.preset);
  assert.ok(set.length >= 4);
  assert.deepEqual(set.slice(0, 4).map((l) => l.style.preset), ['scream', 'scream', 'clean', 'clean']);
  // Section looks: intro/outro whisper, breakdown look; the side stays; one undo step is the caller's store.update
  const f = newProject();
  const ctx = ctxOf();
  const choice = { kind: 'range', from: 0, to: 140 };
  applySongTemplate(f, 'st-screamclean', { ...ctx, part: choice });
  assert.equal(sectionLooksState(f, choice, ctx).on, false);
  setSectionLooks(f, true, choice, ctx);
  const at = (t) => f.lyrics.find((l) => Math.abs(l.start - t) < 0.01);
  assert.equal(at(2).style.preset, 'whisper');
  assert.equal(at(94).style.preset, 'breakdown');
  assert.equal(at(94).style.side, 'left');
  assert.equal(at(14).style.side, 'right');
  assert.equal(sectionLooksState(f, choice, ctx).on, true);
});

test('Tour Ticker: one band, tempo-locked, only the part’s lines, spectrum bars, title bug, end card', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-tourticker', ctxOf({ footage }));
  assert.equal(d.template, 'st-tourticker');
  assert.equal(d.lyricStyle.display, 'ticker');
  assert.equal(d.lyricStyle.font, 'Bebas Neue');
  assert.equal(d.lyricStyle.uppercase, true);
  assert.ok(d.lyricStyle.boxOpacity > 0.8);
  assert.equal(d.lyricStyle.fx.tickerLock, 1);
  assert.equal(d.song.offset, 42);
  assert.ok(d.lyrics.length >= 4 && d.lyrics.every((l) => l.end > 42 && l.start < 64), 'only the part’s lines are in the band');
  const bars = d.layers.filter((l) => l.type === 'viz' && l.visible);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].style, 'bars');
  assert.equal(d.texts.length, 1);
  assert.equal(d.texts[0].text, 'ARC FLASH · STATIC BLOOM');
  assert.ok(d.clips.length && d.clips.every((c) => c.mediaId.startsWith('f')));
  assert.equal(d.endCard.animation, 'rise');
  assert.ok(facts.some((f) => /in the band, one per bar/.test(f)));
  applySongTemplate(d, 'st-tourticker', ctxOf({ footage }));
  assert.equal(d.layers.filter((l) => l.type === 'viz').length, 1, 'no second bars layer');
  // a later template puts the one-line display back
  applySongTemplate(d, 'st-ashdissolve', ctxOf());
  assert.equal(d.lyricStyle.display, 'line');
  assert.equal(d.layers.filter((l) => l.type === 'viz').length, 0);
  // several sections: lines of both
  const s = newProject();
  applySongTemplate(s, 'st-tourticker', ctxOf({ part: several }));
  assert.equal(s.song.parts.length, 2);
  assert.ok(s.lyrics.every((l) => (l.end > 90 && l.start < 110) || (l.end > 42 && l.start < 64)));
});

test('Ash Dissolve: the outro by default, letters in, ash out, dark grey picture, slow sway, rise end card', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-ashdissolve', ctxOf({ video }));
  assert.equal(d.song.offset, 130);
  assert.equal(d.songPart.byTemplate, 'st-ashdissolve');
  assert.equal(d.lyricStyle.display, 'line');
  assert.equal(d.lyricStyle.font, 'Playfair Display');
  assert.equal(d.lyricStyle.animation, 'tracking');
  assert.equal(d.lyricStyle.outAnimation, 'ash');
  assert.ok(d.lyricStyle.outDuration >= 0.8);
  assert.ok(d.lyricStyle.fx.ashDrift > 1 && d.lyricStyle.fx.shakeDir === 'y' && d.lyricStyle.fx.shake < 0.1);
  assert.ok(d.clips.length && d.clips.every((c) => c.filter.adjust.saturate === 0 && c.filter.adjust.brightness < 0.4 && c.grade.fade > 0));
  assert.equal(d.layers.filter((l) => l.type === 'viz' && l.visible).length, 0);
  assert.equal(d.endCard.animation, 'rise');
  assert.ok(facts.some((f) => /ash/.test(f)));
  // a picked part wins; no picture = black
  const p = newProject();
  applySongTemplate(p, 'st-ashdissolve', ctxOf({ coverRec: null, part: oneSection }));
  assert.equal(p.song.offset, 64);
  assert.equal(p.clips.length, 0);
  // no sections: the loudest 20 s
  const n = newProject();
  applySongTemplate(n, 'st-ashdissolve', ctxOf({ song: song({ sections: [] }) }));
  assert.equal(n.duration - n.endCard.duration, 20);
});

test('Ransom Note Zine: paper strips on solid red, mixed fonts, bigger chorus strips, scanlines, glitch end card', () => {
  const d = newProject();
  const facts = applySongTemplate(d, 'st-ransom', ctxOf({ footage }));
  assert.equal(d.lyricStyle.animation, 'paper');
  assert.equal(d.lyricStyle.fx.paperFonts, 1);
  assert.ok(d.lyricStyle.fx.paperTilt > 1);
  assert.equal(d.background, ZINE_RED);
  assert.equal(d.clips.length, 0);
  assert.ok(d.look.scanlines > 0 && d.look.grain >= 0.4);
  const inPart = inRange(d, 42, 64);
  assert.ok(inPart.length >= 4 && inPart.every((l) => l.style && l.style.size > d.lyricStyle.size), 'chorus strips are bigger');
  assert.equal(d.endCard.animation, 'glitch');
  assert.ok(facts.some((f) => /bigger/.test(f)));
  // verses stay at the base size
  const v = newProject();
  applySongTemplate(v, 'st-ransom', ctxOf({ part: oneSection }));
  assert.ok(inRange(v, 66, 90).every((l) => !l.style));
  // another template gives the page back and clears the big strips
  applySongTemplate(d, 'st-bloodslam', ctxOf());
  assert.equal(d.background, '#000000');
  assert.ok(!d.lyrics.some((l) => l.style && JSON.stringify(l.style) === '{"size":11}'));
});

test('batch 2 on one Ctrl+Z worth of change: each leaves a clean draft that loads back with the same looks', () => {
  for (const id of IDS) {
    const d = newProject();
    applySongTemplate(d, id, ctxOf({ footage, part: several }));
    assert.equal(d.template, id);
    assert.equal(d.songPart.template, id);
    assert.equal(d.song.parts.length, 2);
    assert.ok(d.endCard.enabled);
    assert.equal(d.duration, +(d.songPart.length + d.endCard.duration).toFixed(3), id);
    const back = normalizeProject(JSON.parse(JSON.stringify(d)));
    for (const k of ['display', 'animation', 'outAnimation', 'font', 'size']) assert.equal(back.lyricStyle[k], d.lyricStyle[k], `${id} ${k}`);
    assert.ok(!JSON.stringify(d.lyricStyle).includes('"st-'), 'values, not template ids');
  }
});
