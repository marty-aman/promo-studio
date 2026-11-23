// Fans & opportunities (G5): fan list logic, CSV, BCC chunking, city matching, the opportunities
// seed and reminders, backup round trips, and the privacy rule that fan data never reaches a
// generated document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, agenda, overdueTasks, todayISO, addDays } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup, normalizeWorkspace } from '../js/manager/artists.js';
import { normalizeFan, normalizeFans, addFans, parseFanLines, fansFromCSV, guessFanColumns, fansCSV, bccMailtos, emailable, citySummary, cityKey, fansInCity, showsWithFans, filterFans, aliasList, FAN_IMPORT_CAP, isEmail } from '../js/manager/fans.js';
import { normalizeOpp, newOpp, filterOpps, oppReminders, seedOpps, needsOppSeed, SEED_OPPS, SEED_OPPS_ON, daysLeft } from '../js/manager/opps.js';
import { epkHTML, managerICS, moneyLines, moneySummary } from '../js/manager/extras.js';
import { showSheetHTML, stageSetlistHTML, moneyHTML, calendarHTML } from '../js/manager/docs.js';
import { pressRelease, pressHTML, spotifyPitch, curatorPitch, submitPitch } from '../js/manager/press.js';
import { pitchEmail } from '../js/manager/planner.js';
import { newPlan, showPlanHTML, newStage, stagePlotHTML } from '../js/manager/showplan.js';
import { newTour, newStop, tourHTML } from '../js/manager/tours.js';
import { setlistTimes } from '../js/manager/setlist.js';
import { callSheetHTML } from '../js/manager/page-shoot.js';

// ---- fans

test('normalizeFan keeps only the allowed fields: no phone, consent only when true', () => {
  const f = normalizeFan({ id: 'f1', email: ' Sam@Example.com ', phone: '555-0100', mobile: '1', name: 'Sam', city: 'Tacoma', source: 'merch', consent: 'yes', extra: { a: 1 } });
  assert.deepEqual(Object.keys(f).sort(), ['added', 'city', 'consent', 'email', 'id', 'name', 'note', 'region', 'showId', 'source'].sort());
  assert.equal(f.email, 'Sam@Example.com');
  assert.equal(f.consent, false);
  assert.equal(normalizeFan({ email: 'bad', source: 'nope' }).email, '');
  assert.equal(normalizeFan({ source: 'nope' }).source, 'other');
  assert.equal(normalizeFan({ consent: true }).consent, true);
  assert.deepEqual(normalizeFans('x'), []);
});

test('addFans skips duplicates by email (any case), invalid rows and anything over the caps', () => {
  const have = [normalizeFan({ id: 'a', email: 'one@x.com' })];
  const r = addFans(have, [{ email: 'ONE@x.com' }, { email: 'two@x.com' }, { email: 'Two@X.com' }, { email: 'nope' }, { email: 'three@x.com' }], { today: '2026-11-23', cap: 4 });
  assert.equal(r.added, 1);
  assert.equal(r.dupes, 2);
  assert.equal(r.invalid, 1);
  assert.equal(r.over, 1);
  assert.deepEqual(r.list.map((f) => f.email), ['one@x.com', 'two@x.com']);
  assert.equal(r.list[1].added, '2026-11-23');
  const full = addFans([], [{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }], { max: 2 });
  assert.equal(full.added, 2);
  assert.equal(full.over, 1);
});

test('parseFanLines: email anywhere on the line, quotes, BOM and blank lines', () => {
  const rows = parseFanLines('\uFEFFsam@x.com, Sam, Tacoma\n\n"Lee, Jr.", lee@x.com, Seattle\r\nnoemail here\n');
  assert.deepEqual(rows[0], { email: 'sam@x.com', name: 'Sam', city: 'Tacoma' });
  assert.deepEqual(rows[1], { email: 'lee@x.com', name: 'Lee, Jr.', city: 'Seattle' });
  assert.equal(rows.length, 3);
  assert.equal(isEmail(rows[2].email), false);
});

