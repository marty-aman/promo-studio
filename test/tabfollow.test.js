// Tab Studio opens the selected song's Guitar Pro file, and follows the song until you pick or edit a tab yourself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { songTabsMainFirst, songTabChoices, tabToFollow, studioSongContext } from '../js/manager/files.js';

const lib = { gpA: { id: 'gpA', name: 'a.gp', score: {} }, gpA2: { id: 'gpA2', name: 'a-live.gp', score: {} }, draft: { id: 'draft', name: 'a-draft.gp', score: {} }, bad: { id: 'bad', name: 'broken.gp' }, gpB: { id: 'gpB', name: 'b.gp', score: {} } };
const info = (id) => lib[id] || null;
const songA = { id: 'A', title: 'Static Bloom', files: { tabs: [{ id: 't0', mediaId: 'draft', draft: true }, { id: 't1', mediaId: 'gpA' }, { id: 't2', mediaId: 'gpA2' }] } };
const songB = { id: 'B', title: 'Undertow', files: { tabs: [{ id: 't3', mediaId: 'gpB' }] } };
const none = { id: 'N', title: 'Glasshouse', files: { tabs: [] } };
const gone = { id: 'G', title: 'Low Tide', files: { tabs: [{ id: 't4', mediaId: 'lost' }, { id: 't5', mediaId: 'bad' }] } };
const choices = (s) => songTabChoices(s, info, (id) => `${id}.gp`);
const empty = { model: null };

test('the main tab comes first: files you added before drafts from a stem', () => {
  assert.deepEqual(songTabsMainFirst(songA).map((t) => t.mediaId), ['gpA', 'gpA2', 'draft']);
  assert.deepEqual(songTabsMainFirst({ id: 'x' }), []);
  assert.deepEqual(studioSongContext({ songs: [songA] }, { songId: 'A', info }).tabs, ['gpA', 'gpA2', 'draft']);
});

test('missing and unreadable files are named, not dropped', () => {
  assert.deepEqual(choices(gone), [
    { mediaId: 'lost', name: 'lost.gp', draft: false, state: 'missing' },
    { mediaId: 'bad', name: 'broken.gp', draft: false, state: 'unreadable' },
  ]);
});

test('nothing open: the song’s main tab opens, or the one the video uses', () => {
  assert.equal(tabToFollow(empty, songA, choices(songA)), 'gpA');
  assert.equal(tabToFollow(empty, songA, choices(songA), ['clip1', 'gpA2']), 'gpA2');
  assert.equal(tabToFollow(empty, null, []), null);
  assert.equal(tabToFollow(empty, none, choices(none)), null);
  assert.equal(tabToFollow(empty, gone, choices(gone)), null, 'a missing file is not opened');
});

test('a tab opened for the song follows the next song while it is untouched', () => {
  const open = { model: {}, auto: { songId: 'A', mediaId: 'gpA' }, edited: false, sourceId: 'gpA' };
  assert.equal(tabToFollow(open, songA, choices(songA)), null, 'same song: keep the pick');
  assert.equal(tabToFollow(open, songB, choices(songB)), 'gpB');
  assert.equal(tabToFollow(open, none, choices(none)), '', 'the next song has no tab: close it');
  assert.equal(tabToFollow(open, null, []), null);
});

test('a tab opened by hand or edited is never replaced', () => {
  assert.equal(tabToFollow({ model: {}, auto: null, edited: false, sourceId: 'gpA' }, songB, choices(songB)), null);
  assert.equal(tabToFollow({ model: {}, auto: { songId: 'A', mediaId: 'gpA' }, edited: true, sourceId: 'gpA' }, songB, choices(songB)), null);
  // made from stems on top of the song's tab: the open model is no longer that file
  assert.equal(tabToFollow({ model: {}, auto: { songId: 'A', mediaId: 'gpA' }, edited: false, sourceId: null }, songB, choices(songB)), null);
});
