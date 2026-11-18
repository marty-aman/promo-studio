import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confidenceToAlpha, chromaAlpha, keyOf, matteSize, clipRange, framesFor, defaultBgRemove, BG_MODES } from '../js/bgremove.js';
import { paletteFromPixels, suggestBackdrops, backdropSearches, SCENES } from '../js/backgrounds.js';
import { inventory, planTakes, applyTake, canSuggest, inventorySignature } from '../js/suggest.js';
import { newProject } from '../js/state.js';
import { TEMPLATES } from '../js/templates.js';

test('person confidence to alpha: edge and softness', () => {
  assert.equal(confidenceToAlpha(1), 1);
  assert.equal(confidenceToAlpha(0), 0);
  assert.ok(Math.abs(confidenceToAlpha(0.5) - 0.5) < 1e-9);
  assert.ok(confidenceToAlpha(0.4, 0.5) > confidenceToAlpha(0.4, 0), 'grow keeps more');
  assert.ok(confidenceToAlpha(0.6, -0.5) < confidenceToAlpha(0.6, 0), 'shrink keeps less');
  assert.ok(confidenceToAlpha(0.45, 0, 0) < confidenceToAlpha(0.45, 0, 1), 'softer ramps further');
});

test('chroma key removes bright and shadowed green, keeps skin, grey and red', () => {
  const k = keyOf('#00ff00');
  assert.ok(chromaAlpha(0, 255, 0, k) < 0.01, 'pure green');
  assert.ok(chromaAlpha(30, 200, 40, k) < 0.01, 'studio green');
  assert.ok(chromaAlpha(20, 120, 20, k) < 0.05, 'shadowed green');
  assert.ok(chromaAlpha(15, 105, 25, k) < 0.05, 'shadowed green after video compression');
  for (const [r, g, b] of [[220, 170, 140], [128, 128, 128], [230, 30, 40], [20, 20, 20], [250, 250, 250], [40, 60, 200], [60, 10, 10], [10, 60, 60], [5, 8, 5], [90, 70, 40]]) {
    assert.ok(chromaAlpha(r, g, b, k) > 0.99, `keeps ${r},${g},${b}`);
  }
  // blue screen key
  const kb = keyOf('#0047bb');
  assert.ok(chromaAlpha(10, 70, 190, kb) < 0.05);
  assert.ok(chromaAlpha(220, 170, 140, kb) > 0.99);
  assert.ok(chromaAlpha(80, 180, 90, k, 0.9) < chromaAlpha(80, 180, 90, k, 0.1), 'more tolerance removes more');
});

test('matte sizes, clip ranges and the frames to prepare', () => {
  assert.deepEqual(matteSize(1920, 1080, 256), { w: 256, h: 144 });
  assert.deepEqual(matteSize(1080, 1920, 256), { w: 144, h: 256 });
  assert.deepEqual(clipRange({ in: 2, duration: 3, speed: 2 }, 100), [2, 8]);
  assert.deepEqual(clipRange({ in: 2, duration: 3, speed: 2 }, 5), [2, 5]);
  const f = framesFor([[1, 2], [1.5, 2.5]], 12);
  assert.equal(f[0], 11);
  assert.equal(f[f.length - 1], 31);
  assert.equal(new Set(f).size, f.length);
  assert.deepEqual(BG_MODES.map((m) => m[0]), ['person', 'chroma']);
  assert.equal(defaultBgRemove().enabled, false);
});

