import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newText } from '../js/state.js';
import { applyTheme } from '../js/themes.js';
import { defaultTabLayer } from '../js/tab.js';
import { defaultVizLayer } from '../js/viz.js';
import { templateFromProject, applyMyTemplate, templateFile, parseTemplateFile, describeTemplate } from '../js/mytemplates.js';
import { postCheck } from '../js/postcheck.js';

function project() {
  const p = newProject();
  p.song = { mediaId: 'song1', offset: 20 };
  p.clips = [
    { id: 'a', mediaId: 'm1', kind: 'video', in: 0, duration: 3, speed: 1, transition: { type: 'flash', duration: 0.3 }, grade: { preset: 'mono' }, effects: { shake: 0.4 } },
    { id: 'b', mediaId: 'm2', kind: 'video', in: 0, duration: 3, speed: 1, transition: { type: 'fade', duration: 0.4 } },
  ];
  p.texts = [{ ...newText(0), text: 'SEND THIS TO YOUR EMO FRIEND', start: 0, end: 2.5 }];
  p.lyrics = [{ id: 'l1', text: 'We light it up tonight', start: 20.2, end: 22 }];
  p.layers = [
    { ...defaultTabLayer(), id: 't', type: 'tab', name: 'Guitar', mediaId: 'gp1', track: 2, offset: 21.5, style: 'neck' },
    { ...defaultVizLayer(), id: 'v', type: 'viz', name: 'Viz', source: 'stem1', style: 'fire' },
  ];
  p.endCard.title = 'Static';
  p.endCard.coverMediaId = 'cover1';
  p.look.watermark.mediaId = 'logo1';
  p.duration = 14;
  return p;
}

test('a saved template keeps the look but none of the media or release details', () => {
  const p = project();
  applyTheme(p, 'bloodash');
  const t = templateFromProject(p, 'Dark single');
  const s = JSON.stringify(t);
  for (const id of ['song1', 'm1', 'm2', 'gp1', 'stem1', 'cover1', 'logo1', 'Static', 'We light it up']) assert.ok(!s.includes(id), `template leaked ${id}`);
  assert.equal(t.theme.id, 'bloodash');
  assert.equal(t.layers.length, 2);
  assert.equal(t.layers[0].style, 'neck');
  assert.equal(t.clipLooks[0].grade.preset, 'custom'); // the theme's grade
  assert.equal(t.clipLooks[0].transition.type, 'flash');
  assert.equal(t.texts[0].text, 'SEND THIS TO YOUR EMO FRIEND');
  assert.match(describeTemplate(t), /theme · lyric style · clip looks · 1 text · visualizer · tab · 14 s/);
});

test('applying a template restyles a new project and reuses its media', () => {
  const t = templateFromProject(project(), 'Dark single');
  const d = newProject();
  d.song = { mediaId: 'newsong', offset: 5 };
  d.clips = [{ id: 'x', mediaId: 'n1', duration: 2, transition: { type: 'none' } }, { id: 'y', mediaId: 'n2', duration: 2, transition: { type: 'none' } }, { id: 'z', mediaId: 'n3', duration: 2 }];
  d.layers = [{ ...defaultTabLayer(), id: 'mine', type: 'tab', name: 'Bass', mediaId: 'bassgp', track: 1, offset: 6.25, style: 'tab' }];
  d.endCard.title = 'Next Song';
  d.endCard.coverMediaId = 'newcover';
  const res = applyMyTemplate(d, t);
  assert.deepEqual(res, { added: 1, kept: 1, missing: [] });
  const tab = d.layers.find((L) => L.type === 'tab');
  assert.equal(tab.id, 'mine');
  assert.equal(tab.mediaId, 'bassgp');
  assert.equal(tab.offset, 6.25);
  assert.equal(tab.style, 'neck'); // the template's style
  const viz = d.layers.find((L) => L.type === 'viz');
  assert.equal(viz.source, 'song'); // the stem it used isn't in this project
  assert.equal(viz.style, 'fire');
  assert.equal(d.clips[0].transition.type, 'flash');
  assert.equal(d.clips[2].transition.type, 'fade'); // later clips take the last saved look
  assert.equal(d.endCard.title, 'Next Song');
  assert.equal(d.endCard.coverMediaId, 'newcover');
  assert.equal(d.duration, 14);
  assert.equal(d.texts.length, 1);
  assert.notEqual(d.texts[0].id, undefined);
});

