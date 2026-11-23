import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LIMITS, newPoll, normalizePoll, cleanText, cleanDates, splitNames, datesInRange, pollProblem, encodeReply, decodeReply, findCodes, mergeCodes, tally, peopleOf, eventFromPoll, showFromPoll, buildPollFile, POLL_SCRIPT, SCRIPT_HASH, pollFileName } from '../js/manager/availability.js';
import { newManager, normalizeManager, normalizeEvents } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup, normalizeWorkspace } from '../js/manager/artists.js';
import { managerICS, epkHTML } from '../js/manager/extras.js';
import { calendarHTML, showSheetHTML } from '../js/manager/docs.js';
import { agenda } from '../js/manager/model.js';

const D = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'];
const mk = (extra = {}) => newPoll({ title: 'Rehearsal', dates: D, kind: 'rehearsal', members: ['Ana', 'Ben', 'Cy'], ...extra }, new Date('2026-11-23T10:00:00Z'));
const code = (poll, name, a) => encodeReply({ p: poll.id, n: name, a });

test('newPoll cleans its input and respects the limits', () => {
  const p = newPoll({ title: '  Big\n\tday  ', dates: [...D, D[0], 'nope', '2026-02-31'], members: 'Ana, ben\nANA;  ' });
  assert.equal(p.title, 'Big day');
  assert.deepEqual(p.dates, D);
  assert.deepEqual(p.members, ['Ana', 'ben']);
  assert.equal(p.decided, '');
  assert.equal(newPoll({ dates: D, kind: 'nonsense' }).kind, 'other');
  assert.equal(newPoll({ dates: D }).title, 'Rehearsal poll');
  const many = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
  assert.equal(cleanDates(many).length, LIMITS.dates);
  assert.equal(splitNames(Array.from({ length: 20 }, (_, i) => `P${i}`).join(',')).length, LIMITS.people);
  assert.equal(cleanText('x'.repeat(100), 10).length, 10);
  assert.ok(pollProblem({ dates: [D[0]] }));
  assert.ok(pollProblem({ dates: many }));
  assert.equal(pollProblem({ dates: D, members: 'a,b', title: 'ok' }), '');
});

test('datesInRange picks the chosen weekdays', () => {
  const r = datesInRange('2026-12-01', '2026-12-14', [2, 4]); // Tue, Thu
  assert.deepEqual(r, ['2026-12-01', '2026-12-03', '2026-12-08', '2026-12-10']);
  assert.deepEqual(datesInRange('2026-12-05', '2026-12-01', [1]), []);
  assert.deepEqual(datesInRange('2026-12-01', '2026-12-05', []), []);
});

test('reply code round trip keeps unicode names', () => {
  for (const n of ['Zoë Ångström', '李雷', 'Måns 🎸', "O'Brien <b>"]) {
    const c = encodeReply({ p: 'poll_abc', n, a: 'ymn-' });
    assert.match(c, /^AV1\.[A-Za-z0-9_-]+$/);
    const d = decodeReply(c);
    assert.ok(d.ok, n);
    assert.deepEqual(d.reply, { p: 'poll_abc', n, a: 'ymn-' });
  }
});

test('tampered, oversized and foreign codes are rejected', () => {
  const good = encodeReply({ p: 'p1', n: 'Ana', a: 'yy' });
  const bad = [
    '', 'AV1.', 'AV1.!!!', 'AV1.' + good.slice(4, -3), 'AV1.' + 'A'.repeat(1600), 'XX1.' + good.slice(4),
    encodeReply({ p: 'p1', n: 'Ana', a: 'yz' }), encodeReply({ p: 'p1', n: '   ', a: 'yy' }), encodeReply({ p: '', n: 'Ana', a: 'yy' }),
    encodeReply({ p: 'p1', n: 'Ana', a: 'y'.repeat(61) }), encodeReply({ p: 'p1', n: 'Ana', a: '' }),
    'AV1.' + Buffer.from('not json').toString('base64url'), 'AV1.' + Buffer.from('[1,2]').toString('base64url'),
    'AV1.' + Buffer.from('{"v":2,"p":"p1","n":"Ana","a":"yy"}').toString('base64url'),
    'AV1.' + Buffer.from('{"v":1,"p":7,"n":"Ana","a":"yy"}').toString('base64url'),
    'AV1.' + Buffer.from([0xff, 0xfe, 0xfd, 0xfc]).toString('base64url'), // not UTF-8
  ];
  for (const b of bad) assert.equal(decodeReply(b).ok, false, b.slice(0, 40));
  assert.equal(decodeReply(null).ok, false);
  assert.equal(findCodes('x'.repeat(LIMITS.paste + 1)).error !== undefined, true);
  assert.deepEqual(findCodes('hi! my code: ' + good + ' thanks').tokens, [good]);
});

