import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_TEMPLATES, canvasClips, canvasSources, applyCanvas, undoCanvas, canvasIssues, clampCanvasLength, isCanvas } from '../js/canvas.js';
import { ASPECTS } from '../js/core.js';
import { newProject } from '../js/state.js';
import { overlaySupported, PLATFORM_OVERLAYS } from '../js/overlays.js';

const vid = (id, extra = {}) => ({ id, mediaId: `m-${id}`, kind: 'video', in: 0, duration: 4, speed: 1, transition: { type: 'crossfade', duration: 0.4 }, effects: { beatPulse: 0.5 }, volume: 1, ...extra });
const tpl = (id) => CANVAS_TEMPLATES.find((t) => t.id === id);
const srcLen = () => 30;

test('the Canvas format is 9:16 and within Spotify’s 720–1080 px height', () => {
  const a = ASPECTS.canvas;
  assert.ok(a.h >= 720 && a.h <= 1080);
  assert.equal(a.w * 16, a.h * 9); // exactly 9:16: Spotify refuses 608×1080 (0.5630)
  assert.equal(a.w % 2, 0); // even sizes for H.264
  assert.equal(a.h % 2, 0);
  assert.deepEqual([a.w, a.h], [594, 1056]);
  assert.ok(overlaySupported('canvas') && overlaySupported('9:16') && !overlaySupported('16:9'));
  assert.ok(PLATFORM_OVERLAYS.some(([k]) => k === 'spotify'));
});

test('loop length is kept to 3–8 seconds, in half seconds', () => {
  assert.equal(clampCanvasLength(10), 8);
  assert.equal(clampCanvasLength(1), 3);
  assert.equal(clampCanvasLength(5.3), 5.5);
  assert.equal(clampCanvasLength('x'), 8);
});

test('a seamless loop ends on exactly the frame it starts on', () => {
  const { clips, length } = canvasClips(tpl('cv-seamless'), [vid('a', { in: 2 })], 8, srcLen);
  assert.equal(length, 8);
  assert.equal(clips.length, 2);
  const [main, tail] = clips;
  assert.equal(main.in, 3); // starts a second in…
  assert.equal(tail.in, 2); // …and the tail plays the second it skipped, fading in
  assert.equal(tail.in + tail.duration, main.in); // so the last frame is the first frame
  assert.equal(tail.transition.type, 'crossfade');
  assert.equal(tail.transition.duration, tail.duration);
  assert.equal(main.transition.type, 'none'); // no fade from black on every loop
  assert.ok(clips.every((c) => c.volume === 0 && !c.effects.beatPulse && c.exit === null));
  assert.equal(main.grade.preset, 'moody');
  assert.ok(main.grade.contrast || main.grade.saturation || main.grade.shadows); // the preset's values, not just its name
  assert.notEqual(main.id, 'a');
  assert.equal(main.from, 'a');
});

test('rebound zooms out and back; a still loops perfectly', () => {
  const still = { id: 'c', mediaId: 'cover', kind: 'image', in: 0, duration: 3 };
  const { clips, length } = canvasClips(tpl('cv-cover'), [still], 6);
  assert.equal(length, 6);
  assert.equal(clips[0].kenBurns.fromZoom, clips[1].kenBurns.toZoom);
  assert.equal(clips[0].kenBurns.toZoom, clips[1].kenBurns.fromZoom);
  const v = canvasClips(tpl('cv-mono'), [vid('a', { in: 1 })], 8, srcLen).clips;
  assert.equal(v[1].in, 5); // the second half carries on from where the first ended
});

test('hard cut, a montage of shots, and footage that is too short', () => {
  const h = canvasClips(tpl('cv-push'), [vid('a')], 7, srcLen);
  assert.equal(h.clips.length, 1);
  assert.equal(h.length, 7);
  assert.ok(h.clips[0].kenBurns.toZoom > 1);
  const m = canvasClips(tpl('cv-montage'), [vid('a'), vid('b'), vid('c'), vid('d')], 8, srcLen);
  assert.equal(m.clips.length, 5);
  assert.equal(m.length, 8);
  assert.ok(m.clips.slice(0, 4).every((c) => c.duration >= 1.5)); // no rapid cuts
  assert.equal(m.clips[4].from, 'a');
  const short = canvasClips(tpl('cv-push'), [vid('a')], 8, () => 4.5);
  assert.equal(short.length, 4.5);
});

