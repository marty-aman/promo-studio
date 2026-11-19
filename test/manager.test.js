import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, addDays, daysBetween, taskDue, agenda, overdueTasks, nextUp, releaseProgress, normalizeManager, backupFile, parseBackup, RELEASE_TEMPLATE } from '../js/manager/model.js';
import { shootIdeas, hookLines, planPosts } from '../js/manager/ideas.js';
import { callSheetHTML } from '../js/manager/page-shoot.js';
import { showNet, showSummary } from '../js/manager/page-shows.js';

const LYRICS = 'And the static in my veins\nWe light it up tonight\nBURN IT DOWN!\nWe light it up tonight';

test('dates are plain local days', () => {
  assert.equal(addDays('2026-11-28', 5), '2026-12-03');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-18', '2026-12-04'), 16);
  assert.equal(addDays('', 3), '');
});

test('the release checklist counts back from release day and moves with it', () => {
  const s = newSong('Static');
  assert.equal(s.release.length, RELEASE_TEMPLATE.length);
  assert.equal(taskDue(s, s.release[0]), ''); // no date yet
  s.releaseDate = '2026-12-04';
  const upload = s.release.find((t) => /distributor/.test(t.text));
  assert.equal(taskDue(s, upload), '2026-10-30'); // 35 days before
  const pitch = s.release.find((t) => /Spotify editorial/.test(t.text));
  assert.ok(daysBetween(taskDue(s, pitch), s.releaseDate) >= 7); // Spotify needs 7+ days
  s.releaseDate = '2027-01-08';
  assert.equal(taskDue(s, upload), '2026-12-04');
  const fixed = { id: 'x', date: '2026-11-20', offset: 0, text: 'Merch order', cat: 'other', done: false };
  assert.equal(taskDue(s, fixed), '2026-11-20');
});

test('home: agenda, overdue tasks and what is next', () => {
  const m = newManager();
  const s = newSong('Static');
  s.releaseDate = '2026-11-25';
  s.shoot.date = '2026-11-20';
  m.songs.push(s);
  const show = { ...newShow('2026-11-21'), venue: 'Funhouse', status: 'confirmed', setTime: '21:30' };
  const cancelled = { ...newShow('2026-11-22'), venue: 'Gone', status: 'cancelled' };
  m.shows.push(show, cancelled);
  m.posts.push({ id: 'p1', songId: s.id, date: '2026-11-19', title: 'Countdown', platform: 'TikTok', status: 'idea' }, { id: 'p2', songId: s.id, date: '2026-11-19', title: 'Done', status: 'posted' });
  const a = agenda(m, '2026-11-18', 14);
  const kinds = a.map((x) => `${x.date}:${x.kind}`);
  assert.ok(kinds.includes('2026-11-21:show') && kinds.includes('2026-11-25:release') && kinds.includes('2026-11-20:shoot') && kinds.includes('2026-11-19:post'));
  assert.ok(!a.some((x) => x.title === 'Gone' || x.title === 'Done'));
  assert.deepEqual(a.map((x) => x.date), [...a.map((x) => x.date)].sort());
  assert.equal(a.find((x) => x.kind === 'show').ref.id, show.id);
  const late = overdueTasks(m, '2026-11-18');
  assert.ok(late.length > 5 && late[0].due <= late[1].due);
  s.release.forEach((t) => (t.done = true));
  assert.equal(overdueTasks(m, '2026-11-18').length, 0);
  assert.deepEqual(releaseProgress(s), { done: s.release.length, total: s.release.length });
  const nx = nextUp(m, '2026-11-18');
  assert.equal(nx.release.id, s.id);
  assert.equal(nx.show.id, show.id);
});

test('backups round-trip, bad files are refused, old saves are filled in', () => {
  const m = newManager();
  m.songs.push(newSong('A'));
  m.shows.push(newShow('2026-12-01'));
  const back = parseBackup(backupFile(m));
  assert.equal(back.songs[0].title, 'A');
  assert.equal(back.shows[0].date, '2026-12-01');
  assert.throws(() => parseBackup('nope'), /isn’t a band manager backup/);
  assert.throws(() => parseBackup('{"songs":[]}'), /isn’t a band manager backup/);
  const old = normalizeManager({ songs: [{ id: 's1', title: 'Old' }, { title: 'no id' }, 'junk'], shows: [{ id: 'x', date: '2026-01-01' }] });
  assert.equal(old.songs.length, 1);
  assert.ok(old.songs[0].release.length && old.songs[0].shoot.shots && old.songs[0].links);
  assert.ok(old.shows[0].settlement && Array.isArray(old.shows[0].lineup));
  assert.equal(old.band.city, 'Seattle');
});