test('CSV import: BOM, quoted commas and quotes, headings guessed, phone never mapped', () => {
  const text = '\uFEFFFirst Name,Last Name,Email Address,Phone,City,"State"\r\n"Ann ""AJ""",Lee,ann@x.com,555-0100,"Portland, OR",OR\r\nBo,,bo@x.com,555,Seattle,WA\r\n';
  const p = fansFromCSV(text);
  assert.deepEqual(p.map, ['first', 'last', 'email', '', 'city', 'region']);
  assert.equal(p.total, 2);
  assert.deepEqual(p.rows[0], { email: 'ann@x.com', name: 'Ann "AJ" Lee', city: 'Portland, OR', region: 'OR', note: '' });
  assert.ok(!JSON.stringify(p.rows).includes('555'));
  assert.deepEqual(guessFanColumns(['Mobile', 'Telephone', 'e-mail']), ['', '', 'email']);
});

test('CSV import without a heading row, semicolons, and the row cap', () => {
  const p = fansFromCSV('a@x.com;Al;Tacoma\nb@x.com;Bea;Olympia');
  assert.equal(p.head.length, 0);
  assert.deepEqual(p.rows.map((r) => [r.email, r.name, r.city]), [['a@x.com', 'Al', 'Tacoma'], ['b@x.com', 'Bea', 'Olympia']]);
  const big = ['email', ...Array.from({ length: FAN_IMPORT_CAP + 50 }, (_, i) => `f${i}@x.com`)].join('\n');
  const q = fansFromCSV(big);
  assert.equal(q.total, FAN_IMPORT_CAP + 50);
  assert.equal(q.rows.length, FAN_IMPORT_CAP);
  // duplicates inside one file are skipped on add
  const r = addFans([], fansFromCSV('email\nx@x.com\nX@x.com\ny@x.com').rows);
  assert.equal(r.added, 2);
  assert.equal(r.dupes, 1);
});

