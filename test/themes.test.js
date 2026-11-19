import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newText } from '../js/state.js';
import { THEMES, applyTheme, themeColors, stringRamp, drumColors, themeLayer, mix } from '../js/themes.js';
import { applyTemplate } from '../js/templates.js';
import { LINE_PRESETS, lineStyle, presetFields, hasLineStyle } from '../js/linestyle.js';
import { vuValue, peakHold, REAL_STYLES, REAL_PLACEMENT } from '../js/vizreal.js';
import { VIZ_STYLES, defaultVizLayer } from '../js/viz.js';
import { defaultTabLayer } from '../js/tab.js';
import { defaultDrumLayer } from '../js/drums.js';
import { TRANSITIONS, TEXT_ANIMATIONS, END_ANIMATIONS } from '../js/renderer.js';
import { SCENES } from '../js/backgrounds.js';
import { FILTERS } from '../js/carousel.js';
import { FONTS } from '../js/state.js';

function project() {
  const p = newProject();
  p.clips = [{ id: 'a', mediaId: 'm', kind: 'video', in: 0, duration: 3, speed: 1, transition: { type: 'none' } }, { id: 'b', mediaId: 'm', kind: 'video', in: 0, duration: 3, speed: 1, transition: { type: 'none' }, bgRemove: { enabled: true, mode: 'person' } }];
  p.texts = [newText(0)];
  p.layers = [
    { ...defaultTabLayer(), id: 't', type: 'tab', name: 'Guitar' },
    { ...defaultDrumLayer(), id: 'd', type: 'drums', name: 'Drums' },
    { ...defaultVizLayer(), id: 'v', type: 'viz', name: 'Viz' },
  ];
  p.carousel = { slides: [{ layout: 'cover', filter: 'none' }, { layout: 'full', filter: 'none' }] };
  return p;
}

