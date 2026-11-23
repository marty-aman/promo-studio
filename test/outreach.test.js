import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, agenda, overdueTasks } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';
import { OUTREACH_STATUSES, newOutreach, normalizeOutreach, markSent, setOutreachStatus, filterOutreach, outreachStats, outreachAgenda, outreachEmail, outreachMailto, songPitches } from '../js/manager/outreach.js';
import { newPitch, curatorPitch, submitPitch, pressRelease, pressHTML } from '../js/manager/press.js';
import { epkHTML, managerICS } from '../js/manager/extras.js';
import { showSheetHTML, calendarHTML } from '../js/manager/docs.js';
import { pressCheck } from '../js/manager/presscheck.js';

function band() {
  const m = newManager();
  m.band = { ...m.band, name: 'Arc Flash', city: 'Seattle', bio: 'Arc Flash is a Seattle alt-metal band.', contactName: 'Marty', contactEmail: 'band@example.com', links: { instagram: 'https://instagram.com/arcflash', website: 'javascript:alert(1)' } };
  const s = newSong('Static');
  s.releaseDate = '2030-01-10';
  s.status = 'released';
  s.links.spotify = 'https://open.spotify.com/track/abc';
  m.songs.push(s);
  return { m, s };
}

test('newOutreach reuses the pitch fields and normalizeOutreach checks each item', () => {
  const o = newOutreach({ name: 'KEXP' });
  for (const k of ['contact', 'sent', 'followUp', 'followedUp', 'notes']) assert.deepEqual(o[k], newPitch()[k], k);
  assert.equal(o.status, 'idea');
  assert.deepEqual(o.log, []);
  const n = normalizeOutreach([null, 3, { id: 1 }, { id: 'a', type: 'zzz', status: 'nope', url: 'javascript:alert(1)', sent: 'soon', followUp: '2030-02-30x', keep: 9, log: [{ date: 'bad' }, { date: '2030-01-01', text: 'Sent' }] }]);
  assert.equal(n.length, 1);
  assert.equal(n[0].type, 'other');
  assert.equal(n[0].status, 'idea');
  assert.equal(n[0].url, '');
  assert.equal(n[0].sent, '');
  assert.equal(n[0].followUp, '');
  assert.equal(n[0].keep, 9, 'unknown fields kept');
  assert.deepEqual(n[0].log, [{ date: '2030-01-01', text: 'Sent' }]);
  assert.deepEqual(normalizeOutreach('x'), []);
});

test('markSent sets today and a follow-up 7 days on; status changes are logged', () => {
  const o = markSent(newOutreach({ name: 'Blog' }), '2030-01-28');
  assert.equal(o.sent, '2030-01-28');
  assert.equal(o.followUp, '2030-02-04');
  assert.equal(o.status, 'sent');
  assert.equal(o.followedUp, false);
  setOutreachStatus(o, 'replied', '2030-02-01');
  assert.equal(o.status, 'replied');
  assert.deepEqual(o.log.map((l) => l.text), ['Sent', 'Replied']);
  const p = setOutreachStatus(newOutreach(), 'sent', '2030-03-01');
  assert.equal(p.followUp, '2030-03-08', 'choosing Sent from the menu also sets the follow-up');
});

test('filters and the stats row', () => {
  const list = [newOutreach({ type: 'blog', status: 'idea' }), newOutreach({ type: 'radio', status: 'sent', sent: '2030-01-01' }), newOutreach({ type: 'blog', status: 'replied' }), newOutreach({ type: 'podcast', status: 'placed' }), newOutreach({ type: 'press', status: 'passed' })];
  assert.equal(filterOutreach(list, { type: 'blog' }).length, 2);
  assert.equal(filterOutreach(list, { status: 'sent' }).length, 1);
  assert.equal(filterOutreach(list, { type: 'blog', status: 'idea' }).length, 1);
  assert.deepEqual(outreachStats(list), { total: 5, sent: 4, replied: 2, placed: 1 });
  assert.deepEqual(OUTREACH_STATUSES.map(([k]) => k), ['idea', 'drafted', 'sent', 'replied', 'placed', 'passed']);
});

test('agenda source: follow-ups for Sent items only, upcoming and overdue', () => {
  const { m } = band();
  const sent = markSent(newOutreach({ id: 'o1', name: 'Seattle Metal Blog', contact: 'Jo Private' }), '2030-01-01');
  const done = { ...markSent(newOutreach({ id: 'o2', name: 'Done' }), '2030-01-01'), followedUp: true };
  const replied = setOutreachStatus(markSent(newOutreach({ id: 'o3', name: 'Replied' }), '2030-01-01'), 'replied', '2030-01-02');
  const placed = setOutreachStatus(markSent(newOutreach({ id: 'o4', name: 'Placed' }), '2030-01-01'), 'placed', '2030-01-02');
  const passed = setOutreachStatus(markSent(newOutreach({ id: 'o5', name: 'Passed' }), '2030-01-01'), 'passed', '2030-01-02');
  m.outreach = [sent, done, replied, placed, passed, newOutreach({ id: 'o6', name: 'Idea', followUp: '2030-01-08' })];
  const items = agenda(m, '2030-01-05', 7).filter((i) => i.key && i.key.startsWith('outreach-'));
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { date: '2030-01-08', kind: 'task', key: 'outreach-o1', title: 'Follow up: Seattle Metal Blog', sub: 'Outreach · Blog', ref: { page: 'content', id: 'o1', tab: 'outreach' } });
  assert.ok(!items[0].title.includes('Jo Private'), 'no contact name in the title');
  const late = overdueTasks(m, '2030-01-20').filter((x) => x.source && x.source.key.startsWith('outreach-'));
  assert.deepEqual(late.map((x) => x.task.id), ['outreach-o1']);
  assert.equal(overdueTasks(m, '2030-01-08').filter((x) => x.source).length, 0, 'not late on the day itself');
  assert.deepEqual(outreachAgenda({ outreach: 'bad' }, '', '2031-01-01', () => true), []);
});

