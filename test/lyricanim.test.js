import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRANCE_IDS, flashLevel, wipeRect, trackState, graphemes, echoPass, sidePlacement,
  emphStale, emphIndexes, toggleEmph, emphOf, cleanEmph, slamScale, cleanLyricAnimations, EMPH_SIZE,
} from '../js/lyricanim.js';
import { TEXT_ANIMATIONS, renderFrame } from '../js/renderer.js';
import { cleanFx, fxGroups, fxv, FX_FIELDS, GROUP_FIELDS, GROUP_LABEL } from '../js/lyricfx.js';
import { LINE_FIELDS, lineStyle } from '../js/linestyle.js';
import { lookId } from '../js/lookcolors.js';
import { LOOK_THEMES, motionLabel, themeById, themeOf } from '../js/lookthemes.js';
import { applyTheme, withTheme } from '../js/lookapply.js';
import { newProject, normalizeProject } from '../js/state.js';
import { gridFromBpm } from '../js/tempo.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('the entrance ids the cleaner knows are exactly the renderer’s list', () => {
  assert.deepEqual([...ENTRANCE_IDS].sort(), TEXT_ANIMATIONS.map(([v]) => v).sort());
  assert.ok(TEXT_ANIMATIONS.some(([v]) => v === 'wipe'));
  assert.ok(TEXT_ANIMATIONS.some(([v]) => v === 'tracking'));
});

// ---- flash hit

test('flash hit: 3 frames at the line start, on every beat, or on the pulse; never for a beat before the line', () => {
  assert.equal(flashLevel('', { life: 0 }), 0);
  assert.equal(flashLevel('line', { life: 0, amt: 0.7 }), 0.7);
  assert.equal(flashLevel('line', { life: 2.9 / 30 }), 1);
  assert.equal(flashLevel('line', { life: 3.01 / 30 }), 0);
  const e = (dt, decay = 9) => Math.exp(-dt * decay);
  assert.equal(flashLevel('beat', { life: 1, beatE: e(0) }), 1);
  assert.equal(flashLevel('beat', { life: 1, beatE: e(0.09) }), 1);
  assert.equal(flashLevel('beat', { life: 1, beatE: e(0.11) }), 0);
  assert.equal(flashLevel('beat', { life: 1, beatE: 0 }), 0);
  // the beat landed 0.05 s before the line started
  assert.equal(flashLevel('beat', { life: 0.02, beatE: e(0.07) }), 0);
  // pulse division with its own decay (Pulse length ×2 = decay 4.5)
  assert.equal(flashLevel('div', { life: 1, divE: e(0.05, 4.5), divDecay: 4.5 }), 1);
  assert.equal(flashLevel('div', { life: 1, divE: e(0.2, 4.5), divDecay: 4.5 }), 0);
  assert.equal(flashLevel('zzz', { life: 0 }), 0);
});

// ---- wipe, tracking, echo, side

test('wipe reveal uncovers from the chosen side and is gone once done', () => {
  const box = { x: -50, y: -10, w: 100, h: 20 };
  assert.deepEqual(wipeRect(0, 0.25, box), { x: -50, y: -10, w: 25, h: 20 });
  assert.deepEqual(wipeRect(1, 0.25, box), { x: 25, y: -10, w: 25, h: 20 });
  assert.deepEqual(wipeRect(2, 0.5, box), { x: -50, y: -10, w: 100, h: 10 });
  assert.deepEqual(wipeRect(3, 0.5, box), { x: -25, y: -10, w: 50, h: 20 });
  assert.equal(wipeRect(0, 1, box), null);
  assert.equal(wipeRect(0, -1, box).w, 0);
});

