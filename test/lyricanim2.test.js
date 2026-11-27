import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRANCE_IDS, LETTER_MODES, letterStep, letterPose, holdEmph, buildHoldPose, PAPER_FONTS, paperSeed, paperFont, paperTone, paperPose,
  paperCorners, tickerLayout, tickerOffset, tickerBar, tickerLines, tickerHandOffset, cleanLyricAnimations, slamScale,
} from '../js/lyricanim.js';
import { EXITS, ENTRANCES, exitTransform, enterTransform, scatterPiece, ashLetter, isStill } from '../js/exits.js';
import { TEXT_ANIMATIONS, renderFrame } from '../js/renderer.js';
import { cleanFx, fxGroups, fxv, FX_FIELDS, GROUP_FIELDS, GROUP_LABEL } from '../js/lyricfx.js';
import { LINE_FIELDS, lineStyle } from '../js/linestyle.js';
import { LOOK_THEMES, motionLabel, themeOf } from '../js/lookthemes.js';
import { withTheme } from '../js/lookapply.js';
import { LYRIC_DISPLAYS, DISPLAY_DEFAULTS } from '../js/lyricviz.js';
import { newProject, normalizeProject } from '../js/state.js';
import { gridFromBpm } from '../js/tempo.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const WAVE2 = ['letters', 'buildhold', 'paper'];

test('wave 2 ids are add-only: the cleaner, the entrance list and the exit list know them', () => {
  for (const id of WAVE2) {
    assert.ok(ENTRANCE_IDS.includes(id), id);
    assert.ok(TEXT_ANIMATIONS.some(([v]) => v === id), id);
  }
  assert.deepEqual([...ENTRANCE_IDS].sort(), TEXT_ANIMATIONS.map(([v]) => v).sort());
  // the older ids keep their place and order
  assert.deepEqual(TEXT_ANIMATIONS.slice(0, 18).map(([v]) => v), ['pop', 'fade', 'slide', 'rise', 'bounce', 'zoom', 'blur', 'spin', 'flip', 'typewriter', 'karaoke', 'words', 'wave', 'neon', 'glitch', 'beat', 'wipe', 'tracking']);
  assert.ok(EXITS.some(([v]) => v === 'scatter') && EXITS.some(([v]) => v === 'ash'));
  assert.ok(ENTRANCES.every(([id]) => EXITS.some(([e]) => e === id)));
  assert.ok(LYRIC_DISPLAYS.some(([v]) => v === 'ticker') && DISPLAY_DEFAULTS.ticker);
  // a saved wave 2 id is kept; an unknown one is still a fade
  const r = cleanLyricAnimations({ lyricStyle: { animation: 'letters', outAnimation: 'ash' }, lyrics: [{ id: 'a', text: 'x', style: { animation: 'paper', outAnimation: 'scatter' } }], texts: [] });
  assert.deepEqual(r.lyricStyle, { animation: 'letters', outAnimation: 'ash' });
  assert.deepEqual(r.lyrics[0].style, { animation: 'paper', outAnimation: 'scatter' });
  assert.equal(cleanLyricAnimations({ lyricStyle: { animation: 'lettres' } }).lyricStyle.animation, 'fade');
});

// ---- per-letter stagger

test('letters: the stagger is 0.05 s a letter, squeezed so a long line still lands in 0.9 s, and scaled by the setting', () => {
  close(letterStep(5, 1), 0.05);
  close(letterStep(60, 1), 0.015);
  close(letterStep(5, 2), 0.1);
  close(letterStep(5, 0), 0);
  close(letterStep(0, 1), 0.05);
});

test('letters: rise, drop and fade poses', () => {
  assert.equal(letterPose(0, -0.01), null);
  const r0 = letterPose(0, 0);
  assert.equal(r0.alpha, 0);
  assert.ok(r0.dy > 0, 'rise starts below');
  const rEnd = letterPose(0, 0.3);
  assert.deepEqual(rEnd, { alpha: 1, dy: 0, scale: 1 });
  assert.ok(letterPose(1, 0).dy < 0, 'drop starts above');
  const dropped = letterPose(1, 0.5);
  assert.ok(dropped.alpha === 1 && dropped.dy === 0 && dropped.scale === 1);
  const f = letterPose(2, 0.1);
  assert.ok(f.alpha > 0 && f.alpha < 1 && f.dy === 0 && f.scale < 1);
  assert.deepEqual(LETTER_MODES, ['Rise', 'Drop', 'Fade']);
  // later letters are further behind: at the same moment they have moved less
  const a = letterPose(0, 0.2 - 0 * letterStep(10));
  const b = letterPose(0, 0.2 - 4 * letterStep(10));
  assert.ok(a.alpha >= b.alpha && a.dy <= b.dy);
});

