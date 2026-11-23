import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, normalizeManager, agenda, overdueTasks, registerAgendaSource, AGENDA_SOURCES } from '../js/manager/model.js';
import { ARTIST_KEYS, SHARED_KEYS, workspaceFrom, normalizeWorkspace, viewOf, mergeView, addArtist, removeArtist, restoreArtist, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';
import { normalizeSong, SONG_EXTRAS } from '../js/manager/songnorm.js';
import { normalizeShow, SHOW_EXTRAS } from '../js/manager/showsnorm.js';
import { managerICS } from '../js/manager/extras.js';

const PER_ARTIST = ['outreach', 'merch', 'fans', 'captionBank', 'availability'];
const item = (k) => [{ id: `${k}1`, extra: { keep: k }, n: 3 }];

function full() {
  const ws = workspaceFrom(newManager());
  const v = viewOf(ws);
  for (const k of PER_ARTIST) v[k] = item(k);
  v.opportunities = item('opportunities');
  return mergeView(ws, v);
}

test('new keys are listed and have defaults', () => {
  for (const k of PER_ARTIST) assert.ok(ARTIST_KEYS.includes(k), k);
  assert.ok(SHARED_KEYS.includes('opportunities'));
  const m = newManager();
  for (const k of [...PER_ARTIST, 'opportunities']) assert.deepEqual(m[k], []);
});

test('normaliser tolerates bad data and keeps unknown fields', () => {
  const m = normalizeManager({ outreach: 'x', merch: [null, 5, { id: 1 }, { id: 'a', z: 1 }], fans: { id: 'a' }, captionBank: undefined, availability: [[]], opportunities: 7 });
  assert.deepEqual(m.outreach, []);
  assert.deepEqual(m.merch, [{ id: 'a', z: 1 }]);
  for (const k of ['fans', 'captionBank', 'availability', 'opportunities']) assert.deepEqual(m[k], []);
});

test('round trip: backup, parse, switch artist, delete and restore keep every new key', () => {
  const ws = full();
  const back = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(back.artists[0], ws.artists[0]);
  assert.deepEqual(back.shared.opportunities, ws.shared.opportunities);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(ws))), ws);
  const [ws2, id2] = addArtist(ws, 'Other');
  assert.deepEqual(viewOf(ws2, id2).outreach, []);
  const v1 = viewOf(ws2, ws.current);
  for (const k of PER_ARTIST) assert.deepEqual(v1[k], item(k));
  assert.deepEqual(viewOf(ws2, id2).opportunities, item('opportunities'), 'opportunities are shared');
  const gone = removeArtist(ws2, ws.current);
  const again = restoreArtist(ws2, gone, ws.current);
  for (const k of PER_ARTIST) assert.deepEqual(viewOf(again, ws.current)[k], item(k));
});

test('withoutFans blanks only fans', () => {
  const ws = full();
  for (const text of [workspaceBackup(ws, { withoutFans: true }), workspaceBackup(ws, null, { withoutFans: true })]) {
    const b = parseWorkspaceBackup(text);
    assert.deepEqual(b.artists[0].fans, []);
    for (const k of PER_ARTIST.filter((x) => x !== 'fans')) assert.deepEqual(b.artists[0][k], item(k));
  }
  assert.deepEqual(ws.artists[0].fans, item('fans'), 'the live workspace is untouched');
  assert.deepEqual(parseWorkspaceBackup(workspaceBackup(ws)).artists[0].fans, item('fans'));
});

test('agenda source: items added, released and cancelled are the source’s job, errors are isolated', () => {
  const m = newManager();
  const src = (mm, from, to, inRange) => [{ date: '2030-01-05', kind: 'task', key: 'k1', title: 'Fake', sub: 's', ref: { page: 'home', id: 'x' } }, { date: '2029-01-01', kind: 'task', key: 'old', title: 'Old', sub: '', ref: { page: 'home', id: 'y' } }].filter((i) => inRange(i.date));
  const bad = () => { throw new Error('x'); };
  registerAgendaSource(src);
  registerAgendaSource(src);
  registerAgendaSource(bad);
  try {
    assert.equal(AGENDA_SOURCES.filter((f) => f === src).length, 1);
    assert.deepEqual(agenda(m, '2030-01-01', 14).map((i) => i.key), ['k1']);
    const late = overdueTasks(m, '2030-02-01');
    assert.deepEqual(late.map((l) => l.task.id), ['old', 'k1']);
    assert.equal(late[0].source.title, 'Old');
    assert.equal(overdueTasks(m, '2029-06-01').length, 1);
  } finally {
    AGENDA_SOURCES.length = 0;
  }
  assert.deepEqual(agenda(m, '2030-01-01', 14), []);
});

test('an unknown agenda kind does not break sorting, the calendar legend or the ICS file', () => {
  registerAgendaSource(() => [{ date: '2030-03-01', kind: 'zzz', key: 'u', title: 'Odd', sub: '', ref: { page: 'home', id: 'u' } }]);
  try {
    const m = newManager();
    const items = agenda(m, '2030-03-01', 7);
    assert.equal(items.length, 1);
    const ics = managerICS(m, { from: '2030-03-01', days: 7, stamp: new Date('2030-01-01T00:00:00Z') });
    assert.match(ics, /SUMMARY:To do: Odd/);
    assert.ok(!ics.includes('undefined'));
  } finally {
    AGENDA_SOURCES.length = 0;
  }
});

test('KIND maps in the pages fall back to task', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../js/manager/page-calendar.js', import.meta.url), 'utf8'), /KIND\[k\] \|\| KIND\.task/);
  assert.match(readFileSync(new URL('../js/manager/page-home.js', import.meta.url), 'utf8'), /KIND\[k\] \|\| KIND\.task/);
  assert.match(readFileSync(new URL('../js/manager/docs.js', import.meta.url), 'utf8'), /KIND\[x\.kind\] \|\| KIND\.task/);
});

test('SONG_EXTRAS and SHOW_EXTRAS run after the core normalisers', () => {
  const f = (s) => ({ ...s, split: Array.isArray(s.split) ? s.split : [] });
  SONG_EXTRAS.push(f);
  SHOW_EXTRAS.push((s) => ({ ...s, gear: Array.isArray(s.gear) ? s.gear : [] }));
  try {
    assert.deepEqual(normalizeManager({ songs: [{ id: 's', split: 5 }], shows: [{ id: 'h' }] }).songs[0].split, []);
    assert.deepEqual(normalizeManager({ shows: [{ id: 'h', gear: 'x' }] }).shows[0].gear, []);
    assert.equal(normalizeSong({ id: 'a', title: 'T' }, newSong('T')).title, 'T');
    assert.equal(normalizeShow({ id: 'a' }, newShow()).id, 'a');
  } finally {
    SONG_EXTRAS.length = 0;
    SHOW_EXTRAS.length = 0;
  }
});
