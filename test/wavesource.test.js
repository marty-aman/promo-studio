import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWaveSource, chosenWaveSource, waveChoices, resolveWave, normalizeWaveSource } from '../js/wavesource.js';
import { newManager, newSong, normalizeManager, backupFile, parseBackup } from '../js/manager/model.js';

const peaks = new Float32Array([-0.5, 0.5]);
const lib = {
  mSong: { name: 'Static Bloom.wav', peaks },
  mDrums: { name: 'SB Drums.wav', peaks },
  mVox: { name: 'SB Vox.wav', peaks },
  mVox2: { name: 'SB Vox double.wav', peaks },
  mBvs: { name: 'SB Harmony.wav', peaks },
  mFlat: { name: 'SB Broken.wav', peaks: null },
};
const info = (id) => lib[id] || null;
const song = (stems, extra = {}) => ({ ...newSong('Static Bloom'), audioId: 'mSong', files: { tabs: [], stems, video: null, footage: [] }, ...extra });
const st = (mediaId, role, name = '') => ({ id: `s-${mediaId}`, mediaId, role, name });

test('default waveform: lead vocals stem, else backing vocals, else the song', () => {
  assert.equal(defaultWaveSource(song([st('mDrums', 'drums'), st('mBvs', 'bvs'), st('mVox', 'vocals'), st('mVox2', 'vocals')])), 'mVox');
  assert.equal(defaultWaveSource(song([st('mDrums', 'drums'), st('mBvs', 'bvs')])), 'mBvs');
  assert.equal(defaultWaveSource(song([st('mDrums', 'drums')])), 'song');
  assert.equal(defaultWaveSource(song([])), 'song');
  assert.equal(defaultWaveSource({}), 'song');
});

test('a saved choice wins while it is still the song or one of its stems', () => {
  const stems = [st('mDrums', 'drums'), st('mVox', 'vocals')];
  assert.equal(chosenWaveSource(song(stems, { waveSource: 'song' })), 'song');
  assert.equal(chosenWaveSource(song(stems, { waveSource: 'mDrums' })), 'mDrums');
  assert.equal(chosenWaveSource(song(stems, { waveSource: 'removed-stem' })), 'mVox'); // stem taken off the song: default
  assert.equal(chosenWaveSource(song(stems, { waveSource: '' })), 'mVox');
  assert.equal(chosenWaveSource(song(stems, { waveSource: 42 })), 'mVox');
});

test('choices are the song then the stems grouped by part with their own names', () => {
  const c = waveChoices(song([st('mVox', 'vocals', 'Lead take 3'), st('mDrums', 'drums')]), info);
  assert.deepEqual(c, [
    { label: '', options: [{ value: 'song', label: 'Song' }] },
    { label: 'Drums', options: [{ value: 'mDrums', label: 'SB Drums' }] },
    { label: 'Lead vocals', options: [{ value: 'mVox', label: 'Lead take 3' }] },
  ]);
});

test('resolveWave draws the stem, or falls back to the song with a note', () => {
  const s = song([st('mVox', 'vocals'), st('mGone', 'bvs'), st('mFlat', 'other')]);
  assert.deepEqual(resolveWave(s, info), { value: 'mVox', id: 'mVox', label: 'SB Vox', note: '' });
  const gone = resolveWave({ ...s, waveSource: 'mGone' }, info);
  assert.equal(gone.id, 'mSong');
  assert.equal(gone.value, 'mGone');
  assert.match(gone.note, /not in the media library/);
  assert.match(resolveWave({ ...s, waveSource: 'mFlat' }, info).note, /no waveform/);
  assert.deepEqual(resolveWave({ ...s, waveSource: 'song' }, info), { value: 'song', id: 'mSong', label: 'Song', note: '' });
  // the Video Studio falls back to the edit's own song file
  assert.equal(resolveWave({ ...s, waveSource: 'song' }, (id) => (id === 'other' ? { peaks } : info(id)), { songId: 'other' }).id, 'other');
});

test('the choice is saved with the song, kept in backups, and older saves get the default', () => {
  assert.equal(normalizeWaveSource(undefined), '');
  assert.equal(normalizeWaveSource('x'.repeat(200)).length, 80);
  const m = newManager();
  m.songs = [song([st('mVox', 'vocals'), st('mDrums', 'drums')], { waveSource: 'mDrums' })];
  const back = normalizeManager(parseBackup(backupFile(m)));
  assert.equal(back.songs[0].waveSource, 'mDrums');
  assert.equal(chosenWaveSource(back.songs[0]), 'mDrums');
  const old = normalizeManager({ songs: [{ id: 's1', title: 'Old', audioId: 'mSong', files: { stems: [{ id: 'a', mediaId: 'mVox', role: 'vocals' }] } }] });
  assert.equal(old.songs[0].waveSource, '');
  assert.equal(chosenWaveSource(old.songs[0]), 'mVox');
});
