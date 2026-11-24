import test from 'node:test';
import assert from 'node:assert/strict';
import { pushVersion, dueVersion, copyName, findProjects, makeLibraryFile, parseLibraryFile, readProjects, mergeIncoming, templateFrom, mediaSlots, swapMedia, fitClipsToMedia, storageLevel, videoInfo, LIBRARY_FILE_KIND, VERSION_CAP } from '../js/projectlib.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';
import { newProject, newText, normalizeProject } from '../js/state.js';
import { newDoc, newLayer } from '../js/photo/model.js';
import { workspaceBackup, parseWorkspaceBackup, backupProjects } from '../js/manager/artists.js';

const edit = (name = 'Static Bloom promo') => {
  const p = newProject();
  p.name = name;
  p.projectId = 'prj_abc';
  p.duration = 24;
  p.clips.push({ id: 'c1', mediaId: 'm_clip001', kind: 'video', in: 2, duration: 6, speed: 1 });
  p.clips.push({ id: 'c2', mediaId: 'm_pic0001', kind: 'image', in: 0, duration: 3, speed: 1 });
  p.song = { mediaId: 'm_song001', offset: 1, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.texts.push({ ...newText(1), id: 't1', text: 'OUT FRIDAY' });
  return p;
};
const design = () => {
  const d = newDoc({ size: 'post', name: 'Tour poster' });
  d.layers.push({ ...newLayer('image', d), mediaId: 'm_photo01' }, { ...newLayer('text', d), text: 'LIVE' });
  return d;
};

test('versions: newest first, capped at 10, and an identical save is not kept twice', () => {
  let list = [];
  for (let i = 0; i < 14; i++) list = pushVersion(list, { n: i }, 1000 + i);
  assert.equal(list.length, VERSION_CAP);
  assert.deepEqual(list[0], { at: 1013, data: { n: 13 } });
  assert.equal(list.at(-1).data.n, 4);
  assert.equal(pushVersion(list, { n: 13 }, 5000).length, VERSION_CAP);
  assert.equal(pushVersion(list, { n: 13 }, 5000)[0].at, 1013);
  // the stored copy does not change when the edit goes on changing
  const live = { n: 99 };
  const l2 = pushVersion([], live, 1);
  live.n = 100;
  assert.equal(l2[0].data.n, 99);
});

test('a version is due when forced, when there is none, or two minutes after the last', () => {
  assert.equal(dueVersion(null, 0), true);
  assert.equal(dueVersion([{ at: 0 }], 60_000), false);
  assert.equal(dueVersion([{ at: 0 }], 120_000), true);
  assert.equal(dueVersion([{ at: 0 }], 1, true), true);
});

test('copy names count up', () => {
  assert.equal(copyName('Promo', []), 'Promo copy');
  assert.equal(copyName('Promo', ['Promo copy']), 'Promo copy 2');
  assert.equal(copyName('Promo copy', ['Promo copy', 'Promo copy 2']), 'Promo copy 3');
});

test('search finds by name, song or contents; sort by edited, name, created and length', () => {
  const list = [
    { name: 'b promo', updatedAt: '2026-11-02T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', info: { length: 10, song: 'Static Bloom', what: '3 clips' } },
    { name: 'A teaser', updatedAt: '2026-11-03T00:00:00Z', createdAt: '2026-09-01T00:00:00Z', info: { length: 30, song: 'Ash', what: 'song' } },
    { name: 'c reel', updatedAt: '2026-11-01T00:00:00Z', createdAt: '2026-11-01T00:00:00Z', info: { length: 20, song: '', what: '' } },
  ];
  assert.deepEqual(findProjects(list).map((e) => e.name), ['A teaser', 'b promo', 'c reel']);
  assert.deepEqual(findProjects(list, '', 'name').map((e) => e.name), ['A teaser', 'b promo', 'c reel']);
  assert.deepEqual(findProjects(list, '', 'created').map((e) => e.name), ['c reel', 'b promo', 'A teaser']);
  assert.deepEqual(findProjects(list, '', 'length').map((e) => e.name), ['A teaser', 'c reel', 'b promo']);
  assert.deepEqual(findProjects(list, 'bloom').map((e) => e.name), ['b promo']);
  assert.deepEqual(findProjects(list, 'REEL').map((e) => e.name), ['c reel']);
  assert.equal(list[0].name, 'b promo', 'the list passed in is not reordered');
});

test('a projects file carries video edits and designs, the names of their media, and flags the missing ones', () => {
  const p = edit();
  const d = design();
  const names = { m_clip001: ['riff.mp4', '', 'video'], m_song001: ['song.wav', '', 'audio'], m_photo01: ['band.jpg', '', 'image'], m_other01: ['x.png', '', 'image'] };
  const text = makeLibraryFile({ video: [{ id: 'prj_abc', name: p.name, createdAt: 'c', updatedAt: 'u', thumb: 'data:image/jpeg;base64,xx', info: videoInfo(p, 'song'), data: p }], photo: [d] }, names, (id) => !['m_song001', 'm_pic0001'].includes(id), new Date('2026-11-24T00:00:00Z'));
  const raw = JSON.parse(text);
  assert.equal(raw.kind, LIBRARY_FILE_KIND);
  assert.deepEqual(Object.keys(raw.mediaNames).sort(), ['m_clip001', 'm_photo01', 'm_song001']);
  assert.ok(raw.missing.includes('m_song001') && raw.missing.includes('m_pic0001'));
  assert.ok(!raw.missing.includes('m_clip001'));
  const back = parseLibraryFile(text);
  assert.equal(back.video.length, 1);
  assert.equal(back.video[0].data.texts[0].text, 'OUT FRIDAY');
  assert.equal(back.video[0].thumb, 'data:image/jpeg;base64,xx');
  assert.equal(back.photo[0].name, 'Tour poster');
  assert.equal(back.photo[0].layers.length, 2);
  assert.equal(back.names.m_clip001[0], 'riff.mp4');
});

test('a projects file: a single project file also imports; damaged entries are skipped; other files are refused', () => {
  const one = parseLibraryFile(makeProjectFile(edit('Solo')));
  assert.equal(one.video.length, 1);
  assert.equal(one.video[0].name, 'Solo');
  const bad = JSON.stringify({ kind: LIBRARY_FILE_KIND, version: 1, video: [{ name: 'x', data: { clips: 'no' } }, null, { name: 'ok', data: edit('ok') }], photo: [null, 5, design()] });
  const r = parseLibraryFile(bad);
  assert.deepEqual(r.video.map((e) => e.name), ['ok']);
  assert.equal(r.photo.length, 1);
  assert.throws(() => parseLibraryFile('{nope'), /projects file/);
  assert.throws(() => parseLibraryFile(JSON.stringify({ kind: 'other' })), /projects file/);
  assert.throws(() => parseLibraryFile(JSON.stringify({ kind: LIBRARY_FILE_KIND, version: 99 })), /newer version/);
  // a thumbnail that is not an image is dropped
  assert.equal(parseLibraryFile(JSON.stringify({ kind: LIBRARY_FILE_KIND, version: 1, video: [{ name: 'x', thumb: 'javascript:alert(1)', data: edit() }] })).video[0].thumb, '');
});

test('a project file opened from the computer never links to (and saves over) a project in this browser', () => {
  const back = parseProjectFile(makeProjectFile(edit()));
  assert.equal(back.project.projectId, undefined);
  assert.equal(normalizeProject(edit()).projectId, 'prj_abc', 'the edit saved in this browser keeps its link');
});

test('merging never replaces: same content is skipped, a clash or no id gets a new id', () => {
  const here = [{ id: 'a', data: { n: 1 } }, { id: 'b', data: { n: 2 } }];
  const same = (x, y) => JSON.stringify(x.data) === JSON.stringify(y.data);
  const out = mergeIncoming(here, [{ id: 'a', data: { n: 1 } }, { id: 'b', data: { n: 3 } }, { id: 'c', data: { n: 4 } }, { id: '', data: { n: 5 } }], same, 'video', 1);
  assert.equal(out.length, 3);
  assert.notEqual(out[0].item.id, 'b');
  assert.equal(out[0].renamed, true);
  assert.equal(out[1].item.id, 'c');
  assert.ok(out[2].item.id.startsWith('prj_'));
  assert.equal(new Set(out.map((o) => o.item.id)).size, 3);
});

test('use as template keeps layout, texts, styles and timing, and lets each media file be swapped', () => {
  const p = edit();
  p.lyricStyle.color = '#ff0000';
  p.layers.push({ id: 'L1', type: 'video', name: 'B-roll', clips: [{ id: 'oc', mediaId: 'm_clip001', in: 0, duration: 2 }] });
  const t = templateFrom('video', p);
  assert.equal(t.projectId, undefined);
  assert.equal(t.name, 'Static Bloom promo (from template)');
  assert.equal(t.lyricStyle.color, '#ff0000');
  assert.equal(t.texts[0].start, p.texts[0].start);
  assert.equal(p.projectId, 'prj_abc', 'the saved project is untouched');
  const slots = mediaSlots('video', t);
  assert.deepEqual(slots.map((s) => s.where), ['Song', 'Clip 1', 'Clip 2']);
  const n = swapMedia(t, { m_clip001: 'm_clip002', m_song001: 'm_song002', m_none000: 'm_x000000' });
  assert.equal(n, 3, 'the clip on the main track and on the layer, and the song');
  assert.equal(t.clips[0].mediaId, 'm_clip002');
  assert.equal(t.layers[0].clips[0].mediaId, 'm_clip002');
  assert.equal(t.song.mediaId, 'm_song002');
  assert.equal(p.clips[0].mediaId, 'm_clip001');
  // a shorter new file: the in-point moves back, then the clip shortens
  const changed = fitClipsToMedia(t, (id) => (id === 'm_clip002' ? 5 : 0));
  assert.equal(changed, 1);
  assert.equal(t.clips[0].in, 0);
  assert.equal(t.clips[0].duration, 5);
  const d = templateFrom('photo', design());
  assert.ok(d.id && d.id !== design().id);
  assert.deepEqual(mediaSlots('photo', d).map((s) => s.id), ['m_photo01']);
});

test('storage level warns at 80 % or under 300 MB free, and copes with no estimate', () => {
  const GB = 1073741824;
  assert.equal(storageLevel(1 * GB, 10 * GB).warn, false);
  assert.equal(storageLevel(8 * GB, 10 * GB).warn, true);
  assert.equal(storageLevel(700 * 1048576, 900 * 1048576).warn, true);
  assert.match(storageLevel(8 * GB, 10 * GB).text, /80 %/);
  assert.equal(storageLevel(null, null).pct, null);
  assert.equal(storageLevel(null, null).warn, false);
});

test('backups carry the Projects library; older backups without it still load', () => {
  const ws = { version: 2, current: 'a1', artists: [] };
  const projects = { video: [{ id: 'prj_abc', name: 'x', data: edit() }], photo: [design()] };
  const text = workspaceBackup(ws, { m_clip001: ['riff.mp4', '', 'video'] }, { projects });
  const got = readProjects(backupProjects(text));
  assert.equal(got.video[0].data.texts[0].text, 'OUT FRIDAY');
  assert.equal(got.photo[0].name, 'Tour poster');
  assert.equal(parseWorkspaceBackup(text).projects, undefined, 'the workspace itself does not keep them');
  // an empty library adds nothing; an old backup has none
  assert.equal(JSON.parse(workspaceBackup(ws, null, { projects: { video: [], photo: [] } })).projects, undefined);
  const old = JSON.stringify({ promoStudioManager: 2, savedAt: 'x', ...ws });
  assert.equal(backupProjects(old), null);
  assert.deepEqual(readProjects(backupProjects(old)), { video: [], photo: [] });
  assert.ok(parseWorkspaceBackup(old).artists);
});
