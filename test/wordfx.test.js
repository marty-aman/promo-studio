// Per-word lyric effect settings (lyricfx.js wordFx): resolution word > line > look > song, the per-word maths,
// saving, and what the renderer draws for one tuned word while the rest of the line stays as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWordFx, setWordFx, wordFxOf, wordFxStale, resolveWordFx, wordShake, wordPulseScale, shakeOffset, cleanLyricFx } from '../js/lyricfx.js';
import { noise } from '../js/core.js';
import { gridFromBpm } from '../js/tempo.js';
import { newProject, normalizeProject } from '../js/state.js';
import { lineStyle } from '../js/linestyle.js';
import { renderFrame } from '../js/renderer.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';
import { makeLibraryFile, readProjects } from '../js/projectlib.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('resolution: the word wins over the line, the look and the song; missing values follow the line', () => {
  const base = { size: 9, animation: 'beat', fx: { shake: 0.1, pulse: 1.5, glitchAmt: 2 } };
  const line = { text: 'wait for the light', style: { fx: { shake: 0.2 } }, fx: { shake: 0.3 } };
  const s = lineStyle(base, line);
  const none = resolveWordFx(s.fx, null, s.animation);
  assert.equal(none.shake, 0.3); // line over look over song
  assert.equal(none.pulse, 1.5); // song (the line pulses)
  assert.equal(none.glitch, 0); // the line does not glitch
  assert.equal(none.size, 1);
  assert.equal(none.color, null);
  assert.deepEqual(none.own, {});
  const r = resolveWordFx(s.fx, { i: 3, w: 'light', shake: 0.9, pulse: 3, glitch: 1, size: 1.6, color: '#ff0000' }, s.animation);
  assert.deepEqual([r.shake, r.pulse, r.glitch, r.size, r.color], [0.9, 3, 1, 1.6, '#ff0000']);
  assert.deepEqual(r.own, { shake: true, pulse: true, glitch: true, size: true, color: true });
  // a word set to 0 still counts as its own (it stays still while the line shakes)
  assert.equal(resolveWordFx(s.fx, { i: 0, w: 'wait', shake: 0 }, 'beat').own.shake, true);
  // glitch is inherited only when the line glitches
  assert.equal(resolveWordFx({ glitchAmt: 2 }, null, 'glitch').glitch, 2);
  assert.equal(resolveWordFx({ pulse: 2 }, null, 'fade').pulse, 0);
});

test('setWordFx: set, clear one value, reset the word; out-of-date words are dropped', () => {
  let l = { text: 'wait for the light' };
  l.wordFx = setWordFx(l, 3, 'shake', 0.5);
  assert.deepEqual(l.wordFx, [{ i: 3, w: 'light', shake: 0.5 }]);
  l.wordFx = setWordFx(l, 3, 'color', '#00ff00');
  l.wordFx = setWordFx(l, 0, 'size', 2);
  assert.deepEqual(l.wordFx, [{ i: 0, w: 'wait', size: 2 }, { i: 3, w: 'light', shake: 0.5, color: '#00ff00' }]);
  l.wordFx = setWordFx(l, 3, 'shake', undefined);
  assert.deepEqual(l.wordFx[1], { i: 3, w: 'light', color: '#00ff00' });
  l.wordFx = setWordFx(l, 3, null);
  assert.deepEqual(l.wordFx, [{ i: 0, w: 'wait', size: 2 }]);
  assert.equal(setWordFx(l, 0, null), undefined);
  assert.equal(setWordFx(l, 9, 'shake', 1).length, 1, 'a word index past the end changes nothing');
  // the text changed: the old pick is out of date, not used, and dropped on the next change
  l = { text: 'wait for the night', wordFx: [{ i: 3, w: 'light', shake: 0.5 }] };
  assert.equal(wordFxStale(l), true);
  assert.equal(wordFxOf(l), null);
  assert.deepEqual(setWordFx(l, 0, 'pulse', 1), [{ i: 0, w: 'wait', pulse: 1 }]);
  // punctuation and case do not make a word out of date
  assert.equal(wordFxStale({ text: 'Wait, for', wordFx: [{ i: 0, w: 'wait', size: 2 }] }), false);
});

test('cleanWordFx: junk dropped, values kept in range, one entry per word, empty is undefined', () => {
  assert.equal(cleanWordFx(undefined), undefined);
  assert.equal(cleanWordFx('x'), undefined);
  assert.equal(cleanWordFx([{ i: 0, w: 'a' }]), undefined, 'an entry with no value is dropped');
  assert.deepEqual(
    cleanWordFx([{ i: 2, w: 'c', shake: 9, pulse: -1, glitch: '3', size: 0.1, color: 'red', bogus: 1 }, { i: -1, w: 'x', shake: 1 }, { i: 0, w: 'a', color: '#AABBCC' }, { i: 0, w: 'a', size: 2 }]),
    [{ i: 0, w: 'a', size: 2 }, { i: 2, w: 'c', shake: 1, pulse: 0, size: 0.5 }],
  );
});