test('tracking: wide to tight settles at normal spacing; tight to wide opens up over the line', () => {
  const a = trackState(0, 1, 0, 3, 100);
  close(a.sp, 50);
  assert.equal(a.alpha, 0);
  assert.equal(trackState(0, 1, 1.4, 3, 100).sp, 0);
  assert.equal(trackState(0, 1, 2, 3, 100).alpha, 1);
  assert.equal(trackState(0, 0, 0, 3, 100).sp, 0);
  assert.equal(trackState(1, 1, 0, 2, 100).sp, 0);
  close(trackState(1, 1, 1, 2, 100).sp, 15);
  close(trackState(1, 1, 2, 2, 100).sp, 30);
  assert.deepEqual(graphemes('héllo'), ['h', 'é', 'l', 'l', 'o']);
  assert.equal(graphemes('👍🏽ok').length, 3);
});

test('ghost echo: a bigger copy behind, or an offset trailing copy; strength 0 draws none', () => {
  const b = echoPass('behind', {}, 100);
  assert.equal(b.scale, 1.25);
  assert.equal(b.dx, 0);
  assert.equal(b.alpha, 0.25);
  const t = echoPass('trail', { dist: 2 }, 100);
  close(t.dx, 28);
  close(t.lag, 0.16);
  assert.equal(echoPass('trail', { amt: 0 }, 100), null);
  assert.equal(echoPass('', {}, 100), null);
});

test('duet side: left and right sit against their edge in a narrower box; centre leaves the line alone', () => {
  assert.equal(sidePlacement('center', 1000, 880), null);
  assert.equal(sidePlacement(undefined, 1000, 880), null);
  assert.deepEqual(sidePlacement('left', 1000, 880), { cx: 350, align: 'left', maxW: 600 });
  assert.deepEqual(sidePlacement('right', 1000, 400), { cx: 750, align: 'right', maxW: 400 });
  assert.equal(sidePlacement('right', 1000, 880, 420).cx, 420);
});

// ---- key words

test('key words: tap toggles, editing the words marks the pick out of date, a new tap starts again', () => {
  let line = { text: 'wait for the light' };
  line = { ...line, emph: toggleEmph(line, 3) };
  assert.deepEqual(line.emph.words, [{ i: 3, w: 'light' }]);
  line = { ...line, emph: toggleEmph(line, 0) };
  assert.deepEqual([...emphIndexes(line)], [0, 3]);
  assert.equal(toggleEmph({ ...line, emph: { words: [{ i: 0, w: 'wait' }] } }, 0), undefined);
  const edited = { ...line, text: 'wait for the night' };
  assert.equal(emphStale(edited), true);
  assert.equal(emphIndexes(edited), null);
  assert.deepEqual(toggleEmph(edited, 1).words, [{ i: 1, w: 'for' }]);
  // case and punctuation do not count as a change
  assert.equal(emphStale({ ...line, text: 'WAIT for the light!' }), false);
  const o = emphOf({ ...line, emph: { ...line.emph, slam: true } }, '#ff0000');
  assert.equal(o.size, EMPH_SIZE);
  assert.equal(o.color, '#ff0000');
  assert.equal(o.slam, true);
  assert.equal(emphOf({ text: 'x' }, '#fff'), null);
  assert.equal(slamScale(-0.1), 1);
  close(slamScale(0), 1.6);
  assert.equal(slamScale(0.2), 1);
});

test('key words are cleaned on load: bad entries, sizes and colours go', () => {
  assert.deepEqual(cleanEmph({ words: [{ i: 1, w: 'a' }, { i: -1, w: 'b' }, { i: 1.5, w: 'c' }, null, { i: 2 }], size: 9, color: 'red', slam: 'yes' }), { words: [{ i: 1, w: 'a' }], size: 2.5 });
  assert.equal(cleanEmph({ words: [] }), undefined);
  assert.equal(cleanEmph('x'), undefined);
  assert.deepEqual(cleanEmph({ words: [], color: '#112233', slam: true }), { words: [], color: '#112233', slam: true });
});

// ---- cleaner for unknown ids

