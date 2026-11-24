import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TAB_THEMES, TAB_THEME_LIST, tabThemeFields, applyTabTheme, applyGpThemeEverywhere, tabThemeForGame } from '../js/gpthemes.js';
import { TAB_CHROME } from '../js/tabviz.js';
import { GAME_THEMES } from '../js/rhythmgame.js';
import { defaultTabLayer, parseTabBytes, buildTabTimeline, drawTab } from '../js/tab.js';
import { newProject } from '../js/state.js';
import { applyTheme } from '../js/themes.js';

const HEX = /^#[\da-f]{6}$/i;
const band = () => parseTabBytes(readFileSync(new URL('./fixtures/spark-band.gp', import.meta.url)));

// A canvas that records every colour it is given (fill, stroke, shadow and gradient stops).
function recorder(W = 360, H = 220) {
  const colours = [];
  const grad = { addColorStop: (_o, c) => colours.push(c) };
  const target = { canvas: { width: W, height: H }, getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }), measureText: (t) => ({ width: String(t).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, filter: 'none' };
  const ctx = new Proxy(target, {
    get: (o, k) => (k in o ? o[k] : () => {}),
    set: (o, k, v) => {
      if (['fillStyle', 'strokeStyle', 'shadowColor'].includes(k)) colours.push(v);
      o[k] = v;
      return true;
    },
  });
  return { ctx, colours };
}
globalThis.document = globalThis.document || { createElement: () => ({ width: 1, height: 1, getContext: () => recorder().ctx }) };

test('every tab theme is complete: colours for each part, seven strings, a matching game theme', () => {
  assert.ok(TAB_THEME_LIST.length >= 8);
  assert.ok(['original', 'bloodsteel', 'blackout', 'neon', 'clean', 'rosewood'].every((id) => TAB_THEMES[id]));
  for (const [id, t] of Object.entries(TAB_THEMES)) {
    for (const k of ['bg', 'lineColor', 'numColor', 'hiColor']) assert.match(t[k], HEX, `${id}.${k}`);
    assert.ok(GAME_THEMES[t.game], `${id} game theme ${t.game}`);
    if (id === 'original') continue;
    assert.equal(t.strings.length, 7, id);
    t.strings.forEach((c) => assert.match(c, HEX, id));
    for (const k of [...Object.keys(TAB_CHROME), 'gemInk', 'strIdle']) assert.match(t.chrome[k], HEX, `${id}.chrome.${k}`);
  }
});

test('picking a theme writes it into the layer; Original goes back to the first look', () => {
  const L = { ...defaultTabLayer(), id: 't', type: 'tab', numColor: '#123456' };
  applyTabTheme(L, 'bloodsteel');
  assert.equal(L.tabTheme, 'bloodsteel');
  assert.equal(L.hiColor, TAB_THEMES.bloodsteel.hiColor);
  assert.equal(L.numColor, TAB_THEMES.bloodsteel.numColor);
  assert.deepEqual(L.stringColors, TAB_THEMES.bloodsteel.strings);
  assert.notEqual(L.stringColors, TAB_THEMES.bloodsteel.strings, 'a copy, so editing one string leaves the theme alone');
  assert.equal(L.chrome.ink, TAB_THEMES.bloodsteel.chrome.ink);
  assert.equal(L.bgOpacity, 0.55, 'opacity and placement stay');
  applyTabTheme(L, 'original');
  const d = defaultTabLayer();
  assert.deepEqual([L.bg, L.lineColor, L.numColor, L.hiColor], [d.bg, d.lineColor, d.numColor, d.hiColor]);
  assert.ok(!('stringColors' in L) && !('chrome' in L));
  assert.equal(applyTabTheme({ type: 'drums' }, 'neon').tabTheme, undefined, 'only tab layers');
  assert.equal(tabThemeFields('nope'), null);
});