test('merging replies: adds, replaces a person, ignores strangers', () => {
  const p = mk();
  const t0 = '2026-11-24T08:00:00.000Z';
  let r = mergeCodes(p, `${code(p, 'ana', 'yymn')}\n${code(p, 'Ben', 'm-nn')}`, t0);
  assert.deepEqual(r.results.map((x) => x.status), ['added', 'added']);
  assert.equal(r.poll.replies[0].name, 'Ana', 'a member keeps the spelling you typed');
  assert.deepEqual(r.poll.replies[0].answers, { '2026-12-01': 'yes', '2026-12-02': 'yes', '2026-12-03': 'maybe', '2026-12-04': 'no' });
  assert.deepEqual(r.poll.replies[1].answers, { '2026-12-01': 'maybe', '2026-12-03': 'no', '2026-12-04': 'no' }, 'unanswered dates are left out');
  assert.equal(p.replies.length, 0, 'the old poll is not changed');
  r = mergeCodes(r.poll, code(p, 'ANA', 'nnnn'), '2026-11-25T08:00:00.000Z');
  assert.equal(r.results[0].status, 'replaced');
  assert.equal(r.poll.replies.length, 2);
  assert.equal(r.poll.replies.find((x) => x.name === 'Ana').at, '2026-11-25T08:00:00.000Z');
  r = mergeCodes(r.poll, code(p, 'Ana', 'nnnn'), '2027-01-01T00:00:00.000Z');
  assert.equal(r.results[0].status, 'unchanged');
  assert.equal(r.poll.replies.find((x) => x.name === 'Ana').at, '2026-11-25T08:00:00.000Z', 'same answers keep the first time');
  // someone not on your list is added to the grid
  r = mergeCodes(r.poll, code(p, 'Dee', 'yyyy'), t0);
  assert.equal(r.results[0].extra, true);
  assert.deepEqual(peopleOf(r.poll), ['Ana', 'Ben', 'Cy', 'Dee']);
  // other poll, wrong length, junk
  const other = mergeCodes(r.poll, encodeReply({ p: 'someone-elses', n: 'Eve', a: 'yyyy' }) + ' ' + code(p, 'Eve', 'yy') + ' AV1.junk');
  assert.deepEqual(other.results.map((x) => x.ok), [false, false, false]);
  assert.match(other.results[0].error, /different poll/);
  assert.match(other.results[1].error, /2 dates/);
  assert.equal(other.poll.replies.length, r.poll.replies.length);
  assert.equal(mergeCodes(p, 'nothing here').results[0].ok, false);
});

test('a poll holds at most 12 people', () => {
  let p = mk({ members: [] });
  for (let i = 0; i < 12; i++) p = mergeCodes(p, code(p, `P${i}`, 'yyyy')).poll;
  assert.equal(p.replies.length, 12);
  const r = mergeCodes(p, code(p, 'P12', 'yyyy'));
  assert.equal(r.results[0].ok, false);
  assert.equal(r.poll.replies.length, 12);
  assert.equal(mergeCodes(p, code(p, 'p3', 'nnnn')).results[0].status, 'replaced', 'an existing person can still change their answer');
});

test('tally: everyone, maybes only, best date, waiting', () => {
  let p = mk();
  p = mergeCodes(p, [code(p, 'Ana', 'yymn'), code(p, 'Ben', 'ymyn')].join(' ')).poll;
  let t = tally(p);
  assert.deepEqual(t.waiting, ['Cy']);
  assert.deepEqual(t.everyone, [], 'nobody is "everyone" until all have replied');
  assert.equal(t.best, '2026-12-01');
  p = mergeCodes(p, code(p, 'Cy', 'ymmy')).poll;
  t = tally(p);
  assert.deepEqual(t.waiting, []);
  assert.deepEqual(t.everyone, ['2026-12-01']);
  assert.deepEqual(t.maybesOnly, ['2026-12-02', '2026-12-03']);
  assert.equal(t.best, '2026-12-01');
  const r2 = t.rows[1];
  assert.deepEqual([r2.yes, r2.maybe, r2.no, r2.none], [1, 2, 0, 0]);
  assert.equal(t.rows[3].no, 2);
});