test('CSV export guards spreadsheet formulas and reads back', () => {
  const csv = fansCSV([{ id: '1', email: 'a@x.com', name: '=HYPERLINK("x")', city: 'Seattle', consent: true }, { id: '2', email: 'b@x.com', name: 'Bo, "B"', note: '+1 more' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes(`"'+1 more"`));
  const back = fansFromCSV(csv);
  assert.deepEqual(back.rows.map((r) => r.email), ['a@x.com', 'b@x.com']);
  assert.equal(back.rows[1].name, 'Bo, "B"');
});

test('bccMailtos: BCC only, every address exactly once, links under the length and recipient caps', () => {
  const emails = Array.from({ length: 230 }, (_, i) => `fan.number.${i}@example.com`);
  const links = bccMailtos([...emails, 'FAN.NUMBER.3@example.com', 'bad'], { subject: 'Show & tell?', to: 'band@x.com', maxLen: 1800, perMail: 50 });
  assert.ok(links.length >= 5);
  const got = [];
  for (const l of links) {
    assert.ok(l.href.length <= 1800, l.href.length);
    assert.ok(l.href.startsWith('mailto:band%40x.com?bcc='));
    assert.ok(l.href.includes('subject=Show%20%26%20tell%3F'));
    assert.ok(!/[?&]to=|[?&]cc=/.test(l.href));
    const list = decodeURIComponent(l.href.split('bcc=')[1].split('&')[0]).split(',');
    assert.ok(list.length <= 50);
    assert.equal(l.count, list.length);
    got.push(...list);
  }
  assert.deepEqual(got, emails);
  assert.deepEqual(bccMailtos([]), []);
  assert.equal(bccMailtos(['a@x.com'])[0].href, 'mailto:?bcc=a%40x.com');
  // a tight limit still never splits an address
  const tight = bccMailtos(['a@x.com', 'b@x.com', 'c@x.com'], { maxLen: 30 });
  assert.equal(tight.length, 3);
});

test('emailable needs an email and consent', () => {
  assert.deepEqual(emailable([{ id: '1', email: 'a@x.com', consent: true }, { id: '2', email: 'b@x.com' }, { id: '3', consent: true }]).map((f) => f.id), ['1']);
});

test('city matching: case and spaces ignored, nearby towns, summary', () => {
  const fans = [
    { id: '1', email: 'a@x.com', city: ' seattle ', consent: true },
    { id: '2', email: 'b@x.com', city: 'SEATTLE' },
    { id: '3', email: 'c@x.com', city: 'Bellevue', consent: true },
    { id: '4', email: 'd@x.com', city: 'Portland' },
    { id: '5', email: 'e@x.com', city: '' },
  ];
  assert.equal(cityKey('  New   York '), 'new york');
  assert.deepEqual(fansInCity(fans, 'Seattle').map((f) => f.id), ['1', '2']);
  assert.deepEqual(fansInCity(fans, 'Seattle', { seattle: 'Bellevue; Tacoma' }).map((f) => f.id), ['1', '2', '3']);
  assert.deepEqual(fansInCity(fans, ''), []);
  assert.deepEqual(aliasList('Tacoma, tacoma ,; Everett'), ['tacoma', 'everett']);
  assert.deepEqual(citySummary(fans).map((g) => [g.city, g.count]), [[' seattle '.trim(), 2], ['Bellevue', 1], ['Portland', 1]]);
  assert.deepEqual(filterFans(fans, { city: 'seattle' }).map((f) => f.id).sort(), ['1', '2']);
  assert.deepEqual(filterFans(fans, { sort: 'city' }).map((f) => f.id)[0], '5');
});

test('showsWithFans: upcoming, not cancelled or played, with counts and who can be emailed', () => {
  const m = newManager();
  m.band.fanAliases = { seattle: 'Bellevue' };
  m.fans = [{ id: '1', email: 'a@x.com', city: 'Seattle', consent: true }, { id: '2', email: 'b@x.com', city: 'bellevue' }, { id: '3', email: 'c@x.com', city: 'Tacoma', consent: true }];
  const s = (date, city, status = 'confirmed') => ({ ...newShow(date), city, status, venue: `V ${date}` });
  m.shows = [s('2026-12-05', 'Seattle'), s('2026-12-01', 'Tacoma'), s('2026-11-01', 'Seattle'), s('2026-12-10', 'Seattle', 'cancelled'), s('2026-12-12', 'Seattle', 'played')];
  const r = showsWithFans(m, '2026-11-23');
  assert.deepEqual(r.map((x) => [x.show.date, x.count, x.reachable]), [['2026-12-01', 1, 1], ['2026-12-05', 2, 1]]);
});

// ---- opportunities

test('normalizeOpp checks fields and keeps unknown ones', () => {
  const o = normalizeOpp({ id: 'o1', kind: 'x', status: 'y', url: 'javascript:alert(1)', deadline: '12/01/2026', name: ' N ', future: 1 });
  assert.equal(o.kind, 'other');
  assert.equal(o.status, 'interested');
  assert.equal(o.url, '');
  assert.equal(o.deadline, '');
  assert.equal(o.name, 'N');
  assert.equal(o.future, 1);
  assert.equal(newOpp({ name: 'G' }).kind, 'grant');
});

test('filterOpps: filters by kind, status and region; deadline sort puts open first, then no date, then closed', () => {
  const list = [
    { id: 'a', name: 'A', kind: 'grant', deadline: '2026-12-20', region: 'Seattle, WA' },
    { id: 'b', name: 'B', kind: 'festival', deadline: '', region: 'Toronto, ON', status: 'applied' },
    { id: 'c', name: 'C', kind: 'grant', deadline: '2026-11-01', region: 'Seattle, WA' },
    { id: 'd', name: 'D', kind: 'contest', deadline: '2026-12-01', region: 'USA' },
  ];
  const today = '2026-11-23';
  assert.deepEqual(filterOpps(list, { today }).map((o) => o.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(filterOpps(list, { kind: 'grant', today }).map((o) => o.id), ['a', 'c']);
  assert.deepEqual(filterOpps(list, { status: 'applied', today }).map((o) => o.id), ['b']);
  assert.deepEqual(filterOpps(list, { region: 'seattle', today }).map((o) => o.id), ['a', 'c']);
  assert.equal(daysLeft(list[3], today), 8);
  assert.equal(daysLeft(list[1], today), null);
});

test('deadline reminders: 14 and 3 days before, skipping applied, won, passed, past and undated', () => {
  const today = '2026-11-23';
  const all = (d) => !!d;
  const list = [
    { id: 'far', name: 'Far', deadline: '2026-12-31' },
    { id: 'near', name: 'Near', deadline: '2026-11-30' },
    { id: 'gone', name: 'Gone', deadline: '2026-11-20' },
    { id: 'app', name: 'Applied', deadline: '2026-12-31', status: 'applied' },
    { id: 'pass', name: 'Passed', deadline: '2026-12-31', status: 'passed' },
    { id: 'won', name: 'Won', deadline: '2026-12-31', status: 'won' },
    { id: 'none', name: 'None', deadline: '' },
  ];
  const r = oppReminders(list, today, all);
  assert.deepEqual(r.map((x) => [x.key, x.date, x.title]), [
    ['opp-far-14', '2026-12-17', 'Deadline in 14 days: Far'],
    ['opp-far-3', '2026-12-28', 'Deadline in 3 days: Far'],
    ['opp-near-14', '2026-11-16', 'Deadline in 14 days: Near'],
    ['opp-near-3', '2026-11-27', 'Deadline in 3 days: Near'],
  ]);
  for (const it of r) {
    assert.equal(it.kind, 'task');
    assert.deepEqual(it.ref.page, 'fans');
    assert.equal(it.ref.tab, 'opps');
  }
  // once the 3-day reminder is late, only it shows as overdue (not the 14-day one too)
  const late = oppReminders([{ id: 'x', name: 'X', deadline: addDays(today, 2) }], today, (d) => d < today);
  assert.deepEqual(late.map((x) => x.key), ['opp-x-3']);
});

test('reminders reach the agenda and the overdue list through the registered source', () => {
  const today = todayISO();
  const m = newManager();
  m.opportunities = [{ id: 'o1', name: 'Grant', deadline: addDays(today, 10) }, { id: 'o2', name: 'Fest', deadline: addDays(today, 20) }, { id: 'o3', name: 'Done', deadline: addDays(today, 10), status: 'applied' }];
  const items = agenda(m, today, 30).filter((x) => String(x.key).startsWith('opp-'));
  assert.deepEqual(items.map((x) => x.key), ['opp-o2-14', 'opp-o1-3', 'opp-o2-3']);
  const late = overdueTasks(m, today).filter((x) => x.source && String(x.source.key).startsWith('opp-'));
  // o1's 14-day date has passed and its 3-day one is still ahead: the 14-day one shows as late
  assert.deepEqual(late.map((x) => x.source.key), ['opp-o1-14']);
  const m2 = { ...m, opportunities: [{ id: 'o4', name: 'Soon', deadline: addDays(today, 1) }] };
  assert.deepEqual(overdueTasks(m2, today).filter((x) => x.source).map((x) => x.task.text), ['Deadline in 3 days: Soon']);
});

test('the starter list: sourced, dated, no invented deadlines, added once, deletions and edits stick', () => {
  assert.ok(SEED_OPPS.length >= 10 && SEED_OPPS.length <= 20);
  const seeded = seedOpps([]);
  assert.equal(seeded.length, SEED_OPPS.length);
  for (const o of seeded) {
    assert.match(o.url, /^https:\/\//, o.name);
    assert.equal(o.checked, '2026-11-23');
    assert.ok(o.deadline === '' || /^\d{4}-\d{2}-\d{2}$/.test(o.deadline));
    assert.ok(o.seed);
    assert.ok(o.id.startsWith('seed-o-'));
  }
  assert.ok(seeded.some((o) => !o.deadline), 'some deadlines are left blank');
  // add again: nothing doubles
  assert.equal(seedOpps(seeded).length, seeded.length);
  // once the marker is set, a deleted entry stays gone and an edit stays
  const m = newManager();
  assert.equal(needsOppSeed(m), true);
  m.opportunities = seeded.filter((o) => o.id !== seeded[0].id).map((o, i) => (i === 0 ? { ...o, status: 'applied', notes: 'mine' } : o));
  m.seeded = { venues: 'x', opps: SEED_OPPS_ON };
  assert.equal(needsOppSeed(m), false);
  const back = viewOf(parseWorkspaceBackup(workspaceBackup(workspaceFrom(m))));
  assert.equal(needsOppSeed(back), false);
  assert.equal(back.opportunities.length, seeded.length - 1);
  assert.equal(back.opportunities[0].notes, 'mine');
  assert.equal(back.seeded.venues, 'x');
});

// ---- backups

function sample() {
  const ws = workspaceFrom(newManager());
  const v = viewOf(ws);
  v.fans = [normalizeFan({ id: 'f1', email: 'a@x.com', name: 'Ann', city: 'Seattle', consent: true, added: '2026-11-01', source: 'show', showId: 's1' })];
  v.opportunities = seedOpps([]).slice(0, 3);
  v.band.fanAliases = { seattle: 'Tacoma' };
  v.seeded = { opps: SEED_OPPS_ON };
  return mergeView(ws, v);
}

test('backup round trip keeps the fan list, opportunities and nearby towns; artist switch keeps them apart', () => {
  const ws = sample();
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0].fans, ws.artists[0].fans);
  assert.deepEqual(back.shared.opportunities, ws.shared.opportunities);
  assert.deepEqual(back.artists[0].band.fanAliases, { seattle: 'Tacoma' });
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(ws))), ws);
  const [ws2, id2] = addArtist(ws, 'Other');
  const other = viewOf(ws2, id2);
  assert.deepEqual(other.fans, []);
  assert.equal(other.opportunities.length, 3); // shared
  other.fans = [normalizeFan({ id: 'f2', email: 'b@x.com' })];
  const ws3 = mergeView({ ...ws2, current: id2 }, other);
  assert.deepEqual(viewOf(ws3, ws.current).fans.map((f) => f.id), ['f1']);
  assert.deepEqual(viewOf(ws3, id2).fans.map((f) => f.id), ['f2']);
  const back3 = parseWorkspaceBackup(workspaceBackup(ws3));
  assert.deepEqual(back3, normalizeWorkspace(JSON.parse(JSON.stringify(ws3))));
});

