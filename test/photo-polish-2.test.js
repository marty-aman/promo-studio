import test from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, newLayer, resizeDoc, clampDim, exportScales, dpiOf, alignLayer, safeInsets, isUntouched, carouselFromImages, normalizeDoc } from '../js/photo/model.js';
import { layerSig } from '../js/photo/render.js';
import { modeUrl } from '../js/modeurl.js';
import { analysisOf, useAnalysis } from '../js/media.js';

test('a typed size is whole pixels between 100 and 8000, and a carousel stays under 12000 wide', () => {
  assert.equal(clampDim('1500'), 1500);
  assert.equal(clampDim(20), 100);
  assert.equal(clampDim(99999), 8000);
  assert.equal(clampDim('abc'), 1080);
  assert.equal(clampDim(8000, 4), 3000);
});

test('a 1500 × 1500 design takes the new size and keeps layers in the same place on the canvas', () => {
  const d = newDoc({ size: 'post' });
  d.layers.push(newLayer('shape', d, { x: 540, y: 675, w: 108, h: 135 }));
  resizeDoc(d, 'custom', 1500, 1500);
  assert.deepEqual([d.size, d.w, d.h], ['custom', 1500, 1500]);
  assert.deepEqual([d.layers[0].x, d.layers[0].y, d.layers[0].w, d.layers[0].h], [750, 750, 150, 150]);
  assert.equal(normalizeDoc(d).size, 'custom');
});

test('the export size offers 1×, 2× and 3× and a poster at 3× is 5400 × 7200', () => {
  const poster = newDoc({ size: 'poster' });
  assert.deepEqual(exportScales(poster), [1, 2, 3]);
  assert.equal(poster.w * 3, 5400);
  assert.equal(poster.h * 3, 7200);
  assert.equal(dpiOf(poster, 1), 100);
  assert.equal(dpiOf(poster, 3), 300);
  assert.equal(dpiOf(newDoc({ size: 'flyer' }), 2), 300);
  assert.equal(dpiOf(newDoc({ size: 'post' }), 2), null);
  // a canvas too big for a browser is not offered bigger; a phone's smaller limit allows only 1×
  assert.deepEqual(exportScales(newDoc({ w: 8000, h: 8000 })), [1]);
  assert.deepEqual(exportScales(poster, { maxArea: 16e6 }), [1]);
});

test('aligning on a carousel: a layer on slide 2 aligned left ends at the slide width', () => {
  const d = newDoc({ size: 'post', slides: 3 });
  const L = newLayer('shape', d, { x: 1500, y: 100, w: 200, h: 200 });
  alignLayer(d, L, 'left');
  assert.equal(L.x, 1080);
  alignLayer(d, L, 'right');
  assert.equal(L.x, 2160 - 200);
  alignLayer(d, L, 'center');
  assert.equal(L.x, 1080 + 440);
  alignLayer(d, L, 'top');
  assert.equal(L.y, 0);
  alignLayer(d, L, 'bottom');
  assert.equal(L.y, 1350 - 200);
  alignLayer(d, L, 'middle');
  assert.equal(L.y, 575);
});

test('the story safe area shows for 9:16 designs only', () => {
  assert.deepEqual(safeInsets(newDoc({ size: 'story' })), { top: 250, bottom: 340 });
  assert.equal(safeInsets(newDoc({ size: 'post' })), null);
  assert.equal(safeInsets(newDoc({ size: 'square' })), null);
});

test('the empty first design is dropped once you leave it, a design with work in it is not', () => {
  assert.equal(isUntouched(newDoc({ name: 'My first design' })), true);
  const d = newDoc();
  d.layers.push(newLayer('text', d));
  assert.equal(isUntouched(d), false);
  assert.equal(isUntouched({ ...newDoc(), updatedAt: '2026-11-23T10:00:00Z' }), false);
});

test('slides from the Carousel page open as one photo per slide', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `Slide ${i + 1}` }));
  const { doc, left } = carouselFromImages(items, { name: 'Release' });
  assert.equal(doc.slides, 10);
  assert.equal(left, 2);
  assert.equal(doc.w, 10800);
  assert.equal(doc.layers.length, 10);
  assert.deepEqual([doc.layers[3].x, doc.layers[3].w, doc.layers[3].mediaId], [3240, 1080, 'm3']);
  assert.equal(normalizeDoc(doc).slides, 10);
});

test('the workspace is kept in the address, the Manager leaves its own address alone', () => {
  const at = { pathname: '/', search: '', hash: '' };
  assert.equal(modeUrl('photo', at), '/#photo');
  assert.equal(modeUrl('tabstudio', at), '/#tabstudio');
  assert.equal(modeUrl('studio', { ...at, search: '?studio' }), '/#studio');
  assert.equal(modeUrl('manager', { ...at, hash: '#photo' }), '/');
  assert.equal(modeUrl('manager', { ...at, hash: '#m/songs/s1/release' }), '/#m/songs/s1/release');
  assert.equal(modeUrl('manager', { ...at, search: '?x=1&studio', hash: '#studio' }), '/?x=1');
});

test('a layer picture is redrawn only when something it depends on changed', () => {
  const d = newDoc();
  const L = newLayer('image', d, { mediaId: 'a' });
  const img = {};
  const opt = { getImage: () => img, preview: true, epoch: 0 };
  const sig = layerSig(L, 100, 100, 1, opt, null);
  assert.equal(layerSig({ ...L }, 100, 100, 1, opt, null), sig);
  assert.notEqual(layerSig({ ...L, adjust: { ...L.adjust, brightness: 90 } }, 100, 100, 1, opt, null), sig);
  assert.notEqual(layerSig(L, 100, 100, 1, { ...opt, epoch: 1 }, null), sig); // a font or file arrived
  assert.notEqual(layerSig(L, 100, 100, 1, { ...opt, getImage: () => ({}) }, null), sig); // another photo object
  assert.notEqual(layerSig(L, 200, 200, 2, opt, null), sig);
  const clip = { ...L, mask: { ...L.mask, type: 'clip' } };
  const below = {};
  assert.equal(layerSig(clip, 100, 100, 1, opt, below), layerSig(clip, 100, 100, 1, opt, below));
  assert.notEqual(layerSig(clip, 100, 100, 1, opt, below), layerSig(clip, 100, 100, 1, opt, {})); // the layer below was redrawn
});

test('a file keeps its analysis so the next visit does not decode it again', () => {
  const peaks = new Float32Array([0, 1]);
  const env = new Float32Array([0.1, 0.2]);
  const rec = { kind: 'audio', duration: 0, peaks, peaksPerSec: 50, envelope: env, envRate: 100, thumb: null };
  const a = analysisOf({ ...rec, duration: 41.5 });
  assert.equal(a.duration, 41.5);
  const fresh = { kind: 'audio', duration: 40 };
  assert.ok(useAnalysis(fresh, a));
  assert.equal(fresh.peaks, peaks);
  assert.equal(fresh.envelope, env);
  assert.equal(fresh.duration, 41.5);
  assert.equal(useAnalysis({ kind: 'audio' }, { ...a, v: 0 }), null); // an older format is decoded again
  assert.equal(useAnalysis({ kind: 'audio' }, null), null);
  assert.equal(analysisOf({ kind: 'audio' }), null); // nothing analysed: nothing to keep
  assert.equal(analysisOf({ kind: 'image' }), null);
  const vid = analysisOf({ kind: 'video', thumb: 'data:image/jpeg;base64,xx' });
  const v2 = { kind: 'video' };
  assert.ok(useAnalysis(v2, vid));
  assert.equal(v2.peaks, undefined);
});