// ---- build then hold

test('build then hold: earlier words fade in, the last slams and holds as a key word', () => {
  const early = buildHoldPose(0.05, false);
  assert.ok(early.alpha > 0 && early.alpha < 1 && early.dy > 0 && early.slam === 1);
  assert.deepEqual(buildHoldPose(0.5, false), { alpha: 1, dy: 0, slam: 1 });
  const land = buildHoldPose(0, true);
  assert.equal(land.slam, slamScale(0));
  assert.ok(land.slam > 1.5);
  assert.equal(buildHoldPose(2, true).slam, 1, 'it settles and holds');
  const e = holdEmph(null, 4, 1.2, '#ff0000');
  assert.deepEqual([...e.set], [3]);
  assert.deepEqual({ size: e.size, color: e.color, slam: e.slam }, { size: 1.2, color: '#ff0000', slam: false });
  const e2 = holdEmph({ set: new Set([0]), size: 1.6, color: '#00ff00', slam: true }, 3, 1.3, '#ff0000');
  assert.deepEqual([...e2.set].sort(), [0, 2]);
  assert.equal(e2.color, '#00ff00');
  assert.deepEqual([...holdEmph(null, 0, 1.2, '#f00').set], []);
});

// ---- paper strips

test('paper: a strip keeps its tilt, corners, font and tone; it slaps down and jumps on the beat', () => {
  const s1 = paperSeed('light', 3);
  assert.equal(paperSeed('light', 3), s1);
  assert.notEqual(paperSeed('light', 4), s1);
  assert.notEqual(paperSeed('night', 3), s1);
  assert.ok(PAPER_FONTS.includes(paperFont(s1)));
  assert.equal(paperFont(s1), paperFont(s1));
  assert.ok(Math.abs(paperTone(s1)) <= 0.1);
  const settled = (o = {}) => paperPose({ seed: s1, idx: 3, since: 5, ...o });
  // no beat: it rests tilted by at most about 5.7 degrees (0.1 rad), more with a bigger tilt, none at 0
  assert.ok(Math.abs(settled().rot) <= 0.1);
  assert.ok(settled({ tilt: 0 }).rot === 0);
  close(settled({ tilt: 2 }).rot, settled({ tilt: 1 }).rot * 2);
  assert.ok(settled().dy === 0);
  assert.equal(settled().scale, 1);
  // on the beat it hops up (negative dy) and the odd and even strips turn opposite ways
  const hit = settled({ beat: 1 });
  assert.ok(hit.dy < 0);
  close(hit.dy, -0.16);
  assert.ok(settled({ beat: 1, jump: 0 }).dy === 0);
  const even = paperPose({ seed: 0, idx: 0, beat: 1, since: 5 });
  const odd = paperPose({ seed: 0, idx: 1, beat: 1, since: 5 });
  assert.ok(Math.sign(even.rot - paperPose({ seed: 0, idx: 0, since: 5 }).rot) !== Math.sign(odd.rot - paperPose({ seed: 0, idx: 1, since: 5 }).rot));
  // entrance: starts big, turned and unseen
  const start = paperPose({ seed: s1, idx: 3, since: 0 });
  assert.ok(start.scale > 1.3 && start.alpha === 0);
  assert.equal(paperPose({ seed: s1, idx: 3, since: -1 }).alpha, 0);
  const c = paperCorners(s1, 40, 10, 12);
  assert.deepEqual(c, paperCorners(s1, 40, 10, 12));
  assert.equal(c.length, 4);
  assert.ok(c.every(([x, y]) => Math.abs(Math.abs(x) - 20) <= 0.6 + 1e-9 && Math.abs(Math.abs(y) - 5) <= 0.6 + 1e-9));
});

// ---- ticker

test('ticker: one line per step, each line enters at the right edge on its own step', () => {
  const widths = [100, 40, 70];
  const gap = 10;
  const { cum, total } = tickerLayout(widths, gap);
  assert.deepEqual(cum, [0, 110, 160, 240]);
  assert.equal(total, 230);
  assert.equal(tickerOffset(0, widths, gap), 0);
  assert.equal(tickerOffset(-3, widths, gap), 0);
  assert.equal(tickerOffset(1, widths, gap), 110);
  assert.equal(tickerOffset(1.5, widths, gap), 110 + 25);
  assert.equal(tickerOffset(2, widths, gap), 160);
  assert.equal(tickerOffset(3, widths, gap), 240);
  assert.equal(tickerOffset(4, widths, gap), 240 + 80, 'carries on at the last line’s pace');
  assert.equal(tickerOffset(5, [], gap), 0);
});

