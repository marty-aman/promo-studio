import test from 'node:test';
import assert from 'node:assert/strict';
import { ctaText, releaseDay, releaseISO } from '../js/core.js';
import { autoDate, songDateOf } from '../js/manager/releases.js';
import { defaultEndCard, normalizeProject } from '../js/state.js';
import { captionFacts } from '../js/captions.js';

const NOW = new Date(2026, 10, 28, 15, 0); // Nov 28 2026, 3 pm local

test('dates typed in other ways still fill {date} and {countdown}', () => {
  for (const s of ['2026-12-05', '2026-12-5', '12/5/2026', 'Dec 5, 2026', '2026-12-05T00:00:00.000Z', '2026-12-05T23:30:00-08:00', ' 2026-12-05 ']) {
    assert.equal(ctaText('OUT {date}', s, NOW), 'OUT DEC 5', s);
    assert.equal(ctaText('{countdown}', s, NOW), 'OUT IN 7 DAYS', s);
  }
  assert.equal(releaseISO('12/5/2026'), '2026-12-05');
  assert.equal(releaseDay('2026-02-30'), null, 'no such day');
  assert.equal(releaseDay('Dec 5'), null, 'no year: not a date');
  assert.equal(ctaText('OUT {date}', 'soon', NOW), 'OUT');
});

test('the countdown around release day, and the year when it is not this year', () => {
  assert.equal(ctaText('{countdown}', '2026-11-29', NOW), 'OUT TOMORROW');
  assert.equal(ctaText('{countdown}', '2026-11-28', NOW), 'OUT TODAY');
  assert.equal(ctaText('{countdown}', '2026-11-27', NOW), 'OUT NOW');
  assert.equal(ctaText('OUT {date}', '2027-01-09', NOW), 'OUT JAN 9, 2027');
  assert.equal(ctaText('OUT {date}', '2025-03-14', NOW), 'OUT MAR 14, 2025');
  assert.equal(captionFacts({ endCard: { releaseDate: '12/5/2026' } }).when.startsWith('out in'), true);
});

test('the end card date follows the song unless typed by hand', () => {
  const ec = defaultEndCard();
  assert.equal(autoDate(ec, '2026-12-05'), true);
  assert.deepEqual([ec.releaseDate, ec.dateBy], ['2026-12-05', 'auto']);
  assert.equal(autoDate(ec, '2027-01-09'), true, 'another song replaces it');
  assert.equal(autoDate(ec, ''), true, 'a song with no date clears the last song\u2019s');
  assert.deepEqual([ec.releaseDate, ec.dateBy], ['', '']);
  ec.releaseDate = '2026-12-24';
  ec.dateBy = 'manual';
  assert.equal(autoDate(ec, '2026-12-05'), false);
  assert.equal(autoDate(ec, ''), false);
  assert.equal(ec.releaseDate, '2026-12-24');
  assert.equal(autoDate(ec, '2026-12-05', { force: true }), true);
  assert.deepEqual([ec.releaseDate, ec.dateBy], ['2026-12-05', 'auto']);
  const old = { releaseDate: '2026-10-01' }; // an old save: no flag, counts as typed
  assert.equal(autoDate(old, '2026-12-05'), false);
  assert.equal(songDateOf({ releaseId: 'r' }, [{ id: 'r', releaseDate: '2026-12-11' }]), '2026-12-11', 'the EP\u2019s date');
  assert.equal(songDateOf({ releaseDate: '2026-12-01', releaseId: 'r' }, [{ id: 'r', releaseDate: '2026-12-11' }]), '2026-12-01');
});

test('old saves load: a typed date becomes YYYY-MM-DD, anything else is kept', () => {
  assert.equal(normalizeProject({ endCard: { releaseDate: '12/5/2026' } }).endCard.releaseDate, '2026-12-05');
  assert.equal(normalizeProject({ endCard: { releaseDate: 'soon' } }).endCard.releaseDate, 'soon');
  assert.equal(normalizeProject({ endCard: { releaseDate: '2026-12-05' } }).endCard.dateBy, '');
});
