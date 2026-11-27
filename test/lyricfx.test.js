import test from 'node:test';
import assert from 'node:assert/strict';
import { divEnvelope, lyricBeat, cleanFx, cleanLyricFx, fxv, fxGroups, ownBeat, shakeOffset, glitchThreshold, FX_FIELDS } from '../js/lyricfx.js';
import { beatEnvelope, noise } from '../js/core.js';
import { gridFromBpm } from '../js/tempo.js';
import { newProject, normalizeProject } from '../js/state.js';
import { lineStyle } from '../js/linestyle.js';
import { renderFrame } from '../js/renderer.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';
import { makeLibraryFile, readProjects } from '../js/projectlib.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('every beat with the default length is exactly the old beat envelope', () => {
  const g = gridFromBpm(100, 0.3, 30);
  for (const ts of [0, 0.1, 0.3, 0.31, 0.9, 1.234, 7.77, 29.9]) {
    assert.equal(divEnvelope(g, ts, 1, 9), beatEnvelope(g.beats, ts, 9));
    assert.equal(divEnvelope(null, ts, 1, 9), beatEnvelope(undefined, ts, 9));
  }
});

test('Every 2 beats and Every bar pulse only on the chosen beats, counted from the first beat you set', () => {
  // 60 BPM, first beat at 1.0 s: the grid is folded back so it also has a beat at 0 s
  const g = gridFromBpm(60, 1, 20);
  assert.equal(g.beats[0], 0);
  close(divEnvelope(g, 1, 2), 1, 1e-12); // on the first beat
  assert.ok(divEnvelope(g, 2, 2) < 0.001, 'beat 2 is skipped');
  close(divEnvelope(g, 3, 2), 1, 1e-12);
  close(divEnvelope(g, 5, 4), 1, 1e-12); // bars start at 1, 5, 9
  assert.ok(divEnvelope(g, 3, 4) < 0.001);
  close(divEnvelope(g, 9.1, 4), Math.exp(-0.1 * 9));
  // the beat at 0 s is not on a bar (bars at 1, 5, 9...), and no bar has started yet
  assert.equal(divEnvelope(g, 0.05, 4), 0);
});

test('Every half beat adds a pulse halfway between the beats', () => {
  const g = gridFromBpm(60, 0, 10);
  close(divEnvelope(g, 0.5, 0.5), 1, 1e-12);
  close(divEnvelope(g, 0.6, 0.5), Math.exp(-0.1 * 9));
  close(divEnvelope(g, 1.0, 0.5), 1, 1e-12);
  // detected beats that are not even: halfway between those two beats
  const det = { beats: [0, 0.4, 1.2], period: 0.6 };
  close(divEnvelope(det, 0.8, 0.5), 1, 1e-12);
  close(divEnvelope(det, 0.2, 0.5), 1, 1e-12);
  // before the first beat: nothing
  assert.equal(divEnvelope({ beats: [1, 2] }, 0.5, 2), 0);
});

test('no beats at all: divisions of the old 120 BPM grid', () => {
  close(divEnvelope(null, 1.0, 2), 1, 1e-12);
  close(divEnvelope(null, 0.5, 2), Math.exp(-0.5 * 9));
  close(divEnvelope(null, 0.25, 0.5), 1, 1e-12);
  assert.equal(divEnvelope(null, -1, 2), 0);
});

test('pulse length stretches the decay (×2 is half as fast); halfway between beats a long pulse is brighter', () => {
  const p = newProject();
  p.beats = gridFromBpm(120, 0, 10);
  const mid = 0.25;
  const short = lyricBeat(p, {}, mid, 'frame');
  assert.equal(short, 'frame', 'nothing set: the frame beat as it is');
  const long = lyricBeat(p, { len: 2 }, mid, 0);
  close(long, Math.exp(-mid * 4.5));
  assert.ok(long > beatEnvelope(p.beats.beats, mid));
});

test('the lyric tempo follows the project unless the style has its own', () => {
  const p = newProject();
  p.beats = gridFromBpm(120, 0, 10);
  assert.equal(ownBeat(p.lyricStyle, {}), false);
  p.lyricStyle.tempo = { bpm: 60, first: 0.5 };
  assert.equal(ownBeat(p.lyricStyle, {}), true);
  close(lyricBeat(p, {}, 1.5, 0), 1, 1e-12); // own beats at 0.5, 1.5, ...
  assert.ok(lyricBeat(p, {}, 1.0, 0) < 0.02, 'halfway between its own beats');
});

test('defaults: fxv gives the old constants, the glitch threshold is exactly 0.93, shake is off', () => {
  for (const [k, [def]] of Object.entries(FX_FIELDS)) assert.equal(fxv(undefined, k), def);
  assert.equal(glitchThreshold(undefined), 0.93);
  assert.ok(glitchThreshold({ glitchRate: 2 }) < 0.93);
  assert.equal(shakeOffset({}, 1, 50, 1, noise), null);
  const sh = shakeOffset({ shake: 0.5 }, 1, 100, 1, noise);
  assert.ok(Math.abs(sh.dx) <= 12.5 && Math.abs(sh.dy) <= 12.5);
  const x = shakeOffset({ shake: 1, shakeDir: 'x' }, 1, 100, 1, noise);
  assert.equal(x.dy, 0);
  assert.equal(x.rot, 0);
  // on the beat: no shake between beats when the envelope is 0
  const ob = shakeOffset({ shake: 1, shakeBeat: true }, 1, 100, 0, noise);
  close(ob.dx, 0);
  close(ob.dy, 0);
});