test('ticker: locked to the tempo it moves one line per bar, from the bar before the first line; by hand it is steady', () => {
  const g = gridFromBpm(120, 0.5, 40, 'set');
  const { bar, first } = tickerBar(g);
  close(bar, 2);
  close(first, 0.5);
  // first line at 5.2 s: the bar at or before it starts at 4.5 s
  const a = tickerLines(4.5, 5.2, g, 1);
  close(a.t0, 4.5);
  close(a.k, 0);
  close(tickerLines(6.5, 5.2, g, 1).k, 1);
  close(tickerLines(6.5, 5.2, g, 2).k, 2, 1e-9);
  assert.equal(tickerLines(3, 5.2, g, 1).k < 0, true);
  // no grid: 120 BPM from 0
  close(tickerBar(null).bar, 2);
  close(tickerLines(4, 3.9, null, 1).k, 1);
  // a detected grid (no `first`) uses its first beat and its period
  const det = { beats: [1, 1.6, 2.2, 2.8], period: 0.6, bpm: 100 };
  close(tickerBar(det).bar, 2.4);
  close(tickerBar(det).first, 1);
  assert.equal(tickerHandOffset(2, 400, 1), 200);
  assert.equal(tickerHandOffset(2, 400, 2), 400);
  assert.equal(tickerHandOffset(-1, 400, 1), 0);
});

// ---- scatter and ash exits

test('scatter exit: the whole block tumbles off (clips and layers); words fly out from the middle, each on its own delay', () => {
  assert.ok(isStill(exitTransform('scatter', 0)));
  const mid = exitTransform('scatter', 0.5);
  assert.ok(mid.fx < 0 && mid.fy < 0 && mid.rot !== 0 && mid.scale > 1 && mid.alpha < 1);
  assert.equal(exitTransform('scatter', 1).alpha, 0);
  // a full-frame clip stays inside a sensible range (no more than 1.7 times, a third of the frame sideways)
  const end = exitTransform('scatter', 1);
  assert.ok(end.scale <= 1.71 && Math.abs(end.fx) <= 0.33);
  assert.deepEqual(enterTransform('scatter', 1), exitTransform('scatter', 0));
  // words: nothing before the exit, outward after
  assert.equal(scatterPiece(0, 0, 10, 0, 100).alpha, 1);
  const right = scatterPiece(1, 0.7, 40, 0, 100);
  assert.ok(right.tx > 0 && Math.abs(right.ty) < right.tx, 'a word right of the middle flies right');
  const left = scatterPiece(1, 0.7, -40, 0, 100);
  assert.ok(left.tx < 0);
  assert.equal(scatterPiece(2, 1, 40, 20, 100).alpha, 0, 'all gone at the end');
  assert.deepEqual(scatterPiece(2, 0.6, 40, 20, 100), scatterPiece(2, 0.6, 40, 20, 100));
  // a word at the middle still goes somewhere (its own direction)
  const mid0 = scatterPiece(5, 0.8, 0, 0, 100);
  assert.ok(Math.hypot(mid0.tx, mid0.ty) > 10);
  // distance and spin settings
  const d1 = Math.hypot(scatterPiece(1, 0.8, 40, 0, 100, 1).tx, 0);
  const d2 = Math.hypot(scatterPiece(1, 0.8, 40, 0, 100, 2).tx, 0);
  assert.ok(d2 > d1 * 1.9);
  assert.equal(scatterPiece(1, 0.8, 40, 0, 100, 1, 0).rot, 0);
});

test('ash exit: letters start one after another, blur, drift up and fade; the sway comes from the frame, not chance', () => {
  assert.equal(ashLetter(3, 0, 10).alpha, 1);
  const a = ashLetter(3, 0.7, 12);
  assert.deepEqual(a, ashLetter(3, 0.7, 12));
  assert.ok(a.dy < 0 && a.blur > 0 && a.alpha < 1 && a.scale > 1);
  assert.equal(ashLetter(3, 1, 12).alpha, 0);
  assert.equal(ashLetter(0, 1, 99).alpha, 0);
  // not every letter has started at the same moment
  const early = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ashLetter(n, 0.2, 0).alpha);
  assert.ok(new Set(early).size > 2 && Math.min(...early) < 1 && Math.max(...early) === 1);
  // the sway changes with the frame but the drift and fade do not
  const f1 = ashLetter(2, 0.6, 3);
  const f2 = ashLetter(2, 0.6, 9);
  assert.notEqual(f1.dx, f2.dx);
  assert.equal(f1.dy, f2.dy);
  assert.equal(f1.alpha, f2.alpha);
  // settings: drift 0 = no rise, blur 0 = sharp, stagger 0 = all together
  assert.ok(ashLetter(2, 0.6, 3, 0).dy === 0);
  assert.ok(ashLetter(2, 0.6, 3, 1, 0).blur === 0);
  const together = [0, 1, 2, 3].map((n) => ashLetter(n, 0.3, 0, 1, 1, 0).alpha);
  assert.equal(new Set(together).size, 1);
  // the whole-block version (layers, clips) blurs, rises and fades
  const blk = exitTransform('ash', 0.6);
  assert.ok(blk.blur > 0 && blk.fy < 0 && blk.alpha < 1);
  assert.equal(exitTransform('ash', 1).alpha, 0);
  assert.ok(isStill(exitTransform('ash', 0)));
});

