// The Manager polish round: overdue for released songs, stable calendar UIDs, keeping posted posts
// when a song goes, money from played shows only, the member split, venue follow-ups, backups and
// page addresses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, addDays, overdueTasks, agenda, deleteSong, markPreReleaseDone, setShowStatus, showFollowUp, normalizeManager } from '../js/manager/model.js';
import { managerICS, moneyLines, moneySummary, expectedShowMoney, memberSplit, splitText, memberTotals } from '../js/manager/extras.js';
import { showSummary } from '../js/manager/page-shows.js';
import { stageSetlistHTML } from '../js/manager/docs.js';
import { setlistTimes } from '../js/manager/setlist.js';
import { backupDue, viewHash, parseViewHash } from '../js/manager/shell.js';

const TODAY = '2026-11-23';

test('a released song puts only its after-release tasks in Overdue', () => {
  const m = newManager();
  const s = { ...newSong('Glass Lungs'), status: 'released', releaseDate: addDays(TODAY, -40) };
  m.songs.push(s);
  const late = overdueTasks(m, TODAY);
  assert.ok(late.length > 0);
  assert.ok(late.every((x) => x.task.offset > 0), 'only post-release tasks');
  assert.equal(late.length, s.release.filter((t) => t.offset > 0 && addDays(s.releaseDate, t.offset) < TODAY).length);
  // a task with its own date still counts, released or not
  s.release.push({ id: 'own', date: addDays(TODAY, -2), offset: 0, cat: 'other', text: 'Merch order', done: false });
  assert.ok(overdueTasks(m, TODAY).some((x) => x.task.id === 'own'));
  // the same song before it is marked released still shows its run-up (the old behaviour)
  s.status = 'ready';
  assert.ok(overdueTasks(m, TODAY).some((x) => x.task.offset < 0));
  // empty input
  assert.deepEqual(overdueTasks(newManager(), TODAY), []);
});

test('"Mark everything before release day done" ticks the run-up only', () => {
  const s = { ...newSong('X'), releaseDate: '2026-10-01' };
  const pre = s.release.filter((t) => t.offset <= 0).length;
  assert.equal(markPreReleaseDone(s), pre);
  assert.ok(s.release.filter((t) => t.offset > 0).every((t) => !t.done));
  assert.equal(markPreReleaseDone(s), 0); // nothing left the second time
});

test('calendar UIDs stay the same when an earlier item is added', () => {
  const m = newManager();
  const s = { ...newSong('Static'), releaseDate: addDays(TODAY, 10) };
  m.songs.push(s);
  m.shows.push({ ...newShow(addDays(TODAY, 5)), id: 'sh1', venue: 'Funhouse', status: 'confirmed', setTime: '21:00', todo: [{ id: 't1', offset: -2, text: 'Flyer', done: false }, { id: 't2', offset: -2, text: 'Guest list', done: false }] });
  const uids = (t) => t.split('\r\n').filter((l) => l.startsWith('UID:'));
  const a = uids(managerICS(m, { from: TODAY }));
  assert.equal(new Set(a).size, a.length, 'every UID is unique (two tasks on one day for one show)');
  m.posts.push({ id: 'p0', songId: '', title: 'Early post', status: 'idea', date: TODAY, stats: {} });
  const b = uids(managerICS(m, { from: TODAY }));
  assert.equal(b.length, a.length + 1);
  assert.deepEqual(b.filter((u) => !u.includes('post-p0')), a);
});

test('a late set ends after midnight on the next day', () => {
  const m = newManager();
  m.shows.push({ ...newShow('2026-12-05'), id: 'late', venue: 'Night', status: 'confirmed', setTime: '23:30' });
  const ics = managerICS(m, { from: '2026-12-01' });
  assert.match(ics, /DTSTART:20261205T233000/);
  assert.match(ics, /DTEND:20261206T003000/);
});

