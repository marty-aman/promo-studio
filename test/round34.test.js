// Photo Studio (designs, layers, masks, templates, stock photos) and streaming stats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZES, newDoc, newLayer, normalizeDoc, slices, slidesForImage, hitTest, toLocal, moveLayer, duplicateLayer, resizeBox, fitImage, wrapText, filterCSS, shapePoints, docMedia, loadDesigns, saveDesigns, MASKS } from '../js/photo/model.js';
import { TEMPLATES, templateById, countdownSet, daysUntil, shortDate, releaseWhen } from '../js/photo/templates.js';
import { parsePexelsPhotos, parsePixabayPhotos, parseWikimediaPhotos } from '../js/stock.js';
import { mapColumns, toPeriod, detectSource, titleKey, matchSong, parseStatsFile, addImport, removeImport, assignTitle, songStats, newStats, normalizeStats, setLive, trend, lastfmURL, parseLastfm, parseDeezerRank } from '../js/manager/stats.js';
import { ARTIST_KEYS } from '../js/manager/artists.js';
import { newManager, normalizeManager, newSong } from '../js/manager/model.js';

test('designs: sizes, carousels and normalising', () => {
  assert.ok(SIZES.some(([id, , w, h]) => id === 'post' && w === 1080 && h === 1350));
  const d = newDoc({ size: 'post', slides: 3 });
  assert.equal(d.w, 3240);
  assert.equal(d.slides, 3);
  assert.deepEqual(slices(d), [{ x: 0, w: 1080 }, { x: 1080, w: 1080 }, { x: 2160, w: 1080 }]);
  assert.deepEqual(slices(newDoc()), [{ x: 0, w: 1080 }]);
  assert.equal(newDoc({ slides: 1 }).slides, 0);
  assert.equal(slidesForImage(6000, 2000), 4); // 3:1 at 4:5 slides
  assert.equal(slidesForImage(1000, 1000), 2);
  assert.equal(slidesForImage(40000, 1000), 10);
  const n = normalizeDoc({ w: 99999, h: 'x', slides: 1, layers: [{ type: 'text', text: 'hi', opacity: 5 }, { type: 'video' }, null] });
  assert.equal(n.w, 12000);
  assert.equal(n.h, 1350);
  assert.equal(n.slides, 0);
  assert.equal(n.layers.length, 1);
  assert.equal(n.layers[0].opacity, 1);
  assert.equal(n.layers[0].mask.type, 'none');
  assert.equal(normalizeDoc(null), null);
});

test('layers: hit testing with rotation, order, duplicate', () => {
  const d = newDoc({ size: 'square' });
  const a = newLayer('shape', d, { x: 100, y: 100, w: 200, h: 100 });
  const b = newLayer('text', d, { x: 150, y: 120, w: 100, h: 50 });
  d.layers.push(a, b);
  assert.equal(hitTest(d, 160, 130).id, b.id); // top-most first
  assert.equal(hitTest(d, 110, 110).id, a.id);
  assert.equal(hitTest(d, 50, 50), null);
  b.locked = true;
  assert.equal(hitTest(d, 160, 130).id, a.id);
  // rotated 90°: the 200x100 box stands up around its centre (200, 150)
  a.rot = 90;
  const p = toLocal(a, 200, 230);
  assert.ok(Math.abs(p.x - 180) < 1e-9 && Math.abs(p.y - 50) < 1e-9, JSON.stringify(p));
  assert.equal(hitTest(d, 200, 230).id, a.id);
  assert.equal(hitTest(d, 290, 150), null);
  assert.ok(moveLayer(d, a.id, 1));
  assert.equal(d.layers[1].id, a.id);
  assert.ok(!moveLayer(d, a.id, 1));
  const c = duplicateLayer(d, a.id);
  assert.equal(d.layers.length, 3);
  assert.equal(c.x, a.x + 30);
  assert.notEqual(c.id, a.id);
  assert.deepEqual(docMedia({ layers: [{ type: 'image', mediaId: 'm1' }, { type: 'image', mediaId: 'm1' }, { type: 'text' }] }), ['m1']);
});

