// The Link page (js/manager/linkbio.js): what goes on it, what never does, escaping, links, CSP,
// size, and band.linkInBio through backups and artist switches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, normalizeManager } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup, normalizeWorkspace } from '../js/manager/artists.js';
import { linkPageData, linkPageHTML, flyerHTML, safeHref, safeWebUrl, linkRelease, qrTarget, normalizeLinkInBio, newLinkInBio, byteSize, CSP } from '../js/manager/linkbio.js';
import { epkHTML } from '../js/manager/extras.js';

const TODAY = '2026-11-23';
const EVIL = '"><script>alert(1)</script>';
const MARK = 'PLANTED-SECRET-7731';

function band() {
  const m = newManager();
  m.band = { ...m.band, name: 'Arc Flash', genres: 'alt-metal', city: 'Seattle', bio: 'We are loud.\n\nSecond paragraph.', theme: 'bloodash', contactEmail: 'booking@arcflash.band', contactName: `Booker ${MARK}`, contactPhone: `555 ${MARK}`, links: { spotify: 'https://open.spotify.com/artist/abc', instagram: 'https://instagram.com/arcflash', tiktok: 'javascript:alert(1)' }, members: [{ id: 'mem1', name: `Drummer ${MARK}`, role: 'drums' }] };
  const old = { ...newSong('Old one'), status: 'released', releaseDate: '2026-01-10' };
  const s = { ...newSong('Static Bloom'), status: 'released', releaseDate: '2026-10-01', coverId: 'cov1', notes: `notes ${MARK}` };
  s.links = { ...s.links, spotify: 'https://open.spotify.com/track/1', apple: 'data:text/html,hi', bandcamp: 'https://arcflash.bandcamp.com/track/static-bloom?a=1&b=2' };
  s.pitches = [{ id: 'p1', curator: `Curator ${MARK}`, contact: `curator-${MARK}@x.com` }];
  const next = { ...newSong('Undertow'), status: 'ready', releaseDate: '2026-12-12' };
  m.songs = [old, s, next];
  m.shows = [
    { ...newShow('2026-12-01'), venue: 'The Crocodile', city: 'Seattle', status: 'confirmed', tickets: 'https://tix.example/1', notes: `show notes ${MARK}`, contact: `promoter ${MARK}`, deal: `deal ${MARK}` },
    { ...newShow('2026-12-05'), venue: 'Hold Venue', status: 'hold' },
    { ...newShow('2026-11-01'), venue: 'Past Venue', status: 'confirmed' },
    { ...newShow('2026-12-20'), venue: 'Second', city: 'Tacoma', status: 'confirmed', tickets: 'javascript:alert(1)' },
  ];
  m.contacts = [{ id: 'c1', name: `Contact ${MARK}`, email: `contact-${MARK}@x.com` }];
  m.venues = [{ id: 'v1', name: 'The Crocodile', email: `venue-${MARK}@x.com`, notes: MARK }];
  m.fans = [{ id: 'f1', name: `Fan ${MARK}`, email: `fan-${MARK}@x.com` }];
  m.outreach = [{ id: 'o1', name: `Blog ${MARK}`, contact: `${MARK}@blog.com` }];
  m.availability = [{ id: 'a1', who: `Bandmate ${MARK}` }];
  m.band.linkInBio = { ...newLinkInBio(), merchUrl: 'https://arcflash.bandcamp.com/merch', address: 'https://arcflash.netlify.app', buttons: [{ id: 'b1', label: 'Pre-save Undertow', url: 'https://distrokid.com/hyperfollow/x' }, { id: 'b2', label: 'Bad', url: 'javascript:alert(1)' }, { id: 'b3', label: '', url: 'mailto:hi@arcflash.band' }] };
  return m;
}

test('safeHref allows https, http and mailto only', () => {
  assert.equal(safeHref('https://a.b/c?d=1&e=2'), 'https://a.b/c?d=1&e=2');
  assert.equal(safeHref(' http://a.b '), 'http://a.b');
  assert.equal(safeHref('mailto:x@y.z'), 'mailto:x@y.z');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'vbscript:x', '//evil.com', 'https://a.b/"><script>', "https://a.b/'x", 'ftp://a.b', 'mailto:javascript:alert(1)', 'https://a b', '', null]) assert.equal(safeHref(bad), '', String(bad));
  assert.equal(safeWebUrl('mailto:x@y.z'), '', 'the page address must be a web address');
});

