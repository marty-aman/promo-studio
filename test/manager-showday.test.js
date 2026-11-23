import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newShow, normalizeManager, agenda, overdueTasks, addDays, todayISO } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';
import { normalizeShow } from '../js/manager/showsnorm.js';
import { newStage } from '../js/manager/showplan.js';
import { advanceHTML, gearListHTML } from '../js/manager/docs.js';
import { normalizeAdvance, normalizeGear, normalizeRecap, advanceModel, advanceText, advanceMailto, suggestGear, addSuggestions, gearProgress, needsBackline, expenseTotal, recapEmpty, venueHistory, lastTimeHere, showDayItems, newGearItem } from '../js/manager/showday.js';

const today = todayISO();
const MARK = 'ZZ-PLANTED-MARKER-7731';

const withShow = (patch = {}) => {
  const m = newManager();
  m.shows.push({ ...newShow(addDays(today, 20)), id: 's1', venue: 'The Funhouse', status: 'confirmed', ...patch });
  return normalizeManager(m);
};

test('normalisers check bad data and fill defaults', () => {
  const a = normalizeAdvance({ soundcheck: 5, parking: 'x'.repeat(5000), venueContact: 'no', share: { name: 'yes', email: true }, sentOn: 'tomorrow', stagePlot: 'maybe' });
  assert.equal(a.soundcheck, '');
  assert.equal(a.parking.length, 600);
  assert.deepEqual(a.venueContact, { name: '', phone: '', email: '' });
  assert.deepEqual(a.share, { name: false, phone: false, email: true });
  assert.equal(a.sentOn, '');
  assert.equal(a.stagePlot, false);
  assert.equal(normalizeAdvance(undefined).stagePlot, true);
  const g = normalizeGear([null, 4, { label: 'Amp', packed: 'yes', backline: true }, { id: 'k', label: 'Kick', packed: true }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].packed, false);
  assert.ok(g[0].id);
  assert.equal(g[1].id, 'k');
  assert.deepEqual(normalizeGear('x'), []);
  const r = normalizeRecap({ doorCount: '62', expenses: [{ id: 'e', label: 'Gas', amount: '24.5' }, { label: 'Food', amount: 'lots' }, 7], notes: 3 });
  assert.equal(r.doorCount, 62);
  assert.deepEqual(r.expenses.map((e) => e.amount), [24.5, '']);
  assert.equal(r.notes, '');
  assert.equal(normalizeRecap({ doorCount: -3 }).doorCount, '');
  assert.equal(normalizeRecap({ doorCount: true }).doorCount, '');
  assert.equal(expenseTotal(r), 24.5);
  assert.ok(recapEmpty(undefined));
  assert.ok(!recapEmpty({ notes: 'a' }));
});

test('the show normaliser adds the three fields and keeps what was saved', () => {
  const d = newShow('2030-01-01');
  const s = normalizeShow({ ...d, advance: { curfew: '23:00' }, gear: [{ id: 'g', label: 'Amp' }], recap: { doorCount: 40 } }, d);
  assert.equal(s.advance.curfew, '23:00');
  assert.equal(s.gear[0].label, 'Amp');
  assert.equal(s.recap.doorCount, 40);
  const bare = normalizeManager({ shows: [{ id: 'x', date: '2030-01-01' }] }).shows[0];
  assert.deepEqual(bare.gear, []);
  assert.equal(bare.recap.expenses.length, 0);
  assert.equal(bare.advance.sentOn, '');
});