test('resizing from handles, with and without keeping the shape', () => {
  const box = { x: 10, y: 10, w: 100, h: 50 };
  assert.deepEqual(resizeBox(box, 'e', 20, 99), { x: 10, y: 10, w: 120, h: 50 });
  assert.deepEqual(resizeBox(box, 'nw', 10, 10), { x: 20, y: 20, w: 90, h: 40 });
  assert.deepEqual(resizeBox(box, 'se', 100, 0, { keepAspect: true }), { x: 10, y: 10, w: 200, h: 100 });
  assert.deepEqual(resizeBox(box, 'w', 500, 0), { x: 102, y: 10, w: 8, h: 50 });
  assert.deepEqual(resizeBox(box, 'se', -50, 0, { keepAspect: true }), { x: 10, y: 10, w: 50, h: 25 }); // shrinking follows the side that moved
  assert.deepEqual(resizeBox(box, 'nw', 0, 25, { keepAspect: true }), { x: 60, y: 35, w: 50, h: 25 });
});

test('image fit, text wrap, filters and shapes', () => {
  const cover = fitImage(2000, 1000, 500, 500, { fit: 'cover', focusX: 0 });
  assert.deepEqual(cover, { sx: 0, sy: 0, sw: 1000, sh: 1000, dx: 0, dy: 0, dw: 500, dh: 500 });
  const contain = fitImage(2000, 1000, 500, 500, { fit: 'contain' });
  assert.equal(contain.dw, 500);
  assert.equal(contain.dh, 250);
  assert.equal(contain.dy, 125);
  assert.equal(fitImage(2000, 1000, 500, 500, { fit: 'cover', zoom: 2 }).sw, 500);
  assert.deepEqual(wrapText('one two three four', 9, (s) => s.length), ['one two', 'three', 'four']);
  assert.deepEqual(wrapText('a\n\nb', 99, (s) => s.length), ['a', '', 'b']);
  assert.equal(filterCSS(), 'none');
  assert.equal(filterCSS({ brightness: 50, contrast: 100, saturate: 100, hue: 10, blur: 4, grayscale: 0, sepia: 0, invert: 0 }, 0.5), 'brightness(0.5) hue-rotate(10deg) blur(2px)');
  assert.equal(shapePoints('star', 100, 100).length, 10);
  assert.equal(shapePoints('triangle', 10, 10).length, 3);
  assert.ok(MASKS.some(([k]) => k === 'person') && MASKS.some(([k]) => k === 'clip'));
});

test('saved designs round-trip through storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const d = newDoc({ name: 'Poster' });
  d.layers.push(newLayer('text', d));
  assert.ok(saveDesigns({ current: d.id, docs: [d] }, storage));
  const back = loadDesigns(storage);
  assert.equal(back.current, d.id);
  assert.equal(back.docs[0].layers[0].type, 'text');
  assert.deepEqual(loadDesigns({ getItem: () => 'nope' }), { current: null, docs: [] });
});

test('template dates', () => {
  assert.equal(daysUntil('2026-04-03', '2026-03-27'), 7);
  assert.equal(daysUntil('', '2026-03-27'), null);
  assert.equal(shortDate('2026-04-03'), 'FRI APR 3');
  assert.equal(shortDate('2026-04-03', { weekday: false }), 'APR 3');
  assert.equal(releaseWhen('2026-04-03', '2026-03-31'), 'FRIDAY');
  assert.equal(releaseWhen('2026-04-03', '2026-04-02'), 'TOMORROW');
  assert.equal(releaseWhen('2026-04-03', '2026-04-05'), 'NOW');
  assert.equal(releaseWhen('2026-05-20', '2026-04-01'), 'MAY 20');
});

