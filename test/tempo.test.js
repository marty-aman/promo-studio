import test from 'node:test';
import assert from 'node:assert/strict';
import { clampBpm, doubleBpm, halfBpm, tapTempo, beatTimes, beatTime, gridFromBpm, gridFirst, gridLength, gridOf, beatsOf, songBpmOf, tempoSource, MIN_BPM, MAX_BPM } from '../js/tempo.js';
import { newProject, normalizeProject } from '../js/state.js';
import { beatEnvelope, detectBeats } from '../js/core.js';
import { renderFrame } from '../js/renderer.js';
import { polyTiming } from '../js/vizpoly.js';
import { inventory } from '../js/suggest.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';
import { makeLibraryFile, readProjects } from '../js/projectlib.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('clampBpm keeps 20 to 300, allows decimals, and falls back on junk', () => {
  assert.equal(clampBpm(128.5), 128.5);
  assert.equal(clampBpm(5), MIN_BPM);
  assert.equal(clampBpm(999), MAX_BPM);
  assert.equal(clampBpm('93,5'), 93.5);
  assert.equal(clampBpm('abc'), 120);
  assert.equal(clampBpm(NaN, 100), 100);
  assert.equal(clampBpm(0), 120);
  assert.equal(clampBpm(-40), 120);
  assert.equal(clampBpm(100.123456), 100.12);
});

test('×2 and ÷2 double and halve, and stop at the limits', () => {
  assert.equal(doubleBpm(70), 140);
  assert.equal(halfBpm(140), 70);
  assert.equal(doubleBpm(200), MAX_BPM);
  assert.equal(halfBpm(30), MIN_BPM);
  assert.equal(halfBpm(93.3), 46.65);
});

test('tap tempo: the average gap of the taps since the last pause', () => {
  assert.equal(tapTempo([]), null);
  assert.equal(tapTempo([1000]), null);
  assert.equal(tapTempo([1000, 1500]), 120);
  assert.equal(tapTempo([0, 500, 1000, 1500, 2000]), 120);
  // uneven taps average out: 4 gaps of 460, 480, 520, 540 ms = 500 ms
  assert.equal(tapTempo([0, 460, 940, 1460, 2000]), 120);
  // 60000 / 461.5 ms, rounded to 0.1
  assert.equal(tapTempo([0, 461.5]), 130);
  assert.equal(tapTempo([0, 600, 1200]), 100);
  // a long pause starts over: only the last session counts
  assert.equal(tapTempo([0, 500, 1000, 10000, 10400, 10800]), 150);
  assert.equal(tapTempo([0, 500, 1000, 10000]), null, 'one tap after a pause is not a tempo yet');
  // only the last 8 taps count
  const slow = [0, 1000, 2000, 3000, 4000];
  const fast = Array.from({ length: 8 }, (_, i) => 4000 + (i + 1) * 500);
  assert.equal(tapTempo([...slow, ...fast]), 120);
  // taps that are too fast or too slow are clamped
  assert.equal(tapTempo([0, 100]), MAX_BPM);
  assert.equal(tapTempo([0, 2500]), 24);
  assert.equal(tapTempo([0, 2600]), null, 'a gap over 2.5 s starts over');
});

