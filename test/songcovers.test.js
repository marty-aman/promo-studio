import test from 'node:test';
import assert from 'node:assert/strict';
import { songCovers } from '../js/manager/releases.js';

const m = {
  releases: [
    { id: 'ep', type: 'ep', title: 'Static', coverId: 'img-ep' },
    { id: 'al', type: 'album', title: 'No Cover Yet', coverId: null },
  ],
  songs: [
    { id: 'a', title: 'Lighthouse', coverId: 'img-a', releaseId: '' },
    { id: 'b', title: 'Static Bloom', coverId: null, releaseId: 'ep' },
    { id: 'c', title: 'Undertow', coverId: null, releaseId: 'ep' },
    { id: 'd', title: 'Glasshouse', coverId: null, releaseId: 'al' }, // no cover anywhere
    { id: 'e', title: 'Rust', coverId: 'img-ep', releaseId: '' }, // its own cover is the EP's picture
  ],
};

test('only the covers of songs, EPs and albums, one per picture', () => {
  const list = songCovers(m);
  assert.deepEqual(list.map((c) => c.mediaId), ['img-ep', 'img-a']);
  assert.equal(list[0].label, 'EP: Static · Static Bloom, Undertow, Rust');
  assert.deepEqual(list[0].songIds, ['b', 'c', 'e']);
  assert.equal(list[1].label, 'Lighthouse');
  assert.deepEqual(songCovers({ songs: [], releases: [] }), []);
  assert.deepEqual(songCovers({}), []);
});

test('the song in the edit comes first', () => {
  assert.equal(songCovers(m, { firstSongId: 'a' })[0].mediaId, 'img-a');
  assert.equal(songCovers(m, { firstSongId: 'c' })[0].mediaId, 'img-ep');
  assert.equal(songCovers(m, { firstSongId: 'd' })[0].mediaId, 'img-ep'); // no cover: order unchanged
});