test('cleanFx: unknown keys and junk go, numbers stay in range, divisions are the four choices', () => {
  assert.equal(cleanFx(null), null);
  assert.equal(cleanFx({}), null);
  assert.equal(cleanFx({ nope: 3, pulse: 'abc' }), null);
  assert.deepEqual(cleanFx({ pulse: 9, shake: -1, div: 3, shakeBeat: true, shakeDir: 'y', len: '2' }), { pulse: 4, shake: 0, div: 1, len: 2, shakeBeat: true, shakeDir: 'y' });
  assert.deepEqual(cleanFx({ div: 0.5, shakeDir: 'both' }), { div: 0.5 });
});

test('migration: old projects get no fx at all; saved settings survive normalize and the project file', () => {
  const old = normalizeProject(JSON.parse(JSON.stringify({ ...newProject(), lyrics: [{ id: 'a', text: 'hi', start: 0, end: 1 }] })));
  assert.equal('fx' in old.lyricStyle, false);
  assert.equal('tempo' in old.lyricStyle, false);
  assert.equal('fx' in old.lyrics[0], false);
  const p = newProject();
  p.lyricStyle.fx = { pulse: 2, div: 2, bogus: 1 };
  p.lyricStyle.tempo = { bpm: 90, first: 0.2 };
  p.lyrics = [{ id: 'a', text: 'hi', start: 0, end: 1, fx: { shake: 0.4 } }, { id: 'b', text: 'yo', start: 1, end: 2, fx: { junk: 1 } }];
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(n.lyricStyle.fx, { pulse: 2, div: 2 });
  assert.deepEqual(n.lyricStyle.tempo, { bpm: 90, first: 0.2 });
  assert.deepEqual(n.lyrics[0].fx, { shake: 0.4 });
  assert.equal('fx' in n.lyrics[1], false);
  const back = parseProjectFile(makeProjectFile(n, []));
  const q = back.project || back;
  assert.deepEqual(q.lyricStyle.fx, { pulse: 2, div: 2 });
  assert.deepEqual(q.lyrics[0].fx, { shake: 0.4 });
  // the projects library and the backups (structured clone, like IndexedDB)
  const lib = readProjects(JSON.parse(makeLibraryFile({ video: [{ id: 'x', name: 'fx', data: n }] })));
  assert.deepEqual(lib.video[0].data.lyricStyle.fx, { pulse: 2, div: 2 });
  assert.deepEqual(lib.video[0].data.lyricStyle.tempo, { bpm: 90, first: 0.2 });
  assert.deepEqual(lib.video[0].data.lyrics[0].fx, { shake: 0.4 });
  assert.deepEqual(structuredClone(n).lyricStyle, n.lyricStyle);
});

test('a line’s own effect settings go over the shared ones; lines without them keep the shared style object', () => {
  const base = { size: 9, fx: { pulse: 2, shake: 0.1 } };
  assert.equal(lineStyle(base, { text: 'x' }), base);
  assert.equal(lineStyle(base, { text: 'x', fx: {} }), base);
  assert.deepEqual(lineStyle(base, { text: 'x', fx: { shake: 0.8 } }).fx, { pulse: 2, shake: 0.8 });
  assert.deepEqual(lineStyle(base, { text: 'x', style: { preset: 'breakdown' }, fx: { div: 2 } }).fx, { pulse: 2, shake: 0.1, div: 2 });
});

test('Effect settings show only the groups the style uses', () => {
  assert.deepEqual(fxGroups({ display: 'line', animation: 'beat' }), ['pulse', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'glitch' }), ['glitch', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'pop' }), ['shake']);
  assert.deepEqual(fxGroups({ display: 'poster', animation: 'glitch' }), ['pulse', 'slam', 'shake']);
  assert.deepEqual(fxGroups({ display: 'tunnel' }), ['pulse', 'tunnel', 'shake']);
  assert.deepEqual(fxGroups({ display: 'sheet' }), ['shake']);
});

// ---- the renderer: the pulse size it draws with

function recorder() {
  const scales = [];
  const target = {
    canvas: { width: 108, height: 192 },
    measureText: (s) => ({ width: String(s).length * 5 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, d: 1 }),
    scale: (x) => scales.push(x),
    scales,
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}) });
}
const pulseAt = (p, t) => {
  const c = recorder();
  renderFrame(c, 108, 192, p, t, { preview: false, sourceFor: () => null, image: () => null });
  return Math.max(...c.scales.filter((x) => x !== 1), 1);
};

test('Pulse on the beat: peaks land on the chosen beats and the size setting scales them', () => {
  const p = newProject();
  p.duration = 10;
  p.endCard.enabled = false;
  p.lyrics = [{ id: 'a', text: 'HEY', start: 0, end: 9 }];
  p.lyricStyle.animation = 'beat';
  p.beats = gridFromBpm(60, 0, 20, 'set');
  close(pulseAt(p, 2), 1.12);
  p.lyricStyle.fx = { div: 2 };
  close(pulseAt(p, 2), 1.12);
  assert.ok(pulseAt(p, 3) < 1.001, 'beat 3 is skipped with Every 2 beats');
  p.lyricStyle.fx = { pulse: 2 };
  close(pulseAt(p, 4), 1.24);
  p.lyricStyle.fx = { div: 0.5 };
  close(pulseAt(p, 4.5), 1.12);
});