test('every template builds a valid design', () => {
  const ctx = { band: { name: 'Arc Flash' }, song: { title: 'Static Bloom', releaseDate: '2026-04-03' }, show: { date: '2026-04-10', venue: 'El Corazon', city: 'Seattle', lineup: [{ name: 'Arc Flash' }, { name: 'Openers' }], price: '$15', doors: '7pm' }, dates: [{ date: '2026-04-10', city: 'Seattle', venue: 'El Corazon' }, { date: '2026-04-11', city: 'Portland' }], photo: { id: 'm1', w: 6000, h: 2000 }, today: '2026-03-27', colors: { accent: '#e0182d' } };
  assert.ok(TEMPLATES.length >= 8);
  for (const t of TEMPLATES) {
    const d = t.build(ctx);
    const n = normalizeDoc(d);
    assert.ok(n && n.layers.length >= 3, t.id);
    assert.equal(n.layers.length, d.layers.length, t.id);
  }
  const car = templateById('carousel').build(ctx);
  assert.equal(car.slides, 4);
  assert.equal(car.w, 4320);
  assert.equal(car.layers[0].mediaId, 'm1');
  assert.equal(templateById('carousel').build({ ...ctx, slides: 6 }).slides, 6);
  const cd = templateById('countdown').build(ctx);
  assert.ok(cd.layers.some((L) => L.text === '7'));
  assert.ok(cd.layers.some((L) => L.text === 'DAYS TO GO'));
  const set = countdownSet(ctx);
  assert.deepEqual(set.map((d) => d.layers.find((L) => L.name === 'Number').text), ['7', '3', '1', 'OUT']);
  assert.equal(countdownSet({ ...ctx, today: '2026-04-01' }).length, 2);
  const poster = templateById('show').build(ctx);
  assert.ok(poster.layers.some((L) => L.text === 'FRI APR 10'));
  assert.ok(poster.layers.some((L) => /WITH OPENERS/.test(L.text || '')));
  assert.equal(poster.layers[0].mask.type, 'fadeDown');
  const tour = templateById('tour').build(ctx);
  assert.ok(tour.layers.some((L) => L.text === 'PORTLAND'));
  const rel = templateById('release').build(ctx);
  assert.ok(rel.layers.some((L) => L.text === 'OUT APR 3'));
  // the logo replaces the band name when there is one
  const withLogo = templateById('countdown').build({ ...ctx, logo: { id: 'logo1', w: 600, h: 200 } });
  assert.ok(withLogo.layers.some((L) => L.mediaId === 'logo1' && L.fit === 'contain'));
});

test('stock photo results', () => {
  const px = parsePexelsPhotos({ photos: [{ id: 5, width: 4000, height: 6000, url: 'https://www.pexels.com/photo/5/', photographer: 'Ana', alt: 'crowd', src: { medium: 'm.jpg', large2x: 'l.jpg' } }] });
  assert.deepEqual([px[0].id, px[0].url, px[0].thumb, px[0].author, px[0].kind], ['pexels-p5', 'l.jpg', 'm.jpg', 'Ana', 'image']);
  const pb = parsePixabayPhotos({ hits: [{ id: 9, webformatURL: 'w.jpg', largeImageURL: 'L.jpg', imageWidth: 1, imageHeight: 2, user: 'u', pageURL: 'p', tags: 'smoke, stage' }] });
  assert.equal(pb[0].url, 'L.jpg');
  const wm = parseWikimediaPhotos({ query: { pages: { 1: { pageid: 1, index: 1, title: 'File:Stage.jpg', imageinfo: [{ url: 'big.jpg', thumburl: 'https://x/thumb/400px-Stage.jpg', mime: 'image/jpeg', width: 5000, height: 3000, descriptionurl: 'd', extmetadata: { Artist: { value: '<a href="x">Bob</a>' }, LicenseShortName: { value: 'CC BY 4.0' } } }] }, 2: { pageid: 2, index: 2, title: 'File:a.svg', imageinfo: [{ url: 'a.svg', mime: 'image/svg+xml' }] } } } });
  assert.equal(wm.length, 1);
  assert.equal(wm[0].author, 'Bob');
  assert.equal(wm[0].url, 'https://x/thumb/2400px-Stage.jpg');
  assert.equal(wm[0].license, 'CC BY 4.0');
});