test('the old exits are unchanged: a fingerprint of every exit and entrance at 105 points, taken on 63e7e4b', () => {
  let h = 2166136261;
  const ids = ['fade', 'popout', 'zoomout', 'shrink', 'slidedown', 'slideup', 'slideleft', 'slideright', 'blur', 'spin', 'drop', 'glitch', 'flicker', 'cut', 'none', 'weird'];
  const mix = (r) => {
    for (const k of ['alpha', 'scale', 'fx', 'fy', 'rot', 'blur']) {
      const s = String(r[k]);
      for (let j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j), 16777619) >>> 0;
    }
  };
  for (const id of ids) {
    for (let i = -2; i <= 102; i++) {
      mix(exitTransform(id, i / 100));
      mix(enterTransform(id, i / 100));
    }
  }
  assert.equal(h.toString(16), '3777aa5f');
});

// ---- effect settings

test('wave 2 effect settings: defaults, steps, clean copies and the groups each id shows', () => {
  for (const k of ['letterMode', 'letterStagger', 'holdSize', 'tickerLock', 'tickerSpeed', 'tickerGap', 'scatterDist', 'scatterSpin', 'ashDrift', 'ashBlur', 'ashStagger', 'paperTilt', 'paperFonts', 'paperJump']) {
    assert.ok(FX_FIELDS[k], k);
    const [d, min, max] = FX_FIELDS[k];
    assert.ok(d >= min && d <= max, k);
  }
  assert.equal(fxv({}, 'letterMode'), 0);
  assert.equal(fxv(undefined, 'paperFonts'), 0);
  assert.equal(fxv({}, 'tickerLock'), 1);
  assert.deepEqual(cleanFx({ letterMode: 1.6, tickerLock: 0.4, paperFonts: 0.9, holdSize: 9, ashStagger: 'x', letterStagger: '2' }), { letterMode: 2, tickerLock: 0, paperFonts: 1, holdSize: 2, letterStagger: 2 });
  assert.equal(FX_FIELDS.letterMode[5](1), 'Drop');
  assert.equal(FX_FIELDS.tickerLock[5](0), 'Set by hand');
  assert.equal(FX_FIELDS.tickerLock[5](1), 'Tempo (one line per bar)');
  assert.equal(FX_FIELDS.paperFonts[5](1), 'On');
  assert.deepEqual(fxGroups({ display: 'line', animation: 'letters' }), ['letters', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'buildhold' }), ['buildhold', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'paper' }), ['paper', 'shake']);
  assert.deepEqual(fxGroups({ display: 'ticker' }), ['ticker', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'pop', outAnimation: 'scatter' }), ['scatter', 'shake']);
  assert.deepEqual(fxGroups({ display: 'line', animation: 'letters', outAnimation: 'ash' }), ['letters', 'ash', 'shake']);
  assert.deepEqual(fxGroups({ display: 'sheet', outAnimation: 'ash' }), ['shake']);
  for (const g of ['letters', 'buildhold', 'ticker', 'scatter', 'ash', 'paper']) {
    assert.ok(GROUP_FIELDS[g].length && GROUP_LABEL[g], g);
    assert.ok(GROUP_FIELDS[g].every((k) => k in FX_FIELDS), g);
  }
});

