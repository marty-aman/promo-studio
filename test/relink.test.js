import test from 'node:test';
import assert from 'node:assert/strict';
import { referencedIds, normName, splitPath, remember, trim, mergeIndex, missingItems, pickMatches, namesWithCounts } from '../js/mediamatch.js';

const F = (path) => ({ name: path.split('/').pop(), webkitRelativePath: path.includes('/') ? path : '' });
const M = (id, name, path = '', kind = '') => ({ id, name, path, kind });
const ids = (r) => r.matches.map((m) => `${m.item.id}<-${m.file.webkitRelativePath || m.file.name}`);

test('referencedIds finds media ids anywhere in saved data and ignores other strings', () => {
  const data = { clips: [{ mediaId: 'm_abc123xy' }], song: { mediaId: 'm_zzzzzz11', title: 'm_not an id' }, files: { stems: [{ mediaId: 'm_abc123xy' }] }, note: 'xm_abc123xy', n: 4, nothing: null };
  assert.deepEqual([...referencedIds(data)].sort(), ['m_abc123xy', 'm_zzzzzz11']);
  assert.deepEqual([...referencedIds()], []);
});

test('names compare without case, accent form or spaces at the ends', () => {
  assert.equal(normName(' Café.WAV '), normName('Cafe\u0301.wav'));
  assert.deepEqual(splitPath('Band\\Stems/Kick.wav'), { name: 'Kick.wav', dirs: ['band', 'stems'] });
  assert.deepEqual(splitPath('', 'a.wav'), { name: 'a.wav', dirs: [] });
});

test('the name index remembers, never erases with a blank, and trims the oldest present ids first', () => {
  const ix = {};
  remember(ix, 'm_a', { name: 'a.wav', path: 'X/a.wav', kind: 'audio' });
  remember(ix, 'm_a', { name: 'a.wav', path: '', kind: '' });
  assert.deepEqual(ix.m_a, ['a.wav', 'X/a.wav', 'audio']);
  remember(ix, 'm_none', { name: '' });
  assert.ok(!('m_none' in ix));
  remember(ix, 'm_b', { name: 'b.wav' });
  remember(ix, 'm_c', { name: 'c.wav' });
  trim(ix, (id) => id === 'm_b', 2);
  assert.deepEqual(Object.keys(ix), ['m_a', 'm_c']);
  trim(ix, () => false, 1);
  assert.deepEqual(Object.keys(ix), ['m_c']);
});

test('merging another index adds only unknown, well-formed ids', () => {
  const ix = { m_known1: ['mine.wav', '', 'audio'] };
  mergeIndex(ix, { m_known1: ['other.wav', '', ''], m_newone1: ['new.wav', 'D/new.wav', 'audio'], bad: ['x'], m_broken1: 5, m_empty11: [''] });
  assert.deepEqual(ix, { m_known1: ['mine.wav', '', 'audio'], m_newone1: ['new.wav', 'D/new.wav', 'audio'] });
  assert.equal(mergeIndex(ix, null), ix);
});

test('missingItems lists the absent ids with the name they had, unnamed last', () => {
  const index = { m_a: ['Zed.wav', '', 'audio'], m_b: ['alpha.png', 'P/alpha.png', 'image'] };
  const out = missingItems(new Set(['m_a', 'm_b', 'm_c', 'm_here']), (id) => id === 'm_here', index);
  assert.deepEqual(out.map((m) => m.id), ['m_b', 'm_a', 'm_c']);
  assert.deepEqual(out[0], { id: 'm_b', name: 'alpha.png', path: 'P/alpha.png', kind: 'image' });
  assert.equal(out[2].name, '');
});

test('a picked file with the same name replaces the missing one, ignoring case', () => {
  const r = pickMatches([M('m_1', 'Kick.WAV')], [F('kick.wav'), F('snare.wav')]);
  assert.deepEqual(ids(r), ['m_1<-kick.wav']);
  assert.deepEqual(r.extra.map((f) => f.name), ['snare.wav']);
  assert.equal(r.still.length, 0);
});

test('a file that matches nothing leaves the item missing, and unnamed items never match', () => {
  const r = pickMatches([M('m_1', 'gone.mp4'), M('m_2', '')], [F('other.mp4')]);
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.still.map((s) => [s.item.id, s.reason]), [['m_1', 'notFound'], ['m_2', 'unknown']]);
  assert.equal(r.extra.length, 1);
});

