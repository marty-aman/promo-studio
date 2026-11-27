import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_THEMES, themeById, themeState, motionLabel } from '../js/lookthemes.js';
import { applyTheme, applySharedTheme, splitLine, changeLook, lookMembers } from '../js/lookapply.js';
import { lookId, looksById } from '../js/lookcolors.js';
import { lineStyle } from '../js/linestyle.js';
import { FX_FIELDS, cleanLyricFx } from '../js/lyricfx.js';
import { setFx } from '../js/panel-lyricfx.js';
import { newProject, normalizeProject } from '../js/state.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';

const ln = (id, style, fx) => ({ id, text: id, start: 0, end: 1, ...(style ? { style } : {}), ...(fx ? { fx } : {}) });
const proj = (lines) => ({ ...newProject(), lyrics: structuredClone(lines) });
const fxOf = (d, id) => lineStyle(d.lyricStyle, d.lyrics.find((l) => l.id === id), d.theme).fx || {};
const L = (d, id) => d.lyrics.find((l) => l.id === id);
const blood = themeById('bloodash');
const hell = themeById('hellfire');

test('every theme carries effect settings in range, never a tempo; metal shakes, clean is still, neon flickers', () => {
  for (const t of LOOK_THEMES) {
    assert.ok(t.fx, t.id);
    assert.ok(!('tempo' in t.fx) && !('bpm' in t.fx), `${t.id} bakes no tempo`);
    for (const [k, v] of Object.entries(t.fx)) {
      if (!(k in FX_FIELDS)) continue;
      const [, min, max] = FX_FIELDS[k];
      assert.ok(v >= min && v <= max, `${t.id}.${k}`);
    }
    assert.equal(typeof t.fx.shake, 'number', `${t.id} sets the shake`);
    assert.ok(motionLabel(t), t.id);
  }
  for (const id of ['bloodash', 'blackmass', 'hellfire', 'ruststeel']) assert.ok(themeById(id).fx.shake >= 0.2 && themeById(id).fx.shakeBeat, id);
  for (const id of ['cleanwhite', 'cleanbox']) assert.equal(themeById(id).fx.shake, 0, id);
  for (const id of ['neonpink', 'neoncyan']) assert.ok(themeById(id).fx.neonHum > 1 && themeById(id).fx.neonFlicker > 1, id);
  assert.ok(hell.fx.pulse > 1 && hell.fx.div === 1);
  assert.equal(motionLabel(themeById('cleanbox')), 'Still');
});

test('theme -> effect settings merge: the look\'s fx sits over the shared fx and under a line\'s own', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  d.lyricStyle.fx = { shake: 0.9, glitchAmt: 3, tunnelSpeed: 2 };
  applyTheme(d, 'a', blood);
  const fx = fxOf(d, 'a');
  assert.equal(fx.shake, blood.fx.shake, 'the theme wins over the shared shake');
  assert.equal(fx.glitchAmt, blood.fx.glitchAmt);
  assert.equal(fx.tunnelSpeed, 2, 'settings the theme does not set still come from the shared style');
  assert.equal(fx.shakeBeat, true);
  // a line's own setting is on top
  setFx(L(d, 'b'), 'shake', 0.6, { ...d.lyricStyle.fx, ...L(d, 'b').style.fx });
  assert.equal(fxOf(d, 'b').shake, 0.6);
  assert.equal(fxOf(d, 'a').shake, blood.fx.shake, 'and only on that line');
  assert.equal(lookId(L(d, 'a')), lookId(L(d, 'b')), 'a line override does not split the look');
});

test('apply-to-all: every line with the look takes the theme effects, a line with another look and the shared style do not', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 }), ln('c', { size: 6 }), ln('s')]);
  const c0 = structuredClone(L(d, 'c'));
  const shared0 = structuredClone(d.lyricStyle);
  assert.equal(applyTheme(d, 'a', hell), 2);
  assert.deepEqual(L(d, 'a').style.fx, hell.fx);
  assert.deepEqual(L(d, 'b').style.fx, hell.fx);
  assert.deepEqual(L(d, 'c'), c0);
  assert.deepEqual(d.lyricStyle, shared0);
  assert.equal(d.lyricStyle.tempo, undefined, 'no tempo set');
  assert.deepEqual(lookMembers(d.lyrics, 'a'), ['a', 'b']);
  // another theme replaces the look's effects (the old ones do not linger)
  applyTheme(d, 'a', themeById('cleanbox'));
  assert.equal(L(d, 'a').style.fx.pulse, undefined);
  assert.equal(L(d, 'a').style.fx.shake, 0);
  // a preset takes the line off the theme and its effects
  changeLook(d, 'a', () => ({ preset: 'scream' }));
  assert.equal(L(d, 'a').style.fx, undefined);
});

test('a theme on the shared style sets lyricStyle.fx; lines with their own look keep moving exactly as before', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5, color: '#ff0000' }), ln('s'), ln('t', null, { shake: 0.4, tunnelSpeed: 2 })]);
  d.lyricStyle.fx = { glitchAmt: 2 };
  d.lyricStyle.tempo = { bpm: 140 };
  const before = { a: fxOf(d, 'a'), b: fxOf(d, 'b') };
  assert.equal(applyTheme(d, 's', blood), 2);
  assert.deepEqual(d.lyricStyle.fx, blood.fx);
  assert.deepEqual(d.lyricStyle.tempo, { bpm: 140 }, 'the pulse tempo stays');
  const def = (k) => (k in FX_FIELDS ? FX_FIELDS[k][0] : k === 'shakeDir' ? 'both' : false);
  for (const id of ['a', 'b']) {
    const now = fxOf(d, id);
    for (const k of new Set([...Object.keys(before[id]), ...Object.keys(now)])) assert.equal(now[k] ?? def(k), before[id][k] ?? def(k), `${id}.${k}`);
  }
  assert.deepEqual(L(d, 't').fx, { tunnelSpeed: 2 }, 'a shared line\'s own shake gives way to the theme, its other settings stay');
  assert.equal(themeState(d.lyricStyle).theme.id, 'bloodash');
  assert.equal(themeState(d.lyricStyle).edited, false);
});

