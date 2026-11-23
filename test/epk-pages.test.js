// Press kit page: picked photos stay on top while the rest is shown one page at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pinnedPage } from '../js/manager/photos.js';

const list = Array.from({ length: 130 }, (_, i) => ({ id: `m${i}` }));

test('pinnedPage keeps the picked ones on top, in pick order, and pages the rest', () => {
  const p = pinnedPage(list, ['m100', 'm3', 'm100', 'gone'], 1, 48);
  assert.deepEqual(p.pinned.map((x) => x.id), ['m100', 'm3']);
  assert.equal(p.total, 128);
  assert.equal(p.pages, 3);
  assert.equal(p.items.length, 48);
  assert.ok(!p.items.some((x) => x.id === 'm3' || x.id === 'm100'));
  const last = pinnedPage(list, ['m100', 'm3'], 9, 48);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 32);
  assert.deepEqual(last.pinned.map((x) => x.id), ['m100', 'm3']);
});

test('pinnedPage with nothing picked is plain paging', () => {
  const p = pinnedPage(list, [], 2, 24);
  assert.deepEqual(p.pinned, []);
  assert.equal(p.items[0].id, 'm24');
  assert.equal(p.from, 25);
  assert.equal(pinnedPage([], null).total, 0);
});