test('best date: yes beats maybe, fewer no breaks ties, then the earliest; none without a yes or maybe', () => {
  let p = mk({ members: ['A', 'B'], dates: ['2026-12-01', '2026-12-02', '2026-12-03'] });
  assert.equal(tally(p).best, '');
  p = mergeCodes(p, code(p, 'A', 'nnn') + ' ' + code(p, 'B', 'nnn')).poll;
  assert.equal(tally(p).best, '', 'everyone said no');
  p = mergeCodes(p, code(p, 'A', 'myy') + ' ' + code(p, 'B', 'm-y')).poll;
  assert.equal(tally(p).best, '2026-12-03', 'two yes beat two maybes');
  p = mergeCodes(p, code(p, 'A', 'mmm') + ' ' + code(p, 'B', 'mmm')).poll;
  assert.equal(tally(p).best, '2026-12-01', 'a tie goes to the earliest date');
  p = mergeCodes(p, code(p, 'A', 'ymy') + ' ' + code(p, 'B', 'nyn')).poll;
  assert.equal(tally(p).best, '2026-12-02', 'yes+no ties on score; more yes, then fewer no, decide');
});

test('normalizePoll survives junk and keeps unknown fields', () => {
  for (const bad of [null, 5, 'x', [], {}, { id: 3, dates: 'x', replies: 'x', members: {}, kind: 9 }]) {
    const p = normalizePoll(bad);
    assert.deepEqual([p.dates, p.members, p.replies], [[], [], []]);
  }
  const p = mk();
  const q = normalizePoll({ ...p, eventId: 'ev_1', replies: [{ name: 'Ana', answers: { '2026-12-01': 'yes', '2030-01-01': 'yes', '2026-12-02': 'perhaps' }, at: 5 }, null, { name: '' }], decided: '2099-01-01' });
  assert.equal(q.eventId, 'ev_1');
  assert.deepEqual(q.replies, [{ name: 'Ana', answers: { '2026-12-01': 'yes' }, at: '' }]);
  assert.equal(q.decided, '');
  assert.equal(normalizePoll({ ...p, decided: '2026-12-02' }).decided, '2026-12-02');
});

test('Pick this date: an event of the right kind, or a show draft, without names', () => {
  const p = mk({ title: 'Rehearse for Funhouse' });
  const e = eventFromPoll(p, '2026-12-02', { start: '19:00', end: '21:30' });
  assert.deepEqual([e.date, e.title, e.kind, e.start, e.end, e.allDay], ['2026-12-02', 'Rehearse for Funhouse', 'rehearsal', '19:00', '21:30', false]);
  assert.equal(normalizeEvents([e]).length, 1, 'the model accepts it');
  assert.equal(eventFromPoll(p, '2026-12-02', { start: '25:00' }).allDay, true);
  assert.equal(eventFromPoll(newPoll({ dates: D, kind: 'recording', title: 'Tracking' }), D[0]).kind, 'other');
  assert.ok(!JSON.stringify(e).includes('Ana'));
  const s = showFromPoll(newPoll({ dates: D, kind: 'show' }), D[1], 'Tacoma');
  assert.deepEqual([s.date, s.city, s.status], [D[1], 'Tacoma', 'idea']);
});