const SONGS = [{ ...newSong('Static Bloom'), id: 's1', isrc: 'USAB12600001' }, { ...newSong('Undertow'), id: 's2' }];

test('stats file columns, dates and sources', () => {
  assert.deepEqual(toPeriod('2026-03'), '2026-03');
  assert.equal(toPeriod('2026-03-15T00:00'), '2026-03-15');
  assert.equal(toPeriod('Mar 2026'), '2026-03');
  assert.equal(toPeriod('03/2026'), '2026-03');
  assert.equal(toPeriod('3/15/2026'), '2026-03-15');
  assert.equal(toPeriod('soon'), '');
  const at = mapColumns(['Reporting Date', 'Sale Month', 'Store', 'Artist', 'Title', 'ISRC', 'UPC', 'Quantity', 'Team Percentage', 'Song/Album', 'Country of Sale', 'Earnings (USD)']);
  assert.equal(at.title, 4);
  assert.equal(at.streams, 7);
  assert.equal(at.earnings, 11);
  assert.equal(at.store, 2);
  assert.equal(at.date, 1); // the sale month, not the reporting date
  assert.equal(detectSource(['Reporting Date', 'Store', 'Title', 'Quantity', 'Team Percentage', 'Earnings (USD)']).label, 'DistroKid');
  assert.equal(detectSource(['song', 'listeners', 'streams', 'saves', 'release_date']).source, 's4a');
  assert.equal(detectSource(['date', 'streams']).source, 's4a');
  assert.equal(titleKey('Static Bloom (feat. Someone)'), titleKey('static bloom'));
  assert.equal(titleKey('Undertow - Remastered 2026'), 'undertow');
  assert.equal(matchSong(SONGS, { isrc: 'US-AB1-26-00001', title: 'nope' }).id, 's1');
  assert.equal(matchSong(SONGS, { title: 'UNDERTOW!' }).id, 's2');
  assert.equal(matchSong(SONGS, { title: 'Other' }), null);
});

test('importing a distributor report and Spotify for Artists', () => {
  const distro = 'Reporting Date\tSale Month\tStore\tArtist\tTitle\tISRC\tUPC\tQuantity\tTeam Percentage\tSong/Album\tCountry of Sale\tEarnings (USD)\n2026-04-02\t2026-02\tSpotify\tArc Flash\tStatic Bloom\tUSAB12600001\t1\t1000\t100\tSong\tUS\t3.10\n2026-04-02\t2026-02\tApple Music\tArc Flash\tStatic Bloom\tUSAB12600001\t1\t200\t100\tSong\tUS\t1.40\n2026-05-02\t2026-03\tSpotify\tArc Flash\tStatic Bloom\tUSAB12600001\t1\t1500\t100\tSong\tUS\t4.50\n2026-05-02\t2026-03\tSpotify\tArc Flash\tMystery Song\t\t1\t50\t100\tSong\tUS\t0.15\n';
  const res = parseStatsFile(distro, { filename: 'distrokid.tsv', songs: SONGS });
  assert.equal(res.kind.label, 'DistroKid');
  assert.equal(res.lines.length, 4);
  assert.equal(res.lines[0].songId, 's1');
  assert.equal(res.lines[0].date, '2026-02');
  const st = newStats();
  addImport(st, { filename: 'distrokid.tsv', ...res }, '2026-05-10T00:00:00Z');
  let sum = songStats(st, SONGS);
  const s1 = sum.rows.find((r) => r.id === 's1');
  assert.equal(s1.streams, 2700);
  assert.equal(s1.byStore.Spotify.streams, 2500);
  assert.equal(Math.round(s1.earnings * 100), 900);
  assert.deepEqual(s1.monthly, [['2026-02', 1200], ['2026-03', 1500]]);
  assert.deepEqual(sum.unmatched, [['Mystery Song', 50]]);
  assert.equal(sum.stores[0][0], 'Spotify');
  // re-importing the same file replaces it
  const again = addImport(st, { filename: 'distrokid.tsv', ...res });
  assert.ok(again.replaced);
  assert.equal(st.imports.length, 1);
  assert.equal(songStats(st, SONGS).total.streams, 2700); // unmatched rows aren't counted until matched
  assignTitle(st, 'mystery song', 's2');
  assert.equal(songStats(st, SONGS).rows.find((r) => r.id === 's2').streams, 50);
  // Spotify for Artists' running total is newer than the distributor's lagging Spotify rows
  const s4a = parseStatsFile('song,listeners,streams,saves,release_date\nStatic Bloom,900,4200,310,2026-01-09\n', { filename: 'songs.csv', songs: SONGS });
  addImport(st, { filename: 'songs.csv', ...s4a });
  sum = songStats(st, SONGS);
  const r1 = sum.rows.find((r) => r.id === 's1');
  assert.equal(r1.byStore.Spotify.streams, 4200);
  assert.equal(r1.listeners, 900);
  assert.equal(r1.saves, 310);
  assert.equal(r1.streams, 4400);
  // per-stream earnings use the distributor's own (paid) Spotify count, not the newer Spotify for Artists total
  assert.equal(sum.stores.find(([k]) => k === 'Spotify')[1].paid, 2550); // 2500 for Static Bloom + 50 for the title matched to Undertow
  assert.equal(Math.round(r1.perStream * 10000), Math.round((9 / 2700) * 10000));
  removeImport(st, st.imports[0].id);
  assert.equal(st.imports.length, 1);
});

