import test from 'node:test';
import assert from 'node:assert/strict';
import { autoCover, coverOf } from '../js/manager/releases.js';
import { defaultEndCard } from '../js/state.js';
import { applySongTemplate } from '../js/songtemplates.js';
import { newProject } from '../js/state.js';

test('a song picked sets the cover automatically, and a hand-picked cover is kept', () => {
  const ec = defaultEndCard();
  assert.equal(autoCover(ec, 'a'), true);
  assert.deepEqual([ec.coverMediaId, ec.coverBy], ['a', 'auto']);
  assert.equal(autoCover(ec, 'b'), true, 'another song replaces an automatic cover');
  assert.equal(ec.coverMediaId, 'b');
  ec.coverBy = 'manual';
  assert.equal(autoCover(ec, 'c'), false);
  assert.equal(ec.coverMediaId, 'b');
  assert.equal(autoCover(ec, 'c', { force: true }), true, 'Use the song\u2019s cover takes control back');
  assert.deepEqual([ec.coverMediaId, ec.coverBy], ['c', 'auto']);
});

test('no cover: nothing changes; an old save with a cover counts as manual', () => {
  const ec = { coverMediaId: 'x' };
  assert.equal(autoCover(ec, null), false);
  assert.equal(autoCover(ec, 'y'), false);
  assert.equal(ec.coverMediaId, 'x');
  const empty = { coverMediaId: null };
  assert.equal(autoCover(empty, 'y'), true);
});

test('the cover rule: own cover, else the release cover', () => {
  assert.equal(coverOf({ coverId: 'm1', releaseId: 'r' }, [{ id: 'r', coverId: 'm2' }]), 'm1');
  assert.equal(coverOf({ releaseId: 'r' }, [{ id: 'r', coverId: 'm2' }]), 'm2');
});

test('song templates use the same rule', () => {
  const parts = [{ instrument: 'guitar', source: 'tab', mediaId: 'tab', track: 0, label: 'Guitar', from: 'x' }];
  const audio = { id: 'song', name: 's.wav', kind: 'audio', duration: 120, envelope: Float32Array.from({ length: 12000 }, () => 0.5), envRate: 100 };
  const ctx = { song: { id: 's', title: 'T', lyrics: '', releaseDate: '', instrumental: false }, band: 'B', cover: 'm9', today: '2026-01-01', audio, beats: null, footage: [], parts, video: null, hasLyrics: false };
  const hand = newProject();
  hand.endCard.coverMediaId = 'hand';
  hand.endCard.coverBy = 'manual';
  applySongTemplate(hand, 'st-game', ctx);
  assert.equal(hand.endCard.coverMediaId, 'hand');
  const d = newProject();
  applySongTemplate(d, 'st-game', ctx);
  assert.equal(d.endCard.coverMediaId, 'm9');
  assert.equal(d.endCard.coverBy, 'auto');
});
