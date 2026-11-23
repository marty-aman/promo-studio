// To-dos that tick themselves from what is attached to the song or show (js/manager/todoauto.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, overdueTasks, agenda, releaseProgress, normalizeManager, RELEASE_TEMPLATE } from '../js/manager/model.js';
import { SHOW_TODO, showTodo } from '../js/manager/planner.js';
import { RELEASE_RULES, SHOW_RULES, releaseAutoReason, showAutoReason, releaseTaskState, showTaskState, setTaskDone } from '../js/manager/todoauto.js';
import { showSheetHTML } from '../js/manager/docs.js';

const lib = (...ids) => ({ has: (id) => ids.includes(id) });
const task = (song, text) => song.release.find((t) => t.text === text);
const COVER = 'Cover art final (3000 × 3000 px)';

test('every rule matches a standard task, so none is dead', () => {
  const rel = RELEASE_TEMPLATE.map((r) => r[2]);
  for (const k of Object.keys(RELEASE_RULES)) assert.ok(rel.includes(k), k);
  const show = SHOW_TODO.map((r) => r[1]);
  for (const k of Object.keys(SHOW_RULES)) assert.ok(show.includes(k), k);
});

test('cover art: the song cover, else its release cover; a missing file does not count', () => {
  const s = newSong('A');
  const t = task(s, COVER);
  assert.equal(releaseAutoReason(s, t, lib()), '');
  s.coverId = 'img1';
  assert.equal(releaseAutoReason(s, t, lib('img1')), 'cover art attached');
  assert.equal(releaseAutoReason(s, t, lib()), '', 'gone from the library');
  s.coverId = null;
  assert.match(releaseAutoReason(s, t, { ...lib('ep1'), release: { title: 'EP', coverId: 'ep1' } }), /cover of “EP”/);
});

test('each mapped release task, on and off', () => {
  const s = newSong('A');
  const r = (text, has = lib()) => releaseAutoReason(s, task(s, text), has);
  assert.equal(r('Final mix and master approved', lib('a1')), '');
  s.audioId = 'a1';
  s.status = 'mixing';
  assert.equal(r('Final mix and master approved', lib('a1')), '', 'still mixing');
  s.status = 'ready';
  assert.ok(r('Final mix and master approved', lib('a1')));
  assert.equal(r('Final mix and master approved', lib()), '', 'file missing');
  const pro = 'Register the song with your PRO (BMI/ASCAP) and note the ISRC';
  s.isrc = 'nope';
  assert.equal(r(pro), '');
  s.isrc = 'us-um7-17-03861';
  assert.equal(r(pro), 'ISRC entered');
  const up = 'Upload to your distributor with the release date';
  assert.equal(r(up), '');
  s.links.spotify = 'https://open.spotify.com/track/x';
  assert.ok(r(up));
  s.links.spotify = '';
  s.upc = '0 602557 382549';
  assert.match(r(up), /UPC/);
  const plan = 'Plan the music video and short-form shoot (Shoot tab)';
  assert.equal(r(plan), '');
  s.videoStatus = 'idea';
  assert.equal(r(plan), '');
  s.shoot.date = '2026-12-01';
  assert.ok(r(plan));
  const film = 'Film 20–30 short clips in one session';
  s.files.footage = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, mediaId: `f${i}`, note: '' }));
  assert.equal(r(film, { has: (id) => id !== 'f3' }), '', '19 in the library');
  assert.match(r(film, { has: () => true }), /20 clips/);
  const lock = 'Music video edit locked';
  assert.equal(r(lock), '');
  s.files.video = { mediaId: 'v1', offset: 0 };
  assert.ok(r(lock, lib('v1')));
  assert.equal(r(lock, lib()), '');
  s.videoStatus = 'done';
  assert.ok(r(lock, lib()));
  assert.equal(r('Premiere the music video'), '');
  s.videoStatus = 'released';
  assert.ok(r('Premiere the music video'));
  assert.equal(r('Add the song to your press kit (EPK)'), '');
  s.releaseDate = '2027-01-01';
  assert.ok(r('Add the song to your press kit (EPK)'));
  assert.equal(r('Teaser with the hook'), '', 'left manual');
});