test('unknown animation ids from a newer app open as a fade (entrance) and the quick fade (exit)', () => {
  const r = cleanLyricAnimations({
    lyricStyle: { animation: 'zzz', outAnimation: 'melt', hit: 'strobe', echo: 'x', side: 'up' },
    lyrics: [{ id: 'a', text: 'hi', style: { animation: 'letters', outAnimation: 'fade', hit: 'beat' } }, { id: 'b', text: 'ok' }],
    texts: [{ id: 't', animation: 'zzz', outAnimation: 'nope' }, { id: 'u', animation: 'pop' }],
  });
  assert.deepEqual(r.lyricStyle, { animation: 'fade', outAnimation: '' });
  assert.deepEqual(r.lyrics[0].style, { animation: 'fade', outAnimation: 'fade', hit: 'beat' });
  assert.equal(r.lyrics[0].text, 'hi');
  assert.equal(r.texts[0].animation, 'fade');
  assert.equal(r.texts[0].outAnimation, '');
  // known values pass through as the very same objects
  const ls = { animation: 'wipe', outAnimation: 'glitch', hit: 'div', echo: 'trail', side: 'left' };
  const lines = [{ id: 'b', text: 'ok', style: { animation: 'neon' } }];
  const r2 = cleanLyricAnimations({ lyricStyle: ls, lyrics: lines, texts: undefined });
  assert.equal(r2.lyricStyle, ls);
  assert.equal(r2.lyrics[0], lines[0]);
});

test('normalizeProject cleans unknown ids, keeps known ones, and old saves are unchanged', () => {
  const p = newProject();
  p.lyricStyle.animation = 'zzz';
  p.lyrics = [{ id: 'a', text: 'one two', start: 0, end: 2, style: { outAnimation: 'melt' }, emph: { words: [{ i: 1, w: 'two' }], size: 99 } }];
  p.texts = [{ id: 't', text: 'x', start: 0, end: 1, animation: 'hyper' }];
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(n.lyricStyle.animation, 'fade');
  assert.equal(n.lyrics[0].style.outAnimation, '');
  assert.deepEqual(n.lyrics[0].emph, { words: [{ i: 1, w: 'two' }], size: 2.5 });
  assert.equal(n.texts[0].animation, 'fade');
  const old = newProject();
  old.lyrics = [{ id: 'a', text: 'hey', start: 0, end: 2, style: { preset: 'scream' } }];
  const n2 = normalizeProject(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(n2.lyricStyle, normalizeProject(JSON.parse(JSON.stringify(old))).lyricStyle);
  assert.deepEqual(n2.lyrics, old.lyrics);
  assert.deepEqual(n2.texts, old.texts);
});

// ---- settings tables

test('new effect settings default to the designed look, stepped choices save as whole numbers', () => {
  for (const g of ['wipe', 'tracking', 'flash', 'echo']) {
    assert.ok(GROUP_LABEL[g], g);
    for (const k of GROUP_FIELDS[g]) assert.ok(FX_FIELDS[k], k);
  }
  assert.deepEqual(cleanFx({ wipeDir: 2.4, trackDir: 0.7, flashLook: 5, echoAmt: 9 }), { wipeDir: 2, trackDir: 1, flashLook: 1, echoAmt: 3 });
  assert.equal(fxv(undefined, 'wipeDir'), 0);
  assert.equal(FX_FIELDS.wipeDir[5](3), 'Centre out');
  assert.equal(FX_FIELDS.flashLook[5](1), 'Inverted');
});

test('the effect settings groups show for the new animations, the flash hit and the echo (line display only)', () => {
  assert.deepEqual(fxGroups({ display: 'line', animation: 'wipe' }), ['wipe', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'tracking' }), ['tracking', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'pop', hit: 'line', echo: 'trail' }), ['flash', 'echo', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'pop', hit: 'div' }), ['pulse', 'flash', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'beat', hit: 'div' }), ['pulse', 'flash', 'shake']);
  assert.deepEqual(fxGroups({ display: 'sheet', hit: 'line', echo: 'trail' }), ['shake']);
});