test('deleting a song keeps its posted posts and their stats', () => {
  const d = newManager();
  const s = newSong('Bathypelagic');
  d.songs.push(s, newSong('Other'));
  d.posts.push({ id: 'a', songId: s.id, status: 'posted', title: 'Teaser', stats: { views: 5000, likes: 400 } }, { id: 'b', songId: s.id, status: 'idea', title: 'Plan' }, { id: 'c', songId: d.songs[1].id, status: 'idea' });
  deleteSong(d, s.id);
  assert.equal(d.songs.length, 1);
  assert.deepEqual(d.posts.map((p) => p.id), ['a', 'c']);
  assert.equal(d.posts[0].songId, '');
  assert.equal(d.posts[0].songTitle, 'Bathypelagic');
  assert.deepEqual(d.posts[0].stats, { views: 5000, likes: 400 });
  // the kept post survives a save and load
  assert.equal(normalizeManager(JSON.parse(JSON.stringify(d))).posts[0].songTitle, 'Bathypelagic');
  deleteSong(d, 'missing'); // no such song: nothing changes
  assert.equal(d.posts.length, 2);
});

test('money counts played shows only; upcoming pay is shown as expected', () => {
  const m = newManager();
  m.shows.push(
    { ...newShow(addDays(TODAY, 5)), id: 'future', status: 'confirmed', settlement: { pay: '200', merch: '', costs: '' } },
    { ...newShow(addDays(TODAY, -3)), id: 'played', status: 'played', settlement: { pay: '100', merch: '30', costs: '10' } },
    { ...newShow(addDays(TODAY, -10)), id: 'cancelled', status: 'cancelled', settlement: { pay: '50', merch: '', costs: '' } },
    { ...newShow(addDays(TODAY, -1)), id: 'past-confirmed', status: 'confirmed', settlement: { pay: '20', merch: '', costs: '' } },
    { ...newShow(addDays(TODAY, 30)), id: 'early-played', status: 'played', settlement: { pay: '5', merch: '', costs: '' } },
  );
  const lines = moneyLines(m, TODAY);
  assert.deepEqual([...new Set(lines.map((e) => e.showId))].sort(), ['early-played', 'past-confirmed', 'played']);
  assert.equal(moneySummary(lines).net, 100 + 30 - 10 + 20 + 5);
  const ex = expectedShowMoney(m, TODAY);
  assert.equal(ex.total, 200);
  assert.deepEqual(ex.shows.map((s) => s.id), ['future']);
});

test('member split: 4 members, $240 net, 25% fund gives $45 each and $60 to the fund', () => {
  const members = ['Ana', 'Bo', 'Cy', 'Di'].map((name, i) => ({ id: `m${i}`, name }));
  const sp = memberSplit(240, members, { fund: 25 });
  assert.equal(sp.fund, 60);
  assert.deepEqual(sp.members.map((x) => x.amount), [45, 45, 45, 45]);
  assert.equal(splitText(sp), 'Split: $45 each (4 members) · band fund $60');
  // in the band chat summary
  const show = { ...newShow('2026-11-20'), venue: 'Funhouse', status: 'played', settlement: { pay: '200', merch: '80', costs: '40', fund: '25', shares: {} } };
  const text = showSummary(show, [], { members });
  assert.match(text, /Net: \$240 · Split: \$45 each \(4 members\) · band fund \$60/);
  // shares: Ana takes a double share, Di sits this one out
  const uneven = memberSplit(240, members, { fund: 0, shares: { m0: 2, m3: 0 } });
  assert.deepEqual(uneven.members.map((x) => x.amount), [120, 60, 60, 0]);
  assert.equal(uneven.fund, 0);
  // a loss or no members: nothing to split
  assert.deepEqual(memberSplit(-50, members, {}).members.map((x) => x.amount), [0, 0, 0, 0]);
  assert.equal(splitText(memberSplit(100, [], {})), '');
  // an odd amount rounds to cents
  assert.deepEqual(memberSplit(100, members.slice(0, 3), {}).members.map((x) => x.amount), [33.33, 33.33, 33.33]);
  // a fund over 100% is capped
  assert.equal(memberSplit(100, members, { fund: 150 }).fund, 100);
});

test('per-member totals for the year come from played shows', () => {
  const m = newManager();
  m.band.members = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bo' }];
  m.shows.push(
    { ...newShow('2026-03-01'), status: 'played', settlement: { pay: '100', merch: '', costs: '', fund: '', shares: {} } },
    { ...newShow('2026-11-01'), status: 'played', settlement: { pay: '60', merch: '', costs: '20', fund: '50', shares: {} } },
    { ...newShow('2026-12-20'), status: 'confirmed', settlement: { pay: '500', merch: '', costs: '', fund: '', shares: {} } },
  );
  const t = memberTotals(m, { from: '2026-01-01', to: '2026-12-31', today: TODAY });
  assert.equal(t.fund, 20);
  assert.deepEqual(t.members.map((x) => x.amount), [60, 60]);
});

