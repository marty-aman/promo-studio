import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchedToGems, drumsToGems, stemToGems, finishGems, gameState } from '../js/rhythmgame.js';
import { gameParts, songTemplateReady, applySongTemplate, SONG_TEMPLATES } from '../js/songtemplates.js';
import { newProject } from '../js/state.js';
import { detectOnsets } from '../js/drums.js';

test('pitched notes become five-lane gems that follow the melody', () => {
  const notes = [40, 43, 45, 47, 50, 52, 50, 47, 45, 43].map((p, i) => ({ time: i * 0.25, pitch: p, dur: 0.2 }));
  const { gems } = pitchedToGems(notes);
  assert.equal(gems.length, 10);
  assert.ok(gems.every((g) => g.lane >= 0 && g.lane <= 4));
  assert.equal(gems[0].lane, 0); // lowest
  assert.equal(gems[5].lane, 4); // highest
  for (let i = 1; i <= 5; i++) assert.ok(gems[i].lane >= gems[i - 1].lane, 'rising melody climbs the frets');
  // a chord: neighbouring lanes; a long note: a sustain
  const chord = pitchedToGems([{ time: 0, pitch: 40, dur: 1 }, { time: 0.005, pitch: 47, dur: 1 }, { time: 0.01, pitch: 52, dur: 1 }, { time: 1, pitch: 60, dur: 0.1 }]).gems;
  const at0 = chord.filter((g) => g.time === 0);
  assert.equal(at0.length, 3);
  assert.deepEqual(at0.map((g) => g.lane), [at0[0].lane, at0[0].lane + 1, at0[0].lane + 2]);
  assert.ok(at0.every((g) => g.len > 0.8 && g.chord));
});

test('drum hits become pads and kicks', () => {
  const { gems } = drumsToGems([{ time: 0, lane: 'kick' }, { time: 0, lane: 'hihat' }, { time: 0.5, lane: 'snare' }, { time: 1, lane: 'crash' }, { time: 1.2, lane: 'floor' }, { time: 1.4, lane: 'ride' }]);
  assert.deepEqual(gems.map((g) => g.lane), [-1, 1, 0, 3, 3, 2]);
  assert.ok(gems.find((g) => g.lane === 1).cymbal && !gems.find((g) => g.lane === 0).cymbal);
});

test('gems too close on one lane are merged, and the score adds up with the multiplier', () => {
  const g = finishGems([{ time: 0, lane: 0 }, { time: 0.03, lane: 0 }, { time: 0.03, lane: 1 }]);
  assert.equal(g.notes, 2);
  const many = finishGems(Array.from({ length: 60 }, (_, i) => ({ time: i * 0.2, lane: i % 5 })));
  assert.equal(many.gems[0].score, 50);
  assert.equal(many.gems[9].score, 500); // ten notes at ×1
  assert.equal(many.gems[10].score, 600); // the 11th at ×2
  assert.ok(many.gems[24].sp && !many.gems[23].sp); // star power after the first phrase
  const s = gameState(many, 2.05);
  assert.equal(s.n, 11);
  assert.equal(s.mult, 2);
  assert.equal(s.score, 600);
  assert.equal(s.timeOf(11), 2);
  assert.equal(gameState(many, -1).n, 0);
});

test('a stem becomes gems where new sounds start', () => {
  const fps = 50;
  const frames = 500;
  const env = new Float32Array(1000);
  const level = new Float32Array(frames);
  const bands = new Float32Array(frames * 16);
  for (let k = 0; k < 10; k++) {
    const t = 1 + k * 0.8;
    for (let d = 0; d < 20; d++) env[Math.round(t * 100) + d] = Math.exp(-d / 6);
    for (let d = 0; d < 10; d++) level[Math.round(t * fps) + d] = Math.exp(-d / 4);
    const f = Math.round(t * fps) + 1;
    bands[f * 16 + (k % 2 ? 12 : 2)] = 1; // alternating bright and dark sounds
  }
  const c = stemToGems({ env100: env, level, bands, nbands: 16, fps, frames }, detectOnsets);
  assert.equal(c.notes, 10);
  assert.ok(Math.abs(c.gems[0].time - 1) < 0.05);
  assert.ok(c.gems[1].lane > c.gems[0].lane, 'a brighter sound sits higher');
  assert.equal(stemToGems(null, detectOnsets).notes, 0);
});

test('which parts a rhythm game plays, best source first', () => {
  const tab = { id: 'tab', name: 'sb.gp', title: 'Static Bloom', tracks: [{ index: 0, name: 'Lead', strings: 6 }, { index: 1, name: 'Bass', strings: 4 }], drumTracks: [] };
  const midi = { id: 'mid', name: 'Static Bloom drums.mid', midi: { tracks: [{ index: 0, name: 'Drums', notes: 40, isDrum: true }] } };
  const stems = [{ rec: { id: 's1', name: 'Kick.wav', kind: 'audio' }, role: 'drums' }, { rec: { id: 's2', name: 'Gtr.wav', kind: 'audio' }, role: 'guitar' }];
  const parts = gameParts({ tabs: [tab], midis: [midi], stems });
  assert.deepEqual(parts.map((p) => [p.instrument, p.source, p.mediaId, p.track]), [['guitar', 'tab', 'tab', 0], ['drums', 'midi', 'mid', 0], ['bass', 'tab', 'tab', 1]]);
  const stemOnly = gameParts({ stems });
  assert.deepEqual(stemOnly.map((p) => [p.instrument, p.source]), [['guitar', 'stem'], ['drums', 'stem']]);
  assert.deepEqual(gameParts({}), []);
});

