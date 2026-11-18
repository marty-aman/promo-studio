import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../js/state.js';
import { FILTERS, LAYOUTS, carouselInputs, suggestCarousels } from '../js/carousel.js';

function setup({ lyrics = 4, tab = false, clips = 2, images = 1, cover = true } = {}) {
  const p = newProject();
  p.endCard.title = 'Static';
  p.endCard.artist = 'Arc Flash';
  p.endCard.coverMediaId = cover ? 'cov' : null;
  p.lyrics = Array.from({ length: lyrics }, (_, i) => ({ id: `l${i}`, text: ['And the static in my head', 'We light it up tonight', 'Burn it down to the wire', 'Arc flash arc flash'][i % 4], start: 20 + i * 2, end: 21.8 + i * 2 }));
  p.clips = clips ? [{ id: 'c', mediaId: 'v0' }] : [];
  if (tab) p.layers = [{ type: 'tab', mediaId: 'gp', visible: true }];
  const all = [
    ...(cover ? [{ id: 'cov', kind: 'image', name: 'cover.png' }] : []),
    ...Array.from({ length: images }, (_, i) => ({ id: `i${i}`, kind: 'image', name: `photo${i}.jpg` })),
    ...Array.from({ length: clips }, (_, i) => ({ id: `v${i}`, kind: 'video', name: `clip${i}.webm`, duration: 6 })),
  ];
  return carouselInputs(all, p);
}

test('carousel inputs: cover kept apart from photos', () => {
  const inp = setup();
  assert.equal(inp.cover.id, 'cov');
  assert.deepEqual(inp.images.map((m) => m.id), ['i0']);
  assert.equal(inp.clips.length, 2);
  assert.equal(inp.title, 'Static');
});

test('suggested carousels follow the swipe structure and adapt to what you have', () => {
  const all = suggestCarousels(setup({ tab: true }));
  assert.deepEqual(all.map((c) => c.id), ['release', 'lyrics', 'bts', 'dump', 'rate', 'riff']);
  for (const c of all) {
    assert.ok(c.slides.length >= 5 && c.slides.length <= 10, `${c.id}: ${c.slides.length} slides`);
    assert.ok(['cover', 'cta'].includes(c.slides.at(-1).layout), `${c.id} ends on the cover or an ask`);
    assert.ok(c.slides[0].layout !== 'full' || c.slides[0].text, `${c.id} slide 1 has a hook`);
    assert.equal(new Set(c.slides.map((s) => s.id)).size, c.slides.length);
    for (const s of c.slides) assert.ok(FILTERS.some((f) => f.id === s.filter) && LAYOUTS.some((l) => l[0] === s.layout), `${c.id} slide`);
  }
  // the lyric reveal leads with the best line (not the repeated one)
  const lyr = all.find((c) => c.id === 'lyrics');
  assert.ok(lyr.slides.some((s) => s.layout === 'quote' && s.text === 'We light it up tonight'));
  // photos: your image first, then frames spread across clips
  const rel = all[0];
  assert.equal(rel.slides[1].source.kind, 'image');
  assert.equal(rel.slides[2].source.kind, 'clip');
  assert.notEqual(`${rel.slides[2].source.mediaId}@${rel.slides[2].source.time}`, `${rel.slides[3].source.mediaId}@${rel.slides[3].source.time}`);
  // no lyrics, no tab, no edit -> those carousels aren't offered
  const bare = suggestCarousels(setup({ lyrics: 0, clips: 0 }));
  assert.deepEqual(bare.map((c) => c.id), ['release', 'bts', 'dump']);
  // no cover -> plain colour cover slides; a future release date shows the date
  const nc = suggestCarousels(setup({ cover: false }));
  assert.equal(nc[0].slides[0].source.kind, 'color');
  // a forced look applies to the photo slides but not the cover
  const f = suggestCarousels(setup(), { filter: 'noir' })[0];
  assert.equal(f.slides[1].filter, 'noir');
  assert.equal(f.slides[0].filter, 'none');
  // another seed picks other photos
  const a = suggestCarousels(setup({ images: 3 }))[0].slides[1].source;
  const b = suggestCarousels(setup({ images: 3 }), { seed: 1 })[0].slides[1].source;
  assert.notDeepEqual(a, b);
});

test('every look explains itself', () => {
  assert.ok(FILTERS.length >= 10);
  assert.equal(new Set(FILTERS.map((f) => f.id)).size, FILTERS.length);
  for (const f of FILTERS) assert.ok(f.label && f.why && typeof f.css === 'string', f.id);
});