test('six dark themes, each only using things the app has', () => {
  assert.deepEqual(THEMES.map((t) => t.id), ['bloodash', 'doom', 'frost', 'hellfire', 'toxic', 'ruststeel']);
  const tr = new Set(TRANSITIONS.map((x) => x[0]));
  const an = new Set(TEXT_ANIMATIONS.map((x) => x[0]));
  const en = new Set(END_ANIMATIONS.map((x) => x[0]));
  for (const t of THEMES) {
    for (const k of ['bg', 'deep', 'accent', 'light']) assert.match(t.colors[k], /^#[\da-f]{6}$/i, `${t.id} ${k}`);
    assert.ok(FONTS.some((f) => f.id === t.font), `${t.id} font`);
    assert.ok(t.transitions.every((x) => tr.has(x)), `${t.id} transitions`);
    assert.ok(an.has(t.animation) && en.has(t.endCard.animation), `${t.id} animations`);
    assert.ok(SCENES.some((s) => s[0] === t.backdrop), `${t.id} backdrop`);
    assert.ok(FILTERS.some((f) => f.id === t.carousel), `${t.id} carousel look`);
    assert.equal(t.wood.length, 3);
  }
  assert.equal(THEMES[0].colors.accent, '#e0182d', 'Blood & Ash is red and black');
});

test('applying a theme restyles everything and keeps your content', () => {
  const p = project();
  const before = { clips: p.clips.map((c) => c.id), lyrics: p.lyrics, texts: p.texts.map((t) => t.text), dur: p.duration };
  applyTheme(p, 'bloodash');
  const c = THEMES[0].colors;
  assert.deepEqual(p.theme, { id: 'bloodash', colors: c, custom: false });
  assert.equal(p.lyricStyle.font, 'Bebas Neue');
  assert.equal(p.lyricStyle.highlight, c.accent);
  assert.equal(p.texts[0].boxColor, c.accent);
  assert.ok(p.clips.every((x) => x.grade.preset === 'custom' && x.grade.saturation === 0.12));
  assert.deepEqual(p.clips[1].bgRemove.background, { kind: 'scene', scene: 'smoke', color: c.accent, color2: c.deep });
  assert.equal(p.endCard.accent, c.accent);
  assert.equal(p.endCard.bgColor, c.bg);
  assert.equal(p.look.grain, 0.4);
  const [tab, drums, viz] = p.layers;
  assert.equal(tab.hiColor, c.accent);
  assert.equal(tab.stringColors.length, 7);
  assert.equal(tab.chrome.bg0, c.bg);
  assert.equal(drums.colors.kick, c.accent);
  assert.equal(drums.chrome.glow, c.accent);
  assert.deepEqual([viz.color, viz.color2, viz.classic], [c.accent, c.light, false]);
  assert.equal(p.carousel.slides[0].filter, 'none', 'cover slide untouched');
  assert.equal(p.carousel.slides[1].filter, 'grit');
  // motion stays the template's unless asked
  assert.deepEqual(p.clips.map((x) => x.transition.type), ['none', 'none']);
  assert.deepEqual([p.clips.map((x) => x.id), p.lyrics, p.texts.map((t) => t.text), p.duration], [before.clips, before.lyrics, before.texts, before.dur]);
  applyTheme(p, 'bloodash', { motion: true });
  assert.deepEqual(p.clips.map((x) => x.transition.type), ['flash', 'shake']);
  assert.equal(p.lyricStyle.animation, 'pop');
});

test('your own colours, and templates keep the theme', () => {
  const p = project();
  applyTheme(p, 'bloodash', { colors: { accent: '#B00020', light: 'nope' } });
  assert.equal(p.theme.colors.accent, '#b00020');
  assert.equal(p.theme.colors.light, THEMES[0].colors.light, 'bad values ignored');
  assert.equal(p.theme.custom, true);
  assert.equal(p.layers[1].colors.kick, '#b00020');
  applyTemplate(p, 'cinematic');
  assert.equal(p.lyricStyle.font, 'Bebas Neue', 'theme font survives the template');
  assert.equal(p.lyricStyle.highlight, '#b00020');
  assert.equal(p.template, 'cinematic');
  assert.ok(p.clips.every((x) => x.grade.preset === 'custom'));
  assert.equal(p.look.letterbox, 0.55, 'the template’s cinema bars stay');
});

test('theme helpers', () => {
  const c = THEMES[0].colors;
  const r = stringRamp(c, 6);
  assert.equal(r[0], c.accent);
  assert.equal(new Set(r).size, 6);
  assert.equal(Object.keys(drumColors(c)).length, 11); // every lane, plus the old shared 'tom'
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.deepEqual(themeColors(THEMES[1], { bg: '#123456' }).bg, '#123456');
  const v = themeLayer({ type: 'viz' }, THEMES[3], THEMES[3].colors);
  assert.equal(v.color, THEMES[3].colors.accent);
});

test('per-line lyric styles: presets follow the theme, own changes win', () => {
  const p = project();
  const base = p.lyricStyle;
  const line = { id: 'l', text: 'BURN IT DOWN', start: 0, end: 1 };
  assert.equal(lineStyle(base, line, null), base, 'no style: the shared one');
  assert.equal(hasLineStyle(line), false);
  line.style = { preset: 'scream' };
  const plain = lineStyle(base, line, null);
  assert.equal(plain.color, base.highlight, 'without a theme the accent is the shared highlight');
  assert.ok(plain.size > base.size);
  applyTheme(p, 'bloodash');
  const themed = lineStyle(p.lyricStyle, line, p.theme);
  assert.equal(themed.color, THEMES[0].colors.accent);
  assert.equal(themed.animation, 'glitch');
  line.style.color = '#00ff00';
  assert.equal(lineStyle(p.lyricStyle, line, p.theme).color, '#00ff00', 'your change beats the preset');
  const an = new Set(TEXT_ANIMATIONS.map((x) => x[0]));
  for (const [id] of LINE_PRESETS) {
    const f = presetFields(id, base, THEMES[0].colors);
    assert.ok(an.has(f.animation) && FONTS.some((x) => x.id === f.font), id);
  }
});

test('realistic visualizers: registered, placed, and meter maths', () => {
  const ids = VIZ_STYLES.map((s) => s[0]);
  for (const [id] of REAL_STYLES) {
    assert.ok(ids.includes(id), id);
    assert.ok(REAL_PLACEMENT[id], id);
  }
  assert.equal(defaultVizLayer().classic, true);
  // VU: 300 ms integration rises within a few frames and falls back smoothly
  const lv = new Float32Array(60);
  for (let i = 10; i < 20; i++) lv[i] = 1;
  const v = (f) => vuValue(lv, 30, f);
  assert.equal(v(5), 0);
  assert.ok(v(12) > 0.3 && v(19) > 0.95);
  assert.ok(v(22) < v(19) && v(22) > 0.2, 'falls back, not instantly');
  assert.equal(v(40), 0);
  // peak hold: holds, then falls
  const vals = (i) => (i === 10 ? 0.9 : 0.1);
  assert.equal(peakHold(vals, 30, 10), 0.9);
  assert.ok(Math.abs(peakHold(vals, 30, 15) - 0.9) < 1e-9, 'held');
  assert.ok(peakHold(vals, 30, 30) < 0.9 && peakHold(vals, 30, 30) > 0.1, 'falling');
});
