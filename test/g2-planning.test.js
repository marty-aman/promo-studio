// G2: the release rollout (song checklist by week, EP/album rollout), the weekly plan on Home and the
// "what worked" extension (song and hashtag groupings, best this month).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, addDays, taskDue, agenda, overdueTasks, registerAgendaSource, RELEASE_TEMPLATE, ROLLOUT_ADDED, LATE_WINDOW, releaseChecklist, normalizeManager } from '../js/manager/model.js';
import { releaseAutoReason, releaseTaskState, configureTodoAuto } from '../js/manager/todoauto.js';
import { weekOf, weekLabel, songRollout, missingRolloutSteps, addRolloutSteps, EP_ROLLOUT, releaseRollout, releaseAgendaItems, relStepState, setRelStep, normalizeRelRollout, groupsSongs, releaseIsOut, trackProgress } from '../js/manager/rollout.js';
import { newRelease, setRelease } from '../js/manager/releases.js';
import { weekStartOf, weekPlan, mergePlans, weekHTML, isContact, bestType, doFirst } from '../js/manager/weekplan.js';
import { compare, hashtags, bestThisMonth, GROUPINGS, findings } from '../js/manager/content.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup, normalizeWorkspace } from '../js/manager/artists.js';

const TODAY = '2026-11-23'; // a Monday
const byText = (s, text) => s.release.find((t) => t.text === text);
const stats = (views, shares = 0, saves = 0, likes = 0) => ({ views, shares, saves, likes, comments: 0 });
let pn = 0;
const post = (over = {}) => ({ id: `p${pn++}`, songId: '', date: TODAY, platform: 'TikTok', format: 'other', title: 'Post', hook: '', idea: '', status: 'posted', url: '', stats: null, ...over });

function epWorld(date = addDays(TODAY, 40)) {
  const m = newManager();
  const r = { ...newRelease('ep', 'Static Bloom'), id: 'ep1', releaseDate: date };
  m.releases.push(r);
  for (const t of ['One', 'Two', 'Three']) {
    const s = { ...newSong(t), releaseDate: date };
    m.songs.push(s);
    setRelease(m, s.id, r.id);
  }
  return { m, r };
}

// ---------------------------------------------------------------- the song checklist

test('rollout steps extend the checklist: offsets before and after release, every one new', () => {
  assert.equal(RELEASE_TEMPLATE.length, 31);
  assert.equal(ROLLOUT_ADDED.length, 9);
  const offs = ROLLOUT_ADDED.map((r) => r[0]);
  assert.ok(offs.some((o) => o < -7) && offs.some((o) => o > 7), 'weeks before and weeks after');
  const texts = RELEASE_TEMPLATE.map((r) => r[2]);
  assert.equal(new Set(texts).size, texts.length, 'no duplicate step');
  for (let i = 1; i < RELEASE_TEMPLATE.length; i++) assert.ok(RELEASE_TEMPLATE[i][0] >= RELEASE_TEMPLATE[i - 1][0], 'kept in date order');
  assert.equal(releaseChecklist().length, 31);
});

test('due dates follow the release date when it changes; a task with its own date stays put', () => {
  const s = { ...newSong('A'), releaseDate: '2026-12-18' };
  s.release.push({ id: 'own', date: '2026-12-01', offset: 0, cat: 'other', text: 'Merch order', done: false });
  const teaser = byText(s, 'First teaser: a studio or behind-the-scenes clip');
  const recap = byText(s, 'Release recap: numbers, best post, what to change next time');
  assert.equal(taskDue(s, teaser), '2026-11-20');
  assert.equal(taskDue(s, recap), '2027-01-17', 'across the year end');
  s.releaseDate = '2027-03-01';
  assert.equal(taskDue(s, teaser), '2027-02-01', 'across February');
  assert.equal(taskDue(s, recap), '2027-03-31');
  assert.equal(taskDue(s, s.release.find((t) => t.id === 'own')), '2026-12-01');
  s.releaseDate = '';
  assert.equal(taskDue(s, teaser), '');
  // agenda moves too
  s.releaseDate = '2027-03-01';
  const m = newManager();
  m.songs.push(s);
  assert.ok(agenda(m, '2027-02-01', 1).some((it) => it.key === teaser.id));
  assert.ok(!agenda(m, '2026-11-20', 1).some((it) => it.key === teaser.id));
});