test('look themes keep their effect settings, ids and labels; the new per-line fields are look fields', () => {
  for (const t of LOOK_THEMES) for (const k of [...GROUP_FIELDS.flash, ...GROUP_FIELDS.echo, ...GROUP_FIELDS.wipe, ...GROUP_FIELDS.tracking]) assert.equal(t.fx && t.fx[k], undefined, `${t.id}.${k}`);
  for (const k of ['side', 'hit', 'echo']) assert.ok(LINE_FIELDS.includes(k), k);
  // a look saved before these fields keeps its id
  const st = { font: 'Impact', color: '#ffffff' };
  assert.equal(lookId({ style: st }), lookId({ style: { ...st } }));
  assert.notEqual(lookId({ style: { ...st, side: 'right' } }), lookId({ style: st }));
  assert.equal(lineStyle({ size: 9 }, { style: { side: 'left', hit: 'beat' } }).side, 'left');
  assert.equal(motionLabel({ fields: { animation: 'wipe' }, fx: {} }), 'Wipe');
  assert.equal(motionLabel({ fields: { animation: 'tracking', hit: 'beat' }, fx: {} }), 'Tracking · Flash hit');
});

// ---- the renderer draws them

function recorder(ls = true) {
  const log = [];
  const target = {
    canvas: { width: 108, height: 192 },
    measureText: (s) => ({ width: String(s).length * 5 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, d: 1 }),
    log,
  };
  if (ls) target.letterSpacing = '0px';
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...a) => log.push([k, ...a])),
    set: (t, k, v) => {
      log.push([`=${String(k)}`, v]);
      t[k] = v;
      return true;
    },
  });
}
const proj = (style = {}, line = {}) => {
  const p = newProject();
  p.duration = 10;
  p.endCard.enabled = false;
  p.lyrics = [{ id: 'a', text: 'wait for the light', start: 1, end: 4, ...line }];
  Object.assign(p.lyricStyle, { animation: 'fade', outline: '#000000', outlineWidth: 0, uppercase: false, ...style });
  return p;
};
const draw = (p, t, ls) => {
  const c = recorder(ls);
  renderFrame(c, 108, 192, p, t, { preview: false, sourceFor: () => null, image: () => null });
  return c.log;
};
const texts = (log) => log.filter(([k]) => k === 'fillText').map(([, s]) => s);
const fills = (log) => {
  // the fill colour each fillText was drawn with
  let fill = null;
  const out = [];
  for (const [k, v] of log) {
    if (k === '=fillStyle') fill = v;
    if (k === 'fillText') out.push([v, fill]);
  }
  return out;
};

test('renderer: with every new setting off, a line draws exactly the same calls', () => {
  const a = draw(proj(), 2);
  const b = draw(proj({ hit: '', echo: '' }, { style: { side: 'center' } }), 2);
  assert.deepEqual(JSON.stringify(b), JSON.stringify(a));
});

test('renderer: key words draw in the accent colour (and only those)', () => {
  const p = proj({ highlight: '#ff0000', color: '#ffffff' }, { emph: { words: [{ i: 3, w: 'light' }] } });
  const f = fills(draw(p, 3));
  assert.deepEqual(f.find(([s]) => s === 'light'), ['light', '#ff0000']);
  assert.deepEqual(f.find(([s]) => s === 'wait'), ['wait', '#ffffff']);
  // the text changed: the pick no longer counts
  p.lyrics[0].text = 'wait for the night';
  assert.ok(fills(draw(p, 3)).every(([, c]) => c !== '#ff0000'));
});

test('renderer: flash hit draws white words for 3 frames at the line start', () => {
  const p = proj({ hit: 'line', color: '#ff0000' });
  const hitLog = draw(p, 1 + 1 / 30);
  assert.ok(fills(hitLog).some(([, c]) => c === '#ffffff'), 'white flash');
  assert.ok(!fills(draw(p, 1 + 4 / 30)).some(([, c]) => c === '#ffffff'), 'over after 3 frames');
  p.lyricStyle.fx = { flashLook: 1 };
  assert.ok(draw(p, 1 + 1 / 30).some(([k]) => k === 'fillRect'), 'inverted draws a block');
});

