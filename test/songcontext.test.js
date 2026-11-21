import test from 'node:test';
import assert from 'node:assert/strict';
import { studioSongContext } from '../js/manager/files.js';
import { findSong } from '../js/lyricsfetch.js';

const lib = { mSong: 'Static Bloom.wav', mUt: 'undertow-master.wav', mVox: 'SB Vox.wav', mKick: 'SB Kick.wav', mSnare: 'SB Snare.wav', mTab: 'static-bloom.gp', mOther: 'other band stem.wav' };
const info = (id) => (lib[id] ? { id, name: lib[id] } : null);
const m = {
  songs: [
    {
      id: 'sb',
      title: 'Static Bloom',
      audioId: 'mSong',
      files: {
        tabs: [{ id: 't1', mediaId: 'mTab' }, { id: 't2', mediaId: 'gone' }],
        stems: [
          { id: 's1', mediaId: 'mVox', role: 'vocals', name: '' },
          { id: 's2', mediaId: 'mKick', role: 'drums', name: 'Kick in + out' },
          { id: 's3', mediaId: 'mSnare', role: 'drums', name: '' },
          { id: 's4', mediaId: 'gone', role: 'bass', name: '' },
        ],
        footage: [],
        video: null,
      },
    },
    { id: 'ut', title: 'Undertow', audioId: 'mUt', files: { tabs: [], stems: [], footage: [], video: null } },
    { id: 'gh', title: 'Glasshouse', audioId: null },
    { id: 'lt', title: 'Low Tide', audioId: 'gone' },
  ],
};

test('your songs with a song file still in the library', () => {
  const c = studioSongContext(m, { info, findSong });
  assert.deepEqual(c.songs, [{ id: 'sb', title: 'Static Bloom', mediaId: 'mSong' }, { id: 'ut', title: 'Undertow', mediaId: 'mUt' }]);
  assert.equal(c.song, null);
  assert.deepEqual(c.stems, []);
});

test('the current song’s stems (grouped, drums first, named) and tabs', () => {
  const c = studioSongContext(m, { songId: 'sb', info, findSong });
  assert.equal(c.song.id, 'sb');
  assert.deepEqual(c.stems.map((s) => s.label), ['Drums: Kick in + out', 'Drums: SB Snare', 'Lead vocals: SB Vox']);
  assert.deepEqual(c.tabs, ['mTab']);
  // found from the edit's song file when the edit isn't linked
  assert.equal(studioSongContext(m, { audioId: 'mSong', info, findSong }).song.id, 'sb');
  assert.equal(studioSongContext(m, { audioId: 'mUt', info, findSong }).song.id, 'ut');
  assert.equal(studioSongContext(m, { audioId: 'mOther', info, findSong }).song, null);
  assert.deepEqual(studioSongContext(m, { songId: 'ut', info, findSong }).stems, []);
});
