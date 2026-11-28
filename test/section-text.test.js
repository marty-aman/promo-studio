// On-screen text on exported section videos (st1-section-text).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSectionText, cleanSectionText, sectionTextOf, setSectionText, textForSection, fillSectionTokens, sectionTextItem, addSectionText } from '../js/sectiontext.js';
import { newProject, newText, normalizeProject, createStore } from '../js/state.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';
import { applyBatchItem } from '../js/batch.js';
import { ctaText } from '../js/core.js';

const cfg = (o = {}) => cleanSectionText({ ...defaultSectionText(), ...o });

test('no text by default: nothing is added and old saves read as none', () => {
  const p = newProject();
  const before = JSON.stringify(p);
  assert.equal(addSectionText(p, sectionTextOf(p, 'song1'), { from: 0, to: 10 }), null);
  assert.equal(JSON.stringify(p), before);
  const old = normalizeProject({ name: 'old', texts: [] });
  assert.equal(old.sectionText, undefined);
  assert.deepEqual(sectionTextOf(old, 'song1'), defaultSectionText());
});

test('the text is timed from the section start, for the whole section or its first seconds', () => {
  const whole = sectionTextItem(cfg({ text: 'HI' }), { from: 22, to: 45 });
  assert.equal(whole.start, 22);
  assert.equal(whole.end, 45);
  const first = sectionTextItem(cfg({ text: 'HI', start: 1, length: 3 }), { from: 22, to: 45 });
  assert.deepEqual([first.start, first.end], [23, 26]);
  // never past the section end (the end card follows it)
  const short = sectionTextItem(cfg({ text: 'HI', start: 2, length: 30 }), { from: 0, to: 5 });
  assert.equal(short.end, 5);
  assert.equal(sectionTextItem(cfg({ text: 'HI', start: 9 }), { from: 0, to: 5 }), null);
});

test('tokens: song, section and artist now; date and countdown at draw time from the end card date', () => {
  const s = fillSectionTokens('{song} - {Section} by {artist} OUT {date}', { song: 'Blood Moon', section: 'Chorus', artist: 'Arc Flash' });
  assert.equal(s, 'Blood Moon - Chorus by Arc Flash OUT {date}');
  assert.equal(ctaText(s, '2026-12-05', new Date(2026, 10, 28)), 'Blood Moon - Chorus by Arc Flash OUT DEC 5');
});

test('per section: its own text or none, the rest the shared text', () => {
  const c = cfg({ text: 'NEW SINGLE', sections: { a: { mode: 'own', text: 'CHORUS!' }, b: { mode: 'none' }, z: { mode: 'weird' } } });
  assert.equal(textForSection(c, 'a'), 'CHORUS!');
  assert.equal(textForSection(c, 'b'), '');
  assert.equal(textForSection(c, 'c'), 'NEW SINGLE');
  assert.equal(c.sections.z, undefined);
  assert.equal(sectionTextItem(c, { sectionId: 'b', from: 0, to: 10 }), null);
  // only an own text, no shared text: just that section
  const only = cfg({ sections: { a: { mode: 'own', text: 'ONLY HERE' } } });
  assert.equal(textForSection(only, 'a'), 'ONLY HERE');
  assert.equal(textForSection(only, 'c'), '');
});

test('position, size, style, colours and fades reach the text layer', () => {
  const it = sectionTextItem(cfg({ text: 'X', pos: 'top', size: 12, style: 'outline', color: '#ff0000', fadeIn: false, fadeOut: true }), { from: 0, to: 4 });
  assert.equal(it.y, 16);
  assert.equal(it.size, 12);
  assert.equal(it.box, false);
  assert.equal(it.color, '#ff0000');
  assert.equal(it.animation, 'none');
  assert.equal(it.outAnimation, 'fade');
  const it2 = sectionTextItem(cfg({ text: 'X', fadeIn: true, fadeOut: false }), { from: 0, to: 4 });
  assert.equal(it2.animation, 'fade');
  assert.equal(it2.outAnimation, 'cut');
  // the item has every field a text layer has
  for (const k of Object.keys(newText())) assert.ok(k in it, k);
});

test('adding it moves nothing else, and a Batch draft reused for the next clip keeps one text', () => {
  const p = newProject();
  p.texts = [{ ...newText(1), id: 'mine' }];
  p.clips = [{ id: 'c1', start: 0, duration: 5 }];
  p.song = { mediaId: 'm', offset: 0 };
  const keep = JSON.stringify({ clips: p.clips, layers: p.layers, lyrics: p.lyrics, mine: p.texts[0] });
  const c = cfg({ text: 'T' });
  applyBatchItem(p, { songOffset: 10, mvIn: null }, { len: 8 });
  addSectionText(p, c, { from: 0, to: 8, section: 'Clip 1' });
  applyBatchItem(p, { songOffset: 30, mvIn: null }, { len: 8 });
  addSectionText(p, c, { from: 0, to: 8, section: 'Clip 2' });
  assert.equal(p.texts.filter((t) => t.id === 'section-text').length, 1);
  assert.equal(JSON.stringify({ clips: p.clips, layers: p.layers, lyrics: p.lyrics, mine: p.texts[0] }), keep);
});

test('a hidden Text row: the section text still shows, the edit’s own texts stay hidden', () => {
  const p = newProject();
  p.texts = [{ ...newText(1), id: 'mine' }];
  p.layerVis = { text: false };
  addSectionText(p, cfg({ text: 'T' }), { from: 0, to: 8 });
  assert.equal(p.layerVis.text, true);
  assert.equal(p.texts.find((t) => t.id === 'mine').disabled, true);
  assert.ok(!p.texts.find((t) => t.id === 'section-text').disabled);
});

test('saved per song in the edit: one undo step per change, kept in a project file', () => {
  const store = createStore(newProject());
  store.update((d) => setSectionText(d, 'song1', (c) => (c.text = '{song}')));
  store.update((d) => setSectionText(d, 'song1', (c) => (c.pos = 'top')));
  store.update((d) => setSectionText(d, 'song2', (c) => (c.text = 'other')));
  assert.equal(sectionTextOf(store.get(), 'song1').pos, 'top');
  assert.equal(sectionTextOf(store.get(), 'song2').text, 'other');
  store.undo();
  assert.equal(sectionTextOf(store.get(), 'song2').text, '');
  store.undo();
  assert.equal(sectionTextOf(store.get(), 'song1').pos, 'bottom');
  assert.equal(sectionTextOf(store.get(), 'song1').text, '{song}');
  const back = parseProjectFile(makeProjectFile(store.get())).project;
  assert.equal(sectionTextOf(back, 'song1').text, '{song}');
});

test('remembered for the song when the edit has none of its own; the edit wins otherwise', () => {
  const p = newProject();
  assert.equal(sectionTextOf(p, 's', { text: 'MEM' }).text, 'MEM');
  setSectionText(p, 's', (c) => (c.text = 'EDIT'), { text: 'MEM' });
  assert.equal(sectionTextOf(p, 's', { text: 'MEM' }).text, 'EDIT');
});

test('bad saved values are cleaned', () => {
  const c = cleanSectionText({ text: 5, pos: 'side', size: 99, style: 'x', color: 'red', start: -3, length: 'a', fadeIn: false });
  assert.equal(c.text, '5');
  assert.equal(c.pos, 'bottom');
  assert.equal(c.size, 18);
  assert.equal(c.style, 'box');
  assert.equal(c.color, '#ffffff');
  assert.equal(c.start, 0);
  assert.equal(c.length, 0);
  assert.equal(c.fadeIn, false);
  assert.equal(c.fadeOut, true);
});