test('a show set to Pitched gets a follow-up a week later', () => {
  const m = newManager();
  const s = { ...newShow(addDays(TODAY, 60)), id: 'p', venue: 'Black Lodge' };
  m.shows.push(s);
  setShowStatus(s, 'pitched', TODAY);
  assert.equal(s.pitchedOn, TODAY);
  assert.equal(showFollowUp(s), addDays(TODAY, 7));
  assert.ok(agenda(m, TODAY, 14).some((it) => it.kind === 'task' && /Follow up with Black Lodge/.test(it.title)));
  assert.ok(overdueTasks(m, addDays(TODAY, 8)).some((x) => x.followup));
  setShowStatus(s, 'pitched', addDays(TODAY, 3)); // already pitched: the date stays
  assert.equal(s.pitchedOn, TODAY);
  s.followedUp = true;
  assert.equal(showFollowUp(s), '');
  setShowStatus(s, 'confirmed', TODAY);
  assert.equal(showFollowUp(s), '');
  // an old save without pitchedOn gets no follow-up
  assert.equal(showFollowUp({ ...newShow(), status: 'pitched', pitchedOn: undefined }), '');
});

test('old saves load with the new settlement fields', () => {
  const m = normalizeManager({ shows: [{ id: 's1', date: '2026-01-01', settlement: { gross: '', pay: '10', merch: '', costs: '' } }] });
  assert.equal(m.shows[0].settlement.fund, '');
  assert.deepEqual(m.shows[0].settlement.shares, {});
  assert.equal(m.shows[0].settlement.pay, '10');
});

test('stage setlist: one page, big type, covers marked', () => {
  const songs = [{ title: 'Static', key: 'Drop C', length: '3:30' }, { title: 'Hurt', cover: true, length: '3:40' }];
  const text = ['Static', 'Hurt', ...Array.from({ length: 10 }, (_, i) => `Song ${i + 3}`)].join('\n');
  const html = stageSetlistHTML({ venue: 'Funhouse', date: '2026-12-05' }, { name: 'Arc Flash' }, setlistTimes(text, songs));
  assert.equal((html.match(/<li>/g) || []).length, 12);
  const pt = +/font-size:(\d+)pt;line-height/.exec(html)[1];
  assert.ok(pt >= 36 && pt <= 60, `12 songs at ${pt}pt`);
  assert.ok(12 * pt * 1.15 < 640, 'fits one page');
  assert.match(html, /\(cover\)/);
  assert.match(html, /Drop C/);
  const short = stageSetlistHTML({}, {}, setlistTimes('One', []));
  assert.match(short, /font-size:60pt/);
  assert.match(stageSetlistHTML({}, {}, setlistTimes('<b>x</b>', [])), /&lt;b&gt;/);
});

test('backup reminder after 14 days', () => {
  const day = 86400000;
  const now = Date.parse('2026-11-23T12:00:00Z');
  assert.equal(backupDue({}, now), 0);
  assert.equal(backupDue({ lastBackupAt: now - 13 * day }, now), 0);
  assert.equal(backupDue({ lastBackupAt: now - 15 * day }, now), 15);
  assert.equal(backupDue({ firstEditAt: now - 20 * day }, now), 20);
  assert.equal(backupDue({ firstEditAt: now - 20 * day, lastBackupAt: now - day }, now), 0);
});

test('Manager page addresses round-trip', () => {
  const v = { page: 'songs', id: 'song_ab/c', tab: 'release' };
  assert.equal(viewHash(v), '#m/songs/song_ab%2Fc/release');
  assert.deepEqual(parseViewHash(viewHash(v)), v);
  assert.equal(viewHash({ page: 'home', id: null, tab: 'overview' }), '#m/home');
  assert.deepEqual(parseViewHash('#m/home'), { page: 'home', id: null, tab: 'overview' });
  assert.equal(viewHash({ page: 'planner', id: null, tab: 'venues' }), '#m/planner//venues');
  assert.deepEqual(parseViewHash('#m/planner//venues'), { page: 'planner', id: null, tab: 'venues' });
  assert.equal(parseViewHash('#studio'), null);
  assert.equal(parseViewHash(''), null);
  assert.deepEqual(parseViewHash('#m/songs/%E0%A4%A'), { page: 'songs', id: null, tab: 'overview' });
});