test('shoot ideas come from the lyrics, with the matched words; hooks and the post plan', () => {
  const ideas = shootIdeas(LYRICS, 'Static');
  assert.equal(ideas[0].id, 'fire');
  assert.ok(ideas[0].words.includes('burn'));
  assert.ok(ideas.some((c) => c.id === 'machine' && c.words.includes('static')));
  assert.deepEqual(ideas.slice(-2).map((c) => c.id), ['live', 'onetake']); // always offered
  assert.equal(shootIdeas('', '').length, 2);
  assert.equal(hookLines(LYRICS)[0], 'We light it up tonight'); // repeated line first
  const s = { ...newSong('Static'), releaseDate: '2026-12-04', lyrics: LYRICS };
  const posts = planPosts(s);
  assert.ok(posts.length >= 10);
  assert.ok(posts.every((p) => p.songId === s.id && p.status === 'idea' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)));
  assert.ok(posts.some((p) => p.date === '2026-12-04')); // release day
  assert.ok(posts[0].date < '2026-12-04');
  assert.deepEqual(planPosts(newSong('No date')), []);
});

test('call sheet escapes what you typed; show money and summary', () => {
  const s = newSong('<Static>');
  s.shoot.concept = 'Fire & <smoke>';
  s.shoot.crew = [{ id: 'c', role: 'Camera', name: 'Sam', contact: 'sam@example.com' }];
  const html = callSheetHTML({ name: 'Arc Flash' }, s);
  assert.ok(html.includes('&lt;Static&gt;') && html.includes('Fire &amp; &lt;smoke&gt;') && html.includes('sam@example.com'));
  assert.ok(!html.includes('<smoke>'));
  const sh = { ...newShow('2026-12-12'), venue: 'El Corazon', city: 'Seattle', doors: '19:00', setTime: '21:00', lineup: [{ id: 'a', name: 'Arc Flash', time: '21:00' }], setlist: 'Static\nArc Flash', settlement: { gross: '', pay: '150', merch: '220', costs: '60' } };
  assert.equal(showNet(sh), 310);
  const txt = showSummary(sh);
  assert.match(txt, /El Corazon, Seattle/);
  assert.match(txt, /Doors 19:00 · We play 21:00/);
  assert.match(txt, /Setlist: Static \/ Arc Flash/);
});

// ---- show planner
import { venueFromSeed, bandFromSeed, mergeSeed, filterVenues, venueFit, pitchEmail, mailtoLink, showTodo, todoDue, breakEven } from '../js/manager/planner.js';
import { SEED_VENUES } from '../js/manager/seed.js';

test('starter venues are checked and trimmed; bad links and emails are dropped', () => {
  const v = venueFromSeed({ id: 'x', name: ' Room ', city: 'Seattle', capacity: 200, size: 'small', ages: '21+', website: 'javascript:alert(1)', instagram: 'https://www.instagram.com/room/', booking: { email: 'not an email', formUrl: 'https://room.example/book', how: 'Email us' }, sources: ['https://a.example/', 'ftp://b'] });
  assert.equal(v.id, 'seed-v-x');
  assert.equal(v.name, 'Room');
  assert.equal(v.website, '');
  assert.equal(v.instagram, 'https://www.instagram.com/room/');
  assert.equal(v.bookingEmail, '');
  assert.equal(v.bookingForm, 'https://room.example/book');
  assert.deepEqual(v.sources, ['https://a.example/']);
  assert.equal(v.verified, false);
  const b = bandFromSeed({ id: 'y', name: 'Band', socials: { instagram: 'https://www.instagram.com/band/', tiktok: 'tiktok.com/@nope' } });
  assert.equal(b.socials.instagram, 'https://www.instagram.com/band/');
  assert.equal(b.socials.tiktok, '');
});