test('layers that need a file are reported, and unused layers are hidden', () => {
  const t = templateFromProject(project(), 'x');
  const d = newProject();
  d.layers = [{ ...defaultVizLayer(), id: 'old', type: 'viz', name: 'Old viz', style: 'ripple' }, { id: 'vid', type: 'video', name: 'V', clips: [], visible: true }];
  const res = applyMyTemplate(d, t);
  assert.deepEqual(res.missing, ['tab']);
  assert.equal(d.layers.find((L) => L.id === 'old').style, 'fire'); // the viz was reused
  assert.equal(d.layers.find((L) => L.id === 'vid').visible, false);
  assert.equal(d.layers[0].type, 'video'); // video layers stay underneath
});

test('version 1 templates (styles only) still apply', () => {
  const d = newProject();
  applyMyTemplate(d, { name: 'old', lyricStyle: { font: 'Oswald' }, endCard: { cta: 'Out now' }, look: { grain: 0.5, watermark: { size: 20 } }, background: '#111111' });
  assert.equal(d.lyricStyle.font, 'Oswald');
  assert.equal(d.endCard.cta, 'Out now');
  assert.equal(d.look.grain, 0.5);
  assert.equal(d.background, '#111111');
});

test('template files round-trip, and bad files are rejected or cleaned', () => {
  const t = templateFromProject(project(), 'Share me');
  const back = parseTemplateFile(templateFile(t));
  assert.equal(back.name, 'Share me');
  assert.equal(back.layers.length, 2);
  assert.throws(() => parseTemplateFile('not json'), /isn’t a Promo Studio template/);
  assert.throws(() => parseTemplateFile('{"hello":1}'), /isn’t a Promo Studio template/);
  const evil = parseTemplateFile(JSON.stringify({ promoStudioTemplate: 2, name: 'x', lyricStyle: {}, thumb: 'javascript:alert(1)', background: 'url(x)', aspect: 'weird', layers: [{ type: 'tab', mediaId: 'steal', id: 'z' }, { type: 'script' }], look: { watermark: { mediaId: 'm' } } }));
  assert.equal(evil.thumb, null);
  assert.equal(evil.background, undefined);
  assert.equal(evil.aspect, '9:16');
  assert.deepEqual(evil.layers, [{ type: 'tab' }]);
  assert.equal(evil.look.watermark.mediaId, undefined);
});

test('post check: a playbook-shaped edit scores well', () => {
  const p = project();
  p.texts.push({ ...newText(0), text: 'USE THIS SOUND', start: 9, end: 11 });
  p.endCard.duration = 2;
  const r = postCheck(p);
  assert.equal(r.verdict, 'strong', JSON.stringify(r.items.filter((i) => i.level !== 'good')));
  assert.ok(r.items.some((i) => i.id === 'hook' && i.level === 'good'));
  assert.ok(r.items.some((i) => i.id === 'shares' && i.level === 'good'));
});

test('post check: a long, landscape edit with no hook is flagged, with fixes', () => {
  const p = project();
  p.aspect = '16:9';
  p.texts = [];
  p.lyrics = [{ id: 'l', text: 'late', start: 30, end: 32 }];
  p.layers = [];
  p.duration = 75;
  const r = postCheck(p);
  assert.equal(r.verdict, 'risky');
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.equal(by.aspect.level, 'bad');
  assert.deepEqual(by.aspect.fix, { kind: 'aspect' });
  assert.equal(by.hook.level, 'bad');
  assert.deepEqual(by.hook.fix, { kind: 'playbook', action: 'hook' });
  assert.equal(by.length.level, 'bad');
  assert.equal(by.shares.level, 'warn');
  assert.equal(r.items[0].level, 'bad'); // worst first
});

test('post check: text under the app buttons and busy layers', () => {
  const p = project();
  p.layout = 'full';
  p.lyricStyle.y = 90;
  p.layers = [1, 2, 3].map((i) => ({ ...defaultVizLayer(), id: `v${i}`, type: 'viz', name: 'V' }));
  const r = postCheck(p);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.equal(by.safe.level, 'warn');
  assert.deepEqual(by.safe.fix, { kind: 'layout' });
  assert.equal(by.busy.level, 'warn');
  p.layout = 'all';
  assert.ok(!postCheck(p).items.some((i) => i.id === 'safe'));
});

// ---- round 2: ideas from lyrics, editing tips
import { lyricIdeas, lineIdeas, applyLyricIdea } from '../js/lyricideas.js';
import { tipsFor, lyricsOverlap, clearLyricY } from '../js/tips.js';

const LYR = (texts) => texts.map((text, i) => ({ id: `l${i}`, text, start: 20 + i * 2, end: 21.8 + i * 2 }));