test('a song timeline needs its song, and junk files say why', () => {
  assert.throws(() => parseStatsFile('date,streams\n2026-03-01,10\n', { songs: SONGS }), /Pick the song/);
  const tl = parseStatsFile('date,streams\n2026-03-01,10\n2026-03-02,15\n', { songs: SONGS, songId: 's2' });
  assert.equal(tl.lines.length, 2);
  assert.ok(tl.lines.every((l) => l.songId === 's2' && l.store === 'Spotify'));
  assert.throws(() => parseStatsFile('a,b\n1,2\n'), /streams, quantity or earnings/);
  assert.throws(() => parseStatsFile('only a header\n'), /no rows/);
});

test('live numbers and their history', () => {
  const st = normalizeStats({ history: 'x' });
  setLive(st, 's1', 'youtube', { views: 100, likes: 5 }, '2026-03-01T10:00:00Z');
  setLive(st, 's1', 'youtube', { views: 120, likes: 6 }, '2026-03-01T18:00:00Z');
  setLive(st, 's1', 'youtube', { views: 300, likes: 9 }, '2026-03-02T09:00:00Z');
  assert.equal(st.live.s1.youtube.views, 300);
  assert.deepEqual(trend(st, 's1', 'youtube.views'), [{ date: '2026-03-01', value: 120 }, { date: '2026-03-02', value: 300 }]);
  assert.equal(songStats(st, SONGS).total.youtube, 300);
  assert.match(lastfmURL('Arc Flash', 'Static Bloom', 'k1'), /method=track\.getInfo&artist=Arc\+Flash&track=Static\+Bloom&api_key=k1&format=json/);
  assert.deepEqual(parseLastfm({ track: { listeners: '12', playcount: '40', url: 'u' } }), { listeners: 12, plays: 40, url: 'u' });
  assert.equal(parseLastfm({ error: 6 }), null);
  assert.deepEqual(parseDeezerRank({ id: 1, rank: '123456', link: 'l' }), { rank: 123456, link: 'l' });
  assert.equal(parseDeezerRank({ error: {} }), null);
  assert.ok(ARTIST_KEYS.includes('stats'));
  assert.deepEqual(newManager().stats, newStats());
  assert.deepEqual(normalizeManager({ stats: { lines: [{ a: 1 }, 5] } }).stats.lines, [{ a: 1 }]);
});
