// UPC lookups, bulk photo selection and tags, and setlist lengths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normUPC, parseDeezerAlbum, pickMBRelease, parseMBRelease, parseITunesUPC, mergeRelease, matchTrack, lookupUPC, deezerAlbumURL, deezerTrackURL } from '../js/manager/isrc.js';
import { applyUPC } from '../js/manager/page-releases.js';
import { tagPhotos, parseTagEdit, clickSelect, normalizePhotos } from '../js/manager/photos.js';
import { songSeconds, splitLine, setlistTimes } from '../js/manager/setlist.js';
import { showSheetHTML } from '../js/manager/docs.js';
import { newSong, newShow, newManager } from '../js/manager/model.js';
import { newRelease } from '../js/manager/releases.js';

const DZ_ALBUM = { id: 9, title: 'Static', upc: '602557382549', link: 'https://www.deezer.com/album/9', release_date: '2026-04-03', record_type: 'ep', label: 'Self-released', cover_xl: 'https://cdn-images.dzcdn.net/x/1000x1000.jpg', artist: { name: 'Arc Flash' }, tracks: { data: [{ id: 101, title: 'Static Bloom', duration: 220, link: 'https://www.deezer.com/track/101' }, { id: 102, title: 'Undertow (feat. Sam)', duration: 195, link: 'https://www.deezer.com/track/102' }, { id: 103, title: 'Glasshouse', duration: 240 }] } };
const MB_REL = { id: 'mb1', title: 'Static', date: '2026-04-03', 'artist-credit': [{ name: 'Arc Flash' }], relations: [{ url: { resource: 'https://open.spotify.com/album/abc' } }], media: [{ tracks: [{ title: 'Static Bloom', length: 220000, recording: { isrcs: ['USAB12600001'] } }, { title: 'Undertow', length: 195000, recording: { isrcs: ['USAB12600002'] } }, { title: 'Glasshouse', length: 240000, recording: { isrcs: [] } }] }] };
const IT = { results: [{ wrapperType: 'collection', collectionName: 'Static - EP', artistName: 'Arc Flash', collectionViewUrl: 'https://music.apple.com/us/album/static/1', artworkUrl100: 'https://is1.mzstatic.com/a/100x100bb.jpg', releaseDate: '2026-04-03T07:00:00Z' }, { wrapperType: 'track', trackNumber: 2, trackName: 'Undertow', trackTimeMillis: 195000, trackViewUrl: 'https://music.apple.com/us/album/static/1?i=2' }, { wrapperType: 'track', trackNumber: 1, trackName: 'Static Bloom', trackTimeMillis: 220000, trackViewUrl: 'https://music.apple.com/us/album/static/1?i=1' }] };

test('UPC numbers', () => {
  assert.equal(normUPC('6 02557 38254 9'), '602557382549');
  assert.equal(normUPC('0602557382549'), '0602557382549');
  assert.equal(normUPC('12345'), null);
  assert.equal(normUPC('ABC123456789'), null);
  assert.equal(deezerAlbumURL('602557382549'), 'https://api.deezer.com/album/upc:602557382549');
  assert.equal(deezerTrackURL(101), 'https://api.deezer.com/track/101');
});

test('reading each service’s release', () => {
  const dz = parseDeezerAlbum(DZ_ALBUM);
  assert.deepEqual([dz.title, dz.artist, dz.date, dz.type, dz.label, dz.tracks.length, dz.tracks[1].ms], ['Static', 'Arc Flash', '2026-04-03', 'ep', 'Self-released', 3, 195000]);
  assert.equal(dz.link.key, 'deezer');
  assert.equal(parseDeezerAlbum({ error: { code: 800 } }), null);
  assert.equal(pickMBRelease({ releases: [{ id: 'x', barcode: '111' }, { id: 'mb1', barcode: '602557382549' }] }, '0602557382549'), 'mb1');
  assert.equal(pickMBRelease({ releases: [{ id: 'x', barcode: '111' }] }, '602557382549'), null);
  const mb = parseMBRelease(MB_REL);
  assert.deepEqual(mb.tracks.map((t) => t.isrc), ['USAB12600001', 'USAB12600002', '']);
  assert.equal(mb.links[0].key, 'spotify');
  const it = parseITunesUPC(IT);
  assert.deepEqual(it.tracks.map((t) => t.title), ['Static Bloom', 'Undertow']);
  assert.equal(it.cover, 'https://is1.mzstatic.com/a/3000x3000bb.jpg');
  assert.equal(parseITunesUPC({ results: [] }), null);
});

