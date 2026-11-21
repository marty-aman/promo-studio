import test from 'node:test';
import assert from 'node:assert/strict';
import { searchQueries, parseVideos, matchFormats, risingHashtags, newPhrases, parseDeezerChart, chartArtists, scanTrends, rankTrends, hotTemplates, isStale, ago, loadScan, saveScan, shortNum, youtubeTrendURL, TREND_MATCH, pickDeezerPlaylist, newestTracks, deezerPlaylistTracksURL } from '../js/trendscan.js';
import { TRENDS } from '../js/inspiration.js';
import { planTakes } from '../js/suggest.js';

let n = 0;
const vid = (title, views, channel = `ch${++n}`, description = '') => ({ id: `v${String(++n).padStart(10, '0')}`, snippet: { title, description, channelTitle: channel, channelId: channel, publishedAt: '2026-11-20T00:00:00Z' }, statistics: { viewCount: String(views) } });
const items = [
  vid('Wait for the breakdown 😳 #metalcore #breakdown', 2_000_000, 'A'),
  vid('Heaviest breakdown of 2026? #metalcore #heavy', 900_000, 'B'),
  vid('the breakdown at 0:40 #metalcore', 40_000, 'C'),
  vid('Rate this chorus 1-10 #emo', 300_000, 'D', 'drop your score #posthardcore'),
  vid('screaming in my car again #metalcore #carkaraoke', 120_000, 'E'),
  vid('screaming in my car with the band #carkaraoke', 80_000, 'F'),
  vid('screaming in my car on tour #carkaraoke #shorts #fyp', 50_000, 'G'),
  vid('Official music video #shorts', 1_000, 'H'),
];
const videos = parseVideos({ items });

test('search words become up to four Shorts queries', () => {
  assert.deepEqual(searchQueries('metalcore, post-hardcore ,, emo band'), ['metalcore #shorts', 'post-hardcore #shorts', 'emo band #shorts']);
  assert.equal(searchQueries('a,b,c,d,e,f').length, 4);
  assert.equal(searchQueries('').length, 3); // the defaults
  const u = new URL(youtubeTrendURL('emo #shorts', 'K', '2026-11-06T00:00:00Z'));
  assert.equal(u.searchParams.get('videoDuration'), 'short');
  assert.equal(u.searchParams.get('order'), 'viewCount');
  assert.equal(u.searchParams.get('publishedAfter'), '2026-11-06T00:00:00Z');
});

test('videos are parsed safely', () => {
  assert.equal(videos.length, 8);
  assert.equal(videos[0].views, 2_000_000);
  assert.deepEqual(parseVideos({ items: [{ id: 'bad id', snippet: {} }, { id: 'x' }] }), []);
  assert.deepEqual(parseVideos(null), []);
});

test('every known trend has match words, and formats are found with views and examples', () => {
  for (const t of TRENDS) assert.ok(TREND_MATCH[t.id], t.id);
  const f = matchFormats(videos);
  assert.equal(f.breakdown.count, 3);
  assert.equal(f.breakdown.channels, 3);
  assert.equal(f.breakdown.views, 2_940_000);
  assert.equal(f.breakdown.examples[0].views, 2_000_000);
  assert.equal(f.rate.count, 1);
  assert.equal(f.learnriff.count, 0);
});

test('rising hashtags skip generic ones and need two channels', () => {
  const tags = risingHashtags(videos).map((t) => t.tag);
  assert.equal(tags[0], '#metalcore');
  assert.ok(tags.includes('#carkaraoke'));
  assert.ok(!tags.includes('#shorts') && !tags.includes('#fyp'));
  assert.ok(!tags.includes('#heavy')); // one channel only
  assert.ok(!risingHashtags(videos, { skip: ['carkaraoke'] }).some((t) => t.tag === '#carkaraoke'));
});

test('new phrases are ones 3+ channels use that no known format covers', () => {
  const ph = newPhrases(videos);
  assert.equal(ph[0].text, 'screaming in my car');
  assert.equal(ph[0].channels, 3);
  assert.ok(!ph.some((p) => /breakdown/.test(p.text))); // already a known format
  assert.equal(ph.filter((p) => p.text.includes('screaming')).length, 1); // no overlapping duplicates
});

test('the Deezer chart and its artists', () => {
  const chart = parseDeezerChart({ data: [{ title: 'Song', artist: { name: 'Bad Omens' }, link: 'https://www.deezer.com/track/1', position: 1 }, { title: 'X', artist: { name: 'Arc Flash' }, link: 'javascript:alert(1)' }, { title: 'Y', artist: { name: 'Bad Omens' } }, { nope: 1 }] });
  assert.equal(chart.length, 3);
  assert.equal(chart[1].link, ''); // only real Deezer links
  assert.deepEqual(chartArtists(chart, 'arc flash'), ['Bad Omens']);
});

test('a refresh reads YouTube and Deezer, and says what went wrong', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/search?')) return { ok: true, json: async () => ({ items: items.slice(0, 4).map((v) => ({ id: { videoId: v.id } })) }) };
    return { ok: true, json: async () => ({ items }) };
  };
  const scan = await scanTrends({ key: 'K', terms: 'metalcore, emo', fetchFn, deezer: async () => ({ data: [{ title: 'S', artist: { name: 'Spiritbox' } }] }), now: Date.parse('2026-11-21T00:00:00Z') });
  assert.equal(calls.filter((u) => u.includes('/search?')).length, 2);
  assert.ok(calls[0].includes('publishedAfter=2026-11-07T00%3A00%3A00Z'));
  assert.equal(calls.filter((u) => u.includes('/videos?')).length, 1);
  assert.equal(scan.videos, 8);
  assert.equal(scan.formats.breakdown.count, 3);
  assert.equal(scan.chart[0].artist, 'Spiritbox');
  assert.deepEqual(scan.notes, []);

  const noKey = await scanTrends({ fetchFn: async () => assert.fail('no YouTube call without a key'), deezer: async () => null });
  assert.equal(noKey.videos, 0);
  assert.match(noKey.notes.join(' '), /YouTube API key/);
  assert.match(noKey.notes.join(' '), /Deezer/);

  const quota = await scanTrends({ key: 'K', fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }) }) });
  assert.match(quota.notes[0], /quota/);
  const offline = await scanTrends({ key: 'K', fetchFn: async () => { throw new Error('offline'); } });
  assert.match(offline.notes[0], /Could not reach YouTube/);
});

