import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, fromLibrary, fromPack, fromBuiltin, applyMeta, metaFor, filterAll, topTags } from '../js/soundindex.js';

const lib = fromLibrary({ id: 's1', name: 'Big Boom 02', tags: ['impacts', 'big', 'boom'], favorite: false, duration: 1.2, addedAt: 5, fileName: 'Big Boom 02.wav' });
const lib2 = fromLibrary({ id: 's2', name: 'Crowd yell', tags: ['crowd'], favorite: true, duration: 3, addedAt: 9 });
const pack = fromPack({ id: 'airhorn-1', name: 'Air horn blast', cat: 'Meme & hype', tags: ['horn'], dur: 1.5, creator: 'someone', q: 'airhorn' }, 'https://x/airhorn.mp3');
const pack2 = fromPack({ id: 'whoosh-2', name: 'Fast whoosh', cat: 'Transitions', dur: 0.8 }, 'https://x/w.mp3');
const built = fromBuiltin({ id: 'riser', label: 'Riser', secs: 2 });

test('tags typed by a person are cleaned up', () => {
  assert.deepEqual(parseTags('Impacts, big boom,  #drop, impacts,'), ['impacts', 'big boom', 'drop']);
  assert.deepEqual(parseTags(''), []);
  assert.equal(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length, 20);
});

test('every source becomes the same kind of item', () => {
  assert.equal(lib.key, 'lib:s1');
  assert.equal(pack.key, 'pack:airhorn-1');
  assert.deepEqual(pack.tags, ['meme & hype', 'horn']);
  assert.equal(pack.attribution.license, 'CC0');
  assert.equal(built.source, 'builtin');
  assert.ok(built.tags.includes('built-in'));
});

test('renames, tags and stars apply to pack and built-in sounds, and reset to nothing', () => {
  const meta = { 'pack:airhorn-1': { name: 'MLG horn', tags: ['meme', 'intro'], favorite: true } };
  const [p, b, l] = applyMeta([pack, built, lib], { ...meta, 'lib:s1': { name: 'ignored' } });
  assert.equal(p.name, 'MLG horn');
  assert.deepEqual(p.tags, ['meme', 'intro']);
  assert.equal(p.favorite, true);
  assert.equal(p.edited, true);
  assert.equal(b, built);
  assert.equal(l.name, 'Big Boom 02', 'your own sounds keep their edits on their record');
  const defaults = { tags: pack.tags };
  assert.deepEqual(metaFor(pack, { favorite: true }, defaults), { favorite: true });
  assert.deepEqual(metaFor(pack, { name: 'Horn' }, defaults), { name: 'Horn' });
  assert.equal(metaFor(p, { name: pack.defaultName, tags: pack.tags, favorite: false }, defaults), null);
});

test('one search and filter across every source', () => {
  const all = [lib, lib2, pack, pack2, built];
  assert.deepEqual(filterAll(all).map((x) => x.key)[0], 'lib:s2', 'starred first');
  assert.deepEqual(filterAll(all, { q: 'airhorn' }).map((x) => x.key), ['pack:airhorn-1'], 'pack search terms match');
  assert.deepEqual(filterAll(all, { q: 'boom' }).map((x) => x.key), ['lib:s1']);
  assert.deepEqual(filterAll(all, { q: 'bo' }).map((x) => x.key), ['lib:s1'], 'word prefixes');
  assert.deepEqual(filterAll(all, { source: 'pack' }).map((x) => x.source), ['pack', 'pack']);
  assert.deepEqual(filterAll(all, { starred: true }).map((x) => x.key), ['lib:s2']);
  assert.deepEqual(filterAll(all, { tag: 'transitions' }).map((x) => x.key), ['pack:whoosh-2']);
  assert.deepEqual(filterAll(all, { q: 'horn meme' }).map((x) => x.key), ['pack:airhorn-1'], 'every word must match');
  assert.deepEqual(filterAll(all, { q: 'nothing' }), []);
  const t = topTags(all);
  assert.ok(t.every((x) => x.tag !== 'built-in'));
  assert.ok(t.some((x) => x.tag === 'crowd'));
});
