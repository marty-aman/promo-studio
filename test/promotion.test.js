import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, normalizeManager, agenda, overdueTasks } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, SHARED_KEYS } from '../js/manager/artists.js';
import { lyricThemes, genreFamilies, energyOf, suggestPlaylists, playlistTypes, playlistLibrary, playlistSearchURL, PLAYLISTS } from '../js/manager/playlists.js';
import { pressRelease, pressHTML, spotifyPitch, SPOTIFY_PITCH_MAX, curatorPitch, pitchDeadline, spotifyFormHints, pitchStats } from '../js/manager/press.js';

const LYRICS = 'I scream your name into the fire\nI hate the liar in my head\nAlone, alone, so numb and cold\nI scream your name into the fire';

function setup() {
  const m = newManager();
  m.band = { ...m.band, bio: 'Arc Flash is a four-piece from Seattle.\n\nSecond paragraph.', similar: 'Bad Omens, Loathe', contactName: 'Marty', contactEmail: 'press@example.com' };
  const s = newSong('Static Bloom');
  Object.assign(s, { releaseDate: '2026-12-12', bpm: 150, lyrics: LYRICS });
  s.sound.moods = ['aggressive', 'dark'];
  s.sound.vocals = 'mixed';
  s.links.spotify = 'https://open.spotify.com/track/x';
  m.songs.push(s);
  m.shows.push({ ...newShow('2026-12-13'), status: 'confirmed', venue: 'El Corazon' });
  return { m, s };
}

test('lyric themes come from words in the lyrics, most mentioned first', () => {
  const t = lyricThemes(LYRICS);
  assert.equal(t[0].id, 'anger');
  assert.ok(t.some((x) => x.id === 'isolation'));
  assert.deepEqual(lyricThemes(''), []);
  assert.deepEqual(lyricThemes('la la la'), []);
});

test('genres map onto families, and energy falls back to the BPM', () => {
  assert.deepEqual(genreFamilies('alt-metal, emocore').sort(), ['emo', 'hardrock', 'metal', 'metalcore']);
  assert.deepEqual(genreFamilies('bedroom pop'), ['indie', 'pop']);
  assert.ok(!genreFamilies('popular music').includes('pop'));
  assert.equal(energyOf({ bpm: 150 }), 'high');
  assert.equal(energyOf({ bpm: 70 }), 'low');
  assert.equal(energyOf({ bpm: 70, sound: { energy: 'high' } }), 'high');
  assert.equal(energyOf({ bpm: '' }), '');
});

test('a heavy song gets heavy playlists first, a mix of styles, and discovery lists last', () => {
  const { m, s } = setup();
  const sug = suggestPlaylists(s, m);
  const names = sug.map((p) => p.name);
  assert.ok(names.slice(0, 10).some((n) => ['New Core', 'Kickass Metal', 'Breaking Metal'].includes(n)));
  assert.ok(names.includes('Emo Forever'), 'the second genre still shows');
  assert.ok(!names.includes('Today’s Top Hits') && !names.includes('Peaceful Piano'));
  assert.deepEqual(names.slice(-4).sort(), ['Fresh Finds', 'New Music Friday', 'RADAR', 'Release Radar (your followers)'].sort());
  assert.ok(sug.every((p) => p.why.length));
});

test('screamed vocals keep soft pop lists out; the song falls back to the band genres', () => {
  const m = newManager();
  m.band.genres = 'indie pop';
  const s = newSong('Soft');
  s.sound.moods = ['dreamy'];
  const soft = suggestPlaylists(s, m).map((p) => p.name);
  assert.ok(soft.includes('Bedroom Pop') || soft.includes('Lorem'));
  s.sound.vocals = 'screamed';
  assert.ok(suggestPlaylists(s, m).filter((p) => !p.general).length < soft.length);
});

test('your own playlists are matched, hidden built-ins are left out, both shared across artists', () => {
  const { m, s } = setup();
  m.playlists.push({ id: 'pl1', name: 'Heavy Hours', service: 'Spotify', genres: 'metalcore', curator: 'Sam', contact: 'sam@example.com', url: '' });
  m.playlistsOff.push('sp-new-core');
  const lib = playlistLibrary(m);
  assert.ok(lib.some((p) => p.name === 'Heavy Hours' && !p.builtin));
  assert.ok(!lib.some((p) => p.id === 'sp-new-core'));
  const sug = suggestPlaylists(s, m);
  assert.ok(sug.some((p) => p.name === 'Heavy Hours'));
  assert.ok(SHARED_KEYS.includes('playlists') && SHARED_KEYS.includes('playlistsOff'));
  const ws = workspaceFrom(m);
  const back = mergeView(ws, viewOf(ws));
  assert.equal(back.shared.playlists.length, 1);
  assert.deepEqual(back.shared.playlistsOff, ['sp-new-core']);
});