test('two files with the same name in different sub-folders go to the matching folder', () => {
  const missing = [M('m_a', 'riff.wav', 'Band/Guitar/riff.wav'), M('m_b', 'riff.wav', 'Band/Bass/riff.wav')];
  const files = [F('Backup/Bass/riff.wav'), F('Backup/Guitar/riff.wav')];
  assert.deepEqual(ids(pickMatches(missing, files)), ['m_a<-Backup/Guitar/riff.wav', 'm_b<-Backup/Bass/riff.wav']);
});

test('the folder closest to the file wins even when only the last folder agrees', () => {
  const r = pickMatches([M('m_a', 'x.png', 'A/shots/x.png')], [F('P/other/x.png'), F('Q/shots/x.png')]);
  assert.deepEqual(ids(r), ['m_a<-Q/shots/x.png']);
});

test('when several files share the name and none is in the same folder, nothing is guessed', () => {
  const r = pickMatches([M('m_a', 'x.png', 'A/one/x.png')], [F('P/two/x.png'), F('P/three/x.png')]);
  assert.equal(r.matches.length, 0);
  assert.equal(r.still[0].reason, 'ambiguous');
  // no folder known and two candidates: same
  assert.equal(pickMatches([M('m_a', 'x.png')], [F('P/two/x.png'), F('P/three/x.png')]).still[0].reason, 'ambiguous');
  // one candidate and no folder known: fine
  assert.equal(pickMatches([M('m_a', 'x.png')], [F('P/two/x.png')]).matches.length, 1);
});

test('the same file picked twice, or imported twice, still heals', () => {
  const dup = pickMatches([M('m_a', 'x.png', 'A/x.png')], [F('A/x.png'), F('A/x.png')]);
  assert.equal(dup.matches.length, 1);
  const twice = pickMatches([M('m_a', 'x.png', 'A/x.png'), M('m_b', 'x.png', 'A/x.png')], [F('A/x.png')]);
  assert.deepEqual(ids(twice), ['m_a<-A/x.png', 'm_b<-A/x.png']);
});

test('one picked file is not given to two missing files from different places', () => {
  const missing = [M('m_a', 'x.wav', 'R/a/x.wav'), M('m_b', 'x.wav', 'R/b/x.wav')];
  const r = pickMatches(missing, [F('Z/a/x.wav')]);
  assert.deepEqual(ids(r), ['m_a<-Z/a/x.wav']);
  assert.deepEqual(r.still.map((s) => [s.item.id, s.reason]), [['m_b', 'taken']]);
  // a loose file with nothing to tell them apart goes to neither
  const loose = pickMatches([M('m_a', 'x.wav', 'R/a/x.wav'), M('m_b', 'x.wav', 'R/b/x.wav')], [F('x.wav')]);
  assert.equal(loose.matches.length, 0);
  assert.deepEqual(loose.still.map((s) => s.reason), ['ambiguous', 'ambiguous']);
});

test('exact-case names win a tie between files that differ only by case', () => {
  const r = pickMatches([M('m_a', 'Kick.wav', 'R/Kick.wav')], [F('S/kick.wav'), F('S/Kick.wav')]);
  assert.deepEqual(ids(r), ['m_a<-S/Kick.wav']);
});

test('a mixed folder replaces image, audio and video at once and leaves the rest', () => {
  const missing = [M('m_i', 'cover.jpg', '', 'image'), M('m_s', 'song.wav', '', 'audio'), M('m_v', 'mv.mp4', '', 'video'), M('m_x', 'lost.mp3', '', 'audio')];
  const files = [F('Show/cover.jpg'), F('Show/song.WAV'), F('Show/mv.mp4'), F('Show/notes.txt')];
  const r = pickMatches(missing, files);
  assert.deepEqual(r.matches.map((m) => m.item.id), ['m_i', 'm_s', 'm_v']);
  assert.deepEqual(r.still.map((s) => s.item.id), ['m_x']);
  assert.deepEqual(r.extra.map((f) => f.name), ['notes.txt']);
});

test('names are listed with counts', () => {
  assert.deepEqual(namesWithCounts([M('1', 'a'), M('2', 'a'), M('3', '')]), [{ name: 'a', count: 2 }, { name: 'a file whose name was not saved', count: 1 }]);
});
