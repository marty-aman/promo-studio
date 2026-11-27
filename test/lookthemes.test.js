import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_THEMES, themeById, themeOf } from '../js/lookthemes.js';
import { lookMembers, changeLook, splitLine, applyTheme, applySharedTheme, withTheme } from '../js/lookapply.js';
import { lookId, assignLooks, looksById } from '../js/lookcolors.js';
import { LINE_FIELDS, OPTIONAL_LINE_FIELDS, lineStyle } from '../js/linestyle.js';
import { newProject, normalizeProject } from '../js/state.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';

const ln = (id, style) => ({ id, text: id, start: 0, end: 1, ...(style ? { style } : {}) });
const proj = (lines) => ({ ...newProject(), lyrics: structuredClone(lines) });
const drawn = (d, id) => {
  const s = lineStyle(d.lyricStyle, d.lyrics.find((l) => l.id === id), d.theme);
  return Object.fromEntries(LINE_FIELDS.map((k) => [k, s[k] ?? { outAnimation: '', outDuration: 0.35 }[k]]));
};
const colorOf = (d, id) => looksById(d.lyrics, d.lookColors).byLine.get(id).color;
const blood = themeById('bloodash');

test('every theme sets every per-line style field, ids are unique, and there are dark, clean and neon ones', () => {
  assert.equal(new Set(LOOK_THEMES.map((t) => t.id)).size, LOOK_THEMES.length);
  for (const t of LOOK_THEMES) for (const k of LINE_FIELDS) if (!OPTIONAL_LINE_FIELDS.includes(k)) assert.notEqual(t.fields[k], undefined, `${t.id}.${k}`);
  for (const id of ['bloodash', 'blackmass', 'cleanwhite', 'neonpink']) assert.ok(themeById(id), id);
  assert.equal(themeOf(withTheme({ preset: 'scream', lookKey: 'k' }, blood)).id, 'bloodash');
  assert.equal(themeOf({ ...blood.fields, size: 3 }), null);
});

test('look grouping: members share the look; "Only this line" gives a line a look of its own', () => {
  const d = proj([ln('a', { preset: 'scream' }), ln('b', { preset: 'scream' }), ln('c', { preset: 'whisper' }), ln('s')]);
  assert.deepEqual(lookMembers(d.lyrics, 'a'), ['a', 'b']);
  assert.deepEqual(lookMembers(d.lyrics, 's'), ['s']);
  const look = drawn(d, 'b');
  splitLine(d, 'b');
  assert.deepEqual(lookMembers(d.lyrics, 'a'), ['a']);
  assert.deepEqual(lookMembers(d.lyrics, 'b'), ['b']);
  assert.deepEqual(drawn(d, 'b'), look, 'a split line still looks the same');
  assert.notEqual(colorOf(d, 'b'), colorOf(d, 'a'), 'and gets a new look colour');
  assert.equal(new Set(assignLooks(d.lyrics, d.lookColors).map((k) => k.color)).size, 3);
});

test('applying a theme changes every line with the look, never a line whose look differs, and the look keeps its colour', () => {
  const d = proj([ln('a', { size: 5, color: '#123456' }), ln('b', { size: 5, color: '#123456' }), ln('c', { size: 6 }), ln('s')]);
  const col = colorOf(d, 'a');
  const otherC = drawn(d, 'c');
  const otherS = drawn(d, 's');
  const otherColor = colorOf(d, 'c');
  assert.equal(applyTheme(d, 'a', blood), 2);
  assert.equal(themeOf(d.lyrics[0].style).id, 'bloodash');
  assert.deepEqual(d.lyrics[0].style, d.lyrics[1].style);
  assert.deepEqual(drawn(d, 'c'), otherC);
  assert.deepEqual(drawn(d, 's'), otherS);
  assert.equal(colorOf(d, 'a'), col);
  assert.equal(colorOf(d, 'b'), col);
  assert.equal(colorOf(d, 'c'), otherColor);
  assert.equal(assignLooks(d.lyrics, d.lookColors).find((k) => k.id === lookId(d.lyrics[0])).name, 'Blood & Ash');
  // the old look's colour entry does not linger
  assert.equal(Object.keys(d.lookColors).length, 1);
});