test('use on every Guitar Pro layer: tabs and guitar/bass highways, not the drum highway', () => {
  const d = { layers: [{ type: 'tab' }, { type: 'game', instrument: 'guitar', gameTheme: 'classic', followTheme: true }, { type: 'game', instrument: 'drums', gameTheme: 'arcade' }, { type: 'drums' }] };
  assert.equal(applyGpThemeEverywhere(d, 'bloodsteel'), 2);
  assert.equal(d.layers[0].tabTheme, 'bloodsteel');
  assert.equal(d.layers[1].gameTheme, 'bloodsteel');
  assert.equal(d.layers[1].followTheme, false);
  assert.equal(d.layers[2].gameTheme, 'arcade');
  assert.equal(tabThemeForGame('bloodsteel'), 'bloodsteel');
  assert.equal(tabThemeForGame('ice'), 'frostbite');
  assert.equal(tabThemeForGame('arcade'), 'original');
});

test('the project theme marks its tab colours, so the picker can say where they came from', () => {
  const p = newProject();
  p.layers = [{ ...defaultTabLayer(), id: 't', type: 'tab', name: 'Guitar' }];
  applyTheme(p, 'bloodash');
  assert.equal(p.layers[0].tabTheme, 'project');
});

test('a theme reaches every part of every style; an old save draws as before', async () => {
  const tl = buildTabTimeline(await band(), 0);
  const at = tl.events[4].time + 0.05;
  for (const style of ['tab', 'highway', 'neck', 'strings']) {
    const base = { ...defaultTabLayer(), type: 'tab', style, x: 50, y: 50, width: 100, height: 100 };
    const old = recorder();
    drawTab(old.ctx, 360, 220, base, tl, 1, at, Infinity);
    const themed = recorder();
    drawTab(themed.ctx, 360, 220, applyTabTheme({ ...base }, 'bloodsteel'), tl, 1, at, Infinity);
    const T = TAB_THEMES.bloodsteel;
    const used = themed.colours.join(' ');
    // no plain white left over in the themed drawing, and its own colours are used
    assert.ok(!/rgba\(255,255,255|#ffffff/i.test(used), `${style}: white left: ${used.match(/rgba\(255,255,255[^)]*\)|#ffffff/i)}`);
    if (style === 'tab') {
      assert.ok(used.includes(T.hiColor) && used.includes('rgba(191,179,179'), style); // highlight, strings
    } else {
      assert.ok(used.includes('rgba(244,233,233') || used.includes(T.chrome.ink), `${style}: ink`);
      assert.ok(T.strings.slice(0, 6).some((c) => used.includes(c)), `${style}: strings`);
    }
    if (style === 'neck') assert.ok([T.chrome.wood0, T.chrome.fret, T.chrome.nut].every((c) => used.includes(c)), 'neck wood, frets and nut');
    // the original look still uses its white labels
    if (style !== 'tab') assert.ok(/rgba\(255,255,255|#ffffff/i.test(old.colours.join(' ')), `${style}: original white`);
  }
});

test('new rhythm game themes: Blood & steel and Blackout', () => {
  for (const id of ['bloodsteel', 'blackout']) {
    const t = GAME_THEMES[id];
    assert.equal(t.lanes.length, 5);
    assert.equal(t.pads.length, 4);
    assert.equal(t.board.length, 2);
  }
});

test('the theme is kept by project files and saved templates', async () => {
  const { makeProjectFile, parseProjectFile } = await import('../js/projectfile.js');
  const { templateFromProject, templateFile, parseTemplateFile, applyMyTemplate } = await import('../js/mytemplates.js');
  const p = newProject();
  p.layers = [applyTabTheme({ ...defaultTabLayer(), id: 't', type: 'tab', name: 'Guitar' }, 'neon')];
  p.layers[0].stringColors[0] = '#010203'; // your own change on top of the theme
  const back = parseProjectFile(makeProjectFile(p)).project.layers[0];
  assert.equal(back.tabTheme, 'neon');
  assert.equal(back.stringColors[0], '#010203');
  assert.equal(back.chrome.ink, TAB_THEMES.neon.chrome.ink);
  const t = parseTemplateFile(templateFile(templateFromProject(p, 'Neon tab')));
  const d = newProject();
  d.layers = [{ ...defaultTabLayer(), id: 'mine', type: 'tab', name: 'Guitar', mediaId: 'm1' }]; // your layer with its file
  applyMyTemplate(d, t);
  const L = d.layers.find((x) => x.type === 'tab');
  assert.equal(L && L.tabTheme, 'neon');
  assert.equal(L.mediaId, 'm1');
});
