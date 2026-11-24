import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/state.js';

const stepsBack = (store) => {
  let n = 0;
  while (store.undo()) n++;
  return n;
};

test('undo keeps 150 steps of a small edit', () => {
  const store = createStore({ n: 0 });
  for (let i = 1; i <= 200; i++) store.update((d) => (d.n = i));
  assert.equal(stepsBack(store), 150);
});

test('undo of a very large edit keeps fewer steps (about 24 million characters) but never fewer than 20', () => {
  const store = createStore({ n: 0, blob: 'x'.repeat(1_000_000) });
  for (let i = 1; i <= 100; i++) store.update((d) => (d.n = i));
  const kept = stepsBack(store);
  assert.ok(kept >= 20 && kept <= 25, `kept ${kept}`);
  const huge = createStore({ n: 0, blob: 'x'.repeat(4_000_000) });
  for (let i = 1; i <= 40; i++) huge.update((d) => (d.n = i));
  assert.equal(stepsBack(huge), 20);
});

test('undo and redo still return the same edit after steps were dropped', () => {
  const store = createStore({ n: 0, blob: 'x'.repeat(1_000_000) });
  for (let i = 1; i <= 60; i++) store.update((d) => (d.n = i));
  assert.equal(store.undo(), true);
  assert.equal(store.get().n, 59);
  assert.equal(store.redo(), true);
  assert.equal(store.get().n, 60);
  store.replace({ n: 7 });
  assert.equal(store.canUndo(), false);
  for (let i = 1; i <= 160; i++) store.update((d) => (d.n = i));
  assert.equal(stepsBack(store), 150);
});
