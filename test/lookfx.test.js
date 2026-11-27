import test from 'node:test';
import assert from 'node:assert/strict';
import { themeById, themeState } from '../js/lookthemes.js';
import { lookMembers, applyTheme, splitLine, setLookFx, resetLookFx, lookFxState, lookFxOf } from '../js/lookapply.js';
import { lookId } from '../js/lookcolors.js';
import { lineStyle } from '../js/linestyle.js';
import { newProject } from '../js/state.js';

const ln = (id, style, extra = {}) => ({ id, text: id, start: 0, end: 1, ...(style ? { style } : {}), ...extra });
const proj = (lines, fx) => {
  const d = { ...newProject(), lyrics: structuredClone(lines) };
  if (fx) d.lyricStyle = { ...d.lyricStyle, fx };
  return d;
};
const L = (d, id) => d.lyrics.find((l) => l.id === id);
const fxOf = (d, id) => lineStyle(d.lyricStyle, L(d, id), d.theme).fx || {};
const blood = themeById('bloodash');

test('a look’s shake reaches every line with that look, never another look or the shared-style lines', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 }), ln('c', { size: 6 }), ln('s')]);
  const before = structuredClone(d.lyrics.filter((l) => l.id === 'c' || l.id === 's'));
  assert.equal(setLookFx(d, 'a', 'shake', 0.5), 2);
  assert.equal(fxOf(d, 'a').shake, 0.5);
  assert.equal(fxOf(d, 'b').shake, 0.5);
  assert.equal(fxOf(d, 'c').shake, undefined);
  assert.equal(fxOf(d, 's').shake, undefined);
  assert.deepEqual(d.lyrics.filter((l) => l.id === 'c' || l.id === 's'), before);
  // the lines still share one look (its id moved with the settings), so the count stays
  assert.deepEqual(lookMembers(d.lyrics, 'a'), ['a', 'b']);
  assert.equal(lookFxState(d, 'b').count, 2);
  assert.equal(lookFxState(d, 'c').count, 1);
  // a shared-style line has no look of its own: nothing to set
  assert.equal(setLookFx(d, 's', 'shake', 0.5), 0);
  assert.equal(lookFxState(d, 's'), null);
});

test('precedence: shared lyricStyle.fx, then the look’s style.fx, then the line’s own line.fx', () => {
  const d = proj([ln('a', { size: 5 }, { fx: { shakeSpeed: 3 } }), ln('b', { size: 5 })], { shake: 0.2, shakeSpeed: 2, glitchAmt: 2 });
  setLookFx(d, 'a', 'shake', 0.6);
  setLookFx(d, 'a', 'shakeSpeed', 1.5);
  assert.deepEqual([fxOf(d, 'a').shake, fxOf(d, 'a').shakeSpeed, fxOf(d, 'a').glitchAmt], [0.6, 3, 2]);
  assert.deepEqual([fxOf(d, 'b').shake, fxOf(d, 'b').shakeSpeed, fxOf(d, 'b').glitchAmt], [0.6, 1.5, 2]);
  assert.deepEqual(lookFxOf(d.lyricStyle, L(d, 'a').style), { shake: 0.6, shakeSpeed: 1.5, glitchAmt: 2 });
  // back at the shared setting, a plain look drops it again
  setLookFx(d, 'a', 'shake', 0.2);
  assert.deepEqual(L(d, 'a').style.fx, { shakeSpeed: 1.5 });
  setLookFx(d, 'a', 'shakeSpeed', 2);
  assert.equal(L(d, 'a').style.fx, undefined);
  assert.deepEqual(L(d, 'a').style, { size: 5 }, 'and the look is exactly what it was');
});