test('merging fills ISRCs and links from every service', () => {
  const rel = mergeRelease('602557382549', { dz: parseDeezerAlbum(DZ_ALBUM), mb: parseMBRelease(MB_REL), it: parseITunesUPC(IT) });
  assert.equal(rel.title, 'Static');
  assert.deepEqual(rel.tracks.map((t) => t.isrc), ['USAB12600001', 'USAB12600002', '']);
  assert.deepEqual(rel.tracks[0].links.map((l) => l.key).sort(), ['apple', 'deezer']);
  // "Undertow (feat. Sam)" matched Apple's "Undertow"
  assert.ok(rel.tracks[1].links.some((l) => l.key === 'apple'));
  assert.deepEqual(rel.links.map((l) => l.key).sort(), ['apple', 'deezer', 'spotify']);
  assert.equal(matchTrack(rel.tracks, 'undertow').n, 2);
  assert.equal(matchTrack(rel.tracks, 'Nope'), null);
  assert.equal(mergeRelease('1', {}), null);
});

test('lookupUPC asks Deezer for each track’s ISRC', async () => {
  const asked = [];
  const deezer = async (url) => {
    asked.push(url);
    if (url.includes('/album/upc:')) return DZ_ALBUM;
    const id = url.split('/').pop();
    return { id, isrc: { 101: 'USAB12600001', 102: 'USAB12600002' }[id] || null };
  };
  const fetchFn = async () => ({ ok: false, status: 503 });
  const rel = await lookupUPC('602557382549', { deezer, fetchFn, wait: async () => {} });
  assert.deepEqual(rel.tracks.map((t) => t.isrc), ['USAB12600001', 'USAB12600002', '']);
  assert.equal(asked.length, 4);
  assert.ok(rel.notes.some((n) => /MusicBrainz/.test(n)));
  await assert.rejects(lookupUPC('123'), /isn’t a UPC/);
  await assert.rejects(lookupUPC('602557382549', { deezer: async () => null, fetchFn, wait: async () => {} }), /No service knows/);
});

test('filling a release from its UPC', () => {
  const d = newManager();
  d.releases = [{ ...newRelease('ep'), id: 'r1' }];
  d.songs = [{ ...newSong('static bloom'), id: 's1' }, { ...newSong('Other'), id: 's2', releaseId: 'r1', track: 1 }];
  const found = { ...mergeRelease('602557382549', { dz: parseDeezerAlbum(DZ_ALBUM), mb: parseMBRelease(MB_REL) }), notes: [] };
  const out = applyUPC(d, 'r1', found, { create: true, newSongFn: newSong });
  assert.deepEqual(out, { matched: 1, created: 2, isrcs: 2 });
  const r = d.releases[0];
  assert.deepEqual([r.title, r.type, r.upc, r.releaseDate, r.label], ['Static', 'ep', '602557382549', '2026-04-03', 'Self-released']);
  const on = d.songs.filter((s) => s.releaseId === 'r1').sort((a, b) => a.track - b.track);
  assert.deepEqual(on.map((s) => [s.title, s.track]), [['static bloom', 1], ['Undertow (feat. Sam)', 2], ['Glasshouse', 3], ['Other', 4]]);
  assert.equal(d.songs.find((s) => s.id === 's1').isrc, 'USAB12600001');
  assert.equal(d.songs.find((s) => s.id === 's1').links.deezer, 'https://www.deezer.com/track/101');
  // without creating, unmatched tracks are left alone
  const d2 = newManager();
  d2.releases = [{ ...newRelease('ep', 'My EP'), id: 'r1' }];
  d2.songs = [{ ...newSong('Glasshouse'), id: 'g' }];
  assert.deepEqual(applyUPC(d2, 'r1', found, { create: false }), { matched: 1, created: 0, isrcs: 0 });
  assert.equal(d2.releases[0].title, 'My EP'); // a name you gave it stays
});