test('no noise: a released song does not dump untouched past tasks into Overdue', () => {
  const m = newManager();
  const s = { ...newSong('Out'), status: 'released', releaseDate: addDays(TODAY, -40) };
  m.songs.push(s);
  assert.deepEqual(overdueTasks(m, TODAY), [], 'out 40 days, nothing ticked: nothing late');
  s.releaseDate = addDays(TODAY, -12);
  const late = overdueTasks(m, TODAY);
  assert.ok(late.length > 0);
  for (const x of late) {
    assert.ok(x.task.offset > 0, 'never a run-up task');
    assert.ok(x.due >= addDays(TODAY, -LATE_WINDOW), 'only the last week');
  }
  // the Rollout view still shows them, as missed
  const ro = songRollout(s, m, TODAY);
  assert.ok(ro.missed > 0 && ro.late === late.length);
  assert.ok(ro.weeks.flatMap((w) => w.items).some((it) => it.state === 'moot'), 'run-up shown as skipped');
  // the same song not marked released: everything past due is late
  s.status = 'ready';
  assert.ok(overdueTasks(m, TODAY).length > late.length);
});

test('rollout weeks: labels, current week, progress per week', () => {
  assert.equal(weekOf(0), 0);
  assert.equal(weekOf(6), 0);
  assert.equal(weekOf(7), 1);
  assert.equal(weekOf(-1), -1);
  assert.equal(weekOf(-7), -1);
  assert.equal(weekOf(-8), -2);
  assert.equal(weekLabel(0), 'Release week');
  assert.equal(weekLabel(-1), '1 week before');
  assert.equal(weekLabel(3), '3 weeks after');
  const m = newManager();
  const s = { ...newSong('A'), releaseDate: addDays(TODAY, 10) };
  m.songs.push(s);
  byText(s, 'Teaser with the hook').done = true; // -7 → in the week holding today+3
  const ro = songRollout(s, m, TODAY);
  const cur = ro.weeks.filter((w) => w.current);
  assert.equal(cur.length, 1);
  assert.equal(cur[0].week, -2, 'today is 10 days before');
  assert.ok(cur[0].from <= TODAY && cur[0].to >= TODAY);
  const wk = ro.weeks.find((w) => w.items.some((it) => it.task.text === 'Teaser with the hook'));
  assert.ok(wk.done >= 1 && wk.done <= wk.total);
  assert.equal(ro.total, s.release.length);
  assert.equal(ro.weeks.reduce((a, w) => a + w.items.length, 0), s.release.length);
});

test('old songs: add the newer steps that are not past yet, once', () => {
  const s = { ...newSong('Old'), releaseDate: addDays(TODAY, 20) };
  s.release = s.release.filter((t) => !ROLLOUT_ADDED.some((r) => r[2] === t.text));
  assert.equal(s.release.length, 22);
  const miss = missingRolloutSteps(s, TODAY);
  assert.equal(miss.add.length + miss.past.length, 9);
  assert.ok(miss.past.every(([o]) => addDays(s.releaseDate, o) < TODAY));
  const res = addRolloutSteps(s, TODAY);
  assert.equal(res.added, miss.add.length);
  assert.equal(res.skipped, miss.past.length);
  assert.equal(addRolloutSteps(s, TODAY).added, 0, 'second time adds nothing');
  const none = { ...newSong('No date') };
  none.release = none.release.slice(0, 22);
  assert.equal(missingRolloutSteps(none, TODAY).past.length, 0, 'without a date nothing is past');
});