test('applying a Canvas: format, length, no end card, text or lyrics; then back to the edit', () => {
  const d = newProject();
  d.clips = [vid('a'), vid('b')];
  d.texts = [{ id: 't', text: 'NEW SINGLE' }];
  d.lyrics = [{ id: 'l', text: 'hi', start: 0, end: 1 }];
  d.layers = [{ id: 'v', type: 'viz', visible: true }, { id: 'o', type: 'video', visible: true }];
  const r = applyCanvas(d, 'cv-seamless', { length: 6, srcLen });
  assert.ok(r.ok);
  assert.ok(isCanvas(d));
  assert.equal(d.duration, 6);
  assert.equal(d.endCard.enabled, false);
  assert.deepEqual(d.texts, []);
  assert.equal(d.lyrics.length, 1); // kept, just hidden
  assert.equal(d.layerVis.lyrics, false);
  assert.equal(d.layers[0].visible, false);
  assert.equal(d.layers[1].visible, true);
  assert.equal(d.look.overlay, 'spotify');
  assert.equal(d.look.loop, 6);
  assert.equal(d.look.beatFlash, 0);
  assert.deepEqual(canvasIssues(d, { exportHeight: 1080 }), []);
  // switching template starts again from your clips, not the loop
  applyCanvas(d, 'cv-montage', { length: 8, srcLen });
  assert.deepEqual(d.clips.map((c) => c.from), ['a', 'b', 'a']);
  assert.ok(undoCanvas(d));
  assert.equal(d.aspect, '9:16');
  assert.equal(d.duration, 20);
  assert.deepEqual(d.clips.map((c) => c.id), ['a', 'b']);
  assert.equal(d.endCard.enabled, true);
  assert.equal(d.layerVis.lyrics, true);
  assert.equal(d.look.loop, undefined);
  assert.equal(d.canvas, undefined);
  assert.equal(undoCanvas(d), false);
});

test('the cover art is used when the template wants it or there are no clips', () => {
  const d = newProject();
  assert.equal(applyCanvas(d, 'cv-seamless').ok, false);
  d.endCard.coverMediaId = 'cov';
  assert.deepEqual(canvasSources(d, tpl('cv-seamless')).map((c) => c.mediaId), ['cov']);
  d.clips = [vid('a')];
  assert.deepEqual(canvasSources(d, tpl('cv-seamless')).map((c) => c.mediaId), ['m-a']);
  assert.deepEqual(canvasSources(d, tpl('cv-cover')).map((c) => c.mediaId), ['cov']);
  assert.ok(applyCanvas(d, 'cv-cover').ok);
  assert.equal(applyCanvas(d, 'nope').ok, false);
});

test('Canvas checks follow Spotify’s rules', () => {
  const p = newProject();
  p.clips = [vid('a', { duration: 0.5, transition: { type: 'fade' } }), vid('b', { transition: { type: 'flash' } })];
  p.duration = 12;
  p.texts = [{ id: 't' }];
  p.lyrics = [{ id: 'l' }];
  p.look.watermark.mediaId = 'logo';
  const text = canvasIssues(p, { exportHeight: 1920 }).map((i) => `${i.level}: ${i.text}`).join('\n');
  for (const bit of ['bad: Format', 'bad: It exports 1920', 'bad: It’s 12.0 s', 'end card', 'text on it', 'Lyrics are showing', 'under a second', 'flashing', 'logo', 'fades in from black']) assert.ok(text.includes(bit), bit);
});

test('the checklist flags an export size that is not exactly 9:16', () => {
  const p = { aspect: 'canvas', duration: 6, clips: [vid('a', { transition: { type: 'none' }, effects: {} })], endCard: {}, texts: [], lyrics: [], look: {} };
  assert.ok(!canvasIssues(p, { exportHeight: 1056, exportWidth: 594 }).some((i) => i.level === 'bad'));
  assert.ok(canvasIssues(p, { exportHeight: 1080, exportWidth: 608 }).some((i) => i.level === 'bad' && /9:16/.test(i.text)));
});