test('"Back up without the fan list" drops every artist’s fans and nothing else', () => {
  const [ws2, id2] = addArtist(sample(), 'Other');
  const v = viewOf(ws2, id2);
  v.fans = [normalizeFan({ id: 'f2', email: 'b@x.com' })];
  const ws = mergeView(ws2, v);
  const text = workspaceBackup(ws, { withoutFans: true });
  assert.ok(!text.includes('a@x.com') && !text.includes('b@x.com'));
  const back = parseWorkspaceBackup(text);
  assert.ok(back.artists.every((a) => a.fans.length === 0));
  assert.equal(back.shared.opportunities.length, 3);
  assert.equal(ws.artists[0].fans.length, 1); // the workspace itself is untouched
});

// ---- privacy: fan details never reach a generated document

const MARK = 'zzfanmarker';
test('a planted fan never appears in any generated document', () => {
  const today = '2026-11-23';
  const m = newManager();
  m.band = { ...m.band, name: 'Arc Flash', bio: 'Loud.', contactEmail: 'band@arcflash.test', members: [{ name: 'Kai', role: 'drums' }], links: { spotify: 'https://open.spotify.com/artist/x' } };
  const song = { ...newSong('Burn'), status: 'released', releaseDate: '2026-10-01', lyrics: 'burn it down' };
  song.links.spotify = 'https://open.spotify.com/track/x';
  m.songs = [song];
  const show = { ...newShow('2026-12-05'), venue: 'El Corazon', city: 'Seattle', status: 'confirmed', setlist: 'Burn', setTime: '21:00' };
  const played = { ...newShow('2026-11-01'), venue: 'Funhouse', city: 'Seattle', status: 'played', settlement: { gross: 500, pay: 300, merch: 120, costs: 40, fund: '', shares: {} } };
  m.shows = [show, played];
  m.venues = [{ id: 'v1', name: 'El Corazon', city: 'Seattle', bookingPerson: 'Pat' }];
  m.money = [{ id: 'mo1', date: '2026-11-02', kind: 'expense', amount: 50, category: 'promo', note: 'flyers', songId: '' }];
  m.opportunities = seedOpps([]);
  m.fans = [
    { id: 'fan1', email: `${MARK}@example.com`, name: `${MARK} name`, city: 'Seattle', region: `${MARK} region`, note: `${MARK} note`, source: 'show', showId: show.id, consent: true, added: today },
    { id: 'fan2', email: `${MARK}2@example.com`, name: `${MARK}2`, city: `${MARK} city`, consent: true },
  ];
  m.band.fanAliases = { seattle: 'Bellevue' };
  const tour = newTour('Fall run', today);
  tour.stops = [newStop({ city: 'Seattle' })];
  const ws = workspaceFrom(m);
  const lines = moneyLines(m, today);
  const docs = {
    'press kit (epkHTML)': epkHTML(m, { today }),
    'show sheet (showSheetHTML)': showSheetHTML(show, m.band),
    'stage setlist (stageSetlistHTML)': stageSetlistHTML(show, m.band, setlistTimes(show.setlist, m.songs)),
    'money PDF (moneyHTML)': moneyHTML({ band: m.band, year: 'all', lines, sum: moneySummary(lines) }),
    'calendar PDF (calendarHTML)': calendarHTML({ title: 'Cal', monthName: 'December', items: agenda(m, '2026-11-01', 90) }),
    'ICS export (managerICS)': managerICS(m, { from: '2026-11-01' }),
    'ICS export, all artists (managerICS ws)': managerICS(m, { from: '2026-11-01', ws }),
    'press release (pressRelease)': JSON.stringify(pressRelease(song, m, { today })),
    'press release PDF (pressHTML)': pressHTML(pressRelease(song, m, { today }).full),
    'Spotify pitch (spotifyPitch)': JSON.stringify(spotifyPitch(song, m, { today })),
    'curator pitch (curatorPitch)': JSON.stringify(curatorPitch(song, m, { today })),
    'submit pitch (submitPitch)': JSON.stringify(submitPitch(song, m, { today })),
    'venue pitch email (pitchEmail)': JSON.stringify(pitchEmail({ band: m.band, venue: m.venues[0], dates: ['Dec 5'] })),
    'show plan PDF (showPlanHTML)': showPlanHTML(show, newPlan(show, { band: m.band.name, songs: m.songs }), { band: m.band.name }),
    'stage plot PDF (stagePlotHTML)': stagePlotHTML(newStage(), m.band),
    'tour PDF (tourHTML)': tourHTML(tour, { venues: m.venues, band: m.band }),
    'call sheet (callSheetHTML)': callSheetHTML(m.band, song),
    'backup without fans (workspaceBackup withoutFans)': workspaceBackup(ws, { withoutFans: true }),
  };
  for (const [name, text] of Object.entries(docs)) {
    assert.equal(typeof text, 'string', name);
    assert.ok(text.length > 20, name);
    assert.ok(!text.toLowerCase().includes(MARK), `${name} contains fan data`);
  }
  // the control: the marker really is in the data (a normal backup carries it)
  assert.ok(workspaceBackup(ws).includes(MARK));
});