test('the page holds the newest release, confirmed upcoming shows, merch, socials and buttons', () => {
  const d = linkPageData(band(), { today: TODAY });
  assert.equal(d.release.title, 'Static Bloom');
  assert.equal(d.release.coverId, 'cov1');
  assert.deepEqual(d.release.links.map(([l]) => l), ['Spotify', 'Bandcamp'], 'the data: link is dropped');
  assert.deepEqual(d.shows.map((s) => s.venue), ['The Crocodile', 'Second']);
  assert.equal(d.shows[1].tickets, '', 'a javascript: ticket link is dropped');
  assert.deepEqual(d.socials.map(([l]) => l), ['Spotify', 'Instagram']);
  assert.deepEqual(d.buttons, [['Pre-save Undertow', 'https://distrokid.com/hyperfollow/x'], ['hi@arcflash.band', 'mailto:hi@arcflash.band']]);
  assert.equal(d.email, '', 'the contact email is off by default');
  assert.equal(d.bio, 'We are loud.');
  assert.deepEqual(d.qr, { url: 'https://arcflash.netlify.app', kind: 'address' });
  const html = linkPageHTML(d);
  assert.ok(html.includes('https://arcflash.bandcamp.com/track/static-bloom?a=1&amp;b=2'));
  assert.ok(html.includes('>Merch<'));
  assert.ok(html.includes('<svg'), 'the QR code is on the page');
});

test('settings: shows count, release pick, upcoming release, toggles, email', () => {
  const m = band();
  m.band.linkInBio = { ...m.band.linkInBio, shows: 1, songId: m.songs[2].id, socials: false, showEmail: true, release: true };
  const d = linkPageData(m, { today: TODAY });
  assert.equal(d.shows.length, 1);
  assert.equal(d.release.title, 'Undertow');
  assert.equal(d.release.upcoming, true);
  assert.ok(linkPageHTML(d).includes('New release'));
  assert.deepEqual(d.socials, []);
  assert.equal(d.email, 'booking@arcflash.band');
  assert.ok(linkPageHTML(d).includes('href="mailto:booking@arcflash.band"'));
  m.band.linkInBio.release = false;
  assert.equal(linkPageData(m, { today: TODAY }).release, null);
  // no song out yet: the next one coming
  const n = newManager();
  n.songs = [{ ...newSong('Soon'), releaseDate: '2027-01-01' }];
  assert.equal(linkRelease(n, TODAY).title, 'Soon');
  assert.equal(linkRelease(newManager(), TODAY), null);
});

test('QR target: the address, else the Spotify link when ticked, else none', () => {
  const m = band();
  m.band.linkInBio.address = '';
  assert.equal(qrTarget(m.band), null);
  m.band.linkInBio.qrSpotify = true;
  assert.deepEqual(qrTarget(m.band), { url: 'https://open.spotify.com/artist/abc', kind: 'spotify' });
  m.band.linkInBio.address = 'javascript:alert(1)';
  assert.equal(qrTarget(m.band).kind, 'spotify', 'a bad address is ignored');
  const d = linkPageData({ ...m, band: { ...m.band, linkInBio: { ...m.band.linkInBio, qrSpotify: false } } }, { today: TODAY });
  assert.ok(!linkPageHTML(d).includes('<svg'), 'no QR without a target');
});

test('hostile names and links are escaped or dropped, and the file has no script', () => {
  const m = band();
  m.band.name = EVIL;
  m.band.genres = EVIL;
  m.band.linkInBio.bio = EVIL;
  m.songs[1].title = EVIL;
  m.shows[0].venue = EVIL;
  m.shows[0].city = EVIL;
  m.band.linkInBio.buttons = [{ id: 'x', label: EVIL, url: 'https://ok.example/"onmouseover="alert(1)' }, { id: 'y', label: EVIL, url: 'https://ok.example/' }];
  m.band.linkInBio.address = 'https://ok.example/?q=<script>';
  const d = linkPageData(m, { today: TODAY });
  for (const html of [linkPageHTML(d, { cover: 'data:image/svg+xml;base64,PHN2Zz4=', photo: 'javascript:alert(1)' }), flyerHTML(d, { photo: 'data:text/html;base64,AAAA' })]) {
    assert.ok(!/<script/i.test(html), 'no script tag');
    assert.ok(!/javascript:/i.test(html), 'no javascript: link');
    assert.ok(!/data:(?!image\/(png|jpeg|webp))/i.test(html.replace(/img-src data:/, '')), 'no other data: URL');
    assert.ok(!/\son\w+=/i.test(html), 'no event handler attribute');
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'), 'the text is escaped, not dropped');
  }
  assert.equal(d.buttons.length, 1, 'the link with a quote in it is dropped');
  assert.equal(d.qr, null, 'an address with < is not used');
});

