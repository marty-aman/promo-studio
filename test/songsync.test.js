import test from 'node:test';
import assert from 'node:assert/strict';
import { savedVideoSync, setVideoSync, clearVideoSync, sameVideoSync, normalizeTabSync, savedTabSync, setTabSync, clearTabSync, sameTabSync, layerSync, syncPatch, layerTabFile, tabSyncChanges, videoSyncChange, autoSyncDecision, describeTabSync } from '../js/songsync.js';
import { normalizeFiles } from '../js/manager/files.js';

const NOW = new Date('2026-11-24T02:00:00Z');
const song = () => ({ id: 's1', title: 'Static Bloom', audioId: 'a', files: { tabs: [{ id: 't1', mediaId: 'gp' }], stems: [], video: { mediaId: 'mv', offset: 0 }, footage: [] } });

test('music video sync: saved with a date, older saves count when not 0, clear forgets it', () => {
  const s = song();
  assert.equal(savedVideoSync(s), null);
  assert.deepEqual(setVideoSync(s, 12.4004, NOW), { offset: 12.4, savedAt: NOW.toISOString() });
  assert.equal(setVideoSync(s, -3, NOW).offset, 0); // before the video's start is kept as 0, as before
  clearVideoSync(s);
  assert.equal(savedVideoSync(s), null);
  assert.deepEqual(savedVideoSync({ files: { video: { mediaId: 'mv', offset: 8 } } }), { offset: 8, savedAt: '' });
  assert.ok(sameVideoSync(-2, 0));
});

test('tab sync: saved per file on the song, cleaned up from a backup, cleared', () => {
  const s = song();
  assert.equal(setTabSync(s, 'other', { offset: 1 }, NOW), null);
  const saved = setTabSync(s, 'gp', { offset: 4.12345, tempoScale: 0.98765, bar: 5 }, NOW);
  assert.deepEqual(saved, { offset: 4.123, tempoScale: 0.9877, bar: 5, savedAt: NOW.toISOString() });
  assert.deepEqual(savedTabSync(s, 'gp'), saved);
  assert.equal(normalizeTabSync({ offset: 'x' }), null);
  assert.deepEqual(normalizeTabSync({ offset: 2, tempoScale: -1, bar: 0 }), { offset: 2, tempoScale: 1, savedAt: '' });
  clearTabSync(s, 'gp');
  assert.equal(savedTabSync(s, 'gp'), null);
});

test('backups keep both syncs, and older saves without them still load', () => {
  const f = normalizeFiles({ tabs: [{ id: 't1', mediaId: 'gp', sync: { offset: 3, tempoScale: 1.01, savedAt: 'd' } }, { id: 't2', mediaId: 'gp2' }], video: { mediaId: 'mv', offset: 12, savedAt: 'd' } });
  assert.deepEqual(f.tabs[0].sync, { offset: 3, tempoScale: 1.01, savedAt: 'd' });
  assert.equal('sync' in f.tabs[1], false);
  assert.deepEqual(f.video, { mediaId: 'mv', offset: 12, savedAt: 'd' });
  assert.deepEqual(normalizeFiles({ video: { mediaId: 'mv', offset: 0 } }).video, { mediaId: 'mv', offset: 0 });
  assert.deepEqual(normalizeFiles(JSON.parse(JSON.stringify(f))), f);
});

test('which layers read one of the song’s tab files', () => {
  const ids = ['gp'];
  assert.equal(layerTabFile({ type: 'tab', mediaId: 'gp' }, ids), 'gp');
  assert.equal(layerTabFile({ type: 'drums', source: 'gp', mediaId: 'gp' }, ids), 'gp');
  assert.equal(layerTabFile({ type: 'game', source: 'tab', mediaId: 'gp' }, ids), 'gp');
  assert.equal(layerTabFile({ type: 'drums', source: 'audio', mediaId: 'gp' }, ids), null);
  assert.equal(layerTabFile({ type: 'midi', mediaId: 'mid' }, ids), null);
  assert.equal(layerTabFile({ type: 'tab', mediaId: 'other' }, ids), null);
});