test('looks: wave 2 ids ride on the existing look fields; themeOf, withTheme, lineStyle and motion labels know them', () => {
  for (const k of ['animation', 'outAnimation', 'outDuration']) assert.ok(LINE_FIELDS.includes(k), k);
  const theme = { id: 'x', fields: { ...LOOK_THEMES[0].fields, animation: 'paper', outAnimation: 'scatter' }, fx: { paperTilt: 1.5, scatterSpin: 2 } };
  const style = withTheme({ preset: 'scream', side: 'left' }, theme);
  assert.equal(style.animation, 'paper');
  assert.equal(style.outAnimation, 'scatter');
  assert.equal(style.side, 'left');
  assert.deepEqual(style.fx, { paperTilt: 1.5, scatterSpin: 2 });
  const drawn = lineStyle({ size: 9, animation: 'fade' }, { style, fx: { paperJump: 2 } });
  assert.equal(drawn.animation, 'paper');
  assert.deepEqual(drawn.fx, { paperTilt: 1.5, scatterSpin: 2, paperJump: 2 });
  assert.equal(themeOf({ ...theme.fields }), null, 'a theme that is not on the list is not matched');
  assert.equal(motionLabel({ fields: { animation: 'letters', outAnimation: 'ash' }, fx: {} }), 'Letter stagger · Ash exit');
  assert.equal(motionLabel({ fields: { animation: 'buildhold', outAnimation: 'scatter' }, fx: {} }), 'Build & hold · Scatter exit');
  assert.equal(motionLabel({ fields: { animation: 'paper' }, fx: {} }), 'Paper strips');
  // a look that uses them survives a save and load
  const p = newProject();
  p.lyrics = [{ id: 'a', text: 'one two', start: 0, end: 2, style, fx: { paperJump: 2 } }];
  p.lyricStyle.animation = 'letters';
  p.lyricStyle.outAnimation = 'ash';
  p.lyricStyle.display = 'ticker';
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(n.lyricStyle.animation, 'letters');
  assert.equal(n.lyricStyle.outAnimation, 'ash');
  assert.equal(n.lyricStyle.display, 'ticker');
  assert.equal(n.lyrics[0].style.animation, 'paper');
  assert.deepEqual(n.lyrics[0].fx, { paperJump: 2 });
});

// ---- the renderer draws them

function recorder() {
  const log = [];
  const target = {
    canvas: { width: 108, height: 192 },
    measureText: (s) => ({ width: String(s).length * 5 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, d: 1 }),
    letterSpacing: '0px',
    log,
  };
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
  p.duration = 30;
  p.endCard.enabled = false;
  p.look.grain = 0;
  p.lyrics = [{ id: 'a', text: 'wait for the light', start: 1, end: 4, ...line }];
  Object.assign(p.lyricStyle, { animation: 'fade', outline: '#000000', outlineWidth: 0, uppercase: false, ...style });
  return p;
};
const draw = (p, t) => {
  const c = recorder();
  renderFrame(c, 108, 192, p, t, { preview: false, sourceFor: () => null, image: () => null });
  return c.log;
};
const texts = (log) => log.filter(([k]) => k === 'fillText').map(([, s]) => s);
/** The text of each fillText with the fill colour and the font in force. */
const fills = (log) => {
  let fill = null;
  let font = null;
  const out = [];
  for (const [k, v, x, y] of log) {
    if (k === '=fillStyle') fill = v;
    if (k === '=font') font = v;
    if (k === 'fillText') out.push({ s: v, fill, font, x, y });
  }
  return out;
};
const calls = (log, name) => log.filter(([k]) => k === name);

test('renderer letters: each letter is drawn alone and arrives in order; once all are in, the line is whole letters at rest', () => {
  const p = proj({ animation: 'letters' });
  // 0.02 s in: only the first letters have started
  const early = texts(draw(p, 1.0 + 0.02));
  assert.ok(early.every((s) => s.length === 1), 'letters, not words');
  assert.ok(early.length >= 1 && early.length < 5, `a few letters so far: ${early.join('')}`);
  const early2 = texts(draw(p, 1.0 + 0.2));
  assert.ok(early2.length > early.length);
  assert.equal(early2.join(''), 'wait for the light'.replace(/ /g, '').slice(0, early2.length), 'in reading order');
  // after the stagger, every letter is there
  assert.equal(texts(draw(p, 2.5)).join(''), 'waitforthelight');
  // letters rise: the first frame's letters sit below their rest place
  const ty = (log) => calls(log, 'translate').map(([, , y]) => y);
  assert.ok(Math.max(...ty(draw(p, 1.02))) > Math.max(...ty(draw(p, 2.5))) - 1e-6);
  // the other entrances still draw whole words
  assert.ok(texts(draw(proj({ animation: 'fade' }), 2.5)).includes('wait'));
  // drop and fade modes draw too, and a bigger stagger leaves fewer letters at the same moment
  const slow = proj({ animation: 'letters', fx: { letterStagger: 3, letterMode: 1 } });
  assert.ok(texts(draw(slow, 1.2)).length < early2.length + 5);
  assert.ok(texts(draw(proj({ animation: 'letters', fx: { letterMode: 2 } }), 2.5)).length === 15);
  // a text layer with it draws fine
  const q = proj();
  q.lyrics = [];
  q.texts = [{ id: 't', text: 'OUT NOW', start: 0, end: 5, x: 50, y: 50, size: 8, font: 'Impact', color: '#fff', animation: 'letters' }];
  assert.equal(texts(draw(q, 3)).join(''), 'OUTNOW');
});