test('beat times from a BPM and a first beat', () => {
  assert.deepEqual(beatTimes(120, 0, 2), [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(beatTimes(120, 0.25, 2), [0.25, 0.75, 1.25, 1.75]);
  // the grid reaches back before the first beat: it starts inside the first period
  assert.deepEqual(beatTimes(120, 1.3, 2), [0.3, 0.8, 1.3, 1.8]);
  assert.equal(beatTimes(60, 0, 10).length, 11);
  close(beatTime(90, 0.5, 3), 0.5 + 3 * (60 / 90));
  const g = beatTimes(133.33, 0.1, 30);
  for (let i = 1; i < g.length; i++) close(g[i] - g[i - 1], 60 / 133.33, 0.0011);
  // decimals count
  close(60 / 128.5, gridFromBpm(128.5, 0, 5).period);
});

test('gridFromBpm has the shape of detectBeats and remembers where you put the first beat', () => {
  const g = gridFromBpm(100, 0.2, 10, 'song');
  assert.equal(g.bpm, 100);
  close(g.period, 0.6);
  assert.equal(g.source, 'song');
  assert.equal(g.first, 0.2);
  assert.equal(gridFirst(g), 0.2);
  assert.equal(gridFirst({ beats: [0.31, 0.9] }), 0.31);
  assert.equal(gridFirst(null), 0);
  assert.equal(tempoSource(g), 'song');
  assert.equal(tempoSource({ bpm: 120, beats: [0] }), 'detected');
  assert.equal(tempoSource(null), 'default');
  assert.equal(tempoSource({ source: 'set' }), 'set');
  assert.equal(gridFromBpm(1000, -3, 4).bpm, MAX_BPM);
  assert.equal(gridFromBpm(1000, -3, 4).first, 0);
});

test('the grid reaches as far as the song or the edit needs', () => {
  const p = newProject();
  p.duration = 20;
  p.song = { mediaId: 's', offset: 30 };
  assert.equal(gridLength(p, 0), 55);
  assert.equal(gridLength(p, 240), 240);
  assert.equal(songBpmOf({ bpm: '128' }), 128);
  assert.equal(songBpmOf({ bpm: '128,5' }), 128.5);
  assert.equal(songBpmOf({ bpm: '' }), 0);
  assert.equal(songBpmOf({ bpm: '5' }), 0);
  assert.equal(songBpmOf(null), 0);
});

test('an effect with its own tempo follows it, the others follow the project', () => {
  const p = newProject();
  p.beats = gridFromBpm(120, 0, 30, 'set');
  const clip = { id: 'c', tempo: { bpm: 60, first: 0.25 } };
  assert.equal(gridOf(p, {}), p.beats);
  assert.equal(gridOf(p, null), p.beats);
  const own = gridOf(p, clip);
  assert.equal(own.bpm, 60);
  assert.equal(beatsOf(p, clip)[0], 0.25);
  assert.equal(gridOf(p, clip), own, 'cached by value');
  p.beats = null;
  assert.equal(gridOf(p, {}), null);
  assert.equal(beatsOf(p, {}), undefined);
  assert.equal(gridOf(p, { tempo: { bpm: 0 } }), null, 'a broken override is ignored');
});

// ---- the renderer: what the preview and the export draw

function recorder() {
  const flashes = [];
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 108, height: 192 },
    measureText: (s) => ({ width: String(s).length * 5, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, d: 1 }),
    flashes,
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set(t, k, v) {
      if (k === 'fillStyle' && /^rgba\(255,255,255,/.test(v)) flashes.push(+v.slice(v.lastIndexOf(',') + 1, -1));
      t[k] = v;
      return true;
    },
  });
}
const flashAt = (p, t) => {
  const c = recorder();
  renderFrame(c, 108, 192, p, t, { preview: false, sourceFor: () => null, image: () => null });
  return c.flashes[0];
};
const flashProject = () => {
  const p = newProject();
  p.duration = 10;
  p.endCard.enabled = false;
  p.look.beatFlash = 1;
  return p;
};

test('Flash on the beat: the project tempo moves it, its own tempo overrides, and the old behaviour is untouched', () => {
  const p = flashProject();
  // no beats at all: the old 120 BPM grid
  close(flashAt(p, 0.1), Math.pow(beatEnvelope(undefined, 0.1), 3) * 0.45);
  // project tempo 60: a beat at 0, 1, 2 s
  p.beats = gridFromBpm(60, 0, 20, 'set');
  close(flashAt(p, 1.01), Math.pow(beatEnvelope(p.beats.beats, 1.01), 3) * 0.45);
  assert.ok(flashAt(p, 1.01) > 0.3, 'close to the beat at 1 s');
  assert.equal(flashAt(p, 0.5 + 1e-3) < 0.01 || flashAt(p, 0.5 + 1e-3) === undefined, true, 'half way between 60 BPM beats it is dark');
  // its own tempo: 120 BPM with the first beat at 0.25, while the project stays at 60
  p.look.tempo = { bpm: 120, first: 0.25 };
  const own = gridFromBpm(120, 0.25, 20);
  close(flashAt(p, 0.76), Math.pow(beatEnvelope(own.beats, 0.76), 3) * 0.45);
  assert.ok(flashAt(p, 0.76) > 0.3, 'a beat at 0.75 s');
  delete p.look.tempo;
  assert.ok(flashAt(p, 0.76) === undefined || flashAt(p, 0.76) < 0.01, 'back on the project tempo');
});