test('rollout steps that tick themselves from posts, pitches and links', () => {
  const m = newManager();
  const s = { ...newSong('A'), releaseDate: '2026-12-10' };
  m.songs.push(s);
  const r = (text) => releaseAutoReason(s, byText(s, text), { has: () => true, m });
  const teaser = 'First teaser: a studio or behind-the-scenes clip';
  assert.equal(r(teaser), '');
  m.posts.push(post({ songId: s.id, date: '2026-11-20', status: 'scheduled' }));
  assert.equal(r(teaser), '', 'not posted yet');
  m.posts[0].status = 'posted';
  assert.match(r(teaser), /2026-11-20/);
  assert.equal(releaseAutoReason(s, byText(s, teaser), { has: () => true }), '', 'without the artist data: manual');
  const bts = 'Post a behind-the-scenes clip from the shoot or studio';
  m.posts.push(post({ songId: s.id, date: '2026-12-12', format: 'bts' }));
  assert.match(r(bts), /behind-the-scenes/);
  const fu = 'Follow up with the blogs, radio and curators that haven’t replied';
  assert.equal(r(fu), '', 'no pitches');
  s.pitches.push({ id: 'p1', status: 'sent', followedUp: false, sent: '2026-11-01' });
  assert.equal(r(fu), '');
  s.pitches[0].followedUp = true;
  assert.ok(r(fu));
  const second = 'Second playlist pitch round with the first-week numbers';
  assert.equal(r(second), '');
  s.pitches.push({ id: 'p2', status: 'sent', sent: '2026-12-15' });
  assert.match(r(second), /2026-12-15/);
  const prem = 'Set up the music video premiere (date announced, YouTube Premiere set)';
  assert.equal(r(prem), '');
  s.links.youtube = 'https://youtu.be/abcdefghijk';
  assert.ok(r(prem));
  // releaseTaskState passes the artist data through
  assert.equal(releaseTaskState(s, byText(s, teaser), m, { has: () => true }).done, true);
});

// ---------------------------------------------------------------- the EP / album rollout

test('EP rollout: dates move with the release date and reach the agenda', () => {
  const { m, r } = epWorld('2027-01-15');
  assert.ok(groupsSongs(r, m));
  const items = releaseRollout(r, m, TODAY).weeks.flatMap((w) => w.items);
  assert.equal(items.length, EP_ROLLOUT.length);
  const announce = items.find((x) => x.key === 'announce');
  assert.equal(announce.due, '2026-12-18');
  r.releaseDate = '2027-02-12';
  assert.equal(releaseRollout(r, m, TODAY).weeks.flatMap((w) => w.items).find((x) => x.key === 'announce').due, '2027-01-15');
  const ag = agenda(m, '2027-01-15', 1).filter((it) => it.key === 'rr:ep1:announce');
  assert.equal(ag.length, 1, 'registered agenda source');
  assert.equal(ag[0].kind, 'task');
  assert.deepEqual(ag[0].ref, { page: 'releases', id: 'ep1' });
  // a single, or an EP with no songs, has no release-level rollout
  const single = { ...newRelease('single', 'S'), releaseDate: '2027-01-01' };
  m.releases.push(single);
  assert.equal(groupsSongs(single, m), false);
  assert.ok(!agenda(m, '2026-10-01', 120).some((it) => it.key && it.key.startsWith(`rr:${single.id}`)));
});

test('EP rollout: ticks, automatic ticks and turning one off', () => {
  configureTodoAuto({ has: (id) => id === 'cov' });
  const { m, r } = epWorld();
  const step = (k) => EP_ROLLOUT.find((s) => s[2] === k);
  assert.equal(relStepState(r, step('cover'), m).done, false);
  r.coverId = 'cov';
  const st = relStepState(r, step('cover'), m);
  assert.equal(st.done, true);
  assert.match(st.auto, /cover/);
  setRelStep(r, 'cover', false, st.auto);
  assert.equal(relStepState(r, step('cover'), m).done, false, 'turned off');
  assert.deepEqual(r.rollout.off, { cover: true });
  setRelStep(r, 'cover', true, st.auto);
  assert.equal(relStepState(r, step('cover'), m).done, true);
  setRelStep(r, 'announce', true, '');
  assert.equal(relStepState(r, step('announce'), m).done, true);
  assert.ok(!agenda(m, TODAY, 60).some((it) => it.key === 'rr:ep1:announce'), 'done steps leave the agenda');
  assert.equal(relStepState(r, step('dates'), m).done, true, 'every track has a date');
  m.posts.push(...m.songs.map((s) => post({ songId: s.id, status: 'idea' })));
  assert.equal(relStepState(r, step('series'), m).done, true);
  assert.deepEqual(normalizeRelRollout({ done: { cover: true, bogus: true, announce: 'yes' }, off: [] }), { done: { cover: true }, off: {} });
  assert.deepEqual(normalizeRelRollout(null), { done: {}, off: {} });
  configureTodoAuto({ has: () => true });
});

