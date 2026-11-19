import test from 'node:test';
import assert from 'node:assert/strict';
import { normISRC, prettyISRC, platformOf, parseMusicBrainz, parseDeezer, parseSpotify, pickITunes, pickYouTube, searchLinks, mergeLinks, lookupISRC, LINK_KEYS } from '../js/manager/isrc.js';
import { newSong, normalizeManager } from '../js/manager/model.js';

const MB = {
  recordings: [
    {
      title: 'Cut to the Feeling',
      length: 207959,
      'first-release-date': '2017-05-26',
      'artist-credit': [{ name: 'Carly Rae Jepsen', joinphrase: '' }],
      relations: [
        { url: { resource: 'https://open.spotify.com/track/3sswiHyFe3eXhNknhLCLyn' } },
        { url: { resource: 'https://tidal.com/track/466004171' } },
        { url: { resource: 'javascript:alert(1)' } },
        { url: { resource: 'https://evil.example/open.spotify.com' } },
      ],
    },
  ],
};
const DZ = { id: 363747251, title: 'Cut To The Feeling', link: 'https://www.deezer.com/track/363747251', duration: 208, release_date: '2017-05-26', artist: { name: 'Carly Rae Jepsen' }, album: { cover_xl: 'https://e-cdns-images.dzcdn.net/x.jpg' } };
const IT = { results: [{ trackName: 'Cut To The Feeling (Live)', artistName: 'Carly Rae Jepsen', trackTimeMillis: 260000, trackViewUrl: 'https://music.apple.com/us/album/x/1?i=9' }, { trackName: 'Cut To The Feeling', artistName: 'Carly Rae Jepsen', trackTimeMillis: 207959, trackViewUrl: 'https://music.apple.com/us/album/cut-to-the-feeling/1445304934?i=1445304939&uo=4' }] };

test('ISRCs are normalised and checked', () => {
  assert.equal(normISRC('us-um7-17-03861'), 'USUM71703861');
  assert.equal(normISRC(' USUM7 1703861 '), 'USUM71703861');
  assert.equal(normISRC('USUM7170386'), null);
  assert.equal(normISRC('12UM71703861'), null);
  assert.equal(normISRC('USUM7170386X'), null);
  assert.equal(prettyISRC('USUM71703861'), 'US-UM7-17-03861');
});

test('only https links on known hosts are kept', () => {
  assert.equal(platformOf('https://open.spotify.com/track/x'), 'spotify');
  assert.equal(platformOf('https://music.youtube.com/watch?v=x'), 'youtubeMusic');
  assert.equal(platformOf('https://youtu.be/x'), 'youtube');
  assert.equal(platformOf('https://music.amazon.co.uk/albums/x'), 'amazon');
  assert.equal(platformOf('https://arcflash.bandcamp.com/track/x'), 'bandcamp');
  assert.equal(platformOf('https://evil.example/open.spotify.com'), null);
  assert.equal(platformOf('javascript:alert(1)'), null);
  assert.equal(platformOf('not a url'), null);
});

test('MusicBrainz gives the title, artist, length and any streaming links', () => {
  const r = parseMusicBrainz(MB);
  assert.equal(r.title, 'Cut to the Feeling');
  assert.equal(r.artist, 'Carly Rae Jepsen');
  assert.equal(r.ms, 207959);
  assert.deepEqual(r.links.map((l) => [l.key, l.how]), [['spotify', 'isrc'], ['tidal', 'isrc']]);
  assert.equal(parseMusicBrainz({ recordings: [] }), null);
  assert.equal(parseMusicBrainz({ error: 'Not found' }), null);
});

test('Deezer and Spotify are exact; errors give null', () => {
  assert.equal(parseDeezer(DZ).link.url, 'https://www.deezer.com/track/363747251');
  assert.equal(parseDeezer(DZ).ms, 208000);
  assert.equal(parseDeezer({ error: { type: 'DataException' } }), null);
  assert.equal(parseDeezer({ id: 1, link: 'https://evil.example/' }), null);
  const sp = parseSpotify({ tracks: { items: [{ name: 'Cut To The Feeling', duration_ms: 207959, artists: [{ name: 'Carly Rae Jepsen' }], external_urls: { spotify: 'https://open.spotify.com/track/abc' } }] } });
  assert.equal(sp.link.url, 'https://open.spotify.com/track/abc');
  assert.equal(parseSpotify({ tracks: { items: [] } }), null);
});