test('a detected grid and the same grid with a source flag draw the same frame', () => {
  const p = flashProject();
  const beats = Array.from({ length: 40 }, (_, i) => +(0.31 + i * 0.4837).toFixed(3));
  p.beats = { bpm: 124, period: 0.4837, beats };
  const a = [0.31, 0.5, 0.8, 1.0, 3.3].map((t) => flashAt(p, t));
  p.beats = { ...p.beats, source: 'set' };
  assert.deepEqual([0.31, 0.5, 0.8, 1.0, 3.3].map((t) => flashAt(p, t)), a);
});

test('polyrhythm layers take a first beat of their own, and still lock to the project beats by default', () => {
  const own = polyTiming({ bpm: 120, first: 0.5, followSong: false }, 1.5);
  assert.equal(own.t0, 0.5);
  close(own.beat, 0.5);
  const old = polyTiming({ bpm: 120, followSong: false }, 1.5);
  assert.equal(old.t0, 0);
  const g = gridFromBpm(100, 0.3, 20);
  const song = polyTiming({ beats: g, bpm: 120, first: 9, followSong: true }, 2);
  close(song.beat, 0.6);
  assert.equal(song.t0, g.beats[0]);
});

test('Suggested cuts and the song templates cut on a tempo you set, not on the detected one', () => {
  const p = newProject();
  const song = { id: 's1', kind: 'audio', duration: 60, envelope: new Float32Array(100 * 60).fill(0.1), envRate: 100, name: 's' };
  p.song = { mediaId: 's1', offset: 0 };
  assert.equal(inventory([song], p).beats, null, 'a flat envelope has no beat to detect');
  p.beats = gridFromBpm(90, 0.1, 60, 'set');
  assert.equal(inventory([song], p).beats, p.beats);
  p.beats = { bpm: 100, period: 0.6, beats: [0.1, 0.7] };
  assert.equal(inventory([song], p).beats, null, 'a detected tempo is not forced on the cuts');
});

test('older projects load unchanged; tempo survives the project file, the library and undo copies', () => {
  const old = normalizeProject({ name: 'old', beats: { bpm: 120, period: 0.5, beats: [0, 0.5] }, look: { beatFlash: 0.3 }, clips: [], layers: [] });
  assert.equal(old.look.tempo, undefined);
  assert.equal(tempoSource(old.beats), 'detected');
  const p = newProject();
  p.name = 'tempo';
  p.beats = gridFromBpm(128.5, 0.37, 30, 'set');
  p.look.tempo = { bpm: 90, first: 0.1 };
  p.clips = [{ id: 'c1', mediaId: 'm', kind: 'image', in: 0, duration: 3, speed: 1, tempo: { bpm: 70.5, first: 0 }, effects: { beatPulse: 0.5 } }];
  const back = parseProjectFile(makeProjectFile(p));
  assert.deepEqual(back.project.beats, p.beats);
  assert.deepEqual(back.project.look.tempo, p.look.tempo);
  assert.deepEqual(back.project.clips[0].tempo, p.clips[0].tempo);
  const lib = readProjects(JSON.parse(makeLibraryFile({ video: [{ id: 'x', name: 'tempo', data: p }] })));
  assert.deepEqual(lib.video[0].data.beats, p.beats);
  assert.deepEqual(lib.video[0].data.look.tempo, p.look.tempo);
  assert.deepEqual(lib.video[0].data.clips[0].tempo, p.clips[0].tempo);
  assert.deepEqual(structuredClone(p).beats, p.beats);
});

test('detectBeats results still work as the project tempo', () => {
  const rate = 100;
  const env = new Float32Array(rate * 20);
  for (let i = 0; i < env.length; i++) env[i] = i % 50 < 4 ? 1 : 0.05;
  const d = detectBeats(env, rate);
  assert.ok(d && Math.abs(d.bpm - 120) < 3);
  assert.equal(tempoSource(d), 'detected');
});