test('renderer build then hold: words arrive on their sung times and the last one is bigger, in the accent colour, and stays', () => {
  const line = { words: [{ w: 'wait', t: 1.1 }, { w: 'for', t: 1.8 }, { w: 'the', t: 2.4 }, { w: 'light', t: 3.2, end: 3.9 }] };
  const p = proj({ animation: 'buildhold', color: '#ffffff', highlight: '#ff0000' }, line);
  const sung = (t) => fills(draw(p, t)).map((f) => f.s);
  assert.deepEqual(sung(1.0), []);
  assert.deepEqual(sung(1.5), ['wait']);
  assert.deepEqual(sung(2.0), ['wait', 'for']);
  assert.deepEqual(sung(2.8), ['wait', 'for', 'the']);
  assert.deepEqual(sung(3.3), ['wait', 'for', 'the', 'light']);
  const last = fills(draw(p, 3.6));
  assert.equal(last.find((f) => f.s === 'light').fill, '#ff0000');
  assert.equal(last.find((f) => f.s === 'wait').fill, '#ffffff');
  // it lands big (a slam) and has settled by 3.6: the translate scale is bigger just after it is sung
  const scales = (log) => calls(log, 'scale').map(([, a]) => a);
  assert.ok(Math.max(...scales(draw(p, 3.21))) > Math.max(...scales(draw(p, 3.7))));
  // the last word holds to the end of the line
  assert.ok(sung(3.95).includes('light'));
  // with no saved word times the even spread decides: the last word is the last to appear
  const q = proj({ animation: 'buildhold' });
  const order = [1.5, 2, 2.5, 3, 3.5, 3.95].map((t) => fills(draw(q, t)).length);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(order[order.length - 1], 4);
  assert.ok(order[0] < 4);
  // a one-word line is its own last word
  const one = proj({ animation: 'buildhold', highlight: '#ff0000' }, { text: 'scream' });
  assert.equal(fills(draw(one, 2.5))[0].fill, '#ff0000');
});

test('renderer paper strips: a strip behind each word, mixed fonts when on, jumping on the beat', () => {
  const p = proj({ animation: 'paper', color: '#ffffff', fx: { paperFonts: 1 } });
  p.beats = gridFromBpm(60, 0, 40, 'set');
  const at = draw(p, 3.5);
  assert.deepEqual(texts(at), ['wait', 'for', 'the', 'light']);
  assert.equal(calls(at, 'fill').length, 4, 'one paper strip per word');
  // a white strip carries dark text
  assert.ok(fills(at).every((f) => f.fill === '#111111'));
  const fonts = new Set(fills(at).map((f) => f.font.replace(/^\d+px /, '')));
  assert.ok(fonts.size > 1, 'mixed fonts');
  const plain = proj({ animation: 'paper' });
  const plainFonts = new Set(fills(draw(plain, 3.5)).map((f) => f.font));
  assert.equal(plainFonts.size, 1, 'one font when Mixed fonts is off');
  // the same strip is drawn the same way every time
  assert.equal(JSON.stringify(draw(p, 3.5)), JSON.stringify(draw(p, 3.5)));
  // the box colour (when the box is on) is the paper; the text is readable on it
  const boxed = proj({ animation: 'paper', box: true, boxColor: '#101010', color: '#ffffff' });
  assert.ok(fills(draw(boxed, 3.5)).every((f) => f.fill === '#ffffff'));
  // on the beat (t = 3.0 s is a beat of the 60 BPM grid) the strips sit higher than off the beat (3.6 s)
  const ys = (log) => calls(log, 'translate').map(([, , y]) => y).filter((y) => typeof y === 'number');
  assert.notDeepEqual(ys(draw(p, 3.02)), ys(draw(p, 3.6)));
  const still = proj({ animation: 'paper', fx: { paperJump: 0 } });
  still.beats = gridFromBpm(60, 0, 40, 'set');
  assert.deepEqual(ys(draw(still, 3.02)), ys(draw(still, 3.6)));
});