test('cover palette picks the two strongest vivid hues', () => {
  const px = [];
  const put = (n, rgb) => { for (let i = 0; i < n; i++) px.push(...rgb, 255); };
  put(500, [200, 20, 40]); // red
  put(300, [20, 60, 220]); // blue
  put(200, [128, 128, 128]); // grey is ignored
  const [a, b] = paletteFromPixels(new Uint8ClampedArray(px));
  assert.match(a, /^#[ef][0-9a-f]0{0,1}[0-9a-f]{3,4}$/i);
  assert.ok(parseInt(a.slice(1, 3), 16) > 200 && parseInt(a.slice(5, 7), 16) < 120, `red first: ${a}`);
  assert.ok(parseInt(b.slice(5, 7), 16) > 200, `blue second: ${b}`);
  assert.deepEqual(paletteFromPixels(new Uint8ClampedArray(400).fill(128)), ['#ff2bd6', '#2b6bff'], 'fallback for grey art');
});

test('suggested backgrounds follow the template and include your clips', () => {
  const rock = suggestBackdrops({ template: 'rock', palette: ['#ff0000', '#0000ff'], otherMedia: [{ id: 'v2', name: 'crowd.webm', kind: 'video' }] });
  assert.equal(rock[0].bg.scene, 'concrete');
  assert.equal(rock[0].bg.color, '#ff0000');
  assert.ok(rock.some((s) => s.bg.kind === 'gradient' && s.label === 'Cover colours'));
  assert.ok(rock.some((s) => s.bg.kind === 'blur'));
  assert.ok(rock.some((s) => s.bg.kind === 'media' && s.bg.mediaId === 'v2'));
  assert.equal(new Set(rock.map((s) => s.id)).size, rock.length, 'no duplicates');
  assert.equal(rock.filter((s) => s.bg.kind === 'scene').length, SCENES.length, 'every scene offered');
  assert.equal(suggestBackdrops({ template: 'neon' })[0].bg.scene, 'neongrid');
  assert.equal(suggestBackdrops({})[0].bg.scene, 'smoke', 'alt / heavy default');
  assert.ok(backdropSearches('neon').includes('neon city night'));
});

// a fake library: song with a 120 BPM envelope, two clips, a Guitar Pro file with guitar + bass + drums
function library({ gp = true, lyrics = 0 } = {}) {
  const rate = 100;
  const env = new Float32Array(rate * 60).map((_, i) => (i % 50 === 0 ? 1 : 0.05) * (i > 2000 && i < 3500 ? 2 : 1));
  const all = [
    { id: 'song', kind: 'audio', name: 'arc-flash.wav', duration: 60, envelope: env, envRate: rate },
    { id: 'v1', kind: 'video', name: 'stage.webm', duration: 6 },
    { id: 'v2', kind: 'video', name: 'crowd.webm', duration: 6 },
  ];
  if (gp) all.push({ id: 'gp', kind: 'tab', name: 'band.gp', tracks: [{ index: 0, name: 'Guitar', strings: 6, tuning: [] }, { index: 1, name: 'Bass', strings: 4, tuning: [] }], drumTracks: [{ index: 2, name: 'Drums' }] });
  const p = newProject();
  p.lyrics = Array.from({ length: lyrics }, (_, i) => ({ id: `l${i}`, text: `line ${i}`, start: 20 + i * 2, end: 21.5 + i * 2 }));
  return { all, p };
}

test('suggestions: three different takes from what you added', () => {
  const { all, p } = library({ lyrics: 4 });
  const inv = inventory(all, p);
  assert.ok(canSuggest(inv));
  assert.equal(inv.song.id, 'song');
  assert.ok(inv.guitar && inv.bass && inv.drums);
  assert.equal(inv.beats.bpm, 120);
  const takes = planTakes(inv);
  assert.equal(takes.length, 3);
  assert.equal(new Set(takes.map((t) => t.template)).size, 3);
  assert.equal(takes[0].template, 'fullband', 'guitar + drums -> full band first');
  assert.ok(['lyricvideo', 'poster', 'tunnel'].includes(takes[1].template), 'then a lyric take');
  for (const t of takes) assert.ok(TEMPLATES.some((x) => x.id === t.template), t.template);
  const other = planTakes(inv, { seed: 1 });
  assert.notDeepEqual(other.map((t) => t.template), takes.map((t) => t.template), 'a new seed gives different takes');
  // without a Guitar Pro file or lyrics: look-only takes
  const bare = library({ gp: false });
  const t2 = planTakes(inventory(bare.all, bare.p));
  assert.equal(t2.length, 3);
  assert.equal(t2[0].template, 'rock', 'alt / heavy first');
  assert.equal(canSuggest(inventory([], newProject())), false);
  assert.notEqual(inventorySignature(inv), inventorySignature(inventory(bare.all, bare.p)));
});

test('applying a take: hook, beat cuts, template layers synced to the song, cut-outs carried over', () => {
  const { all, p } = library({ lyrics: 4 });
  p.clips = [{ id: 'old', mediaId: 'v1', kind: 'video', in: 0, duration: 3, speed: 1, bgRemove: { ...defaultBgRemove(), enabled: true } }];
  const inv = inventory(all, p);
  const take = planTakes(inv)[0];
  const facts = applyTake(p, take, { inv, palette: ['#ff0000', '#00ffff'], tabTempo: () => 100 });
  assert.equal(p.song.mediaId, 'song');
  assert.ok(p.song.offset <= 20 && p.song.offset + take.hookLen >= 35, `hook covers the loud part (20-35 s): ${p.song.offset}`);
  assert.equal(p.duration, take.hookLen + p.endCard.duration);
  assert.ok(p.clips.length >= 8, `cuts: ${p.clips.length}`);
  // cuts land on beats: every 4 beats at 120 BPM = 2 s
  const lens = p.clips.slice(0, -1).map((c) => c.duration);
  assert.ok(lens.every((d) => Math.abs(d - 2) < 0.02), JSON.stringify(lens));
  assert.ok(p.clips.filter((c) => c.mediaId === 'v1').every((c) => c.bgRemove && c.bgRemove.enabled), 'cut-out carried to new clips of the same media');
  assert.ok(p.clips.filter((c) => c.mediaId === 'v2').every((c) => !c.bgRemove));
  assert.equal(p.clips.find((c) => c.mediaId === 'v1').bgRemove.background.scene, 'stage', 'best background for full band');
  const gtr = p.layers.find((l) => l.type === 'tab' && l.visible !== false);
  assert.equal(gtr.style, 'highway');
  assert.equal(gtr.offset, inv.beats.beats[0]);
  assert.equal(gtr.tempoScale, 1.2, '100 BPM tab matched to the 120 BPM song');
  assert.ok(p.layers.some((l) => l.type === 'drums' && l.style === 'kit'));
  assert.ok(facts.some((f) => f.includes('120 BPM')) && facts.some((f) => f.includes('fretboard highway')) && facts.some((f) => f.includes('Cut-outs')), JSON.stringify(facts));
  // applying again keeps a layer you synced yourself
  gtr.offset = 12.5;
  gtr.userSync = true;
  applyTake(p, take, { inv, tabTempo: () => 100 });
  assert.equal(p.layers.find((l) => l.id === gtr.id).offset, 12.5);
  // a lyric take hides tab / drum layers instead of piling them over the lyrics
  const lt = planTakes(inv).find((t) => t.template === 'lyricvideo');
  const lf = applyTake(p, lt, { inv });
  assert.ok(p.layers.every((l) => l.visible === false) && p.layers.length >= 2);
  assert.ok(lf.some((f) => f.includes('hidden')));
});