test('EP rollout: no noise once every track is out; late steps while it is not', () => {
  const { m, r } = epWorld(addDays(TODAY, -3));
  const lateKeys = () => overdueTasks(m, TODAY).filter((x) => x.source && x.source.key.startsWith('rr:')).map((x) => x.source.key);
  assert.ok(lateKeys().length > 5, 'not marked released: the run-up is late');
  for (const s of m.songs) s.status = 'released';
  assert.ok(releaseIsOut(r, m));
  assert.deepEqual(lateKeys(), [], 'out 3 days: only after-release steps could be late, none due yet');
  r.releaseDate = addDays(TODAY, -10);
  assert.deepEqual(lateKeys(), ['rr:ep1:week1'], 'the +7 step, inside the week');
  r.releaseDate = addDays(TODAY, -60);
  assert.deepEqual(lateKeys(), [], 'old steps are missed, not late');
  assert.ok(releaseRollout(r, m, TODAY).missed > 0);
  assert.equal(releaseAgendaItems(m, '', TODAY, (d) => !!d && d < TODAY).length, 0);
  assert.equal(trackProgress(r, m, TODAY).length, 3);
});

// ---------------------------------------------------------------- data round trip

test('backup round trip and artist switch keep the rollout ticks and the new steps', () => {
  const { m, r } = epWorld();
  setRelStep(r, 'announce', true, '');
  setRelStep(r, 'cover', false, 'the release cover is attached');
  addRolloutSteps(m.songs[0], TODAY);
  const ws = workspaceFrom(normalizeManager(JSON.parse(JSON.stringify(m))));
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0], ws.artists[0]);
  assert.deepEqual(back.artists[0].releases[0].rollout, { done: { announce: true }, off: { cover: true } });
  assert.equal(back.artists[0].songs[0].release.length, 31);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(ws))), ws);
  const [ws2, id2] = addArtist(ws, 'Other');
  assert.deepEqual(viewOf(ws2, id2).releases, []);
  const v1 = viewOf(ws2, ws.current);
  assert.deepEqual(v1.releases[0].rollout, r.rollout);
  const ws3 = mergeView(ws2, v1);
  assert.deepEqual(viewOf(ws3, ws.current).releases[0].rollout, r.rollout);
});

// ---------------------------------------------------------------- the weekly plan

test('weekStartOf: the Monday', () => {
  assert.equal(weekStartOf('2026-11-23'), '2026-11-23');
  assert.equal(weekStartOf('2026-11-29'), '2026-11-23');
  assert.equal(weekStartOf('2026-11-30'), '2026-11-30');
  assert.equal(weekStartOf('2027-01-01'), '2026-12-28');
  assert.equal(weekStartOf('nope'), '');
});