test('tab changes: a synced layer is saved, a new layer of the file starts on the saved sync', () => {
  const saved = { offset: 10, tempoScale: 1.02, savedAt: 'x' };
  const L = { id: 'L1', type: 'tab', mediaId: 'gp', offset: 0, tempoScale: 1 };
  let r = tabSyncChanges(new Map(), [L], [], () => null); // the edit as it was: nothing counts as new
  r = tabSyncChanges(r.seen, [L], ['gp'], () => saved);
  assert.deepEqual(r.fresh, []);
  // auto-sync moved it
  r = tabSyncChanges(r.seen, [{ ...L, offset: 4.5, tempoScale: 0.99, userSync: true }], ['gp'], () => saved);
  assert.deepEqual(r.edited, [{ mediaId: 'gp', sync: { offset: 4.5, tempoScale: 0.99 } }]);
  // a moved layer that isn't the user's sync (e.g. a template's) isn't saved
  r = tabSyncChanges(r.seen, [{ ...L, offset: 5 }], ['gp'], () => saved);
  assert.deepEqual(r.edited, []);
  // a new layer, and a layer switched to the file
  r = tabSyncChanges(r.seen, [{ ...L, offset: 5 }, { id: 'L2', type: 'game', source: 'tab', mediaId: 'gp', offset: 0 }], ['gp'], () => saved);
  assert.deepEqual(r.fresh, [{ id: 'L2', sync: saved }]);
  r = tabSyncChanges(r.seen, [{ id: 'L3', type: 'tab', mediaId: 'gp', offset: 10, tempoScale: 1.02 }], ['gp'], () => saved);
  assert.deepEqual(r.fresh, [], 'already on it');
  assert.deepEqual(syncPatch({ offset: 1, tempoScale: 1.1, bar: 3 }), { offset: 1, tempoScale: 1.1, syncBar: 3, userSync: true });
  assert.deepEqual(layerSync({ offset: 1, syncBar: 3 }), { offset: 1, tempoScale: 1, bar: 3 });
});

test('music video changes: only a changed in-point of a normal-speed clip of the video counts', () => {
  const clip = { id: 'c1', mediaId: 'mv', in: 0, speed: 1, start: 2 };
  let r = videoSyncChange(new Map(), [clip], 'mv', 0);
  assert.equal(r.point, null);
  r = videoSyncChange(r.seen, [{ ...clip, start: 5 }], 'mv', 0);
  assert.equal(r.point, null, 'moving it is not a sync');
  r = videoSyncChange(r.seen, [{ ...clip, start: 5, in: 17.4 }], 'mv', 1);
  assert.equal(r.point, 11.4);
  r = videoSyncChange(r.seen, [{ ...clip, start: 5, in: 18, speed: 2 }], 'mv', 1);
  assert.equal(r.point, null);
  r = videoSyncChange(r.seen, [{ id: 'c9', mediaId: 'other', in: 3, start: 0 }], 'mv', 0);
  assert.equal(r.point, null);
});

test('automatic saves keep a different saved value unless this tab saved it', () => {
  const same = (a, b) => sameVideoSync(a.offset, b);
  assert.equal(autoSyncDecision(null, 3, same), 'save');
  assert.equal(autoSyncDecision({ offset: 3, savedAt: 'a' }, 3, same), 'same');
  assert.equal(autoSyncDecision({ offset: 3, savedAt: 'a' }, 4, same), 'conflict');
  assert.equal(autoSyncDecision({ offset: 3, savedAt: 'a' }, 4, same, 'a'), 'save');
  assert.equal(autoSyncDecision({ offset: 3, tempoScale: 1, savedAt: 'a' }, { offset: 3.0004, tempoScale: 1 }, sameTabSync), 'same');
  assert.equal(describeTabSync({ offset: 72.5, tempoScale: 0.985, bar: 5 }), 'bar 1 at 1:12.50 in the song, 98.5% speed, lined up on bar 5');
});
