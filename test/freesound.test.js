import test from 'node:test';
import assert from 'node:assert/strict';
import { freesoundUrl, mapResults, licenseLabel } from '../js/freesound.js';

// soundlib.js needs IndexedDB, but its pure helpers can be imported in Node.
import { tagsFromPath, filterSounds, isAudioFile } from '../js/soundlib.js';

test('freesound URL filters licenses and duration, never non-commercial', () => {
  const u = new URL(freesoundUrl('whoosh', { key: 'K', license: 'cc0', maxDuration: '5', sort: 'downloads_desc', page: 2 }));
  assert.equal(u.searchParams.get('query'), 'whoosh');
  assert.equal(u.searchParams.get('filter'), 'license:"Creative Commons 0" duration:[0 TO 5]');
  assert.equal(u.searchParams.get('sort'), 'downloads_desc');
  assert.equal(u.searchParams.get('page'), '2');
  assert.equal(u.searchParams.get('token'), 'K');
  const by = new URL(freesoundUrl('x', { key: 'K', license: 'cc0by' }));
  assert.equal(by.searchParams.get('filter'), 'license:("Creative Commons 0" OR "Attribution")');
  assert.ok(!/noncommercial/i.test(by.searchParams.get('filter')));
});

test('licenseLabel and result mapping', () => {
  assert.equal(licenseLabel('http://creativecommons.org/publicdomain/zero/1.0/'), 'CC0 1.0');
  assert.equal(licenseLabel('https://creativecommons.org/licenses/by/4.0/'), 'CC BY 4.0');
  const res = mapResults({
    results: [
      { id: 1, name: 'Boom', username: 'ann', license: 'http://creativecommons.org/publicdomain/zero/1.0/', duration: 2.5, previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/a.mp3' }, url: 'https://freesound.org/s/1/', tags: ['boom'] },
      { id: 2, name: 'No preview', previews: {} },
      { id: 3, name: 'Riser', username: 'bo', license: 'https://creativecommons.org/licenses/by/4.0/', duration: 4, previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/b.mp3' }, url: 'https://freesound.org/s/3/' },
    ],
  });
  assert.equal(res.length, 2);
  assert.deepEqual([res[0].id, res[0].needsCredit, res[1].needsCredit, res[1].license], ['fs-1', false, true, 'CC BY 4.0']);
});

test('library helpers: tags from paths, audio detection, filtering', () => {
  assert.deepEqual(tagsFromPath('Impacts/Big_Boom-02.wav'), ['impacts', 'big', 'boom']);
  assert.ok(isAudioFile({ name: 'x.FLAC', type: '' }));
  assert.ok(isAudioFile({ name: 'noext', type: 'audio/mpeg' }));
  assert.ok(!isAudioFile({ name: 'pic.png', type: 'image/png' }));
  const list = [
    { id: 'a', name: 'Big boom', tags: ['impacts'], favorite: false, addedAt: 3 },
    { id: 'b', name: 'Riser long', tags: ['risers'], favorite: true, addedAt: 1 },
    { id: 'c', name: 'Small boom', tags: [], favorite: false, addedAt: 2 },
  ];
  assert.deepEqual(filterSounds(list, '').map((s) => s.id), ['b', 'a', 'c']); // favorites first, then newest
  assert.deepEqual(filterSounds(list, 'boom').map((s) => s.id), ['a', 'c']);
  assert.deepEqual(filterSounds(list, 'imp').map((s) => s.id), ['a']); // tag prefix
  assert.deepEqual(filterSounds(list, '', { favoritesOnly: true }).map((s) => s.id), ['b']);
});