test('email: curators get curatorPitch, others submitPitch, several go in BCC', () => {
  const { m, s } = band();
  const cur = newOutreach({ name: 'Heavy Rotation', type: 'curator', contact: 'Sam Lee', email: 'sam@example.com' });
  const a = outreachEmail(cur, m, { song: s, today: '2030-02-01' });
  const want = curatorPitch(s, m, { curator: 'Sam', playlist: 'Heavy Rotation', today: '2030-02-01' });
  assert.equal(a.subject, want.subject);
  assert.equal(a.body, want.body);
  assert.equal(a.to, 'sam@example.com');
  const blog = newOutreach({ name: 'Metal Blog', type: 'blog', email: 'ed@blog.example' });
  const b = outreachEmail(blog, m, { song: s, today: '2030-02-01' });
  assert.ok(b.body.includes(submitPitch(s, m, { today: '2030-02-01' })));
  assert.ok(b.body.includes('https://open.spotify.com/track/abc'));
  assert.ok(b.body.includes('https://instagram.com/arcflash'));
  assert.ok(!b.body.includes('javascript:'), 'only http(s) band links');
  const intro = outreachEmail(blog, m, {});
  assert.match(intro.subject, /introduction/);
  assert.ok(intro.body.includes('Arc Flash is a Seattle alt-metal band.'));
  const many = outreachEmail([blog, cur, newOutreach({ email: 'not-an-email' })], m, { song: s });
  assert.equal(many.to, '');
  assert.deepEqual(many.bcc, ['ed@blog.example', 'sam@example.com']);
  assert.match(many.body, /^Hi there,/);
  const href = outreachMailto(many);
  assert.match(href, /^mailto:\?subject=/);
  assert.ok(href.endsWith(`&bcc=${encodeURIComponent('ed@blog.example,sam@example.com')}`));
  assert.ok(outreachMailto(a).startsWith(`mailto:${encodeURIComponent('sam@example.com')}?`));
  assert.ok(!outreachMailto(a).includes('bcc='));
});

test('song pitches are listed, not copied', () => {
  const { m, s } = band();
  s.pitches.push(newPitch({ id: 'p1', playlist: 'A', sent: '2030-01-01' }), newPitch({ id: 'p2', playlist: 'B', sent: '2030-02-01' }));
  const list = songPitches(m);
  assert.deepEqual(list.map((x) => x.pitch.id), ['p2', 'p1']);
  assert.equal(list[0].pitch, s.pitches[1], 'same object, read from the song');
  assert.deepEqual(m.outreach, []);
});

test('backup round trip and artist switch keep the outreach list', () => {
  const { m } = band();
  m.outreach = [markSent(newOutreach({ id: 'o1', name: 'KEXP', type: 'radio', email: 'x@kexp.example', notes: 'loves riffs' }), '2030-01-01')];
  const ws = workspaceFrom(m);
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0].outreach, ws.artists[0].outreach);
  assert.deepEqual(back, parseWorkspaceBackup(workspaceBackup(back)));
  const [ws2, id2] = addArtist(ws, 'Other band');
  assert.deepEqual(viewOf(ws2, id2).outreach, [], 'a new artist starts empty');
  const v2 = viewOf(ws2, id2);
  v2.outreach = [newOutreach({ id: 'z', name: 'Theirs' })];
  const ws3 = mergeView(ws2, v2);
  assert.deepEqual(viewOf(ws3, ws.current).outreach, m.outreach, 'the first artist keeps its own list');
  assert.deepEqual(viewOf(ws3, id2).outreach.map((o) => o.id), ['z']);
  const back3 = parseWorkspaceBackup(workspaceBackup(ws3));
  assert.deepEqual(back3.artists.map((a) => a.outreach), ws3.artists.map((a) => a.outreach), 'both artists survive a backup');
});

test('privacy: outreach contacts never reach the press kit, docs, calendar export or health check', () => {
  const MARK = 'ZZPRIVATEMARKERZZ';
  const { m, s } = band();
  const sh = newShow('2030-03-01');
  sh.status = 'confirmed';
  sh.venue = 'Chop Suey';
  m.shows.push(sh);
  m.outreach = [markSent(newOutreach({ id: 'o1', name: 'Blog', contact: `${MARK} person`, email: `${MARK}@example.com`, notes: MARK, log: [{ date: '2030-01-01', text: MARK }] }), '2030-02-20')];
  const outs = [
    epkHTML(m, { today: '2030-02-25' }),
    pressHTML(pressRelease(s, m, { today: '2030-02-25' }).full),
    pressRelease(s, m, { today: '2030-02-25' }).short,
    showSheetHTML(sh, m.band),
    calendarHTML({ title: 'Cal', monthName: 'Feb', items: agenda(m, '2030-02-01', 60) }),
    managerICS(m, { from: '2030-02-01', days: 60, stamp: new Date('2030-01-01T00:00:00Z') }),
    JSON.stringify(pressCheck({ band: m.band, songs: m.songs, shows: m.shows, stats: m.stats, today: '2030-02-25' })),
  ];
  assert.ok(managerICS(m, { from: '2030-02-01', days: 60, stamp: new Date('2030-01-01T00:00:00Z') }).includes('Follow up: Blog'), 'the follow-up itself is exported');
  for (const [i, t] of outs.entries()) assert.ok(!t.includes(MARK), `output ${i} leaks the marker`);
});