test('weekly plan with a fake agenda source: sections, best type, do this first', () => {
  const m = newManager();
  m.outreach = [{ id: 'o1', name: 'Gutter Blog', followUp: '2026-11-25', status: 'sent' }];
  // stands in for another build's source; the plan never reads m.outreach itself
  registerAgendaSource((mm, from, to, inRange) => (mm.outreach || []).filter((o) => o.status !== 'done' && inRange(o.followUp)).map((o) => ({ date: o.followUp, kind: 'task', key: o.id, title: `Follow up: ${o.name}`, sub: 'Outreach', ref: { page: 'outreach', id: o.id } })));
  m.fakeAdvance = true;
  registerAgendaSource((mm, from, to, inRange) => (mm.fakeAdvance && inRange('2026-11-26') ? [{ date: '2026-11-26', kind: 'task', key: 'adv', title: 'Advance the show: parking and load-in', sub: 'Show day', ref: { page: 'shows', id: 'x' } }] : []));
  const s = { ...newSong('Glass'), releaseDate: '2027-02-01' };
  m.songs.push(s);
  m.shows.push({ ...newShow('2026-11-28'), id: 'sh1', venue: 'Black Lodge', status: 'confirmed' });
  m.posts.push(post({ songId: s.id, date: '2026-11-24', status: 'scheduled', title: 'Riff clip' }));
  m.posts.push(post({ date: '2026-10-01', format: 'bts', stats: stats(1000, 50, 30) }), post({ date: '2026-10-02', format: 'live', stats: stats(1000, 1, 1) }));
  const plan = weekPlan(m, '2026-11-23', TODAY);
  assert.equal(plan.to, '2026-11-29');
  assert.deepEqual(plan.posts.map((x) => x.title), ['Riff clip']);
  assert.ok(plan.contacts.some((x) => x.title === 'Follow up: Gutter Blog'), 'fake source in Who to contact');
  assert.ok(plan.tasks.some((x) => x.key === 'adv'), 'other source items are deadlines');
  assert.ok(plan.dated.some((x) => x.kind === 'show'));
  assert.ok(plan.best && plan.best.n === 1 && plan.best.small, 'best type with n, flagged small');
  assert.match(plan.first.text, /Follow up: Gutter Blog, before the show at Black Lodge/);
  assert.deepEqual(plan.late, []);
  // another week: no late items, nothing from this week
  const next = weekPlan(m, '2026-11-30', TODAY);
  assert.equal(next.posts.length + next.contacts.length, 0);
  // late items come first
  s.releaseDate = addDays(TODAY, 3); // the run-up is overdue
  const p2 = weekPlan(m, '2026-11-23', TODAY);
  assert.ok(p2.late.length > 0);
  assert.match(p2.first.text, /^Catch up: /);
});

test('weekly plan: empty week, next up, and contact detection', () => {
  const m = newManager();
  assert.match(weekPlan(m, '2026-11-23', TODAY).first.text, /Nothing planned/);
  m.songs.push({ ...newSong('Far'), releaseDate: '2027-06-01' });
  assert.match(weekPlan(m, '2026-11-23', TODAY).first.text, /Next up: “Far”/);
  assert.equal(isContact({ kind: 'task', title: 'Thank the blogs, radio and curators who shared the song' }), true);
  assert.equal(isContact({ kind: 'task', title: 'Cover art final (3000 × 3000 px)' }), false);
  assert.equal(isContact({ kind: 'show', title: 'Follow up' }), false, 'only tasks');
  assert.equal(bestType([]), null);
  assert.equal(doFirst({ late: [], dated: [], contacts: [], tasks: [], posts: [], next: null }, TODAY).text.length > 0, true);
});

test('All artists: plans merge with the artist on every item', () => {
  const a = newManager();
  a.posts.push(post({ date: '2026-11-25', status: 'idea', title: 'A post' }));
  const b = newManager();
  b.shows.push({ ...newShow('2026-11-27'), venue: 'Funhouse', status: 'confirmed' });
  const plan = mergePlans([{ artistId: 'a', artist: 'Arc Flash', plan: weekPlan(a, '2026-11-23', TODAY) }, { artistId: 'b', artist: 'Undertow', plan: weekPlan(b, '2026-11-23', TODAY) }], TODAY);
  assert.equal(plan.posts[0].artist, 'Arc Flash');
  assert.equal(plan.dated[0].artist, 'Undertow');
  assert.equal(plan.best.length, 2);
  assert.match(plan.first.text, /^Arc Flash: Get “A post” ready/);
  const html = weekHTML(plan, { title: 'All' });
  assert.match(html, /Undertow/);
});