test('the researched venue list loads cleanly', () => {
  const list = SEED_VENUES.map(venueFromSeed);
  assert.ok(list.length >= 20);
  assert.ok(list.every((v) => v.name && v.city && v.sources.length));
  assert.equal(new Set(list.map((v) => v.id)).size, list.length);
  assert.ok(list.filter((v) => v.bookingEmail || v.bookingForm).length >= 12);
});

test('seeding merges once and keeps your edits; filters and room fit', () => {
  const seeds = [venueFromSeed({ id: 'a', name: 'A', city: 'Seattle', capacity: 100, size: 'small', ages: 'all ages' }), venueFromSeed({ id: 'b', name: 'B', city: 'Tacoma', capacity: 800, size: 'large', ages: '21+', genres: ['metal'] })];
  const mine = [{ ...seeds[0], myNotes: 'talked to Sam' }];
  const merged = mergeSeed(mine, seeds);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].myNotes, 'talked to Sam');
  assert.deepEqual(filterVenues(merged, { ages: 'all' }).map((v) => v.name), ['A']);
  assert.deepEqual(filterVenues(merged, { q: 'metal' }).map((v) => v.name), ['B']);
  assert.deepEqual(filterVenues(merged, { city: 'Tacoma', size: 'large' }).map((v) => v.name), ['B']);
  assert.equal(venueFit(seeds[0], 70), 'good');
  assert.equal(venueFit(seeds[1], 70), 'too big');
  assert.equal(venueFit(seeds[1], 300), 'stretch');
  assert.equal(venueFit({ capacity: null }, 50), '');
});

test('pitch email has what bookers ask for, and a working mailto link', () => {
  const venue = venueFromSeed({ id: 'e', name: 'El Corazon', booking: { email: 'booking@elcorazonseattle.com', person: 'Dana (booking@); Kevin' } });
  const p = pitchEmail({ band: { name: 'Arc Flash', genres: 'alt-metal, emocore', city: 'Seattle' }, venue, dates: ['Fri Jan 16'], draw: '40', lineup: ['Band B'], links: ['https://open.spotify.com/track/x'], similar: 'Bad Omens' });
  assert.equal(p.to, 'booking@elcorazonseattle.com');
  assert.match(p.subject, /Arc Flash · Fri Jan 16/);
  assert.match(p.body, /^Hi Dana,/);
  for (const s of ['an alt-metal, emocore band from Seattle', 'For fans of Bad Omens.', 'Fri Jan 16', 'Band B', 'around 40 people', 'https://open.spotify.com/track/x']) assert.ok(p.body.includes(s), s);
  assert.ok(!/\n\n\n/.test(p.body));
  const link = mailtoLink(p);
  assert.ok(link.startsWith('mailto:booking%40elcorazonseattle.com?subject=Booking%20inquiry'));
  assert.equal(decodeURIComponent(link.split('body=')[1]), p.body);
});

test('show to-do list counts back from the show; break-even tickets', () => {
  const t = showTodo();
  const show = { date: '2026-12-12' };
  assert.equal(todoDue(show, t[0]), '2026-10-13');
  assert.equal(todoDue(show, t.find((x) => x.offset === 0)), '2026-12-12');
  assert.equal(todoDue({ date: '' }, t[0]), '');
  assert.equal(breakEven({ price: 15, share: 0.7, costs: 210 }), 20);
  assert.equal(breakEven({ price: 0, share: 1, costs: 50 }), null);
  assert.equal(breakEven({ price: 10, share: 1, costs: 0 }), 0);
});

test('show to-dos show up on Home and in the overdue list', () => {
  const m = newManager();
  m.shows.push({ ...newShow('2026-11-25'), venue: 'Funhouse', status: 'confirmed', todo: showTodo() });
  const a = agenda(m, '2026-11-18', 14);
  assert.ok(a.some((x) => x.kind === 'task' && /Advance the show/.test(x.title)));
  const late = overdueTasks(m, '2026-11-18');
  assert.ok(late.some((x) => x.show && /Pitch the venue/.test(x.task.text)));
});