test('renderer ticker: one band, lines crawl right to left, the sung line is in the accent colour', () => {
  const lines = [
    { id: 'a', text: 'first line here', start: 2, end: 4 },
    { id: 'b', text: 'second', start: 4.5, end: 6 },
    { id: 'c', text: 'third line of words', start: 6.5, end: 8 },
  ];
  const mk = (fx = {}) => {
    const p = proj({ display: 'ticker', ...DISPLAY_DEFAULTS.ticker, fx, color: '#ffffff', highlight: '#ff0000' });
    p.lyrics = lines;
    p.beats = gridFromBpm(120, 0, 40, 'set');
    return p;
  };
  const xOf = (log, s) => fills(log).find((f) => f.s === s.toUpperCase());
  // before the first line's bar there is nothing
  assert.deepEqual(texts(draw(mk(), 1.9)), []);
  // locked to the tempo (120 BPM = a 2 s bar): line j enters the right edge (x = 108) exactly at bar j
  assert.ok(xOf(draw(mk(), 2.001), 'first line here').x <= 108 + 1e-6 && xOf(draw(mk(), 2.2), 'first line here').x < 108, 'enters from the right');
  const k1 = draw(mk(), 4);
  close(xOf(k1, 'second') ? xOf(k1, 'second').x : 108, 108, 0.05);
  // by hand: a steady quarter of the frame a second
  const hand = (t) => xOf(draw(mk({ tickerLock: 0 }), t), 'first line here').x;
  close(hand(3) - hand(4), 108 * 0.25, 1e-6);
  close(hand(2.0 + 1e-9), 108, 1e-3);
  // the sung line is red, the others white
  const sungFrame = fills(draw(mk({ tickerLock: 0 }), 3));
  assert.equal(sungFrame.find((f) => f.s === 'FIRST LINE HERE').fill, '#ff0000');
  // a band (box) is drawn, and everything goes after the last line has crawled off
  assert.ok(calls(draw(mk(), 4), 'fillRect').length >= 1);
  assert.deepEqual(texts(draw(mk({ tickerLock: 0 }), 28)), []);
  // faster speed moves further in the same time
  const fast = xOf(draw(mk({ tickerLock: 0, tickerSpeed: 2 }), 3), 'first line here').x;
  assert.ok(fast < hand(3));
});