test('Reset to default drops a plain look’s settings; a theme look goes back to the theme’s', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  setLookFx(d, 'a', 'shake', 0.4);
  assert.equal(lookFxState(d, 'a').canReset, true);
  assert.equal(lookFxState(d, 'a').theme, null);
  assert.equal(resetLookFx(d, 'a'), 2);
  assert.deepEqual(d.lyrics.map((l) => l.style), [{ size: 5 }, { size: 5 }]);
  assert.equal(lookFxState(d, 'a').canReset, false);

  const t = proj([ln('a', { size: 5 }), ln('b', { size: 5 }), ln('c', { size: 7 })]);
  applyTheme(t, 'a', blood);
  const c = structuredClone(L(t, 'c'));
  let st = lookFxState(t, 'a');
  assert.equal(st.theme.id, 'bloodash');
  assert.equal(st.edited, false);
  assert.equal(st.canReset, false);
  setLookFx(t, 'a', 'shake', 0.9);
  st = lookFxState(t, 'b');
  assert.equal(st.edited, true);
  assert.equal(st.canReset, true);
  assert.equal(st.count, 2);
  assert.equal(themeState(t.lyricStyle, { ...L(t, 'b'), fx: undefined }).edited, true, 'the legend’s card shows edited');
  // a theme look keeps a setting written out even when it equals the shared one (the shared ones never reach it)
  setLookFx(t, 'a', 'shakeSpeed', 1);
  assert.equal(L(t, 'a').style.fx.shakeSpeed, 1);
  assert.equal(resetLookFx(t, 'a'), 2);
  assert.deepEqual(L(t, 'a').style.fx, blood.fx);
  assert.deepEqual(L(t, 'b').style.fx, blood.fx);
  assert.equal(lookFxState(t, 'a').edited, false);
  assert.deepEqual(L(t, 'c'), c);
});

test('edited mark: a setting the theme leaves at its default but the look changes counts as edited', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  applyTheme(d, 'a', blood);
  assert.ok(!('div' in blood.fx));
  setLookFx(d, 'a', 'div', 2);
  assert.equal(lookFxState(d, 'a').edited, true);
  setLookFx(d, 'a', 'div', 1);
  assert.equal(lookFxState(d, 'a').edited, false, 'back at the default it is the theme again');
  // a line’s own setting does not mark the look (only that line, in its own block)
  L(d, 'a').fx = { shake: 0.9 };
  assert.equal(lookFxState(d, 'b').edited, false);
  assert.equal(themeState(d.lyricStyle, L(d, 'a')).edited, true);
});

test('"Only this line" still splits a line off; its look settings then stay on it', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 }), ln('c', { size: 5 })]);
  splitLine(d, 'b');
  assert.equal(setLookFx(d, 'b', 'shake', 0.7), 1);
  assert.equal(fxOf(d, 'b').shake, 0.7);
  assert.equal(fxOf(d, 'a').shake, undefined);
  assert.equal(lookFxState(d, 'a').count, 2);
  assert.equal(lookFxState(d, 'b').count, 1);
  // a slider drag keeps the lines it started with (ids), even if another line's look matches mid-drag
  assert.equal(setLookFx(d, 'a', 'shake', 0.3, { ids: ['a'] }), 1);
  assert.equal(fxOf(d, 'c').shake, undefined);
});

test('lines without look effect settings draw with the very same style object as before', () => {
  const d = proj([ln('a', { preset: 'scream' }), ln('s'), ln('f', null, { fx: { shake: 0.3 } })], { shake: 0.1 });
  const before = d.lyrics.map((l) => JSON.stringify(lineStyle(d.lyricStyle, l, d.theme)));
  setLookFx(d, 'a', 'shake', 0.1); // equal to the shared one: nothing written
  assert.deepEqual(L(d, 'a').style, { preset: 'scream' });
  assert.equal(lookId(L(d, 'a')), 'p:scream');
  assert.deepEqual(d.lyrics.map((l) => JSON.stringify(lineStyle(d.lyricStyle, l, d.theme))), before);
  assert.equal(lineStyle(d.lyricStyle, L(d, 's'), d.theme), d.lyricStyle);
});

test('a preset look with its own effect settings keeps its timeline colour', () => {
  const d = proj([ln('a', { preset: 'scream' }), ln('b', { preset: 'scream' })]);
  setLookFx(d, 'a', 'shake', 0.5);
  assert.notEqual(lookId(L(d, 'a')), 'p:scream');
  assert.equal(d.lookColors[lookId(L(d, 'a'))], '#ff4d6d');
  resetLookFx(d, 'a');
  assert.equal(lookId(L(d, 'a')), 'p:scream');
  assert.deepEqual(d.lookColors, {});
});
