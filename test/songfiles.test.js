import test from 'node:test';
import assert from 'node:assert/strict';
import { guessStemRole, normalizeFiles, addStems, addFootage, setVideo, fileCounts, songMediaIds, studioSongFiles, newFiles } from '../js/manager/files.js';
import { newSong, normalizeManager } from '../js/manager/model.js';

test('stem parts are guessed from file names', () => {
  const cases = {
    'Static Bloom - DRUMS.wav': 'drums',
    'static_bloom_kick.wav': 'drums',
    'Overheads.flac': 'drums',
    'Bass DI.wav': 'bass',
    'gtr L rhythm.wav': 'guitar',
    'Lead Guitar.mp3': 'guitar',
    'Lead Vox.wav': 'vocals',
    'screams-double.wav': 'vocals',
    'Synth pad.wav': 'keys',
    'click.wav': 'other',
    'Bassoon.wav': 'other',
  };
  for (const [name, role] of Object.entries(cases)) assert.equal(guessStemRole(name), role, name);
});

test('adding stems, a music video and footage skips repeats', () => {
  const s = newSong('Static Bloom');
  s.audioId = 'mix';
  assert.equal(addStems(s, [{ id: 'd', name: 'Drums.wav' }, { id: 'b', name: 'Bass.wav' }, { id: 'mix', name: 'Mix.wav' }]), 2);
  assert.equal(addStems(s, [{ id: 'd', name: 'Drums.wav' }]), 0);
  assert.deepEqual(s.files.stems.map((x) => [x.mediaId, x.role]), [['d', 'drums'], ['b', 'bass']]);
  assert.equal(addFootage(s, [{ id: 'c1' }, { id: 'c2' }, { id: 'c1' }]), 2);
  setVideo(s, { id: 'c2' });
  assert.equal(s.files.video.mediaId, 'c2');
  assert.deepEqual(s.files.footage.map((c) => c.mediaId), ['c1'], 'the music video leaves the footage list');
  assert.equal(addFootage(s, [{ id: 'c2' }]), 0, 'the music video is not footage too');
  assert.deepEqual(fileCounts(s), { stems: 2, video: 1, footage: 1, total: 4 });
  assert.deepEqual(songMediaIds(s).sort(), ['b', 'c1', 'c2', 'd', 'mix']);
  setVideo(s, null);
  assert.equal(s.files.video, null);
});

test('old and broken saves are cleaned up', () => {
  assert.deepEqual(normalizeFiles(undefined), newFiles());
  const f = normalizeFiles({ stems: [{ mediaId: 'a', role: 'banjo' }, { role: 'bass' }, 'x'], video: { nope: 1 }, footage: [{ mediaId: 'c', note: 7 }] });
  assert.equal(f.stems.length, 1);
  assert.equal(f.stems[0].role, 'other');
  assert.equal(f.video, null);
  assert.equal(f.footage[0].note, '7');
  const m = normalizeManager({ songs: [{ id: 's1', title: 'Old' }] });
  assert.deepEqual(m.songs[0].files, newFiles());
});

test('the Video Studio lists songs that have files, skipping missing ones', () => {
  const lib = { v: { id: 'v', name: 'MV.mp4', kind: 'video', duration: 200 }, c: { id: 'c', name: 'take1.mov', kind: 'video', duration: 12 }, d: { id: 'd', name: 'Drums.wav', kind: 'audio' } };
  const a = { ...newSong('A'), releaseDate: '2026-12-01', files: { stems: [{ id: '1', mediaId: 'd', role: 'drums' }], video: { mediaId: 'v' }, footage: [{ id: '2', mediaId: 'c', note: 'chorus' }, { id: '3', mediaId: 'gone', note: '' }] } };
  const b = { ...newSong('B'), releaseDate: '2027-01-01', files: { stems: [], video: null, footage: [{ id: '4', mediaId: 'c', note: '' }] } };
  const empty = newSong('C');
  const out = studioSongFiles([a, b, empty], (id) => lib[id] || null);
  assert.deepEqual(out.map((s) => s.title), ['B', 'A'], 'newest release first, songs without files left out');
  const A = out[1];
  assert.equal(A.video.name, 'MV.mp4');
  assert.deepEqual(A.footage.map((x) => [x.name, x.note]), [['take1.mov', 'chorus']]);
  assert.deepEqual(A.stems.map((x) => [x.name, x.role]), [['Drums.wav', 'drums']]);
});