// ---- content and insights
import { parseLink, isYouTube, isoDuration, parseYouTube, fetchYouTubeStats, youtubeStatsUrl, postMetrics, compare, findings, parseCSV, importRows, matchImport } from '../js/manager/content.js';

test('links: which app, and the video id', () => {
  assert.deepEqual(parseLink('https://youtube.com/shorts/abcDEF12345?feature=share'), { platform: 'Shorts', id: 'abcDEF12345' });
  assert.deepEqual(parseLink('https://www.youtube.com/watch?v=abcDEF12345&t=3'), { platform: 'YouTube', id: 'abcDEF12345' });
  assert.deepEqual(parseLink('https://youtu.be/abcDEF12345'), { platform: 'YouTube', id: 'abcDEF12345' });
  assert.deepEqual(parseLink('https://www.tiktok.com/@arcflash/video/7501082162368662827'), { platform: 'TikTok', id: '7501082162368662827' });
  assert.deepEqual(parseLink('https://www.instagram.com/reel/C9xYz/'), { platform: 'Reels', id: 'C9xYz' });
  assert.deepEqual(parseLink('not a link'), { platform: '', id: '' });
  assert.ok(isYouTube('https://youtube.com/shorts/abcDEF12345'));
  assert.ok(!isYouTube('https://www.tiktok.com/@a/video/1'));
  assert.equal(isoDuration('PT1M5S'), 65);
  assert.equal(isoDuration('PT45S'), 45);
});

test('YouTube stats are parsed, batched by 50, and key errors explained', async () => {
  const item = (id, v) => ({ id, statistics: { viewCount: String(v), likeCount: '10', commentCount: '2' }, contentDetails: { duration: 'PT30S' }, snippet: { title: 'T', publishedAt: '2026-11-01T10:00:00Z' } });
  const got = parseYouTube({ items: [item('aaaaaaaaaaa', 1000)] }, 'now');
  assert.deepEqual(got.aaaaaaaaaaa, { views: 1000, likes: 10, comments: 2, shares: null, saves: null, length: 30, title: 'T', publishedAt: '2026-11-01', source: 'youtube', fetchedAt: 'now' });
  assert.match(youtubeStatsUrl(['a', 'b'], 'K&Y'), /id=a,b&key=K%26Y$/);
  const calls = [];
  const ids = Array.from({ length: 60 }, (_, i) => `id${String(i).padStart(9, '0')}`);
  const fake = async (url) => {
    calls.push(url);
    const asked = new URL(url).searchParams.get('id').split(',');
    return { ok: true, status: 200, json: async () => ({ items: asked.map((x) => item(x, 5)) }) };
  };
  const all = await fetchYouTubeStats(ids, 'k', fake);
  assert.equal(calls.length, 2);
  assert.equal(Object.keys(all).length, 60);
  const bad = async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) });
  await assert.rejects(fetchYouTubeStats(['x'], 'k', bad), /quota/);
});

test('engagement per post, groups ranked by sends and saves, and findings', () => {
  assert.equal(postMetrics(null), null);
  assert.equal(postMetrics({ views: 0, likes: 3 }), null);
  const mt = postMetrics({ views: 1000, likes: 50, comments: 10, shares: 20, saves: 20, avgWatch: 9, length: 12 });
  assert.equal(mt.engagement, 0.1);
  assert.equal(mt.sharesPer1k, 20);
  assert.equal(mt.watched, 0.75);
  const P = (format, platform, date, s) => ({ id: `${format}${date}`, format, platform, date, title: format, stats: s });
  const posts = [
    P('learnriff', 'TikTok', '2026-11-02', { views: 2000, likes: 100, comments: 20, shares: 80, saves: 60 }),
    P('learnriff', 'TikTok', '2026-11-09', { views: 1500, likes: 80, comments: 10, shares: 50, saves: 40 }),
    P('countdown', 'Reels', '2026-11-03', { views: 3000, likes: 90, comments: 5, shares: 3, saves: 2 }),
    P('countdown', 'Reels', '2026-11-10', { views: 2500, likes: 60, comments: 4, shares: 2, saves: 1 }),
    P('bts', 'Shorts', '2026-11-04', { views: 800, likes: 30, comments: 6, shares: 4, saves: 2 }),
    P('rate', 'TikTok', '2026-11-05', null),
  ];
  const fmt = compare(posts, 'format');
  assert.ok(/riff/i.test(fmt[0].key));
  assert.equal(fmt.find((g) => /riff/i.test(g.key)).n, 2);
  assert.ok(!fmt.some((g) => /rate/i.test(g.key))); // no stats, not counted
  assert.equal(compare(posts, 'platform')[0].key, 'TikTok');
  const fd = findings(posts);
  assert.ok(fd.ready && fd.count === 5);
  assert.match(fd.lines[0].text, /riff/i);
  assert.match(fd.lines[0].text, /× the shares, saves and comments per view/);
  assert.ok(fd.lines.some((l) => l.kind === 'top' && /3,000 views on Reels/.test(l.text)));
  assert.equal(findings(posts.slice(0, 2)).ready, false);
});

