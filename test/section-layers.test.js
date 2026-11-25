// Layers in an edit of part of the song (Song part, Export Song sections, templates on a part, the export range):
// edit time maps to song time with timelineToSong, and a chart or stem layer shows (song time - offset) x tempoScale,
// so every part shows its own bars. New chart layers start at the song's 0:00 (NEW_CHART_OFFSET), not at the song
// time of the edit's 0:00.
import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineToSong, NEW_CHART_OFFSET } from '../js/core.js';
import { applySongPart } from '../js/songpart.js';
import { applyBatchItem } from '../js/batch.js';
import { applyTemplate } from '../js/templates.js';
import { gridOf, gridLength } from '../js/tempo.js';
import { newProject } from '../js/state.js';

const audio = { id: 'song', name: 'Song.wav', kind: 'audio', duration: 64, envelope: Float32Array.from({ length: 6400 }, () => 0.3), envRate: 100 };
const SECTIONS = [
  { id: 'i', label: 'Intro', start: 0, end: 16 },
  { id: 'v', label: 'Verse', start: 16, end: 40 },
  { id: 'c', label: 'Chorus', start: 40, end: 56 },
  { id: 'o', label: 'Outro', start: 56, end: 64 },
];
const ctx = { song: { id: 's', title: 'Song', sections: SECTIONS }, audio, picture: 'keep' };
const edit = (choice) => {
  const d = newProject();
  applySongPart(d, choice, ctx);
  return d;
};
// what a chart layer shows at edit time t
const chartTime = (L, t, song) => (timelineToSong(t, song) - (L.offset || 0)) * (L.tempoScale || 1);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('new chart layers start with the song', () => {
  assert.equal(NEW_CHART_OFFSET, 0);
});

test('one section: the edit’s 0:00 shows the Chorus’s bar, not bar 1', () => {
  const d = edit({ kind: 'one', ids: ['c'] });
  const L = { offset: NEW_CHART_OFFSET, tempoScale: 1 };
  near(chartTime(L, 0, d.song), 40, 'start of the Chorus edit');
  near(chartTime(L, 5.3, d.song), 45.3, '5.3 s in');
  // a saved sync (the file starts 1.5 s into the song, 2% fast) stays in song time
  const S = { offset: 1.5, tempoScale: 1.02 };
  near(chartTime(S, 2, d.song), (42 - 1.5) * 1.02, 'saved sync');
});

test('a custom range and an Export Song sections item map the same way', () => {
  const r = edit({ kind: 'range', from: 40, to: 52 });
  near(timelineToSong(3, r.song), 43, 'range');
  const b = newProject();
  b.song = { mediaId: 'song', offset: 0, volume: 1 };
  applyBatchItem(b, { songOffset: 40, mvIn: null }, { len: 16 });
  near(timelineToSong(3, b.song), 43, 'sections export item');
});

test('several sections joined: each piece jumps to its own section, crossfaded or cut, reordered or repeated', () => {
  const j = edit({ kind: 'several', ids: ['i', 'c'], join: { kind: 'fade', fade: 0.3 } });
  assert.deepEqual(j.song.parts.map((q) => q.at), [0, 15.7]);
  near(timelineToSong(2, j.song), 2, 'in the Intro');
  near(timelineToSong(15.7 + 2.6, j.song), 42.6, 'in the Chorus');
  const r = edit({ kind: 'several', ids: ['c', 'i'], join: { kind: 'cut' } });
  near(timelineToSong(1, r.song), 41, 'Chorus first');
  near(timelineToSong(17, r.song), 1, 'then the Intro');
  const rep = edit({ kind: 'several', ids: ['c', 'i', 'c'], join: { kind: 'cut' } });
  assert.deepEqual(rep.song.parts.map((q) => [q.from, q.at]), [[40, 0], [0, 16], [40, 32]]);
  near(timelineToSong(2, rep.song), 42, 'first Chorus');
  near(timelineToSong(34, rep.song), 42, 'the Chorus again');
  near(timelineToSong(20, rep.song), 4, 'the Intro between');
});

test('an export range on top of a section edit renders the song moments of that stretch', () => {
  const j = edit({ kind: 'several', ids: ['i', 'c'], join: { kind: 'cut' } });
  // export 14..20 of the edit: the end of the Intro, then the start of the Chorus
  const from = 14;
  const got = [0, 1, 1.99, 2, 3, 6].map((x) => +timelineToSong(from + x, j.song).toFixed(3));
  assert.deepEqual(got, [14, 15, 15.99, 40, 41, 44]);
});

test('a band template on a section edit starts its tab and drum chart with the song', () => {
  const sources = [
    { id: 'gp1', name: 'band.gp', tracks: [{ index: 0, name: 'Guitar', strings: 6 }], drumTracks: [] },
    { id: 'gp2', name: 'drums.gp', tracks: [], drumTracks: [{ index: 0, name: 'Drums' }] },
  ];
  const d = edit({ kind: 'one', ids: ['c'] });
  applyTemplate(d, 'fullband', sources);
  const charts = d.layers.filter((l) => l.type === 'tab' || l.type === 'drums');
  assert.equal(charts.length, 2);
  for (const L of charts) near(chartTime(L, 1, d.song), 41, `${L.type} 1 s into the Chorus edit`);
});

test('the beat grid reaches every part the edit plays, so beat effects keep going in a later section', () => {
  const j = edit({ kind: 'several', ids: ['i', 'c'], join: { kind: 'cut' } });
  assert.ok(gridLength(j) >= 61, `grid length ${gridLength(j)}`);
  const g = gridOf(j, { tempo: { bpm: 120, first: 0.25 } });
  assert.ok(g.beats.includes(55.75), 'a beat late in the Chorus');
  // one stretch: as before
  const one = edit({ kind: 'one', ids: ['c'] });
  assert.equal(gridLength(one), one.duration + 40 + 5);
});