const audio = { id: 'song', name: 'Static Bloom.wav', kind: 'audio', duration: 120, envelope: Float32Array.from({ length: 12000 }, (_, i) => (i > 6000 && i < 9000 ? 1 : 0.2)), envRate: 100 };
const baseCtx = (extra = {}) => ({
  song: { id: 'sb', title: 'Static Bloom', lyrics: 'Burn it down\nI am the fire', releaseDate: '2027-03-01', instrumental: false },
  band: 'Arc Flash',
  audio,
  beats: null,
  video: null,
  footage: [],
  parts: [],
  cover: 'cov',
  hasLyrics: false,
  today: '2026-11-21',
  ...extra,
});

test('templates say what they need', () => {
  assert.equal(SONG_TEMPLATES.length, 3);
  assert.match(songTemplateReady('st-game', null).missing, /Pick one of your songs/);
  assert.match(songTemplateReady('st-game', baseCtx()).missing, /Guitar Pro tab/);
  assert.match(songTemplateReady('st-mv', baseCtx()).missing, /music video/);
  assert.match(songTemplateReady('st-footage', baseCtx()).missing, /raw footage/);
  assert.match(songTemplateReady('st-mv', baseCtx({ audio: null })).missing, /no song file/);
  assert.throws(() => applySongTemplate(newProject(), 'st-mv', baseCtx()), /music video/);
});

test('the rhythm game template: highways, the arena, the song intro and the end card', () => {
  const d = newProject();
  d.layers = [{ id: 'old', type: 'viz', visible: true }];
  const parts = [{ instrument: 'guitar', source: 'tab', mediaId: 'tab', track: 0, label: 'Guitar', from: 'x' }, { instrument: 'drums', source: 'stem', mediaId: 's1', track: 0, label: 'Drums', from: 'y' }];
  const facts = applySongTemplate(d, 'st-game', baseCtx({ parts }));
  const games = d.layers.filter((l) => l.type === 'game');
  assert.equal(games.length, 2);
  assert.deepEqual(games.map((l) => [l.instrument, l.x, l.backdrop]), [['guitar', 27, 'arena'], ['drums', 73, 'none']]);
  assert.equal(d.layers.find((l) => l.id === 'old').visible, false); // hidden, not deleted
  assert.equal(d.song.offset, 60); // the loudest 30 s
  assert.equal(d.duration, 34);
  assert.deepEqual(d.texts.map((t) => t.text), ['STATIC BLOOM', 'ARC FLASH']);
  assert.equal(d.layerVis.lyrics, false);
  assert.ok(d.endCard.enabled && d.endCard.title === 'Static Bloom' && d.endCard.artist === 'Arc Flash' && d.endCard.coverMediaId === 'cov');
  assert.equal(d.endCard.cta, '{countdown}'); // released in the future
  assert.ok(facts.some((f) => f.includes('rock arena')));
  // again: its own highways are replaced, not doubled
  applySongTemplate(d, 'st-game', baseCtx({ parts: parts.slice(0, 1) }));
  assert.equal(d.layers.filter((l) => l.type === 'game').length, 1);
  // with a music video it plays behind them, dimmed and in sync
  const v = { id: 'mv', kind: 'video', name: 'mv.mp4', duration: 200 };
  applySongTemplate(d, 'st-game', baseCtx({ parts, video: { rec: v, offset: 12 } }));
  assert.equal(d.clips[0].in, 72);
  assert.equal(d.clips[0].filter.adjust.brightness, 0.45);
  assert.ok(d.layers.filter((l) => l.type === 'game').every((l) => l.backdrop === 'none'));
});

test('the music video and raw footage templates put the lyrics on top', () => {
  const v = { id: 'mv', kind: 'video', name: 'mv.mp4', duration: 200 };
  const d = newProject();
  applySongTemplate(d, 'st-mv', baseCtx({ video: { rec: v, offset: 12 } }));
  assert.equal(d.clips.length, 1);
  assert.equal(d.clips[0].in, 72); // the same moment of the video as the song's hook
  assert.equal(d.clips[0].duration, 15);
  assert.deepEqual(d.lyrics.map((l) => l.text), ['Burn it down', 'I am the fire']);
  assert.equal(d.lyrics[0].start, 60.5);
  assert.ok(d.layerVis.lyrics !== false && d.endCard.enabled);
  assert.equal(d.look.letterbox, 0);
  const f = newProject();
  const clips = [1, 2, 3].map((i) => ({ id: `c${i}`, kind: 'video', name: `c${i}.mp4`, duration: 20 }));
  applySongTemplate(f, 'st-footage', baseCtx({ footage: clips }));
  assert.ok(f.clips.length >= 3);
  assert.ok(f.clips.every((c) => ['c1', 'c2', 'c3'].includes(c.mediaId)));
  assert.equal(f.lyrics.length, 2);
  assert.ok(f.endCard.enabled && f.endCard.title === 'Static Bloom');
  // an instrumental: no lyrics are added
  const i = newProject();
  applySongTemplate(i, 'st-footage', baseCtx({ footage: clips, song: { ...baseCtx().song, instrumental: true } }));
  assert.equal(i.lyrics.length, 0);
});
