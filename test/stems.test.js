import test from 'node:test';
import assert from 'node:assert/strict';
import { guessStemRole, normalizeFiles, addStems, stemName, groupStems, moveStem, studioSongFiles, videoDone, videoStatusLabel, STEM_ROLES } from '../js/manager/files.js';
import { newSong, newManager, normalizeManager } from '../js/manager/model.js';
import { pressRelease, spotifyPitch, submitPitch } from '../js/manager/press.js';
import { soundOf } from '../js/manager/playlists.js';
import { planPosts } from '../js/manager/ideas.js';

test('new stem parts are guessed from file names', () => {
  const cases = {
    'Click track.wav': 'click',
    'Guide vox count in.wav': 'click',
    'Shaker.wav': 'perc',
    'Tambourine.wav': 'perc',
    'BVs.wav': 'bvs',
    'Backing harmonies.wav': 'bvs',
    'Gang vocals.wav': 'bvs',
    'Lead vocal double.wav': 'vocals',
    'FX risers.wav': 'fx',
    'Samples.wav': 'fx',
    'Room mics.wav': 'drums',
  };
  for (const [name, role] of Object.entries(cases)) assert.equal(guessStemRole(name), role, name);
});

test('a stem keeps its own name, else shows the file name', () => {
  assert.equal(stemName({ name: 'Kick + snare' }, 'drums_01.wav'), 'Kick + snare');
  assert.equal(stemName({ name: '  ' }, 'drums_01.wav'), 'drums_01');
  assert.equal(stemName({}, ''), 'Stem');
  const f = normalizeFiles({ stems: [{ id: 'a', mediaId: 'm1', role: 'bass', name: 'Fuzz bass' }, { id: 'b', mediaId: 'm2', role: 'nope', name: 7 }] });
  assert.equal(f.stems[0].name, 'Fuzz bass');
  assert.equal(f.stems[1].name, '');
  assert.equal(f.stems[1].role, 'other');
  assert.equal(normalizeFiles({ stems: [{ mediaId: 'm', name: 'x'.repeat(200) }] }).stems[0].name.length, 80);
  const s = newSong('A');
  addStems(s, [{ id: 'm1', name: 'Kick.wav' }]);
  assert.equal(s.files.stems[0].name, '');
});

test('stems group by part in mix-sheet order and move within their part', () => {
  const s = newSong('A');
  s.files.stems = [
    { id: 'v', mediaId: 'mv', role: 'vocals', name: '' },
    { id: 'd1', mediaId: 'md1', role: 'drums', name: '' },
    { id: 'b', mediaId: 'mb', role: 'bass', name: '' },
    { id: 'd2', mediaId: 'md2', role: 'drums', name: '' },
  ];
  const g = groupStems(s.files.stems);
  assert.deepEqual(g.map((x) => x.role), ['drums', 'bass', 'vocals']);
  assert.deepEqual(g[0].stems.map((x) => x.id), ['d1', 'd2']);
  assert.equal(g[0].label, 'Drums');
  assert.ok(moveStem(s, 'd2', -1)); // skips over the bass stem
  assert.deepEqual(groupStems(s.files.stems)[0].stems.map((x) => x.id), ['d2', 'd1']);
  assert.equal(moveStem(s, 'd2', -1), false); // already first drum stem
  assert.equal(moveStem(s, 'v', 1), false); // only vocal stem
  assert.equal(moveStem(s, 'nope', 1), false);
  assert.equal(STEM_ROLES.at(-1)[0], 'other');
});

test('the Video Studio gets stems grouped, with their names', () => {
  const s = newSong('A');
  s.files.stems = [
    { id: 'v', mediaId: 'mv', role: 'vocals', name: 'Lead' },
    { id: 'd', mediaId: 'md', role: 'drums', name: '' },
  ];
  const info = (id) => ({ id, name: `${id}.wav`, kind: 'audio' });
  const [out] = studioSongFiles([s], info);
  assert.deepEqual(out.stems.map((x) => [x.role, x.label]), [['drums', 'md'], ['vocals', 'Lead']]);
});

test('instrumental and music video status are kept and checked on load', () => {
  const m = normalizeManager({ songs: [{ id: 's1', title: 'A', instrumental: true, videoStatus: 'done' }, { id: 's2', title: 'B', instrumental: 'yes', videoStatus: 'filming' }, { id: 's3', title: 'C' }] });
  assert.equal(m.songs[0].instrumental, true);
  assert.equal(m.songs[0].videoStatus, 'done');
  assert.equal(m.songs[1].instrumental, false);
  assert.equal(m.songs[1].videoStatus, '');
  assert.equal(m.songs[2].videoStatus, '');
  assert.equal(newSong().instrumental, false);
  assert.ok(videoDone({ videoStatus: 'done' }));
  assert.ok(videoDone({ videoStatus: 'released' }));
  assert.ok(!videoDone({ videoStatus: 'editing' }));
  assert.ok(!videoDone(null));
  assert.equal(videoStatusLabel('done'), 'Complete');
  assert.equal(videoStatusLabel(''), 'Not started');
});

test('an instrumental drops the lyric talk from pitches, press and post hooks', () => {
  const m = newManager();
  m.band.name = 'Arc Flash';
  const s = newSong('Static Bloom');
  s.lyrics = 'Burn it down\nBurn it down\nI am the fire tonight\nBurn it down';
  s.releaseDate = '2026-09-01';
  s.sound.vocals = 'screamed';
  const sung = pressRelease(s, m, { today: '2026-08-01' });
  assert.match(sung.full, /chorus line/);
  s.instrumental = true;
  const pr = pressRelease(s, m, { today: '2026-08-01' });
  assert.doesNotMatch(pr.full, /chorus line|lyrics about|screamed vocals/);
  assert.match(pr.headline, /instrumental single/);
  assert.match(pr.blurb, /new instrumental single/);
  assert.match(spotifyPitch(s, m), /instrumental single/);
  assert.doesNotMatch(spotifyPitch(s, m), /screamed/);
  assert.match(submitPitch(s, m), /instrumental/);
  assert.equal(soundOf(s).vocals, 'none');
  assert.ok(planPosts(s).every((p) => p.hook === ''));
});