test('per-word shake: relative to the line, so a word set to 0 stays still while the line shakes', () => {
  const px = 40;
  assert.equal(wordShake({}, 0, 0, 1, px, 1, noise), null, 'nothing shakes: nothing to add');
  const fx = { shake: 0.5 };
  const line = shakeOffset(fx, 1.234, px, 1, noise);
  const still = wordShake(fx, 0, 2, 1.234, px, 1, noise, { x: 0, y: 0 });
  close(still.dx, -line.dx);
  close(still.dy, -line.dy);
  close(still.rot, -line.rot);
  // the line's turn moves an off-centre word too: that is taken back
  const far = wordShake(fx, 0, 2, 1.234, px, 1, noise, { x: 100, y: 10 });
  close(far.dx, -line.dx + line.rot * 10);
  close(far.dy, -line.dy - line.rot * 100);
  // a word with its own shake on a still line moves by itself, differently from its neighbours
  const a = wordShake({}, 0.8, 0, 2.5, px, 1, noise);
  const b = wordShake({}, 0.8, 1, 2.5, px, 1, noise);
  assert.ok(Math.abs(a.dx) + Math.abs(a.dy) > 0);
  assert.notDeepEqual(a, b);
  assert.ok(Math.abs(a.dx) <= px * 0.25 * 0.8 + 1e-9 && Math.abs(a.dy) <= px * 0.25 * 0.8 + 1e-9);
  // the line's direction setting reaches the word's own shake
  assert.equal(wordShake({ shakeDir: 'x' }, 0.8, 0, 2.5, px, 1, noise).dy, 0);
  // the default seed is the old shake exactly
  assert.deepEqual(shakeOffset(fx, 3, px, 1, noise), shakeOffset(fx, 3, px, 1, noise, 0));
});

test('per-word pulse: the word ends at its own pulse size whatever the line pulses', () => {
  close(wordPulseScale(2, 0, 1), 1.24);
  close(wordPulseScale(2, 1, 1) * (1 + 0.12 * 1), 1.24);
  close(wordPulseScale(0, 1, 1) * 1.12, 1, 1e-12);
  close(wordPulseScale(3, 1, 0), 1);
});

test('saving: normalize, the project file, the projects library and backups keep word settings; old saves gain nothing', () => {
  const old = normalizeProject(JSON.parse(JSON.stringify({ ...newProject(), lyrics: [{ id: 'a', text: 'hi there', start: 0, end: 1 }] })));
  assert.equal('wordFx' in old.lyrics[0], false);
  const p = newProject();
  const wf = [{ i: 1, w: 'there', shake: 0.4, color: '#ff0000' }];
  p.lyrics = [{ id: 'a', text: 'hi there', start: 0, end: 1, wordFx: wf }, { id: 'b', text: 'yo', start: 1, end: 2, wordFx: [{ i: 0, w: 'yo', junk: 1 }] }];
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(n.lyrics[0].wordFx, wf);
  assert.equal('wordFx' in n.lyrics[1], false);
  const back = parseProjectFile(makeProjectFile(n, []));
  assert.deepEqual((back.project || back).lyrics[0].wordFx, wf);
  const lib = readProjects(JSON.parse(makeLibraryFile({ video: [{ id: 'x', name: 'wf', data: n }] })));
  assert.deepEqual(lib.video[0].data.lyrics[0].wordFx, wf);
  assert.deepEqual(structuredClone(n).lyrics[0].wordFx, wf);
  // lines without word settings are passed through as the same objects
  const ls = [{ id: 'z', text: 'x', start: 0, end: 1 }];
  assert.equal(cleanLyricFx({}, ls).lyrics[0], ls[0]);
});

// ---- the renderer

function recorder() {
  const log = [];
  const target = {
    canvas: { width: 108, height: 192 },
    measureText: (s) => ({ width: String(s).length * 5 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, d: 1 }),
    log,
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...a) => log.push([k, ...a])),
    set: (t, k, v) => {
      log.push([`=${String(k)}`, v]);
      t[k] = v;
      return true;
    },
  });
}
const proj = (style = {}, line = {}) => {
  const p = newProject();
  p.duration = 10;
  p.endCard.enabled = false;
  p.lyrics = [{ id: 'a', text: 'wait for the light', start: 1, end: 4, ...line }];
  Object.assign(p.lyricStyle, { animation: 'fade', outline: '#000000', outlineWidth: 0, uppercase: false, maxWidth: 98, ...style });
  return p;
};
const draw = (p, t) => {
  const c = recorder();
  renderFrame(c, 108, 192, p, t, { preview: false, sourceFor: () => null, image: () => null });
  return c.log;
};
// for each word drawn: its text, the last translate and scale before it, and its fill colour
function words(log) {
  const out = {};
  let tr = null;
  let sc = null;
  let fill = null;
  for (const [k, ...a] of log) {
    if (k === 'translate') tr = a;
    if (k === 'scale') sc = a[0];
    if (k === '=fillStyle') fill = a[0];
    if (k === 'fillText' && !(a[0] in out)) out[a[0]] = { tr, sc, fill };
  }
  return out;
}