test('weekly plan PDF: escapes text and never includes fans, contacts or members', () => {
  const MARK = 'zz-PRIVATE-9f3';
  const m = newManager();
  m.fans = [{ id: 'f1', email: `${MARK}@fan.example`, name: MARK }];
  m.contacts = [{ id: 'c1', name: MARK, email: `${MARK}@x.example`, phone: MARK }];
  m.band.members = [{ id: 'mb', name: MARK, email: MARK }];
  m.availability = [{ id: 'av', replies: [{ name: MARK }] }];
  m.outreach = [{ id: 'o2', contact: MARK, email: MARK, name: 'Radio X', followUp: '2026-11-25', status: 'sent' }];
  m.shows.push({ ...newShow('2026-11-27'), venue: '<script>alert(1)</script>', contact: MARK, status: 'confirmed', notes: MARK });
  m.posts.push(post({ date: '2026-11-24', status: 'idea', title: '"><img src=x onerror=alert(1)>', idea: MARK }));
  const html = weekHTML(weekPlan(m, '2026-11-23', TODAY), { title: 'Week' });
  assert.ok(!html.includes(MARK), 'no personal data');
  assert.ok(!html.includes('<script>alert'), 'escaped');
  assert.ok(!html.includes('<img src=x'), 'escaped');
  assert.match(html, /&lt;script&gt;/);
});

// ---------------------------------------------------------------- what worked

test('hashtags: from title, hook and idea, once each, lower-cased', () => {
  assert.deepEqual(hashtags({ title: 'New riff #Metal #emocore', hook: '#metal again', idea: 'mail me a#b #x' }), ['#metal', '#emocore']);
  assert.deepEqual(hashtags({}), []);
});

test('compare by song and by hashtag; tiny groups keep their n', () => {
  const songs = [{ id: 's1', title: 'Glass' }, { id: 's2', title: 'Undertow' }];
  const posts = [post({ songId: 's1', title: '#riff', stats: stats(1000, 40) }), post({ songId: 's1', title: '#riff #live', stats: stats(1000, 20) }), post({ songId: 's2', title: '#live', stats: stats(1000, 1) }), post({ songId: '', songTitle: 'Gone', stats: stats(500, 1) }), post({ songId: 's2', stats: null })];
  const bySong = compare(posts, 'song', { songs });
  assert.deepEqual(bySong.map((g) => [g.key, g.n]), [['Glass', 2], ['Gone', 1], ['Undertow', 1]]);
  const byTag = compare(posts, 'hashtag');
  assert.deepEqual(byTag.map((g) => [g.key, g.n]), [['#riff', 2], ['#live', 2]]);
  assert.ok(GROUPINGS.song && GROUPINGS.hashtag);
  // the old callers still work
  assert.equal(compare(posts, 'format').length, 1);
  assert.equal(findings(posts).ready, true);
});

test('best this month: only this month, honest about small samples', () => {
  const songs = [{ id: 's1', title: 'Glass' }, { id: 's2', title: 'Undertow' }];
  const none = bestThisMonth([post({ date: '2026-10-30', stats: stats(9999, 99) })], TODAY, songs);
  assert.equal(none.n, 0);
  assert.equal(none.label, 'November 2026');
  assert.deepEqual(none.lines, []);
  const posts = [post({ songId: 's1', date: '2026-11-02', format: 'bts', title: 'Studio #riff', stats: stats(2000, 80) }), post({ songId: 's2', date: '2026-11-10', format: 'live', title: 'Live #gig', stats: stats(1000, 2) }), post({ date: '2026-10-01', stats: stats(9e5, 9e4) })];
  const b = bestThisMonth(posts, TODAY, songs);
  assert.equal(b.n, 2);
  assert.equal(b.small, true);
  assert.equal(b.top.title, 'Studio #riff');
  assert.equal(b.song.key, 'Glass');
  assert.equal(b.tag.key, '#riff');
  assert.ok(b.type && b.type.n === 1);
  assert.match(b.lines.at(-1).text, /only 2 posts/);
  assert.ok(b.lines.every((l) => /\d/.test(l.text) || l.kind === 'top'), 'each line says how many posts');
  const big = bestThisMonth(Array.from({ length: 6 }, (_, i) => post({ date: '2026-11-0' + (i + 1), stats: stats(100 * (i + 1), i) })), TODAY);
  assert.equal(big.small, false);
  assert.equal(big.type, null, 'one type only: nothing to compare');
});
