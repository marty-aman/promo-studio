import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTabBytes, tabTracks, buildTabTimeline, chordName, isBassTrack } from '../js/tab.js';
import { TAB_STYLES, TAB_PLACEMENT, stringColor, neckWindow, chordsAround } from '../js/tabviz.js';
import { lastStarted, wordTimes, sheetPosition, posterLayout, LYRIC_DISPLAYS, DISPLAY_DEFAULTS } from '../js/lyricviz.js';
import { newProject } from '../js/state.js';
import { TEMPLATES, applyTemplate, applyLayout, templateNeeds } from '../js/templates.js';

const band = () => parseTabBytes(readFileSync(new URL('./fixtures/spark-band.gp', import.meta.url)));

test('chord names from pitches', () => {
  assert.equal(chordName([40, 47, 52, 55, 59, 64]), 'Em'); // open E minor
  assert.equal(chordName([43, 47, 50, 55, 59, 67]), 'G'); // open G
  assert.equal(chordName([48, 52, 55, 60, 64]), 'C');
  assert.equal(chordName([43, 48, 52, 55, 60]), 'C/G'); // C with G in the bass
  assert.equal(chordName([40, 47]), 'E5'); // power chord
  assert.equal(chordName([45, 52, 55, 60, 64]), 'Am7');
  assert.equal(chordName([50, 57, 62, 66]), 'D');
  assert.equal(chordName([52]), null);
  assert.equal(chordName([52, 64]), null); // octave only
});

test('band fixture: guitar chords, a bass track and tuning pitches', async () => {
  const score = await band();
  const tracks = tabTracks(score);
  assert.deepEqual(tracks.map((t) => [t.name, t.strings, isBassTrack(t)]), [['Guitar', 6, false], ['Bass', 4, true]]);
  const gtr = buildTabTimeline(score, 0);
  assert.equal(gtr.tuningMidi.length, 6);
  const chords = [];
  for (const ev of gtr.events) if (ev.chord && chords[chords.length - 1] !== ev.chord) chords.push(ev.chord);
  assert.deepEqual(chords, ['Em', 'G', 'C', 'D']);
  const lead = gtr.events.filter((e) => e.bar === 4);
  assert.ok(lead.length >= 6 && lead.every((e) => e.chord === null), 'single notes have no chord name');
  assert.ok(lead.some((e) => e.notes.some((n) => n.bend)), 'the bend survives');
  const bass = buildTabTimeline(score, 1);
  assert.equal(bass.strings, 4);
  assert.deepEqual(bass.tuning, ['G', 'D', 'A', 'E']);
});

test('styles, placement and string colours', () => {
  assert.deepEqual(TAB_STYLES.map((s) => s[0]), ['tab', 'highway', 'neck', 'strings']);
  for (const [id] of TAB_STYLES) assert.ok(TAB_PLACEMENT[id].height > 0, id);
  // bass E-A-D-G match guitar E-A-D-G
  for (let k = 0; k < 4; k++) assert.equal(stringColor({}, 4, 3 - k), stringColor({}, 6, 5 - k));
  assert.equal(stringColor({ stringColors: ['#123456'] }, 6, 5), '#123456');
});

test('the light-up neck follows the frets in use', async () => {
  const tl = buildTabTimeline(await band(), 0);
  const open = neckWindow(tl, 0.5);
  assert.equal(open.lo, 0, 'open chords keep the nut on screen');
  const leadBar = tl.bars.find((b) => b.index === 4);
  const w = neckWindow(tl, leadBar.time + 0.5);
  const frets = tl.events.filter((e) => e.bar === 4).flatMap((e) => e.notes.map((n) => n.fret)).filter((f) => f > 0);
  assert.ok(w.lo <= Math.min(...frets) - 1 + 1e-9 && w.hi >= Math.max(...frets), JSON.stringify(w));
  // slides toward the next bar's range in the last 0.35 s of a bar
  const b3 = tl.bars.find((b) => b.index === 3);
  const mid = neckWindow(tl, b3.time + b3.duration - 0.1);
  assert.ok(mid.hi >= neckWindow(tl, b3.time + 0.2).hi);
  const { now, next } = chordsAround(tl, 0.1);
  assert.equal(now.name, 'Em');
  assert.equal(next.name, 'G');
});

test('lyric timing helpers', () => {
  const lines = [
    { id: 'a', text: 'we light it up', start: 10, end: 12 },
    { id: 'b', text: 'tonight', start: 12.5, end: 14 },
    { id: 'c', text: 'burn it down', start: 20, end: 22 },
  ];
  assert.equal(lastStarted(lines, 9), -1);
  assert.equal(lastStarted(lines, 12.5), 1);
  const wt = wordTimes(lines[0]);
  assert.equal(wt.length, 4);
  assert.equal(wt[0].start, 10);
  assert.ok(Math.abs(wt[3].end - 12) < 1e-9);
  assert.equal(sheetPosition(lines, 5), null, 'nothing long before the first line');
  assert.equal(sheetPosition(lines, 9).index, 0, 'the first line shows just before it starts');
  assert.equal(sheetPosition(lines, 11).scroll, 0);
  const gliding = sheetPosition(lines, 12.35);
  assert.ok(gliding.index === 0 && gliding.scroll > 0 && gliding.scroll < 1, 'glides to the next line');
  assert.equal(sheetPosition(lines, 17), null, 'hidden in a long gap');
  assert.equal(sheetPosition(lines, 24).alpha, 1, 'stays up for 2 s after the last line');
  assert.ok(sheetPosition(lines, 24.3).alpha < 1, 'then fades');
});