test('renderer: flash on every beat follows the project beat', () => {
  const p = proj({ hit: 'beat', color: '#ff0000' });
  p.beats = gridFromBpm(60, 0, 20, 'set');
  assert.ok(fills(draw(p, 2.02)).some(([, c]) => c === '#ffffff'));
  assert.ok(!fills(draw(p, 2.5)).some(([, c]) => c === '#ffffff'));
});

test('renderer: wipe clips while it reveals, then draws unclipped', () => {
  const p = proj({ animation: 'wipe' });
  assert.ok(draw(p, 1.1).some(([k]) => k === 'clip'));
  assert.ok(!draw(p, 2.5).some(([k]) => k === 'clip'));
});

test('renderer: tracking sets the letter spacing, or draws letters one by one without it', () => {
  const p = proj({ animation: 'tracking' });
  const log = draw(p, 1.2);
  assert.ok(log.some(([k, v]) => k === '=letterSpacing' && parseFloat(v) > 0));
  const old = draw(p, 1.2, false);
  assert.ok(texts(old).includes('w') && !texts(old).includes('wait'));
  // settled: whole words again
  assert.ok(texts(draw(p, 3.5, false)).includes('wait'));
});

test('renderer: ghost echo draws the line twice; text layers with a new entrance draw fine', () => {
  const p = proj({ echo: 'behind' });
  assert.equal(texts(draw(p, 3)).filter((s) => s === 'wait').length, 2);
  const q = proj();
  q.lyrics = [];
  q.texts = [{ id: 't', text: 'OUT NOW', start: 0, end: 5, x: 50, y: 50, size: 8, font: 'Impact', color: '#fff', animation: 'wipe' }, { id: 'u', text: 'HI', start: 0, end: 5, x: 50, y: 30, size: 8, font: 'Impact', color: '#fff', animation: 'tracking' }];
  const log = draw(q, 3);
  assert.ok(texts(log).includes('OUT') && texts(log).includes('HI'));
});

test('renderer: duet side moves the line to its edge', () => {
  const at = (log) => log.find(([k]) => k === 'translate');
  const mid = at(draw(proj(), 3));
  const left = at(draw(proj({}, { style: { side: 'left' } }), 3));
  const right = at(draw(proj({}, { style: { side: 'right' } }), 3));
  assert.ok(left[1] < mid[1] && right[1] > mid[1], `${left[1]} ${mid[1]} ${right[1]}`);
});

test('applying a look theme keeps a line\u2019s duet side, flash hit and ghost echo, and the card still shows the theme', () => {
  const blood = themeById('bloodash');
  const p = newProject();
  p.lyricStyle.hit = 'line';
  p.lyrics = [
    { id: 'a', text: 'scream', start: 0, end: 2, style: { font: 'Impact', color: '#ffffff', side: 'right', hit: 'beat', echo: 'trail' } },
    { id: 'b', text: 'scream', start: 3, end: 5, style: { font: 'Impact', color: '#ffffff', side: 'right', hit: 'beat', echo: 'trail' } },
    { id: 's', text: 'shared', start: 6, end: 7 },
  ];
  applyTheme(p, 'a', blood);
  for (const id of ['a', 'b']) {
    const st = p.lyrics.find((l) => l.id === id).style;
    assert.equal(st.side, 'right');
    assert.equal(st.hit, 'beat');
    assert.equal(st.echo, 'trail');
    assert.equal(st.font, blood.fields.font);
    assert.equal(themeOf(st), blood);
  }
  // the shared style keeps its flash hit when a theme is applied to it
  applyTheme(p, 's', blood);
  assert.equal(p.lyricStyle.hit, 'line');
  assert.equal(themeOf(p.lyricStyle), blood);
  // a theme that sets one of them itself wins
  const own = { ...blood, fields: { ...blood.fields, side: 'left' } };
  assert.equal(withTheme({ side: 'right', echo: 'behind' }, own).side, 'left');
  assert.equal(withTheme({ side: 'right', echo: 'behind' }, own).echo, 'behind');
  // looks without these fields match their theme as before
  assert.equal(themeOf({ ...blood.fields }), blood);
  assert.equal(themeOf({ ...blood.fields, side: 'right', size: 3 }), null);
});