test('a renamed or own task stays manual', () => {
  const s = newSong('A');
  s.coverId = 'img1';
  assert.equal(releaseAutoReason(s, { text: 'Cover art (my version)' }, lib('img1')), '');
});

test('manual ticks, "Mark not done" and letting it tick again', () => {
  const s = newSong('A');
  s.coverId = 'img1';
  const t = task(s, COVER);
  const before = JSON.stringify(s);
  let st = releaseTaskState(s, t, null, lib('img1'));
  assert.deepEqual(st, { done: true, manual: false, auto: 'cover art attached', off: false });
  assert.equal(JSON.stringify(s), before, 'deriving writes nothing');
  setTaskDone(t, false, st.auto); // untick: remembered for this task
  assert.equal(t.autoOff, true);
  st = releaseTaskState(s, t, null, lib('img1'));
  assert.equal(st.done, false);
  assert.equal(st.off, true);
  setTaskDone(t, true, st.auto); // tick by hand
  assert.equal(t.done, true);
  assert.equal(t.autoOff, undefined);
  s.coverId = null;
  assert.equal(releaseTaskState(s, t, null, lib()).done, true, 'a manual tick holds without the file');
  const other = task(s, 'Teaser with the hook');
  setTaskDone(other, false, '');
  assert.equal(other.autoOff, undefined, 'unticking a manual-only task stores nothing extra');
});

test('progress, Overdue and the agenda count automatic ticks; the release cover reaches through m', () => {
  const m = newManager();
  const s = newSong('A');
  s.releaseDate = '2026-12-30';
  m.songs.push(s);
  const today = '2026-11-23'; // cover art due 2026-11-11, so it's overdue until attached
  const isLate = () => overdueTasks(m, today).some((x) => x.task.text === COVER);
  assert.equal(isLate(), true);
  const base = releaseProgress(s, m).done;
  m.releases.push({ id: 'ep', title: 'EP', type: 'ep', coverId: 'epc', releaseDate: '', upc: '' });
  s.releaseId = 'ep';
  assert.equal(isLate(), false);
  assert.equal(releaseProgress(s, m).done, base + 1);
  assert.equal(releaseProgress(s).done, base, 'without m the release cover is unknown');
  // in the agenda: due 2026-11-11, so look at that day
  const inAgenda = () => agenda(m, '2026-11-11', 1).some((x) => x.title === COVER);
  assert.equal(inAgenda(), false);
  task(s, COVER).autoOff = true;
  assert.equal(inAgenda(), true);
  assert.equal(isLate(), true);
});

test('show to-dos: pitched, confirmed with a deal, poster attached', () => {
  const sh = { ...newShow('2027-02-01'), todo: showTodo() };
  const t = (text) => sh.todo.find((x) => x.text === text);
  assert.equal(showAutoReason(sh, t('Pitch the venue and hold the date'), lib()), '');
  sh.status = 'hold';
  assert.match(showAutoReason(sh, t('Pitch the venue and hold the date'), lib()), /On hold/);
  sh.status = 'confirmed';
  assert.equal(showAutoReason(sh, t('Confirm the lineup and the deal in writing'), lib()), '');
  sh.deal = '$200 guarantee';
  assert.ok(showAutoReason(sh, t('Confirm the lineup and the deal in writing'), lib()));
  sh.posterId = 'p1';
  assert.equal(showTaskState(sh, t('Flyer / poster made (all bands tagged)'), lib('p1')).auto, 'poster attached');
  assert.equal(showTaskState(sh, t('Flyer / poster made (all bands tagged)'), lib()).done, false);
  assert.match(showSheetHTML(sh), /☑ Pitch the venue/);
  const m = newManager();
  m.shows.push(sh);
  assert.ok(!overdueTasks(m, '2026-12-25').some((x) => x.task.text === 'Pitch the venue and hold the date'));
});

test('old saves load: no autoOff anywhere, and autoOff survives a round trip', () => {
  const s = newSong('A');
  for (const t of s.release) delete t.autoOff;
  s.release[1].autoOff = true;
  const m = normalizeManager({ songs: [s] });
  assert.equal(m.songs[0].release[1].autoOff, true);
  assert.equal(m.songs[0].release[0].autoOff, undefined);
});