test('renderer scatter exit: before the exit the words are whole; during it they leave the middle and fade; at the end nothing is drawn', () => {
  const p = proj({ animation: 'fade', outAnimation: 'scatter', outDuration: 1 });
  const before = draw(p, 2.5);
  assert.deepEqual(texts(before), ['wait', 'for', 'the', 'light']);
  const mid = draw(p, 3.6);
  assert.equal(texts(mid).length, 4);
  const pos = (log) => calls(log, 'translate').map(([, x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('|');
  assert.notEqual(pos(mid), pos(before));
  assert.ok(calls(mid, 'rotate').length > calls(before, 'rotate').length, 'the words turn');
  // gone at the end of the line
  assert.deepEqual(texts(draw(p, 4.0)), []);
  // old exits still move the whole block (translate then scale), not word by word
  const q = proj({ animation: 'fade', outAnimation: 'slideleft', outDuration: 1 });
  assert.equal(calls(draw(q, 3.6), 'rotate').length, 0);
  // settings: distance 0.2 keeps the words closer to home than 3
  const far = proj({ animation: 'fade', outAnimation: 'scatter', outDuration: 1, fx: { scatterDist: 3 } });
  const near = proj({ animation: 'fade', outAnimation: 'scatter', outDuration: 1, fx: { scatterDist: 0.2 } });
  const reach = (log) => calls(log, 'translate').reduce((a, [, x, y]) => a + Math.hypot(x, y), 0);
  assert.ok(reach(draw(far, 3.7)) > reach(draw(near, 3.7)));
  // a text layer scatters the same way
  const t = proj();
  t.lyrics = [];
  t.texts = [{ id: 't', text: 'OUT NOW', start: 0, end: 5, x: 50, y: 50, size: 8, font: 'Impact', color: '#fff', animation: 'fade', outAnimation: 'scatter', outDuration: 1 }];
  assert.deepEqual(texts(draw(t, 2.5)), ['OUT', 'NOW']);
  assert.deepEqual(texts(draw(t, 5)), []);
});

test('renderer ash exit: whole words before it, letters during it (blurred as they go), nothing at the end; no chance or clock reads', () => {
  const p = proj({ animation: 'fade', outAnimation: 'ash', outDuration: 1.2 });
  assert.deepEqual(texts(draw(p, 2.5)), ['wait', 'for', 'the', 'light']);
  const mid = draw(p, 3.5);
  const mt = texts(mid);
  assert.ok(mt.length > 0 && mt.every((s) => s.length === 1), 'letters');
  assert.ok(calls(mid, '=filter').some(([, v]) => /blur\(/.test(v)), 'blurred letters');
  assert.deepEqual(texts(draw(p, 4)), []);
  // the same time draws the same calls, with Math.random and the clocks made to fail
  const R = Math.random;
  const N = Date.now;
  const P = Object.getOwnPropertyDescriptor(globalThis.performance, 'now');
  Math.random = () => { throw new Error('Math.random'); };
  Date.now = () => { throw new Error('Date.now'); };
  Object.defineProperty(globalThis.performance, 'now', { value: () => { throw new Error('performance.now'); }, configurable: true });
  try {
    const a = JSON.stringify(draw(p, 3.5));
    const b = JSON.stringify(draw(p, 3.5));
    assert.equal(a, b);
    for (const anim of ['letters', 'buildhold', 'paper']) draw(proj({ animation: anim, outAnimation: 'scatter', outDuration: 1 }), 3.7);
    draw(proj({ display: 'ticker' }), 3);
  } finally {
    Math.random = R;
    Date.now = N;
    if (P) Object.defineProperty(globalThis.performance, 'now', P);
    else delete globalThis.performance.now;
  }
  // letters arrive and leave in one line
  const both = proj({ animation: 'letters', outAnimation: 'ash', outDuration: 1.2 });
  assert.ok(texts(draw(both, 3.6)).every((s) => s.length === 1));
  assert.equal(texts(draw(both, 2.5)).join(''), 'waitforthelight');
});

test('renderer: lines that use none of the wave 2 ids draw the same calls as before (no extra state)', () => {
  for (const anim of ['pop', 'fade', 'words', 'karaoke', 'wave', 'tracking']) {
    const a = JSON.stringify(draw(proj({ animation: anim }), 2.5));
    const b = JSON.stringify(draw(proj({ animation: anim, fx: { paperTilt: 2, letterMode: 2, ashDrift: 3, scatterDist: 3, holdSize: 2 } }), 2.5));
    assert.equal(a, b, anim);
  }
});

// ---- the Pulse on the beat group is always listed (panel-lyricfx.js); what is saved does not change

test('pulse group always shown: fxGroups and cleanFx are untouched, so nothing is added or dropped, and switching is one change', async () => {
  // the group list (what a look theme's fx is built from) still has "pulse" only when the style pulses
  assert.ok(!fxGroups({ display: 'line', animation: 'pop' }).includes('pulse'));
  assert.ok(fxGroups({ display: 'line', animation: 'beat' }).includes('pulse'));
  assert.ok(fxGroups({ display: 'poster' }).includes('pulse'));
  // saved pulse values on a style that does not pulse are kept as they are, and none are made up
  const saved = { div: 2, len: 1.5, pulse: 2.5 };
  assert.deepEqual(cleanFx(saved), saved);
  assert.equal(cleanFx({}), null);
  assert.equal(cleanFx({ shake: 0.3 }).pulse, undefined);
  const p = newProject();
  p.lyricStyle.animation = 'pop';
  p.lyricStyle.fx = { ...saved };
  p.lyrics = [{ id: 'a', text: 'one', start: 0, end: 2, fx: { pulse: 3 } }];
  const n = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(n.lyricStyle.fx, saved);
  assert.deepEqual(n.lyrics[0].fx, { pulse: 3 });
  const bare = normalizeProject(JSON.parse(JSON.stringify(newProject())));
  assert.equal(bare.lyricStyle.fx, undefined);
  // the button's change on a look reaches the lines of the look (changeLook), on one line only that line
  const { changeLook } = await import('../js/lookapply.js');
  const d = newProject();
  d.lyrics = [
    { id: 'a', text: 'x', start: 0, end: 1, style: { lookKey: 'k1', animation: 'pop' } },
    { id: 'b', text: 'y', start: 1, end: 2, style: { lookKey: 'k1', animation: 'pop' } },
    { id: 'c', text: 'z', start: 2, end: 3 },
  ];
  assert.equal(changeLook(d, 'a', (st) => ({ ...(st || {}), animation: 'beat' }), { ids: ['a', 'b'] }), 2);
  assert.deepEqual(d.lyrics.map((l) => l.style && l.style.animation), ['beat', 'beat', undefined]);
  assert.equal(changeLook(d, 'c', (st) => ({ ...(st || {}), animation: 'beat' }), { only: true }), 1);
  assert.equal(d.lyrics[2].style.animation, 'beat');
});
