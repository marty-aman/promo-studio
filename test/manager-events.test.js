// Your own calendar events: defaults and checks on load, the agenda (Home and the Calendar), the
// combined "All artists" agenda, the calendar PDF and the .ics export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newEvent, normalizeEvents, normalizeManager, eventDates, eventTime, agenda } from '../js/manager/model.js';
import { managerICS } from '../js/manager/extras.js';
import { calendarHTML } from '../js/manager/docs.js';
import { workspaceFrom, addArtist, combinedAgenda, viewOf, mergeView } from '../js/manager/artists.js';

const ev = (o) => ({ ...newEvent('2026-12-03'), id: 'ev1', title: 'Rehearsal', ...o });

test('old saves get no events; events are checked on load', () => {
  assert.deepEqual(newManager().events, []);
  assert.deepEqual(normalizeManager({}).events, []);
  assert.deepEqual(normalizeManager({ events: 'x' }).events, []);
  const [a, b] = normalizeEvents([
    { id: 'a', date: '2026-12-03', title: 'Practice', start: '19:00', end: '21:00', allDay: false, kind: 'rehearsal', repeat: 'weekly', until: '2027-01-31' },
    { id: 'b', date: '2026-12-04', start: '25:00', end: '9pm', kind: 'party', repeat: 'daily', until: '2026-01-01', title: 7 },
    { id: 'c', date: 'soon' },
    { date: '2026-12-05' },
    null,
  ]);
  assert.equal(normalizeEvents([{ id: 'x', date: '2026-12-03' }]).length, 1);
  assert.deepEqual([a.start, a.end, a.allDay, a.repeat, a.until], ['19:00', '21:00', false, 'weekly', '2027-01-31']);
  assert.deepEqual([b.start, b.end, b.allDay, b.kind, b.repeat, b.until, b.title], ['', '', true, 'other', '', '', '']);
  assert.equal(normalizeEvents([{ id: 'u', date: '2026-12-03', repeat: 'weekly', until: '2026-11-01' }])[0].until, '', 'an end before the start is dropped');
});

test('events live with their artist in a workspace and survive the merge', () => {
  const m = newManager();
  m.events.push(ev());
  let ws = workspaceFrom(m);
  let id2;
  [ws, id2] = addArtist(ws, 'Two');
  assert.deepEqual(viewOf(ws, id2).events, []);
  assert.equal(viewOf(ws).events[0].title, 'Rehearsal');
  const v = viewOf(ws);
  v.events.push(ev({ id: 'ev2', title: 'Meeting' }));
  assert.equal(mergeView(ws, v).artists[0].events.length, 2);
});

test('eventDates: once, weekly, until, and a range far from the start', () => {
  assert.deepEqual(eventDates(ev(), '2026-12-01', '2026-12-08'), ['2026-12-03']);
  assert.deepEqual(eventDates(ev(), '2026-12-04', '2026-12-08'), []);
  const w = ev({ repeat: 'weekly' });
  assert.deepEqual(eventDates(w, '2026-12-01', '2026-12-25'), ['2026-12-03', '2026-12-10', '2026-12-17', '2026-12-24']);
  assert.deepEqual(eventDates({ ...w, until: '2026-12-10' }, '2026-12-01', '2026-12-25'), ['2026-12-03', '2026-12-10']);
  assert.deepEqual(eventDates(w, '2028-06-01', '2028-06-15'), ['2028-06-01', '2028-06-08']);
  assert.deepEqual(eventDates(w, '2026-11-01', '2026-11-30'), [], 'nothing before it starts');
  assert.equal(eventTime(ev({ allDay: false, start: '19:00', end: '21:00' })), '19:00–21:00');
  assert.equal(eventTime(ev({ allDay: false, start: '19:00' })), 'from 19:00');
  assert.equal(eventTime(ev()), '');
});

test('events show in the agenda (Home, Calendar) and the combined agenda', () => {
  const m = newManager();
  m.events.push(ev({ allDay: false, start: '19:00', end: '21:00', location: 'Room 4', repeat: 'weekly' }));
  const items = agenda(m, '2026-12-01', 14).filter((x) => x.kind === 'event');
  assert.deepEqual(items.map((x) => x.date), ['2026-12-03', '2026-12-10']);
  assert.equal(items[0].title, 'Rehearsal');
  assert.equal(items[0].sub, 'Rehearsal · 19:00–21:00 · Room 4');
  assert.deepEqual(items[0].ref, { page: 'calendar', id: 'ev1' });
  assert.equal(items[0].evKind, 'rehearsal');
  let ws = workspaceFrom(m);
  [ws] = addArtist(ws, 'Two');
  ws.artists[1].events = [ev({ id: 'ev9', title: 'Van pickup', kind: 'travel' })];
  const all = combinedAgenda(ws, '2026-12-01', 14).filter((x) => x.kind === 'event');
  assert.equal(all.length, 3);
  assert.ok(all.some((x) => x.title === 'Van pickup' && x.artist === 'Two'));
  // the month PDF lists them with their time and place
  const html = calendarHTML({ title: 'T', monthName: 'December', items });
  assert.match(html, /<b>Event<\/b> · Rehearsal · Rehearsal · 19:00–21:00 · Room 4/);
});

test('events in the .ics: stable UID from the event id, times, weekly as one repeating event', () => {
  const m = newManager();
  m.events.push(
    ev({ allDay: false, start: '19:00', end: '21:00', repeat: 'weekly', until: '2027-01-28', location: 'Room 4', note: 'Bring the click' }),
    ev({ id: 'late', title: 'Load out', date: '2026-12-05', allDay: false, start: '23:30', end: '01:00', kind: 'travel' }),
    ev({ id: 'day', title: 'Day off', date: '2026-12-06', kind: 'personal' }),
    ev({ id: 'nostop', title: 'From 8', date: '2026-12-07', allDay: false, start: '20:00' }),
    ev({ id: 'old', date: '2025-01-01' }),
  );
  const ics = managerICS(m, { from: '2026-12-01' });
  const block = (id) => ics.split('BEGIN:VEVENT').find((b) => b.includes(`UID:event-${id}@promo-studio`)) || '';
  assert.match(block('ev1'), /DTSTART:20261203T190000\r\nDTEND:20261203T210000\r\nRRULE:FREQ=WEEKLY;UNTIL=20270128T235959/);
  assert.match(block('ev1'), /LOCATION:Room 4/);
  assert.match(block('ev1'), /DESCRIPTION:Rehearsal\\nBring the click/);
  assert.equal((ics.match(/UID:event-ev1@/g) || []).length, 1, 'one VEVENT for a weekly event');
  assert.match(block('late'), /DTSTART:20261205T233000\r\nDTEND:20261206T010000/);
  assert.match(block('day'), /DTSTART;VALUE=DATE:20261206\r\nDTEND;VALUE=DATE:20261207/);
  assert.match(block('nostop'), /DTEND:20261207T210000/);
  assert.equal(block('old'), '', 'past one-off events before the range are left out');
  // moving an event keeps its UID
  m.events[2].date = '2026-12-09';
  assert.ok(managerICS(m, { from: '2026-12-01' }).includes('UID:event-day@promo-studio'));
  // a workspace export tags the artist
  const ws = workspaceFrom(m);
  const all = managerICS(null, { from: '2026-12-01', ws });
  assert.ok(all.includes(`UID:event-ev1-${ws.artists[0].id}@promo-studio`));
  assert.match(all, /SUMMARY:Arc Flash: Rehearsal/);
});