test('backup round trip and artist switch keep advance, gear and recap', () => {
  const m = withShow({ advance: { soundcheck: '17:00', venueContact: { name: 'Sam', phone: '555', email: 's@v.com' }, share: { name: true }, rider: 'two DIs' }, gear: [{ id: 'g1', label: 'Amp', owner: 'Jo', packed: true, borrowed: false, backline: true }], recap: { doorCount: 70, expenses: [{ id: 'e1', label: 'Gas', amount: 30 }, { id: 'e2', label: '', amount: '' }], notes: 'good', whatWorked: 'merch', promoterNote: 'paid', venueNote: 'back door' } });
  const ws = mergeView(workspaceFrom(newManager()), m);
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0].shows, ws.artists[0].shows);
  assert.deepEqual(back.artists[0].shows[0].recap.expenses, [{ id: 'e1', label: 'Gas', amount: 30 }, { id: 'e2', label: '', amount: '' }]);
  const [ws2, id2] = addArtist(ws, 'Other');
  assert.deepEqual(viewOf(ws2, ws.current).shows[0], ws.artists[0].shows[0]);
  assert.deepEqual(viewOf(ws2, id2).shows, []);
  assert.deepEqual(normalizeManager(JSON.parse(JSON.stringify(viewOf(ws2, ws.current)))).shows, viewOf(ws2, ws.current).shows);
});

const planted = () => {
  const m = withShow({
    notes: `show notes ${MARK}-notes`,
    deal: `deal ${MARK}-deal`,
    contact: `contact ${MARK}-contact`,
    settlement: { gross: '', pay: '987654', merch: '', costs: '', fund: '', shares: {} },
    advance: { soundcheck: '17:00', curfew: '23:00', parking: 'lot B', venueContact: { name: `${MARK}-vname`, phone: `${MARK}-vphone`, email: `${MARK}@venue.com` }, share: { name: false, phone: false, email: false }, hospitality: 'water' },
    gear: [{ id: 'g1', label: 'Bass amp', owner: `${MARK}-owner`, packed: true, backline: true }],
    lineup: [{ id: 'l1', name: 'Arc Flash', time: '21:00' }],
  });
  m.band.members = [{ id: 'm1', name: `${MARK}-member`, phone: `${MARK}-mphone` }];
  m.band.stage = newStage('four');
  m.fans = [{ id: 'f1', email: `${MARK}-fan@x.com` }];
  m.availability = [{ id: 'a1', who: `${MARK}-avail` }];
  m.outreach = [{ id: 'o1', name: `${MARK}-outreach` }];
  m.contacts = [{ id: 'c1', name: `${MARK}-contact2`, email: `${MARK}-c@x.com` }];
  m.shows[0].recap = { doorCount: 5, expenses: [], notes: `${MARK}-recap`, whatWorked: '', promoterNote: `${MARK}-promoter`, venueNote: '' };
  return m;
};

test('the advance sheet never carries personal or private data (planted marker)', () => {
  const m = planted();
  const show = m.shows[0];
  const model = advanceModel(show, m.band, { stage: m.band.stage });
  const html = advanceHTML(model);
  const text = advanceText(model);
  const compact = advanceText(model, { compact: true });
  const mail = advanceMailto(show, model, m.band);
  const everything = [html, text, compact, decodeURIComponent(mail.href.split('body=')[1]), JSON.stringify(model), gearListHTML(show, m.band, show.gear)].join('\n');
  assert.ok(!everything.includes(MARK), 'the marker leaked: ' + everything.slice(everything.indexOf(MARK) - 40, everything.indexOf(MARK) + 40));
  assert.ok(!everything.includes('987654'), 'settlement leaked');
  assert.ok(text.includes('Soundcheck: 17:00') && text.includes('Curfew: 23:00') && text.includes('Input list'), text);
  // the unticked venue email is still the recipient: that is what it was typed for
  assert.ok(mail.href.startsWith(`mailto:${encodeURIComponent(`${MARK}@venue.com`)}?`));
});

test('contact details appear only when ticked', () => {
  const m = planted();
  const show = { ...m.shows[0], advance: { ...m.shows[0].advance, share: { name: true, phone: false, email: false } } };
  const model = advanceModel(show, m.band, {});
  const html = advanceHTML(model);
  assert.ok(html.includes(`${MARK}-vname`));
  assert.ok(!html.includes(`${MARK}-vphone`) && !html.includes('@venue.com'));
  assert.deepEqual(model.contacts, [['Venue contact', `${MARK}-vname`]]);
});

