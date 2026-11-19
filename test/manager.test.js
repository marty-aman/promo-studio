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