test('poster layout fills the width and is the same every frame', () => {
  const ctx = {
    font: '100px x',
    save() {},
    restore() {},
    measureText(s) {
      return { width: s.length * parseFloat(this.font.split(' ')[1]) * 0.5 };
    },
  };
  const s = { font: 'Bebas Neue', size: 9, maxWidth: 84, uppercase: true };
  const line = { id: 'l1', text: 'We light it up tonight', start: 0, end: 3 };
  const a = posterLayout(ctx, line, s, 1080, 1920);
  const b = posterLayout(ctx, line, s, 1080, 1920);
  assert.equal(a, b);
  assert.deepEqual(a.rows.flatMap((r) => r.words.map((w) => w.text)), ['WE', 'LIGHT', 'IT', 'UP', 'TONIGHT']);
  assert.ok(a.rows.some((r) => r.words.length === 1 && r.words[0].text === 'TONIGHT' && r.words[0].accent));
  for (const r of a.rows) assert.ok(r.width <= 1080 * 0.84 + 0.5, `row ${r.width}`);
  assert.ok(a.height <= 1920 * 0.5 + 0.5);
  assert.deepEqual(LYRIC_DISPLAYS.map((x) => x[0]), ['line', 'sheet', 'poster', 'tunnel', 'ticker']);
  for (const [id] of LYRIC_DISPLAYS) assert.ok(DISPLAY_DEFAULTS[id], id);
});

const sources = [
  { id: 'gp1', name: 'spark-band.gp', tracks: [{ index: 0, name: 'Guitar', strings: 6, tuning: ['e', 'B', 'G', 'D', 'A', 'E'] }, { index: 1, name: 'Bass', strings: 4, tuning: ['G', 'D', 'A', 'E'] }], drumTracks: [] },
  { id: 'gp2', name: 'spark-drums.gp', tracks: [], drumTracks: [{ index: 0, name: 'Drums' }] },
];
const CLEAR = { tiktok: [0.04, 0.11, 0.83, 0.79], full: [0, 0, 1, 1] };

test('band templates add the right layers from your Guitar Pro files and keep them in the clear area', () => {
  const want = {
    riff: [['tab', 'neck', 'gp1', 0]],
    basscam: [['tab', 'neck', 'gp1', 1], ['viz', 'electric']],
    fullband: [['tab', 'highway', 'gp1', 0], ['drums', 'kit', 'gp2', 0]],
    challenge: [['tab', 'strings', 'gp1', 0]],
  };
  for (const layout of ['full', 'tiktok']) {
    for (const [id, layers] of Object.entries(want)) {
      const p = newProject();
      if (layout !== 'full') applyLayout(p, layout);
      applyTemplate(p, id, sources);
      const got = p.layers.map((l) => (l.type === 'viz' ? [l.type, l.style] : [l.type, l.style, l.mediaId, l.track]));
      assert.deepEqual(got, layers, `${id} ${layout}`);
      const [x0, y0, x1, y1] = CLEAR[layout];
      for (const L of p.layers) {
        if (L.type === 'viz') continue;
        assert.ok(L.x - L.width / 2 >= x0 * 100 - 0.05 && L.x + L.width / 2 <= x1 * 100 + 0.05, `${id} ${layout} ${L.type} x`);
        assert.ok(L.y - L.height / 2 >= y0 * 100 - 0.05 && L.y + L.height / 2 <= y1 * 100 + 0.05, `${id} ${layout} ${L.type} y ${L.y} h ${L.height}`);
        assert.equal(L.role, undefined, 'temporary role tags are removed');
      }
      assert.ok(p.lyricStyle.y > y0 * 100 && p.lyricStyle.y < y1 * 100);
      // applying again reuses the layers
      applyTemplate(p, id, sources);
      assert.equal(p.layers.length, layers.length, `${id} re-apply`);
    }
  }
  // the full band template reuses a guitar layer and adds a bass-free drum chart
  const p = newProject();
  applyTemplate(p, 'riff', sources);
  applyTemplate(p, 'fullband', sources);
  assert.deepEqual(p.layers.map((l) => [l.type, l.style]), [['tab', 'highway'], ['drums', 'kit']]);
  // switching band templates hides layers the new one doesn't use instead of piling them up
  applyTemplate(p, 'basscam', sources);
  assert.deepEqual(p.layers.filter((l) => l.visible).map((l) => [l.type, l.style, l.track ?? null]), [['tab', 'neck', 1], ['viz', 'electric', null]]);
  assert.equal(p.layers.length, 4, 'hidden, not deleted');
});

test('band templates without a Guitar Pro file add an empty layer and say what they need', () => {
  const p = newProject();
  applyTemplate(p, 'riff');
  assert.equal(p.layers.length, 1);
  assert.equal(p.layers[0].mediaId, null);
  assert.equal(templateNeeds('riff', []), 'guitar');
  assert.equal(templateNeeds('basscam', [sources[1]]), 'bass');
  assert.equal(templateNeeds('basscam', sources), null);
  assert.equal(templateNeeds('spotlight', []), null);
});

test('lyric templates pick their display and other templates go back to one line', () => {
  const p = newProject();
  for (const [id, display] of [['lyricvideo', 'sheet'], ['poster', 'poster'], ['tunnel', 'tunnel'], ['spotlight', 'line']]) {
    applyTemplate(p, id);
    assert.equal(p.lyricStyle.display, display, id);
  }
  assert.ok(TEMPLATES.length >= 16);
});