test('Only this line: a split line keeps its effects, and a theme on it reaches only it', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  applyTheme(d, 'a', blood);
  const fa = fxOf(d, 'a');
  splitLine(d, 'b');
  assert.deepEqual(fxOf(d, 'b'), fa);
  assert.notEqual(lookId(L(d, 'a')), lookId(L(d, 'b')));
  applyTheme(d, 'b', themeById('neonpink'));
  assert.deepEqual(fxOf(d, 'a'), fa);
  assert.equal(fxOf(d, 'b').neonHum, themeById('neonpink').fx.neonHum);
  // applying only to one line
  const e = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  applyTheme(e, 'a', hell, { only: true });
  assert.deepEqual(L(e, 'a').style.fx, hell.fx);
  assert.equal(L(e, 'b').style.fx, undefined);
});

test('override precedence and Reset: a line edit after the theme stays and marks the theme edited; Reset returns to the theme', () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  applyTheme(d, 'a', blood);
  assert.deepEqual(themeState(d.lyricStyle, L(d, 'a')), { theme: blood, edited: false });
  setFx(L(d, 'a'), 'shake', 0.8, { ...(d.lyricStyle.fx || {}), ...L(d, 'a').style.fx });
  assert.equal(fxOf(d, 'a').shake, 0.8);
  assert.deepEqual(themeState(d.lyricStyle, L(d, 'a')), { theme: blood, edited: true });
  assert.equal(themeState(d.lyricStyle, L(d, 'b')).edited, false, 'the other line still matches');
  // setting it back to the look's value removes the override
  setFx(L(d, 'a'), 'shake', blood.fx.shake, { ...(d.lyricStyle.fx || {}), ...L(d, 'a').style.fx });
  assert.equal(L(d, 'a').fx, undefined);
  // Reset ("Use the look's effect settings") drops line.fx
  setFx(L(d, 'a'), 'shakeSpeed', 3, { ...(d.lyricStyle.fx || {}), ...L(d, 'a').style.fx });
  delete L(d, 'a').fx;
  assert.deepEqual(fxOf(d, 'a'), fxOf(d, 'b'));
  // picking the theme again drops the line's own settings the theme sets
  setFx(L(d, 'a'), 'shake', 0.1, { ...(d.lyricStyle.fx || {}), ...L(d, 'a').style.fx });
  L(d, 'a').fx.tunnelSpeed = 2;
  applyTheme(d, 'a', blood);
  assert.deepEqual(L(d, 'a').fx, { tunnelSpeed: 2 });
  assert.equal(themeState(d.lyricStyle, L(d, 'a')).edited, false);
  // shared style edited after the theme
  const s = proj([ln('s')]);
  applySharedTheme(s, hell);
  s.lyricStyle.fx = { ...s.lyricStyle.fx, pulse: 0.5 };
  assert.equal(themeState(s.lyricStyle).edited, true);
});

test('no theme: old lines and looks keep their look ids and draw exactly as before', () => {
  const lines = [ln('a', { size: 5 }), ln('b', { preset: 'scream' }), ln('s'), ln('f', null, { shake: 0.3 }), ln('g', { size: 5, lookKey: 'k' }, { glitchAmt: 2 })];
  const d = proj(lines);
  d.lyricStyle.fx = { shake: 0.2 };
  for (const l of lines) {
    const s = lineStyle(d.lyricStyle, l, d.theme);
    if (!l.style && !l.fx) assert.equal(s, d.lyricStyle);
    else assert.deepEqual(s.fx, l.fx ? { ...d.lyricStyle.fx, ...l.fx } : d.lyricStyle.fx);
  }
  // the look ids of #103 (no fx) are unchanged: a known id from mainline
  assert.equal(lookId(ln('x', { preset: 'scream' })), 'p:scream');
  const ids = d.lyrics.map(lookId);
  assert.deepEqual(normalizeProject(structuredClone(d)).lyrics.map(lookId), ids);
});

test('look effects survive save, project files and junk is cleaned on load', async () => {
  const d = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  applyTheme(d, 'a', themeById('funeral'));
  const n = normalizeProject(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(L(n, 'a').style.fx, themeById('funeral').fx);
  assert.equal(L(n, 'a').style.fx.shakeBeat, false, 'explicit defaults kept on a look');
  assert.equal(lookId(L(n, 'a')), lookId(L(d, 'a')));
  const back = await parseProjectFile(await makeProjectFile(d));
  const p2 = back.project || back;
  assert.deepEqual(L(p2, 'b').style.fx, themeById('funeral').fx);
  const c = cleanLyricFx({}, [ln('j', { size: 5, fx: { shake: 99, nope: 1, shakeDir: 'zz' } }), ln('k', { size: 5, fx: 'junk' })]);
  assert.deepEqual(c.lyrics[0].style.fx, { shake: 1 });
  assert.deepEqual(c.lyrics[1].style, { size: 5 });
  // timeline colour stays with the look across save
  assert.equal(looksById(n.lyrics, n.lookColors).byLine.get('a').color, looksById(d.lyrics, d.lookColors).byLine.get('a').color);
});