test('analytics CSV: quoted cells, k/M numbers, columns by name, matched to posts by link', () => {
  assert.deepEqual(parseCSV('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  const csv = '\uFEFFVideo title,Video link,Post time,Total views,Total likes,Total comments,Total shares,Add to Favorites\n"Riff, part 2",https://www.tiktok.com/@arcflash/video/111,2026-11-02 18:00,1.2K,"1,050",33,40,12\nOther,https://www.tiktok.com/@arcflash/video/222,11/03/2026,900,10,1,0,0\n';
  const rows = importRows(csv, 'now');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { url: 'https://www.tiktok.com/@arcflash/video/111', title: 'Riff, part 2', date: '2026-11-02', stats: { views: 1200, likes: 1050, comments: 33, shares: 40, saves: 12, avgWatch: null, length: null, source: 'csv', fetchedAt: 'now' } });
  assert.equal(rows[1].date, '2026-11-03');
  const posts = [{ id: 'p1', url: 'https://www.tiktok.com/@arcflash/video/111?is_from_webapp=1' }];
  const { matched, fresh } = matchImport(posts, rows);
  assert.deepEqual(matched.map((x) => x.postId), ['p1']);
  assert.equal(fresh.length, 1);
  assert.throws(() => importRows('a,b\n1,2'), /views/);
  const ig = importRows('Permalink;Publish time;Views;Likes;Comments;Shares;Saves\nhttps://www.instagram.com/reel/AbC/;2026-11-05T19:00:00;4300;210;12;30;44\n');
  assert.equal(ig[0].stats.saves, 44);
});

// ---- calendar, press kit, money
import { monthGrid, monthStart, managerICS, epkHTML, shortBio, moneyLines, moneySummary, releaseSpend, newEntry } from '../js/manager/extras.js';

test('month grid starts on Monday and covers the whole month', () => {
  const w = monthGrid('2026-11-18');
  assert.equal(w[0][0], '2026-10-26'); // Nov 1 2026 is a Sunday
  assert.ok(w.flat().includes('2026-11-30'));
  assert.ok(w.every((x) => x.length === 7));
  assert.equal(monthStart('2026-11-18', 1), '2026-12-01');
  assert.equal(monthStart('2026-01-05', -1), '2025-12-01');
});

test('ics export: timed shows and shoots, all-day items, escaped text', () => {
  const m = newManager();
  m.band.name = 'Arc Flash';
  const s = { ...newSong('Static; Part 1'), releaseDate: '2026-12-04' };
  s.shoot.date = '2026-11-22';
  s.shoot.callTime = '09:30';
  m.songs.push(s);
  m.shows.push({ ...newShow('2026-11-28'), venue: 'The Funhouse', city: 'Seattle', setTime: '21:30', status: 'confirmed' });
  const ics = managerICS(m, { from: '2026-11-18', days: 30, stamp: new Date('2026-11-18T12:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261128T213000') && ics.includes('DTEND:20261128T223000'));
  assert.ok(ics.includes('LOCATION:The Funhouse\\, Seattle'));
  assert.ok(ics.includes('DTSTART:20261122T093000'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261204') && ics.includes('DTEND;VALUE=DATE:20261205'));
  assert.ok(ics.includes('Static\\; Part 1'));
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
});

test('press kit escapes everything and only links safe URLs', () => {
  const m = newManager();
  Object.assign(m.band, { name: 'Arc <Flash>', bio: 'We are loud.\n\nSecond para.', links: { spotify: 'https://open.spotify.com/artist/x', website: 'javascript:alert(1)' }, press: [{ id: 'p', quote: 'Huge <b>riffs</b>', source: 'The Stranger' }], contactEmail: 'band@example.com' });
  m.songs.push({ ...newSong('Static'), releaseDate: '2026-12-04', links: { spotify: 'https://open.spotify.com/track/y', youtube: '', bandcamp: '', apple: '' } });
  m.shows.push({ ...newShow('2026-12-12'), venue: 'El Corazon', status: 'confirmed' }, { ...newShow('2026-10-01'), venue: 'Funhouse', status: 'played' });
  const html = epkHTML(m, { today: '2026-11-18', photos: ['data:image/jpeg;base64,AAAA', 'javascript:x'] });
  assert.ok(html.includes('<h1>Arc &lt;Flash&gt;</h1>'));
  assert.ok(html.includes('Huge &lt;b&gt;riffs&lt;/b&gt;'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="https://open.spotify.com/artist/x"') && html.includes('href="https://open.spotify.com/track/y"'));
  assert.ok(html.includes('El Corazon') && html.includes('<h2>Has played</h2><p>Funhouse</p>'));
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.equal(shortBio('One. Two.'), 'One. Two.');
  assert.ok(shortBio('A'.repeat(100) + '. ' + 'B'.repeat(300), 280).endsWith('.'));
});

test('money: ledger plus show settlements, totals by category and month, release spend', () => {
  const m = newManager();
  const s = newSong('Static');
  s.shoot.budget = '$400';
  m.songs.push(s);
  m.money.push({ ...newEntry('expense', '2026-11-02'), amount: '250', category: 'video', songId: s.id }, { ...newEntry('income', '2026-11-20'), amount: '42.5', category: 'streaming' });
  m.shows.push({ ...newShow('2026-11-28'), venue: 'Funhouse', settlement: { gross: '', pay: 150, merch: '90', costs: '40' } });
  const lines = moneyLines(m);
  assert.equal(lines.length, 5);
  const sum = moneySummary(lines, { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(sum.income, 282.5);
  assert.equal(sum.expense, 290);
  assert.equal(sum.net, -7.5);
  assert.deepEqual(sum.byMonth.map((x) => x[0]), ['2026-11']);
  assert.ok(sum.byCat.some(([k, i]) => k === 'merch' && i === 90));
  assert.deepEqual(releaseSpend(m, s), { spent: 250, budget: 400, left: 150 });
  assert.equal(moneySummary(lines, { from: '2027-01-01', to: '2027-12-31' }).net, 0);
});

import { SEED_BANDS } from '../js/manager/seed.js';
test('the scene band list loads cleanly, with no venue or listing-site accounts', () => {
  const list = SEED_BANDS.map(bandFromSeed);
  assert.ok(list.length >= 30);
  assert.equal(new Set(list.map((b) => b.id)).size, list.length);
  assert.ok(list.every((b) => b.name && b.sources.length));
  const links = list.flatMap((b) => Object.values(b.socials)).filter(Boolean);
  assert.ok(links.length > list.length);
  assert.ok(!links.some((u) => /do206|Do206Seattle|elcorazon/i.test(u)));
  assert.ok(list.filter((b) => b.socials.instagram).length >= 25);
});

// ---- several artists
import { workspaceFrom, normalizeWorkspace, viewOf, mergeView, addArtist, removeArtist, artistList, combinedAgenda, combinedNext, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';

test('an old single-artist save becomes the first artist, nothing lost', () => {
  const m = newManager();
  m.songs.push({ ...newSong('Static'), releaseDate: '2026-12-04' });
  m.venues.push({ id: 'v1', name: 'Funhouse' });
  m.contacts.push({ id: 'c1', name: 'Sam' });
  const ws = normalizeWorkspace(JSON.parse(JSON.stringify(m)));
  assert.equal(ws.artists.length, 1);
  assert.equal(ws.artists[0].band.name, 'Arc Flash');
  assert.equal(ws.artists[0].songs[0].title, 'Static');
  assert.equal(ws.shared.venues[0].name, 'Funhouse');
  const v = viewOf(ws);
  assert.equal(v.artistId, ws.current);
  assert.equal(v.songs[0].title, 'Static');
  assert.equal(v.contacts[0].name, 'Sam');
});

test('artists keep their own songs and shows but share venues, bands and contacts', () => {
  let ws = workspaceFrom(newManager());
  const first = ws.current;
  let [next, second] = addArtist(ws, ' Static Ritual ', 'Tacoma');
  ws = next;
  assert.deepEqual(artistList(ws).map((a) => a.name), ['Arc Flash', 'Static Ritual']);
  // edit the first artist's view: a song and a shared venue
  const v1 = viewOf(ws, first);
  v1.songs.push(newSong('Arc Song'));
  v1.venues.push({ id: 'v1', name: 'El Corazon' });
  ws = mergeView(ws, v1);
  // the second artist sees the venue but not the song
  const v2 = viewOf(ws, second);
  assert.equal(v2.songs.length, 0);
  assert.equal(v2.venues[0].name, 'El Corazon');
  assert.equal(v2.band.name, 'Static Ritual');
  assert.equal(v2.band.city, 'Tacoma');
  v2.shows.push({ ...newShow('2026-11-25'), venue: 'El Corazon', status: 'confirmed' });
  ws = mergeView(ws, v2);
  assert.equal(viewOf(ws, first).shows.length, 0);
  assert.equal(viewOf(ws, first).songs[0].title, 'Arc Song');
  // removing keeps at least one, and moves "current" off a removed artist
  ws = { ...ws, current: second };
  ws = removeArtist(ws, second);
  assert.equal(ws.artists.length, 1);
  assert.equal(ws.current, first);
  assert.equal(removeArtist(ws, first).artists.length, 1);
});

test('all-artists agenda and next show are tagged with the artist', () => {
  let ws = workspaceFrom(newManager());
  const a = ws.current;
  let [next, b] = addArtist(ws, 'Static Ritual');
  ws = next;
  const va = viewOf(ws, a);
  va.shows.push({ ...newShow('2026-11-28'), venue: 'Funhouse', status: 'confirmed' });
  ws = mergeView(ws, va);
  const vb = viewOf(ws, b);
  vb.shows.push({ ...newShow('2026-11-21'), venue: 'Substation', status: 'confirmed' });
  vb.songs.push({ ...newSong('Ritual'), releaseDate: '2026-11-30' });
  ws = mergeView(ws, vb);
  const items = combinedAgenda(ws, '2026-11-18', 14).filter((x) => x.kind !== 'task');
  assert.deepEqual(items.map((x) => [x.date, x.artist]), [['2026-11-21', 'Static Ritual'], ['2026-11-28', 'Arc Flash'], ['2026-11-30', 'Static Ritual']]);
  const n = combinedNext(ws, '2026-11-18');
  assert.equal(n.show.show.venue, 'Substation');
  assert.equal(n.show.artistId, b);
  assert.equal(n.release.artist, 'Static Ritual');
  const ics = managerICS(viewOf(ws), { ws, from: '2026-11-18', days: 14, stamp: new Date('2026-11-18T00:00:00Z') });
  assert.ok(ics.includes('SUMMARY:Static Ritual: Show: Substation') && ics.includes('SUMMARY:Arc Flash: Show: Funhouse'));
});

test('workspace backups hold every artist; old backups still restore', () => {
  let ws = workspaceFrom(newManager());
  [ws] = addArtist(ws, 'Static Ritual');
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists.map((a) => a.band.name), ['Arc Flash', 'Static Ritual']);
  assert.equal(back.current, ws.current);
  const old = newManager();
  old.songs.push(newSong('Old song'));
  const fromOld = parseWorkspaceBackup(backupFile(old));
  assert.equal(fromOld.artists.length, 1);
  assert.equal(fromOld.artists[0].songs[0].title, 'Old song');
  assert.throws(() => parseWorkspaceBackup('{"artists":[]}'), /isn’t a band manager backup/);
  const bad = normalizeWorkspace({ artists: [{ id: 'x', band: { name: 'A' } }, 'junk', { band: {} }], current: 'nope' });
  assert.equal(bad.artists.length, 1);
  assert.equal(bad.current, 'x');
});