test('built-in playlists have unique ids and a search link per service', () => {
  assert.equal(new Set(PLAYLISTS.map((p) => p.id)).size, PLAYLISTS.length);
  assert.ok(PLAYLISTS.length >= 45);
  assert.match(playlistSearchURL(PLAYLISTS.find((p) => p.service === 'Apple Music')), /^https:\/\/music\.apple\.com\//);
  assert.match(playlistSearchURL({ name: 'New Core', service: 'Spotify' }), /^https:\/\/open\.spotify\.com\/search\/New%20Core\/playlists$/);
  assert.equal(playlistSearchURL({ name: 'x', url: 'https://example.com/p' }), 'https://example.com/p');
});

test('playlist types search by genre, themes, moods and similar artists', () => {
  const { m, s } = setup();
  const t = playlistTypes(s, m);
  assert.ok(t.length >= 4 && t.length <= 6);
  assert.ok(t.some((x) => /rage/.test(x.search)));
  assert.ok(t.some((x) => x.search === 'Bad Omens'));
  assert.ok(t.every((x) => x.url.startsWith('https://open.spotify.com/search/')));
});

test('the press release has the standard parts and uses what the manager knows', () => {
  const { m, s } = setup();
  s.press.quote = 'We wrote it in one night.';
  s.press.credits = 'Produced by Jo';
  const r = pressRelease(s, m, { today: '2026-11-19' });
  assert.match(r.full, /^FOR IMMEDIATE RELEASE/);
  assert.match(r.full, /###$/);
  assert.match(r.full, /Arc Flash announces new single “Static Bloom”, out December 12/);
  assert.match(r.full, /SEATTLE, November 19, 2026 — Seattle alt-metal \/ emocore band Arc Flash will release/);
  assert.match(r.full, /lyrics about anger/);
  assert.match(r.full, /“We wrote it in one night,” says Arc Flash\./);
  assert.match(r.full, /El Corazon/);
  assert.match(r.full, /Produced by Jo/);
  assert.match(r.full, /press@example\.com/);
  assert.ok(!/Second paragraph/.test(r.full), 'only the short bio');
  assert.ok(r.short.split(/\s+/).length <= 170);
  assert.ok(r.blurb.split(/\s+/).length <= 70);
  s.releaseDate = '2026-11-01';
  assert.match(pressRelease(s, m, { today: '2026-11-19' }).headline, /releases new single/);
});

test('edited drafts are kept until reset', () => {
  const { m, s } = setup();
  s.press.edits = { short: 'My own words' };
  const r = pressRelease(s, m, { today: '2026-11-19' });
  assert.equal(r.short, 'My own words');
  assert.notEqual(r.drafts.short, 'My own words');
});

test('the printable page escapes the text', () => {
  const html = pressHTML('A <b>bold</b> & claim\n\nNext');
  assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt; &amp; claim'));
  assert.ok(!html.includes('<b>'));
});

test('the Spotify pitch fits 500 characters and only claims plans that exist', () => {
  const { m, s } = setup();
  let p = spotifyPitch(s, m, { today: '2026-11-19' });
  assert.ok(p.length <= SPOTIFY_PITCH_MAX);
  assert.match(p, /Static Bloom/);
  assert.ok(!/Release plan/.test(p));
  m.posts.push({ id: 'p1', songId: s.id }, { id: 'p2', songId: s.id });
  s.press.story = 'x'.repeat(400);
  m.band.similar = 'A, B, C, D';
  p = spotifyPitch(s, m, { today: '2026-11-19' });
  assert.ok(p.length <= SPOTIFY_PITCH_MAX, String(p.length));
  assert.equal(pitchDeadline(s, '2026-11-19').last, '2026-12-05');
  assert.equal(pitchDeadline(s, '2026-11-19').left, 16);
  assert.equal(pitchDeadline({ releaseDate: '' }, '2026-11-19'), null);
  assert.equal(spotifyFormHints(s, m)[2][1], 'Sung and screamed');
});

test('the curator pitch names the curator and playlist and links the song', () => {
  const { m, s } = setup();
  const c = curatorPitch(s, m, { curator: 'Sam', playlist: 'Heavy Hours', today: '2026-11-19' });
  assert.match(c.subject, /Heavy Hours: Arc Flash – “Static Bloom”/);
  assert.match(c.body, /^Hi Sam,/);
  assert.match(c.body, /an alt-metal\/emocore band from Seattle/);
  assert.match(c.body, /open\.spotify\.com\/track\/x/);
  assert.match(curatorPitch({ ...s, links: {} }, m).body, /\[private link or pre-save\]/);
});

test('pitch follow-ups show in the agenda and as overdue, until followed up', () => {
  const { m, s } = setup();
  s.pitches.push({ id: 'pt1', playlist: 'Heavy Hours', curator: 'Sam', status: 'sent', sent: '2026-11-10', followUp: '2026-11-17', followedUp: false });
  s.pitches.push({ id: 'pt2', playlist: 'Other', status: 'sent', followUp: '2026-11-22', followedUp: false });
  s.pitches.push({ id: 'pt3', playlist: 'Added', status: 'added', followUp: '2026-11-22' });
  const late = overdueTasks(m, '2026-11-19').filter((x) => x.pitch);
  assert.equal(late.length, 1);
  assert.equal(late[0].task.text, 'Follow up with Sam');
  const items = agenda(m, '2026-11-19', 14).filter((x) => x.ref.tab === 'pitch');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Follow up: Other');
  s.pitches[0].followedUp = true;
  assert.equal(overdueTasks(m, '2026-11-19').filter((x) => x.pitch).length, 0);
  assert.deepEqual(pitchStats(s), { total: 3, sent: 3, added: 1, replied: 0, declined: 0 });
});

test('old saves get sound, press and pitch fields', () => {
  const m = normalizeManager({ songs: [{ id: 's1', title: 'Old', sound: { moods: 'bad' } }] });
  assert.deepEqual(m.songs[0].sound.moods, []);
  assert.deepEqual(m.songs[0].pitches, []);
  assert.equal(m.songs[0].press.quote, '');
  assert.deepEqual(m.playlists, []);
  assert.deepEqual(m.playlistsOff, []);
});