test('tags on many photos at once', () => {
  const m = { photos: normalizePhotos([{ id: 'a', mediaId: '1', tags: ['old'] }, { id: 'b', mediaId: '2', tags: ['live'] }, { id: 'c', mediaId: '3' }]) };
  assert.deepEqual(parseTagEdit('Live, #2026, -old'), { add: ['live', '2026'], remove: ['old'] });
  assert.equal(tagPhotos(m, ['a', 'b'], ['live', '2026'], ['old']), 2);
  assert.deepEqual(m.photos.map((p) => p.tags), [['live', '2026'], ['live', '2026'], []]);
  assert.equal(tagPhotos(m, ['a', 'b'], ['live']), 0); // nothing new
});

test('shift and ctrl/cmd clicks', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  let s = clickSelect(new Set(), order, 'b');
  assert.deepEqual([[...s.selected], s.anchor], [['b'], 'b']);
  s = clickSelect(s.selected, order, 'd', { shift: true, anchor: s.anchor });
  assert.deepEqual([...s.selected].sort(), ['b', 'c', 'd']);
  s = clickSelect(s.selected, order, 'a', { shift: true, anchor: 'd' }); // backwards
  assert.deepEqual([...s.selected].sort(), ['a', 'b', 'c', 'd']);
  s = clickSelect(s.selected, order, 'c'); // ctrl/cmd: toggle one
  assert.deepEqual([...s.selected].sort(), ['a', 'b', 'd']);
  assert.equal(s.anchor, 'c');
  // shift with no anchor ticks just that one
  assert.deepEqual([...clickSelect(new Set(), order, 'e', { shift: true }).selected], ['e']);
});

test('setlist lengths', () => {
  const songs = [{ ...newSong('Static Bloom'), length: '3:40' }, { ...newSong('Undertow'), audioId: 'm1' }, { ...newSong('Glasshouse') }];
  const dur = (id) => (id === 'm1' ? 194.6 : 0);
  assert.equal(songSeconds(songs[0], dur), 220);
  assert.equal(songSeconds(songs[1], dur), 195);
  assert.equal(songSeconds(songs[2], dur), 0);
  assert.deepEqual(splitLine('Jam 2:30'), { title: 'Jam', seconds: 150 });
  assert.deepEqual(splitLine('Talk / tune - 1:00'), { title: 'Talk / tune', seconds: 60 });
  assert.deepEqual(splitLine('Undertow (live)'), { title: 'Undertow (live)', seconds: null });
  const t = setlistTimes('static bloom\nUndertow (live)\nJam 2:30\nGlasshouse', songs, dur);
  assert.deepEqual(t.rows.map((r) => [r.title, r.seconds, r.from]), [['static bloom', 220, 0], ['Undertow (live)', 195, 220], ['Jam', 150, 415], ['Glasshouse', 0, 565]]);
  assert.deepEqual([t.total, t.text, t.missing], [565, '9:25', 1]);
  const g = setlistTimes('Static Bloom\nUndertow', songs, dur, { gap: 30 });
  assert.deepEqual([g.total, g.music, g.gaps], [445, 415, 30]);
  assert.equal(setlistTimes('', songs).rows.length, 0);
  const sheet = showSheetHTML({ ...newShow('2026-05-01'), venue: 'El Corazon', setlist: 'Static Bloom\nUndertow' }, { name: 'Arc Flash' }, { times: g });
  assert.match(sheet, /Setlist · 7:25/);
  assert.match(sheet, /with 0:30 between songs/);
});