test('Apple is matched by title, artist and length; YouTube by the artist channel', () => {
  const ap = pickITunes(IT, { title: 'Cut to the Feeling', artist: 'Carly Rae Jepsen', ms: 208000 });
  assert.equal(ap.url, 'https://music.apple.com/us/album/cut-to-the-feeling/1445304934?i=1445304939');
  assert.equal(ap.how, 'match');
  assert.equal(pickITunes(IT, { title: 'Other Song', artist: 'Carly Rae Jepsen' }), null);
  const yt = { items: [{ id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: 'Cut To The Feeling (cover)', channelTitle: 'Some Fan' } }, { id: { videoId: 'bbbbbbbbbbb' }, snippet: { title: 'Cut To The Feeling', channelTitle: 'Carly Rae Jepsen - Topic' } }] };
  assert.equal(pickYouTube(yt, { title: 'Cut To The Feeling', artist: 'Carly Rae Jepsen' }).url, 'https://www.youtube.com/watch?v=bbbbbbbbbbb');
  assert.equal(pickYouTube({ items: [yt.items[0]] }, { title: 'Cut To The Feeling', artist: 'Carly Rae Jepsen' }), null);
});

test('merging keeps the first real link per platform and fills the rest with searches', () => {
  const meta = { title: 'Song', artist: 'Band' };
  const all = mergeLinks([[{ key: 'spotify', url: 'https://open.spotify.com/track/1', how: 'isrc' }], [{ key: 'spotify', url: 'https://open.spotify.com/track/2', how: 'isrc' }]], meta);
  assert.equal(all.length, LINK_KEYS.length);
  assert.equal(all.find((l) => l.key === 'spotify').url, 'https://open.spotify.com/track/1');
  assert.ok(all.filter((l) => l.how === 'search').every((l) => l.url.includes('Band%20Song')));
  assert.equal(searchLinks(meta, ['spotify']).length, LINK_KEYS.length - 1);
});

const fakeFetch = (routes) => async (url) => {
  const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
  if (!hit) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => hit[1] };
};

test('a lookup combines every source', async () => {
  const r = await lookupISRC('US-UM7-17-03861', {
    fetchFn: fakeFetch({ 'https://musicbrainz.org/': MB, 'https://itunes.apple.com/': IT }),
    deezer: async () => DZ,
  });
  assert.equal(r.isrc, 'USUM71703861');
  assert.equal(r.title, 'Cut To The Feeling');
  assert.equal(r.cover, 'https://e-cdns-images.dzcdn.net/x.jpg');
  const by = Object.fromEntries(r.links.map((l) => [l.key, l]));
  assert.equal(by.spotify.how, 'isrc');
  assert.equal(by.deezer.url, 'https://www.deezer.com/track/363747251');
  assert.equal(by.tidal.how, 'isrc');
  assert.equal(by.apple.how, 'match');
  assert.equal(by.youtube.how, 'search');
  assert.ok(r.notes.some((n) => n.includes('Spotify client ID')));
});

test('an unknown ISRC says so, and a bad one throws', async () => {
  const r = await lookupISRC('QZES72000001', { fetchFn: fakeFetch({ 'https://musicbrainz.org/': { recordings: [] } }), deezer: async () => ({ error: {} }), fallback: { title: 'Static Bloom', artist: 'Arc Flash' } });
  assert.ok(r.links.every((l) => l.how === 'search'));
  assert.ok(r.links[0].url.includes('Arc%20Flash%20Static%20Bloom'));
  assert.ok(r.notes.some((n) => n.startsWith('No service knows this ISRC')));
  await assert.rejects(() => lookupISRC('nope'), /isn’t an ISRC/);
});

test('Spotify uses the client credentials, then searches by ISRC', async () => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push([url, init.method || 'GET', init.headers?.Authorization || '']);
    if (url.startsWith('https://accounts.spotify.com/')) return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    if (url.startsWith('https://api.spotify.com/')) return { ok: true, json: async () => ({ tracks: { items: [{ name: 'X', artists: [{ name: 'Y' }], external_urls: { spotify: 'https://open.spotify.com/track/zzz' } }] } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const r = await lookupISRC('USUM71703861', { fetchFn, deezer: async () => null, spotify: { clientId: 'id', clientSecret: 'secret' } });
  assert.equal(r.links.find((l) => l.key === 'spotify').url, 'https://open.spotify.com/track/zzz');
  assert.deepEqual(calls[1] ? calls.find((c) => c[0].startsWith('https://accounts')).slice(1) : null, ['POST', `Basic ${btoa('id:secret')}`]);
  assert.ok(calls.some((c) => c[0] === 'https://api.spotify.com/v1/search?type=track&limit=1&q=isrc%3AUSUM71703861' && c[2] === 'Bearer tok'));
  assert.ok(!r.notes.some((n) => n.includes('Spotify client ID')));
});

test('songs keep an ISRC and the new link fields; old saves gain them', () => {
  const s = newSong('x');
  assert.equal(s.isrc, '');
  assert.deepEqual(Object.keys(s.links).sort(), LINK_KEYS.map(([k]) => k).sort());
  const m = normalizeManager({ songs: [{ id: 's1', title: 'Old', links: { spotify: 'https://open.spotify.com/track/1' } }] });
  assert.equal(m.songs[0].links.spotify, 'https://open.spotify.com/track/1');
  assert.equal(m.songs[0].links.tidal, '');
  assert.equal(m.songs[0].isrc, '');
});