test('lyric ideas: fire words pick Hellfire and the fire visualizer, with the words as the reason', () => {
  const p = newProject();
  p.lyrics = LYR(['Watch the city burn tonight', 'We light it up', 'Into the flames we go', 'Burn it down']);
  const r = lyricIdeas(p);
  assert.equal(r.ok, true);
  assert.equal(r.theme.id, 'hellfire');
  assert.ok(r.theme.words.includes('burn') && r.theme.words.includes('flame'));
  assert.equal(r.viz.style, 'fire');
  assert.equal(r.display.id, 'poster'); // short lines
});

test('lyric ideas: cold words pick Frostbite, long lines pick the sheet, the title counts', () => {
  const p = newProject();
  p.lyrics = LYR(['I have been walking through the winter for so many years now', 'and the snow keeps falling on everything I ever said to you']);
  assert.equal(lyricIdeas(p).theme.id, 'frost');
  assert.equal(lyricIdeas(p).display.id, 'sheet');
  p.endCard.title = 'Static';
  p.lyrics = LYR(['Nothing here at all', 'Nothing here again']);
  assert.equal(lyricIdeas(p).theme.id, 'ruststeel');
  assert.equal(lyricIdeas({ ...p, lyrics: LYR(['one']) }).ok, false);
});

test('line ideas: shouted lines scream, repeats become gang vocals, soft and spoken lines', () => {
  const ideas = lineIdeas(LYR(['BURN IT DOWN', 'We are the ones', 'We are the ones', 'whisper my name', '(spoken) this is it', 'just a normal line here']));
  const by = Object.fromEntries(ideas.map((x) => [x.text, x.preset]));
  assert.equal(by['BURN IT DOWN'], 'scream');
  assert.equal(by['We are the ones'], 'chant');
  assert.equal(by['whisper my name'], 'whisper');
  assert.equal(by['(spoken) this is it'], 'spoken');
  assert.equal(by['just a normal line here'], undefined);
});

test('applying all lyric ideas sets theme, a themed visualizer, display and line looks (once)', () => {
  const p = newProject();
  p.lyrics = LYR(['Into the fire!', 'Burn burn burn', 'Into the fire!']);
  const ideas = lyricIdeas(p);
  applyLyricIdea(p, ideas, 'all');
  applyLyricIdea(p, ideas, 'viz'); // reuses its own visualizer
  assert.equal(p.theme.id, 'hellfire');
  const viz = p.layers.filter((L) => L.type === 'viz');
  assert.equal(viz.length, 1);
  assert.equal(viz[0].style, 'fire');
  assert.equal(viz[0].classic, false); // themed colours
  assert.equal(p.lyricStyle.display, ideas.display.id);
  assert.equal(p.lyrics[0].style.preset, 'scream');
});

test('tips: a new song-driven visualizer is pointed at the drum stem', () => {
  const a = newProject();
  const b = structuredClone(a);
  b.layers = [{ ...defaultVizLayer(), id: 'v1', type: 'viz', name: 'V', style: 'ripple' }];
  const t = tipsFor(a, b, { stems: [{ id: 's1', name: 'drums-stem.wav' }] });
  assert.equal(t[0].id, 'viz-stem');
  assert.deepEqual(t[0].fix, { kind: 'vizSource', layerId: 'v1', source: 's1' });
  assert.deepEqual(tipsFor(a, b, { stems: [] }), []);
});

test('tips: a tab on top of the lyrics, too many layers, pasted lyrics, second clip', () => {
  const a = newProject();
  a.lyrics = LYR(['one line', 'two line']);
  a.song = { mediaId: 's', offset: 0 };
  const b = structuredClone(a);
  b.layers = [{ ...defaultTabLayer(), id: 't', type: 'tab', name: 'T', y: 72, height: 16 }];
  assert.ok(lyricsOverlap(b, b.layers[0]));
  const t = tipsFor(a, b);
  assert.equal(t.find((x) => x.id === 'overlap').fix.kind, 'lyricsClear');
  const y = clearLyricY(b, b.layers[0]);
  assert.ok(!lyricsOverlap({ ...b, lyricStyle: { ...b.lyricStyle, y } }, b.layers[0]), `y=${y}`);
  const c = structuredClone(b);
  c.layers.push({ ...defaultVizLayer(), id: 'v1', type: 'viz', name: 'V' }, { ...defaultVizLayer(), id: 'v2', type: 'viz', name: 'V2' });
  assert.ok(tipsFor(b, c).some((x) => x.id === 'busy'));
  const e = newProject();
  const f = structuredClone(e);
  f.lyrics = LYR(['a', 'b']);
  assert.equal(tipsFor(e, f)[0].fix.kind, 'lyricIdeas');
  const g = structuredClone(a);
  g.clips = [{ id: 'c1' }, { id: 'c2' }];
  a.clips = [{ id: 'c1' }];
  assert.ok(tipsFor(a, g).some((x) => x.id === 'beats'));
});

