import test from 'node:test';
import assert from 'node:assert/strict';
import { newCover, normalizeCovers, addCover, findCover, setlistSongs, tidyLength } from '../js/manager/covers.js';
import { setlistTimes } from '../js/manager/setlist.js';
import { newManager, newSong, newShow, normalizeManager } from '../js/manager/model.js';
import { ARTIST_KEYS, workspaceFrom, viewOf, mergeView } from '../js/manager/artists.js';
import { normalizeDoc } from '../js/photo/model.js';

test('covers are cleaned up on load and kept per artist', () => {
  const list = normalizeCovers([{ id: 'c1', title: '  Change (In the House of Flies) ', artist: 'Deftones', length: '4:59', key: 'Drop D' }, { title: '' }, null, { title: 'Hurt', artist: 7 }]);
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'Change (In the House of Flies)');
  assert.equal(list[1].artist, '');
  assert.match(list[1].id, /^cover/);
  assert.ok(ARTIST_KEYS.includes('covers'));
  const m = normalizeManager({ covers: [{ title: 'Hurt', length: '3:38' }] });
  assert.equal(m.covers[0].length, '3:38');
  assert.deepEqual(newManager().covers, []);
  // a workspace round trip keeps them with the artist
  const ws = workspaceFrom(m);
  const v = viewOf(ws);
  assert.equal(v.covers[0].title, 'Hurt');
  v.covers.push(newCover('Bodies', '3:22'));
  assert.equal(viewOf(mergeView(ws, v)).covers.length, 2);
});

test('lengths are tidied, and a setlist line becomes a cover', () => {
  assert.equal(tidyLength(' 3:5 '), '3:5'); // not a time: kept as typed so the page can flag it
  assert.equal(tidyLength('225'), '3:45');
  assert.equal(tidyLength('3:45'), '3:45');
  const m = newManager();
  m.songs.push({ ...newSong('Static Bloom'), length: '3:40' });
  assert.equal(addCover(m, 'static bloom', '3:00'), null); // your own song, not a cover
  assert.equal(addCover(m, '  ', '3:00'), null);
  const c = addCover(m, 'Chop Suey!', '3:30', { artist: 'System of a Down' });
  assert.equal(c.length, '3:30');
  assert.equal(addCover(m, 'chop suey', '3:31').id, c.id); // same song, length updated
  assert.equal(m.covers.length, 1);
  assert.equal(m.covers[0].length, '3:31');
  assert.equal(findCover(m.covers, 'CHOP SUEY!!').id, c.id);
});

test('setlists time covers next to your own songs', () => {
  const m = newManager();
  m.songs.push({ ...newSong('Static Bloom'), length: '3:40' });
  m.covers = [{ ...newCover('Chop Suey!', '3:30'), artist: 'System of a Down' }, newCover('No length yet')];
  const songs = setlistSongs(m);
  assert.equal(songs.length, 3);
  assert.ok(songs[1].cover && songs[1].artist === 'System of a Down');
  const t = setlistTimes('Static Bloom\nChop Suey!\nNo length yet\nJam 2:00', songs);
  assert.deepEqual(t.rows.map((r) => r.seconds), [220, 210, 0, 120]);
  assert.equal(t.rows[1].song.cover, true);
  assert.equal(t.rows[2].song.cover, true);
  assert.equal(t.rows[3].song, null);
  assert.equal(t.missing, 1);
  assert.equal(t.text, '9:10');
});

test('a show keeps its poster; a poster design keeps its show', () => {
  assert.equal(newShow().posterId, null);
  const m = normalizeManager({ shows: [{ id: 's1', venue: 'The Crocodile', posterId: 'img1' }, { id: 's2', posterId: 5 }] });
  assert.equal(m.shows[0].posterId, 'img1');
  assert.equal(m.shows[1].posterId, null);
  assert.equal(normalizeDoc({ name: 'Poster', showId: 's1' }).showId, 's1');
  assert.equal(normalizeDoc({ name: 'Poster' }).showId, '');
});
