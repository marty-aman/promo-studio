import test from 'node:test';
import assert from 'node:assert/strict';
import { lookId, assignLooks, looksById, SHARED_COLOR, CUSTOM_COLORS } from '../js/lookcolors.js';
import { newProject, normalizeProject } from '../js/state.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';

const ln = (id, style) => ({ id, text: id, start: 0, end: 1, ...(style ? { style } : {}) });

test('shared-style lines have no look; presets and own changes are distinct looks', () => {
  assert.equal(lookId(ln('a')), '');
  assert.equal(lookId(ln('a', {})), '');
  assert.equal(lookId(ln('a', { preset: 'scream' })), 'p:scream');
  assert.notEqual(lookId(ln('a', { preset: 'scream', size: 5 })), 'p:scream');
  assert.equal(lookId(ln('a', { size: 5, color: '#fff' })), lookId(ln('b', { color: '#fff', size: 5 })));
  assert.notEqual(lookId(ln('a', { size: 5 })), lookId(ln('b', { size: 6 })));
});

test('colours are stable, distinct, and do not depend on line order', () => {
  const lines = [ln('1', { preset: 'scream' }), ln('2'), ln('3', { preset: 'whisper' }), ln('4', { size: 5 }), ln('5', { size: 6 }), ln('6', { preset: 'scream' })];
  const a = assignLooks(lines);
  const b = assignLooks([...lines].reverse());
  assert.deepEqual(a, b);
  assert.equal(a.length, 4);
  assert.equal(new Set(a.map((k) => k.color)).size, 4);
  assert.equal(a.find((k) => k.id === 'p:scream').count, 2);
  assert.ok(!a.some((k) => k.color === SHARED_COLOR));
  assert.equal(new Set(a.map((k) => k.letter)).size, 4);
});

test('custom looks never share a colour until the slots run out', () => {
  const lines = Array.from({ length: CUSTOM_COLORS.length }, (_, i) => ln(String(i), { size: 3 + i }));
  assert.equal(new Set(assignLooks(lines).map((k) => k.color)).size, CUSTOM_COLORS.length);
});

test('a picked colour overrides the default; bad values are ignored', () => {
  const lines = [ln('1', { preset: 'scream' })];
  assert.equal(assignLooks(lines, { 'p:scream': '#112233' })[0].color, '#112233');
  assert.equal(assignLooks(lines, { 'p:scream': '#112233' })[0].picked, true);
  assert.notEqual(assignLooks(lines, { 'p:scream': 'red' })[0].color, 'red');
  const { byLine } = looksById(lines, {});
  assert.ok(byLine.has('1'));
});

test('lookColors is saved in project files and old saves load with none', () => {
  const p = newProject();
  assert.deepEqual(p.lookColors, {});
  p.lookColors = { 'p:scream': '#112233' };
  const back = parseProjectFile(makeProjectFile(p, []));
  assert.equal(normalizeProject(back.project || back).lookColors['p:scream'], '#112233');
  const old = newProject();
  delete old.lookColors;
  assert.deepEqual(normalizeProject(old).lookColors, {});
});