test('user text is escaped and links cannot be made', () => {
  const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
  const m = withShow({ venue: evil, advance: { parking: evil, rider: evil, hospitality: evil, notes: evil, venueContact: { name: evil, phone: evil, email: evil }, share: { name: true, phone: true, email: true } }, lineup: [{ id: 'l', name: evil, time: '' }], gear: [{ id: 'g', label: evil, owner: evil, backline: true }] });
  m.band.name = evil;
  m.band.stage = { items: [{ id: 'i', type: 'vocal', x: 0.5, y: 0.5, label: evil }], notes: evil, backline: evil };
  const show = m.shows[0];
  const html = advanceHTML(advanceModel(show, m.band, { stage: m.band.stage })) + gearListHTML(show, m.band, show.gear);
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'), 'unescaped markup');
  assert.ok(!/href=/i.test(advanceHTML(advanceModel(show, m.band, {}))), 'the sheet has no links');
  const mail = advanceMailto(show, advanceModel(show, m.band, {}), m.band);
  assert.ok(mail.href.startsWith('mailto:?'), 'a hostile address is not used as the recipient: ' + mail.href.slice(0, 40));
});

test('the mailto link stays short enough for mail apps', () => {
  const m = withShow({ advance: { rider: 'amp '.repeat(1200), parking: 'park '.repeat(100) } });
  m.band.stage = newStage('five');
  const model = advanceModel(m.shows[0], m.band, { stage: m.band.stage });
  const mail = advanceMailto(m.shows[0], model, m.band);
  assert.ok(mail.href.length <= 1900, String(mail.href.length));
  assert.ok(mail.href.startsWith('mailto:?subject='));
});

test('gear suggestions come from the stage plot, are not duplicated, and progress counts only what you bring', () => {
  const stage = newStage('four');
  const sug = suggestGear(stage);
  const labels = sug.map((g) => g.label);
  assert.ok(labels.includes('Drum kit') && labels.includes('Guitar amp') && labels.includes('Bass amp'));
  assert.ok(!labels.some((l) => /riser|^power$/i.test(l)));
  assert.ok(labels.includes('Cables and power strips'));
  assert.ok(suggestGear(null).length >= 3, 'works with no stage plot');
  const again = addSuggestions(sug.slice(0, 3), sug);
  assert.equal(again.length, sug.length);
  assert.equal(addSuggestions(again, sug.map((g) => ({ ...g, label: g.label.toUpperCase() }))).length, again.length);
  const list = [{ ...newGearItem('Amp'), packed: true }, { ...newGearItem('Drums'), backline: true }, { ...newGearItem('Bass'), backline: true, borrowed: true }, newGearItem('Cables')];
  assert.deepEqual(gearProgress(list), { packed: 1, total: 3, needs: 1 });
  assert.ok(needsBackline(list[1]) && !needsBackline(list[2]));
  assert.ok(advanceModel({ ...newShow(today), gear: list }, {}, {}).needs.includes('Drums'));
  assert.ok(gearListHTML({ venue: 'V' }, {}, list).includes('Needs backline'));
});