test('renderer: no word settings, or out-of-date ones, draw exactly the same calls as before', () => {
  for (const anim of ['fade', 'karaoke', 'words', 'glitch', 'beat']) {
    const a = JSON.stringify(draw(proj({ animation: anim }), 2.2));
    assert.equal(JSON.stringify(draw(proj({ animation: anim }, { wordFx: [{ i: 3, w: 'night', shake: 1, color: '#ff0000' }] }), 2.2)), a, anim);
  }
});

test('renderer: a word’s own colour and size reach that word only; a size boost moves its neighbours aside', () => {
  const plain = words(draw(proj({ color: '#ffffff' }), 2.5));
  const w = words(draw(proj({ color: '#ffffff' }, { wordFx: [{ i: 1, w: 'for', color: '#00ff00', size: 2 }] }), 2.5));
  assert.equal(w.for.fill, '#00ff00');
  assert.equal(w.wait.fill, '#ffffff');
  assert.equal(w.light.fill, '#ffffff');
  close(w.for.sc, 2);
  assert.equal(w.wait.sc, plain.wait.sc);
  assert.ok(w.light.tr[0] > plain.light.tr[0], 'the words after a bigger word move right');
  // the word colour beats the key-word accent
  const k = words(draw(proj({ color: '#ffffff', highlight: '#ff0000' }, { emph: { words: [{ i: 1, w: 'for' }] }, wordFx: [{ i: 1, w: 'for', color: '#00ff00' }] }), 2.5));
  assert.equal(k.for.fill, '#00ff00');
});

test('renderer: per-word shake moves only that word between frames; the others stay put', () => {
  const p = proj({}, { wordFx: [{ i: 2, w: 'the', shake: 1 }] });
  const a = words(draw(p, 2.0));
  const b = words(draw(p, 2.2));
  assert.deepEqual(a.wait.tr, b.wait.tr);
  assert.deepEqual(a.light.tr, b.light.tr);
  assert.notDeepEqual(a.the.tr, b.the.tr);
  // a line that shakes, with one word set to 0: that word lands where it would on a still line (to rounding)
  const still = words(draw(proj({ fx: { shake: 0 } }), 2.0));
  const q = proj({ fx: { shake: 0.6, shakeDir: 'x' } }, { wordFx: [{ i: 0, w: 'wait', shake: 0 }] });
  const log = draw(q, 2.0);
  const outer = log.filter(([k]) => k === 'translate')[0]; // withShake's translate to the shaken middle
  const sw = words(log);
  close(outer[1] - 54 + sw.wait.tr[0], still.wait.tr[0], 1e-6);
});

test('renderer: per-word pulse scales that word on the beat, on the same beat grid as the line', () => {
  const p = proj({ animation: 'fade' }, { wordFx: [{ i: 3, w: 'light', pulse: 2 }] });
  p.beats = gridFromBpm(60, 0, 20, 'set');
  const on = words(draw(p, 2));
  close(on.light.sc, 1.24);
  assert.equal(on.wait.sc, 1);
  const off = words(draw(p, 2.6));
  assert.ok(off.light.sc < 1.01);
  // on a pulsing line the word's own size replaces the line's for that word
  const q = proj({ animation: 'beat' }, { wordFx: [{ i: 3, w: 'light', pulse: 0 }] });
  q.beats = gridFromBpm(60, 0, 20, 'set');
  const log = draw(q, 2);
  const blockScale = log.filter(([k]) => k === 'scale')[0][1];
  close(blockScale, 1.12);
  close(blockScale * words(log).light.sc, 1);
});

test('renderer: per-word glitch splits the colours of that word only', () => {
  const p = proj({ animation: 'fade' }, { wordFx: [{ i: 0, w: 'wait', glitch: 2 }] });
  const log = draw(p, 1.1); // inside the first 0.35 s the glitch always fires
  const split = [];
  let fill = null;
  for (const [k, v] of log) {
    if (k === '=fillStyle') fill = v;
    if (k === 'fillText' && (fill === '#00f0ff' || fill === '#ff2bd6')) split.push(v);
  }
  assert.deepEqual([...new Set(split)], ['wait']);
  // a glitch line with one word set to 0: every word but that one splits
  const q = proj({ animation: 'glitch' }, { wordFx: [{ i: 0, w: 'wait', glitch: 0 }] });
  const s2 = [];
  fill = null;
  for (const [k, v] of draw(q, 1.1)) {
    if (k === '=fillStyle') fill = v;
    if (k === 'fillText' && fill === '#00f0ff') s2.push(v);
  }
  assert.deepEqual(s2, ['for', 'the', 'light']);
});
