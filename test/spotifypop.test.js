// Spotify popularity typed in by hand (js/manager/spotifypop.js): checks, history edits, summary, saves and backups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, normalizeManager } from '../js/manager/model.js';
import { workspaceFrom, viewOf, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';
import { realDate, cleanScore, entryError, normalizeSpotifyPop, addScore, editScore, deleteScore, scoreSummary, checkedLabel, changeLabel, trendPath, trendRange, SPOTIFY_STALE_DAYS } from '../js/manager/spotifypop.js';

const TODAY = '2026-11-23';

test('scores are whole numbers 0–100; dates must be real and not in the future', () => {
  for (const ok of [0, 100, '57', ' 8 ', 42]) assert.notEqual(cleanScore(ok), null, String(ok));
  for (const bad of ['', '101', -1, '4.5', 'abc', null, undefined, '1e2', 1000]) assert.equal(cleanScore(bad), null, String(bad));
  assert.ok(realDate('2024-02-29'));
  assert.ok(!realDate('2026-02-29'));
  assert.ok(!realDate('2026-02-30'));
  assert.ok(!realDate('0002-01-01x'));
  assert.ok(!realDate(''));
  assert.equal(entryError('50', TODAY, TODAY), '');
  assert.match(entryError('101', TODAY, TODAY), /0 to 100/);
  assert.match(entryError('50', '2026-13-01', TODAY), /date/);
  assert.match(entryError('50', '2026-11-24', TODAY), /future/);
});

test('add, replace the same date, edit and delete', () => {
  const s = newSong('Static Bloom');
  assert.equal(s.spotifyPop, undefined, 'a song made this session has no list yet');
  assert.equal(addScore(s, '20', '2026-10-01', TODAY), '');
  assert.equal(addScore(s, '31', '2026-11-01', TODAY), '');
  assert.equal(addScore(s, '25', '2026-10-15', TODAY), '');
  assert.deepEqual(s.spotifyPop.map((e) => [e.date, e.score]), [['2026-10-01', 20], ['2026-10-15', 25], ['2026-11-01', 31]], 'kept oldest first');
  assert.equal(addScore(s, '33', '2026-11-01', TODAY), '');
  assert.equal(s.spotifyPop.length, 3, 'same date replaces');
  assert.equal(s.spotifyPop[2].score, 33);
  const before = JSON.stringify(s.spotifyPop);
  assert.match(addScore(s, '120', '2026-11-02', TODAY), /0 to 100/);
  assert.equal(JSON.stringify(s.spotifyPop), before, 'an error changes nothing');

  const id = s.spotifyPop[0].id;
  assert.equal(editScore(s, id, { score: '22' }, TODAY), '');
  assert.equal(s.spotifyPop[0].score, 22);
  assert.match(editScore(s, id, { date: '2026-11-01' }, TODAY), /already/);
  assert.match(editScore(s, id, { score: '' }, TODAY), /0 to 100/);
  assert.equal(editScore(s, id, { date: '2026-11-10' }, TODAY), '');
  assert.deepEqual(s.spotifyPop.map((e) => e.date), ['2026-10-15', '2026-11-01', '2026-11-10'], 'an edited date re-sorts');
  deleteScore(s, id);
  assert.deepEqual(s.spotifyPop.map((e) => e.score), [25, 33]);
});

test('summary: latest, change since the previous, days since and stale after 14 days', () => {
  const s = newSong('x');
  assert.deepEqual(scoreSummary(s, TODAY), { latest: null, previous: null, change: null, days: null, stale: false, points: [] });
  addScore(s, 40, '2026-11-16', TODAY);
  let r = scoreSummary(s, TODAY);
  assert.equal(r.latest.score, 40);
  assert.equal(r.change, null);
  assert.equal(r.days, 7);
  assert.equal(r.stale, false);
  addScore(s, 37, '2026-11-23', TODAY);
  r = scoreSummary(s, TODAY);
  assert.equal(r.change, -3);
  assert.equal(changeLabel(r.change), '−3');
  assert.equal(changeLabel(4), '+4');
  assert.equal(changeLabel(0), 'no change');
  assert.equal(checkedLabel(r.days), 'checked today');
  assert.equal(scoreSummary(s, '2026-12-07').stale, false, `exactly ${SPOTIFY_STALE_DAYS} days is not stale yet`);
  assert.equal(scoreSummary(s, '2026-12-08').stale, true);
  assert.equal(checkedLabel(15), 'checked 15 days ago');
  assert.equal(checkedLabel(1), 'checked yesterday');
});

test('trend path is spaced by date and scaled to the scores (at least 10 points tall)', () => {
  assert.equal(trendPath([]), '');
  assert.equal(trendPath([{ date: TODAY, score: 3 }]), '');
  const d = trendPath([{ date: '2026-11-01', score: 0 }, { date: '2026-11-03', score: 100 }, { date: '2026-11-11', score: 50 }], 100, 22);
  assert.equal(d, 'M0.0 21.0 L20.0 1.0 L100.0 11.0');
  assert.deepEqual(trendRange([{ score: 25 }, { score: 38 }]), [25, 38]);
  assert.deepEqual(trendRange([{ score: 30 }, { score: 32 }]), [26, 36]);
  assert.deepEqual(trendRange([{ score: 99 }, { score: 100 }]), [90, 100]);
  assert.deepEqual(trendRange([{ score: 0 }, { score: 1 }]), [0, 10]);
  assert.equal(trendPath([{ date: '2026-11-01', score: 25 }, { date: '2026-11-02', score: 38 }], 10, 22), 'M0.0 21.0 L10.0 1.0');
});

test('normaliser: junk dropped, one per date, old saves without the field load', () => {
  assert.deepEqual(normalizeSpotifyPop('nope'), []);
  const list = normalizeSpotifyPop([{ id: 'a', date: '2026-11-02', score: 10 }, null, { date: 'bad', score: 5 }, { id: 'b', date: '2026-11-01', score: '200' }, { date: '2026-11-01', score: '12' }, { id: 'c', date: '2026-11-02', score: 11 }]);
  assert.deepEqual(list.map((e) => [e.date, e.score]), [['2026-11-01', 12], ['2026-11-02', 11]]);
  assert.ok(list.every((e) => typeof e.id === 'string' && e.id));

  const old = { ...newManager(), songs: [{ ...newSong('Old one') }] };
  delete old.songs[0].spotifyPop;
  const m = normalizeManager(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(m.songs[0].spotifyPop, []);
});

test('scores survive the workspace save, a backup and a restore', () => {
  const m = newManager();
  const s = newSong('Static Bloom');
  addScore(s, 18, '2026-10-20', TODAY);
  addScore(s, 24, '2026-11-20', TODAY);
  m.songs.push(s);
  const ws = workspaceFrom(m);
  const view = viewOf(JSON.parse(JSON.stringify(ws)));
  assert.deepEqual(view.songs[0].spotifyPop.map((e) => e.score), [18, 24]);
  const text = workspaceBackup(ws);
  assert.match(text, /"spotifyPop"/, 'the backup file carries the scores');
  const back = viewOf(parseWorkspaceBackup(text));
  assert.deepEqual(back.songs[0].spotifyPop, s.spotifyPop);
});
