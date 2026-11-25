import test from 'node:test';
import assert from 'node:assert/strict';
import { PANES, FOCUS_WORKSPACES, defaultLayout, normalizeLayout, setPane, setFocus, resetLayout, isShown, shownPanes, isDefaultLayout, topLayer } from '../js/panes.js';

test('an old save without a layout (or junk) opens with every pane shown and no focus mode', () => {
  for (const raw of [undefined, null, 'x', 3, [], {}, { studio: 'nope' }, { studio: { hidden: 'tools', focus: 'yes' } }]) {
    const L = normalizeLayout(raw);
    assert.deepEqual(L, defaultLayout());
    for (const ws of Object.keys(PANES)) assert.ok(isDefaultLayout(L, ws));
  }
});

test('unknown pane ids and duplicates are dropped; focus only sticks where there is a preview', () => {
  const L = normalizeLayout({ studio: { hidden: ['tools', 'tools', 'timeline', 'preview'], focus: true }, manager: { hidden: ['nav'], focus: true }, tabstudio: { focus: true } });
  assert.deepEqual(L.studio, { hidden: ['tools'], focus: true });
  assert.deepEqual(L.manager, { hidden: ['nav'], focus: false });
  assert.equal(L.tabstudio.focus, false);
  assert.deepEqual(FOCUS_WORKSPACES, ['studio', 'photo']);
});

test('the core areas are never in a pane list, so they cannot be hidden', () => {
  const ids = Object.values(PANES).flat().map((p) => p.id);
  for (const core of ['preview', 'timeline', 'stage', 'center', 'main']) assert.ok(!ids.includes(core));
  const L = setPane(defaultLayout(), 'studio', 'timeline', false);
  assert.deepEqual(L, defaultLayout());
});

test('hide, show and flip one pane; the input layout is not changed', () => {
  const base = defaultLayout();
  const a = setPane(base, 'studio', 'tools', false);
  assert.equal(isShown(a, 'studio', 'tools'), false);
  assert.equal(isShown(a, 'studio', 'inspector'), true);
  assert.deepEqual(base, defaultLayout());
  const b = setPane(a, 'studio', 'tools');
  assert.equal(isShown(b, 'studio', 'tools'), true);
  assert.deepEqual(shownPanes(setPane(b, 'photo', 'right'), 'photo'), { left: true, right: false });
  // hiding twice is the same as once
  assert.deepEqual(setPane(a, 'studio', 'tools', false), a);
});

test('workspaces keep their own layout', () => {
  let L = setPane(defaultLayout(), 'studio', 'inspector', false);
  L = setPane(L, 'photo', 'left', false);
  assert.deepEqual(L.studio.hidden, ['inspector']);
  assert.deepEqual(L.photo.hidden, ['left']);
  assert.deepEqual(L.manager.hidden, []);
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(L))), L); // survives the settings round trip
});

test('focus mode hides every side pane and keeps the earlier choices for when it ends', () => {
  let L = setPane(defaultLayout(), 'studio', 'inspector', false);
  L = setFocus(L, 'studio');
  assert.deepEqual(shownPanes(L, 'studio'), { tools: false, inspector: false });
  assert.ok(!isDefaultLayout(L, 'studio'));
  const off = setFocus(L, 'studio');
  assert.deepEqual(shownPanes(off, 'studio'), { tools: true, inspector: false });
  // showing a pane ends focus mode; the pane hidden before focus stays hidden
  const shown = setPane(L, 'studio', 'tools', true);
  assert.equal(shown.studio.focus, false);
  assert.deepEqual(shownPanes(shown, 'studio'), { tools: true, inspector: false });
  // hiding an already hidden pane in focus mode changes nothing
  assert.deepEqual(setPane(L, 'studio', 'tools', false), L);
  // no focus mode in the Manager or Tab Studio
  assert.deepEqual(setFocus(defaultLayout(), 'manager', true), defaultLayout());
  assert.deepEqual(setFocus(defaultLayout(), 'tabstudio', true), defaultLayout());
});

test('restore the default layout for one workspace only', () => {
  let L = setFocus(setPane(defaultLayout(), 'studio', 'tools', false), 'studio', true);
  L = setPane(L, 'photo', 'right', false);
  const r = resetLayout(L, 'studio');
  assert.ok(isDefaultLayout(r, 'studio'));
  assert.deepEqual(r.photo.hidden, ['right']);
});

test('Esc goes to the top-most open layer: the last one opened that is still open', () => {
  const mk = (open) => ({ open: () => open });
  const a = mk(true);
  const b = mk(false);
  const c = mk(true);
  assert.equal(topLayer([a, b, c]), c);
  assert.equal(topLayer([a, b]), a);
  assert.equal(topLayer([b]), null);
  assert.equal(topLayer([]), null);
});