test('editing a look setting reaches all its lines; a picked colour follows the look', () => {
  const d = proj([ln('a', { preset: 'clean' }), ln('b', { preset: 'clean' }), ln('c', { preset: 'clean', lookKey: 'x' })]);
  const id0 = lookId(d.lyrics[0]);
  d.lookColors = { [id0]: '#010203' };
  changeLook(d, 'a', (st) => ({ ...st, size: 12 }));
  assert.equal(d.lyrics[0].style.size, 12);
  assert.equal(d.lyrics[1].style.size, 12);
  assert.equal(d.lyrics[2].style.size, undefined);
  // preset looks keep their fixed colour, so the edited one is now a custom look: it keeps the old colour only if picked
  assert.equal(colorOf(d, 'a'), colorOf(d, 'b'));
  const d2 = proj([ln('a', { size: 5 }), ln('b', { size: 5 })]);
  d2.lookColors = { [lookId(d2.lyrics[0])]: '#010203' };
  changeLook(d2, 'a', (st) => ({ ...st, color: '#ff0000' }));
  assert.equal(colorOf(d2, 'b'), '#010203');
  // ids limit a drag to the lines it started with, and a line whose look differs is never written
  const d3 = proj([ln('a', { size: 5 }), ln('b', { size: 5 }), ln('c', { size: 6 })]);
  changeLook(d3, 'a', (st) => ({ ...st, size: 7 }), { ids: ['a', 'b', 'c'] });
  assert.deepEqual(d3.lyrics.map((l) => l.style.size), [7, 7, 6]);
});

test('a theme on the shared style changes every shared line and no line with its own look', () => {
  const d = proj([ln('s1'), ln('s2'), ln('p', { preset: 'scream' }), ln('o', { lookKey: 'k' }), ln('t', withTheme({}, themeById('neonpink')))]);
  const keep = ['p', 'o', 't'].map((id) => drawn(d, id));
  const cols = ['p', 'o', 't'].map((id) => colorOf(d, id));
  assert.equal(applySharedTheme(d, blood), 2);
  assert.equal(themeOf(d.lyricStyle).id, 'bloodash');
  assert.equal(d.lyricStyle.y, newProject().lyricStyle.y, 'position is not a theme field');
  assert.deepEqual(drawn(d, 's1'), drawn(d, 's2'));
  assert.equal(drawn(d, 's1').font, blood.fields.font);
  assert.deepEqual(['p', 'o', 't'].map((id) => drawn(d, id)), keep);
  // the scream line took the old shared size into its own style, so it is a custom look now: same colour as before
  assert.deepEqual(['p', 'o', 't'].map((id) => colorOf(d, id)), cols);
  // applyTheme on a shared line goes to the shared style
  const d2 = proj([ln('s1'), ln('s2')]);
  assert.equal(applyTheme(d2, 's1', themeById('cleanbox')), 2);
  assert.equal(d2.lyrics[0].style, undefined);
  assert.equal(themeOf(d2.lyricStyle).id, 'cleanbox');
  // ... and only:true gives just that line the theme as its own look
  applyTheme(d2, 's2', blood, { only: true });
  assert.equal(themeOf(d2.lyrics[1].style).id, 'bloodash');
  assert.equal(d2.lyrics[0].style, undefined);
});

test('back to the shared style for the whole look; themed looks survive save, file and reload', () => {
  const d = proj([ln('a', { preset: 'chant' }), ln('b', { preset: 'chant' }), ln('c', { preset: 'spoken' })]);
  changeLook(d, 'a', () => undefined);
  assert.deepEqual(d.lyrics.map((l) => !!l.style), [false, false, true]);
  const e = proj([ln('a'), ln('b', { size: 5 }), ln('c', { size: 5 })]);
  applyTheme(e, 'b', blood);
  splitLine(e, 'c');
  const back = normalizeProject(JSON.parse(JSON.stringify(e)));
  assert.deepEqual(back.lyrics, e.lyrics);
  assert.deepEqual(back.lookColors, e.lookColors);
  const viaFile = parseProjectFile(makeProjectFile(e, []));
  const p2 = normalizeProject(viaFile.project || viaFile);
  assert.deepEqual(p2.lyrics.map((l) => l.style || null), e.lyrics.map((l) => l.style || null));
  assert.deepEqual(looksById(p2.lyrics, p2.lookColors).looks, looksById(e.lyrics, e.lookColors).looks);
});

test('old saves keep their look ids (no lookKey, unchanged hashing)', () => {
  assert.equal(lookId(ln('a', { preset: 'scream' })), 'p:scream');
  assert.equal(lookId(ln('a', { size: 5 })), lookId(ln('b', { size: 5 })));
  assert.notEqual(lookId(ln('a', { size: 5, lookKey: 'k' })), lookId(ln('b', { size: 5 })));
  assert.notEqual(lookId(ln('a', { preset: 'scream', lookKey: 'k' })), 'p:scream');
});