test('trends are ranked hottest first; suggestions lean on the hot formats', async () => {
  assert.deepEqual(rankTrends(TRENDS, null).map((r) => r.trend.id), TRENDS.map((t) => t.id));
  assert.ok(rankTrends(TRENDS, null).every((r) => r.heat === null));
  const scan = { videos: videos.length, formats: matchFormats(videos) };
  const ranked = rankTrends(TRENDS, scan);
  assert.equal(ranked[0].trend.id, 'breakdown');
  assert.equal(ranked[0].heat, 'hot');
  assert.equal(ranked.find((r) => r.trend.id === 'rate').heat, 'rising'); // one channel only
  assert.equal(ranked.at(-1).heat, 'quiet');
  assert.deepEqual(hotTemplates(TRENDS, scan), ['rock']);
  const inv = { guitar: false, bass: false, drums: false, lyrics: 0 };
  const plain = planTakes(inv, { seed: 0 });
  const hot = planTakes(inv, { seed: 0, hot: ['neon'] });
  assert.ok(!plain.some((t) => t.trending));
  assert.ok(hot.some((t) => t.template === 'neon' && t.trending));
  assert.equal(hot.length, 3);
  assert.equal(new Set(hot.map((t) => t.template)).size, 3);
  // a picked template that's hot is just marked
  assert.ok(planTakes(inv, { seed: 0, hot: [plain[0].template] }).find((t) => t.template === plain[0].template).trending);
});

test('saved scans, age and number formatting', () => {
  const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
  assert.equal(loadScan(mem), null);
  assert.ok(saveScan({ fetchedAt: 5, formats: {} }, mem));
  assert.equal(loadScan(mem).fetchedAt, 5);
  mem.v = '{bad';
  assert.equal(loadScan(mem), null);
  const now = Date.parse('2026-11-21T12:00:00Z');
  assert.ok(isStale({ fetchedAt: now - 8 * 864e5 }, now));
  assert.ok(!isStale({ fetchedAt: now - 2 * 864e5 }, now));
  assert.ok(isStale(null, now));
  assert.equal(ago(now - 30e3, now), 'just now');
  assert.equal(ago(now - 3 * 36e5, now), '3 hours ago');
  assert.equal(ago(now - 864e5, now), 'yesterday');
  assert.equal(shortNum(2_940_000), '2.9M');
  assert.equal(shortNum(1234), '1.2k');
  assert.equal(shortNum(45_600), '46k');
});

test('Deezer: its editors’ playlist for the genre, newest additions first', async () => {
  const search = { data: [
    { id: 1, title: 'Metalcore Workout', nb_tracks: 80, user: { name: 'gym fan' }, mod_date: '2026-11-21' },
    { id: 2, title: 'Metalcore', nb_tracks: 200, user: { name: 'Rod - Deezer Metal Editor' }, link: 'https://www.deezer.com/playlist/2', mod_date: '2026-11-20 16:34:05' },
    { id: 3, title: 'Metalcore Classics', nb_tracks: 100, user: { name: 'Deezer Metal Editor' }, mod_date: '2025-01-01' },
    { id: 4, title: 'Tiny metalcore', nb_tracks: 5, user: { name: 'Deezer' } },
  ] };
  const pl = pickDeezerPlaylist(search, 'metalcore');
  assert.equal(pl.id, 2);
  assert.equal(pl.updated, '2026-11-20');
  assert.equal(pickDeezerPlaylist(search, 'emo band'), null);
  const tracks = parseDeezerChart({ data: [{ title: 'Old', artist: { name: 'A' }, time_add: 100 }, { title: 'New', artist: { name: 'B' }, time_add: 300 }, { title: 'Mid', artist: { name: 'C' }, time_add: 200 }] });
  assert.deepEqual(newestTracks(tracks, 2).map((t) => t.title), ['New', 'Mid']);
  const urls = [];
  const deezer = async (u) => {
    urls.push(u);
    if (u.includes('/search/playlist')) return u.includes('q=metalcore') ? search : { data: [] };
    if (u === deezerPlaylistTracksURL(2)) return { data: [{ title: 'Assimilate', artist: { name: 'Bury Tomorrow' }, time_add: 9 }] };
    return { data: [{ title: 'Classic', artist: { name: 'AC/DC' } }] };
  };
  const scan = await scanTrends({ terms: 'emo band, metalcore', deezer });
  assert.equal(scan.chartSource.kind, 'playlist');
  assert.equal(scan.chartSource.title, 'Metalcore');
  assert.equal(scan.chart[0].artist, 'Bury Tomorrow');
  assert.ok(!urls.some((u) => u.includes('/chart/')));
  const fallback = await scanTrends({ terms: 'zzz', deezer });
  assert.equal(fallback.chartSource.kind, 'chart');
  assert.equal(fallback.chart[0].artist, 'AC/DC');
});