test('the poll file: self-contained, strict CSP, escaped, under 30 KB at the limits', () => {
  assert.equal('sha256-' + createHash('sha256').update(POLL_SCRIPT, 'utf8').digest('base64'), SCRIPT_HASH, 'update SCRIPT_HASH after editing the script');
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>&\'';
  const p = mk({ title: evil, members: [evil, 'Zoë 🎸', '</datalist><b>x</b>'] });
  const f = buildPollFile(p);
  assert.match(f, new RegExp(`script-src '${SCRIPT_HASH.replace(/[+/]/g, '\\$&')}'`));
  assert.match(f, /default-src 'none'/);
  assert.doesNotMatch(f, /connect-src|unsafe-eval|https?:\/\//, 'no network and no external URLs');
  assert.equal(f.split('<script').length - 1, 1, 'exactly one script');
  assert.equal(f.split('</script>').length - 1, 1);
  assert.ok(!f.includes('<script>alert'), 'typed text is escaped');
  assert.ok(!f.includes('<img src=x'));
  assert.ok(!f.includes('</datalist><b>'));
  assert.ok(!/<[a-z][^>]*\son\w+=/i.test(f.replace(/<script>[\s\S]*<\/script>/, '')), 'no inline handlers');
  assert.ok(f.includes('&lt;script&gt;alert(1)'));
  for (const d of D) assert.ok(f.includes(`data-d="${d}"`));
  assert.ok(f.includes(`data-poll="${p.id}"`));
  // the maximum: 60 dates, 12 people with long names, a long title of characters that grow when escaped
  const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
  const big = newPoll({ title: '&'.repeat(80), dates, members: Array.from({ length: 12 }, (_, i) => `${i}`.padEnd(40, '🎸')) });
  assert.equal(big.dates.length, 60);
  assert.equal(big.members.length, 12);
  const size = Buffer.byteLength(buildPollFile(big), 'utf8');
  assert.ok(size < 30 * 1024, `poll file is ${size} bytes`);
  assert.throws(() => buildPollFile({ ...p, id: '' }));
  assert.throws(() => buildPollFile({ ...p, dates: [] }));
  assert.match(pollFileName({ title: 'Rehearsal / "Dec" ✓' }), /^[\p{L}\p{N}-]+-availability-poll\.html$/u);
});

test('no personal data in the file or the codes', () => {
  const p = mk();
  const f = buildPollFile({ ...p, email: 'me@example.com', phone: '555-0100', replies: [{ name: 'Ana', answers: {}, at: '', email: 'ana@example.com' }] });
  for (const s of ['me@example.com', '555-0100', 'ana@example.com']) assert.ok(!f.includes(s), s);
  // a code only ever carries four fields
  const j = JSON.parse(Buffer.from(encodeReply({ p: 'x', n: 'Ana', a: 'y' }).slice(4), 'base64url').toString());
  assert.deepEqual(Object.keys(j).sort(), ['a', 'n', 'p', 'v']);
});

test('bandmate names and answers never reach the press kit, calendar PDF, .ics, show sheet or agenda', () => {
  const MARK = 'ZQXMARKER';
  const m = newManager();
  let p = mk({ title: `${MARK}Title`, members: [`${MARK}Ana`, `${MARK}Ben`] });
  p = mergeCodes(p, code(p, `${MARK}Ana`, 'yymn')).poll;
  m.availability.push({ ...p, note: MARK });
  const pick = eventFromPoll(p, '2026-12-02');
  m.events.push({ ...pick, title: 'Band rehearsal' }); // the title the organiser kept; names are never added
  assert.ok(!JSON.stringify(pick).includes(`${MARK}Ana`));
  const show = { ...showFromPoll(p, '2026-12-03', 'Tacoma'), id: 's1', venue: 'Funhouse' };
  m.shows.push(show);
  const outputs = [
    epkHTML(m, { today: '2026-11-23' }),
    managerICS(m, { from: '2026-11-01' }),
    calendarHTML({ title: 'Cal', monthName: 'December', items: agenda(m, '2026-11-25', 30) }),
    showSheetHTML(show, m.band),
  ];
  for (const o of outputs) assert.ok(!o.includes(MARK), 'a bandmate marker leaked');
  assert.ok(outputs[1].includes('Band rehearsal'), 'the check really sees calendar output');
});

test('availability survives backup, restore and switching artist', () => {
  let p = mk();
  p = mergeCodes(p, code(p, 'Ana', 'yymn') + ' ' + code(p, 'Zoë 🎸', 'ymmy')).poll;
  p = { ...p, decided: '2026-12-02', eventId: 'ev_x' };
  const m = { ...newManager(), availability: [p] };
  const ws = mergeView(workspaceFrom(newManager()), m);
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0].availability, ws.artists[0].availability);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(ws))).artists[0].availability, [p]);
  assert.deepEqual(normalizePoll(back.artists[0].availability[0]), p, 'normalising a restored poll changes nothing');
  assert.deepEqual(normalizeManager(JSON.parse(JSON.stringify(m))).availability.map(normalizePoll), [p]);
  const [ws2, id2] = addArtist(ws, 'Other band');
  assert.deepEqual(viewOf(ws2, id2).availability, [], 'a new artist starts without polls');
  assert.deepEqual(viewOf(ws2, ws.current).availability, [p], 'and the first artist keeps theirs');
  const ws3 = mergeView(ws2, viewOf(ws2, ws.current));
  assert.deepEqual(viewOf(ws3, ws.current).availability, [p]);
});