test('the page carries a strict Content-Security-Policy and rel=noopener noreferrer on every link', () => {
  const html = linkPageHTML(linkPageData(band(), { today: TODAY }));
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`));
  assert.match(CSP, /^default-src 'none'; style-src 'unsafe-inline'; img-src data: https:/);
  const anchors = html.match(/<a\b[^>]*>/g);
  assert.ok(anchors.length >= 8);
  for (const a of anchors) {
    assert.match(a, /rel="noopener noreferrer"/);
    assert.match(a, /href="(https?:|mailto:)/);
  }
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<style>'), 'the policy comes first');
});

test('planted personal data never reaches the link page, the flyer or the press kit', () => {
  const m = band();
  m.band.linkInBio.showEmail = true;
  const d = linkPageData(m, { today: TODAY });
  const docs = [linkPageHTML(d), flyerHTML(d), JSON.stringify(d)];
  for (const doc of docs) assert.ok(!doc.includes(MARK), 'marker found in a generated document');
  // the press kit lists members, contact name and phone on purpose, but never fans, contacts, venues or outreach
  const epk = epkHTML({ ...m, band: { ...m.band, members: [], contactName: '', contactPhone: '' } }, { today: TODAY });
  assert.ok(!epk.includes(MARK));
});

test('size: two downscaled photos keep the page under 200 KB', () => {
  const jpeg = `data:image/jpeg;base64,${'A'.repeat(70 * 1024)}`;
  const html = linkPageHTML(linkPageData(band(), { today: TODAY }), { cover: jpeg, photo: `data:image/jpeg;base64,${'B'.repeat(24 * 1024)}` });
  assert.ok(byteSize(html) < 200 * 1024, `${byteSize(html)} bytes`);
  assert.ok(html.includes('class="pic"') && html.includes('cover art'));
});

test('light and dark use the band theme colours', () => {
  const m = band();
  const dark = linkPageData(m, { today: TODAY });
  assert.equal(dark.colors.accent, '#e0182d');
  m.band.linkInBio.mode = 'light';
  const light = linkPageData(m, { today: TODAY });
  assert.notEqual(light.colors.bg, dark.colors.bg);
  m.band.theme = 'doom';
  assert.equal(linkPageData({ ...m, band: { ...m.band, linkInBio: { mode: 'dark' } } }, { today: TODAY }).colors.accent, '#c08a3e');
});

test('normalizeLinkInBio checks every field and drops bad buttons', () => {
  assert.deepEqual(normalizeLinkInBio(null), newLinkInBio());
  assert.deepEqual(normalizeLinkInBio([1]), newLinkInBio());
  const n = normalizeLinkInBio({ shows: 99, mode: 'neon', photo: 'yes', buttons: [null, { id: 3 }, { id: 'a', label: 5, url: 'https://x.y' }, ...Array.from({ length: 20 }, (_, i) => ({ id: `k${i}`, label: 'l', url: '' }))], evil: 1 });
  assert.equal(n.shows, 10);
  assert.equal(n.mode, 'dark');
  assert.equal(n.photo, true);
  assert.equal(n.buttons.length, 12);
  assert.deepEqual(n.buttons[0], { id: 'a', label: '', url: 'https://x.y' });
  assert.ok(!('evil' in n));
  assert.equal(normalizeLinkInBio({ shows: '0' }).shows, 0);
  // the manager normaliser runs it on band.linkInBio, and leaves it absent until first used
  assert.equal(normalizeManager({ band: { name: 'x' } }).band.linkInBio, undefined);
  assert.equal(normalizeManager({ band: { linkInBio: { shows: -4 } } }).band.linkInBio.shows, 0);
});

test('round trip: band.linkInBio survives backup, restore and switching artists', () => {
  const m = band();
  const ws = workspaceFrom(normalizeManager(JSON.parse(JSON.stringify(m))));
  const li = ws.artists[0].band.linkInBio;
  assert.equal(li.buttons.length, 3);
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0].band.linkInBio, li);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(ws))).artists[0].band.linkInBio, li);
  const [ws2, id2] = addArtist(ws, 'Other band');
  assert.equal(viewOf(ws2, id2).band.linkInBio, undefined, 'a new artist starts without link settings');
  const v2 = viewOf(ws2, id2);
  v2.band.linkInBio = { ...newLinkInBio(), address: 'https://other.example' };
  const ws3 = mergeView({ ...ws2, current: id2 }, v2);
  assert.deepEqual(viewOf(ws3, ws.current).band.linkInBio, li, 'the first artist keeps its own settings');
  assert.equal(viewOf(ws3, id2).band.linkInBio.address, 'https://other.example');
  assert.deepEqual(parseWorkspaceBackup(workspaceBackup(ws3)).artists.map((a) => a.band.linkInBio?.address), ['https://arcflash.netlify.app', 'https://other.example']);
});