// ---- round 3: new realistic visualizers, the free sound pack
import { GEAR_STYLES, GEAR_PLACEMENT, GEAR_DRAW, boltPath, strikeFlicker, reelAngle, bandAvg } from '../js/vizgear.js';
import { REAL_STYLES, REAL_PLACEMENT, REAL_DRAW } from '../js/vizreal.js';
import { VIZ_STYLES } from '../js/viz.js';
import { filterPack, packCategories } from '../js/soundpack.js';

test('four new realistic visualizers are listed, placed and drawable', () => {
  const ids = GEAR_STYLES.map(([id]) => id);
  assert.deepEqual(ids, ['tape', 'faders', 'lightning', 'strings']);
  for (const id of ids) {
    assert.ok(REAL_STYLES.some(([x]) => x === id) && VIZ_STYLES.some(([x]) => x === id), id);
    assert.ok(REAL_PLACEMENT[id] && GEAR_PLACEMENT[id], id);
    assert.equal(typeof REAL_DRAW[id], 'function');
    assert.equal(GEAR_DRAW[id], REAL_DRAW[id]);
  }
  assert.equal(VIZ_STYLES.length, 21); // + polyrhythm shapes, arcs and polymeter
});

test('lightning bolts are the same every frame and flicker then fade', () => {
  const a = boltPath(0, 0, 0, 100, 7, 30);
  const b = boltPath(0, 0, 0, 100, 7, 30);
  assert.deepEqual(a, b);
  assert.equal(a.length, 129); // 7 rounds of midpoint splits
  assert.deepEqual(a[0], [0, 0]);
  assert.deepEqual(a.at(-1), [0, 100]);
  assert.notDeepEqual(boltPath(0, 0, 0, 100, 8, 30), a);
  assert.equal(strikeFlicker(0.01), 1);
  assert.ok(strikeFlicker(0.05) < 0.5 && strikeFlicker(0.09) > 0.8);
  assert.ok(strikeFlicker(0.2) > 0 && strikeFlicker(0.2) < 1);
  assert.equal(strikeFlicker(0.4), 0);
});

test('tape reels: a fuller reel turns slower; band averages weight recent frames', () => {
  assert.ok(reelAngle(10, 3, 100, 90) < reelAngle(10, 3, 100, 40));
  assert.equal(reelAngle(0, 3, 100, 50), 0);
  const feat = { fps: 10, nbands: 2, level: new Float32Array([0, 0, 0, 1]), bands: new Float32Array([0, 0, 0, 0, 0, 0, 1, 0]) };
  assert.ok(bandAvg(feat, 3, -1, 0.3) > 0.4);
  assert.ok(bandAvg(feat, 3, 0, 0.3) > 0.4 && bandAvg(feat, 3, 1, 0.3) === 0);
});

test('sound pack search: words match names first, then categories and tags', () => {
  const list = [
    { id: '1', name: 'Airhorn blast', cat: 'Horns & alarms', q: 'airhorn', tags: ['dj'], dur: 1.6, file: 'a' },
    { id: '2', name: 'Stadium crowd', cat: 'Crowd', q: 'crowd cheer', tags: ['cheer', 'sports'], dur: 4, file: 'b' },
    { id: '3', name: 'Big boom', cat: 'Hits & impacts', q: 'boom', tags: ['explosion'], dur: 2, file: 'c' },
    { id: '4', name: 'DJ horn', cat: 'Horns & alarms', q: 'air horn', tags: [], dur: 3, file: 'd' },
  ];
  assert.deepEqual(filterPack(list, 'air').map((s) => s.id), ['1', '4']);
  assert.deepEqual(filterPack(list, 'cheer').map((s) => s.id), ['2']);
  assert.deepEqual(filterPack(list, 'horn dj').map((s) => s.id), ['4', '1']);
  assert.deepEqual(filterPack(list, '', 'Crowd').map((s) => s.id), ['2']);
  assert.deepEqual(filterPack(list, 'zzz'), []);
  assert.deepEqual(packCategories(list), [{ name: 'Horns & alarms', n: 2 }, { name: 'Crowd', n: 1 }, { name: 'Hits & impacts', n: 1 }]);
});