test('earlier shows at the same venue, newest first', () => {
  const mk = (id, date, o) => ({ ...newShow(date), id, venue: 'The Funhouse', status: 'played', ...o });
  const shows = [
    mk('a', '2026-01-10', { settlement: { pay: '100', merch: '20', costs: '10' }, recap: { venueNote: 'Load in at the back', doorCount: 62, promoterNote: 'paid on time' } }),
    mk('b', '2026-03-03', {}),
    mk('c', '2026-02-02', { venue: 'Other place' }),
    mk('d', '2026-04-04', { status: 'cancelled' }),
    mk('e', '2026-05-05', { venue: 'the  FUNHOUSE!', venueId: null }),
    mk('f', '2026-06-06', { venue: 'Renamed', venueId: 'v9' }),
  ];
  const rows = venueHistory(shows, { venue: 'The Funhouse' });
  assert.deepEqual(rows.map((r) => r.id), ['e', 'b', 'a']);
  assert.deepEqual(venueHistory(shows, { venueId: 'v9' }).map((r) => r.id), ['f']);
  assert.deepEqual(venueHistory(shows, { venue: 'The Funhouse' }, { skipId: 'e' }).map((r) => r.id), ['b', 'a']);
  const a = rows.find((r) => r.id === 'a');
  assert.equal(a.net, 110);
  assert.equal(lastTimeHere([a]).startsWith('Last time here: '), true);
  assert.match(lastTimeHere([a]), /net \$110 · 62 at the door · “Load in at the back”/);
  assert.equal(lastTimeHere([]), '');
  assert.equal(rows.find((r) => r.id === 'b').net, null);
});

const ids = (m, from, days) => agenda(m, from, days).filter((x) => /^(advance|recap)-/.test(x.key || '')).map((x) => x.key);

test('reminders: advance sheet a week before until sent, recap the day after', () => {
  const m = withShow({ date: addDays(today, 9) });
  assert.deepEqual(ids(m, today, 2), []);
  assert.deepEqual(ids(m, addDays(today, 2), 1), ['advance-s1']);
  const item = agenda(m, addDays(today, 2), 1).find((x) => x.key === 'advance-s1');
  assert.equal(item.kind, 'task');
  assert.deepEqual(item.ref, { page: 'shows', id: 's1' });
  m.shows[0].advance.sentOn = today;
  assert.deepEqual(ids(m, addDays(today, 2), 1), []);
  // late: the date is past but the show is still ahead
  const late = withShow({ date: addDays(today, 3) });
  assert.equal(overdueTasks(late, today).filter((o) => o.task.id === 'advance-s1').length, 1);
  // played, no recap: due the day after, overdue until filled in
  const played = withShow({ status: 'played', date: addDays(today, -3) });
  assert.equal(overdueTasks(played, today).filter((o) => o.task.id === 'recap-s1').length, 1);
  played.shows[0].recap.notes = 'done';
  assert.equal(overdueTasks(played, today).filter((o) => o.task.id === 'recap-s1').length, 0);
  const today1 = withShow({ status: 'played', date: today });
  assert.equal(overdueTasks(today1, today).length, 0, 'the recap is due tomorrow');
  assert.deepEqual(ids(today1, addDays(today, 1), 1), ['recap-s1']);
});

test('reminders skip cancelled, past and not-played shows (no overdue noise)', () => {
  const none = (patch) => {
    const m = withShow(patch);
    const keys = overdueTasks(m, today).filter((o) => /^(advance|recap)-/.test(o.task.id));
    return keys.length + ids(m, addDays(today, -60), 200).length;
  };
  assert.equal(none({ status: 'cancelled', date: addDays(today, 3) }), 0);
  assert.equal(none({ status: 'cancelled', date: addDays(today, -3) }), 0);
  assert.equal(none({ status: 'confirmed', date: addDays(today, -20) }), 0, 'past and never marked played');
  assert.equal(none({ status: 'idea', date: addDays(today, 3) }), 0);
  assert.equal(none({ status: 'pitched', date: addDays(today, 3) }), 0);
  assert.equal(none({ status: 'played', date: addDays(today, -200) }), 0, 'an old logged show');
  assert.equal(none({ status: 'played', date: addDays(today, -15) }), 0);
  assert.equal(none({ status: 'confirmed', date: '' }), 0);
  // the pure function agrees for any "today"
  const m = withShow({ status: 'played', date: '2020-01-01' });
  assert.equal(showDayItems(m, '', '2020-01-10', (d) => d < '2020-01-10', '2020-01-10').length, 1);
  assert.equal(showDayItems(m, '', '2021-01-20', (d) => d < '2021-01-20', '2021-01-20').length, 0);
});
