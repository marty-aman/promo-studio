import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newText } from '../js/state.js';
import { LAYOUTS, TEMPLATES, applyLayout, applyTemplate } from '../js/templates.js';
import { TRANSITIONS, TEXT_ANIMATIONS, END_ANIMATIONS, GRADE_PRESETS } from '../js/renderer.js';

const clip = (id) => ({ id, mediaId: 'm', kind: 'video', in: 0, duration: 3, speed: 1, fit: 'cover', zoom: 1, transition: { type: 'none', duration: 0.4 } });
function project() {
  const p = newProject();
  p.clips = [clip('a'), clip('b'), clip('c')];
  p.texts = [{ ...newText(0), y: 95 }];
  p.lyrics = [{ id: 'l', text: 'hello', start: 1, end: 2, x: 10 }];
  return p;
}

const CLEAR = { tiktok: [0.04, 0.11, 0.83, 0.79], reels: [0.04, 0.1, 0.85, 0.79], shorts: [0.04, 0.1, 0.84, 0.77], all: [0.04, 0.11, 0.83, 0.77] };

test('platform layouts put lyrics, text, logo and end card inside the clear area', () => {
  for (const { id } of LAYOUTS) {
    const p = project();
    applyLayout(p, id);
    assert.equal(p.layout, id);
    if (id === 'full') {
      assert.equal(p.endCard.area, null);
      continue;
    }
    const [x0, y0, x1, y1] = CLEAR[id];
    const ls = p.lyricStyle;
    assert.ok(ls.x - ls.maxWidth / 2 >= x0 * 100 - 0.01 && ls.x + ls.maxWidth / 2 <= x1 * 100 + 0.01, `${id} lyric width`);
    assert.ok(ls.y > y0 * 100 && ls.y < y1 * 100, `${id} lyric y`);
    assert.equal(p.lyrics[0].x, undefined, 'per-line x override cleared');
    for (const t of p.texts) assert.ok(t.y >= y0 * 100 && t.y <= y1 * 100, `${id} text y ${t.y}`);
    assert.equal(p.look.watermark.position, 'custom');
    assert.ok(p.look.watermark.x <= x1 * 100 && p.look.watermark.y >= y0 * 100);
    assert.deepEqual(p.endCard.area, CLEAR[id]);
  }
});

test('every template only uses known transitions, animations and grades', () => {
  const tr = new Set(TRANSITIONS.map(([k]) => k));
  const ta = new Set(TEXT_ANIMATIONS.map(([k]) => k));
  const ea = new Set(END_ANIMATIONS.map(([k]) => k));
  assert.ok(TEMPLATES.length >= 8);
  for (const tpl of TEMPLATES) {
    const p = project();
    applyTemplate(p, tpl.id);
    assert.equal(p.template, tpl.id);
    assert.ok(ta.has(p.lyricStyle.animation), `${tpl.id} lyric animation ${p.lyricStyle.animation}`);
    assert.ok(ea.has(p.endCard.animation), `${tpl.id} end animation`);
    for (const c of p.clips) {
      assert.ok(tr.has(c.transition.type), `${tpl.id} transition ${c.transition.type}`);
      if (c.grade) assert.ok(GRADE_PRESETS[c.grade.preset], `${tpl.id} grade ${c.grade.preset}`);
    }
    for (const t of p.texts) assert.ok(ta.has(t.animation) && t.end > t.start, `${tpl.id} text`);
  }
});

test('templates keep the chosen platform layout', () => {
  const p = project();
  applyLayout(p, 'shorts');
  const y = p.lyricStyle.y;
  applyTemplate(p, 'hype');
  assert.equal(p.layout, 'shorts');
  assert.equal(p.lyricStyle.y, y);
  assert.deepEqual(p.endCard.area, CLEAR.shorts);
});

test('countdown template uses the release date when set', () => {
  const p = project();
  p.endCard.releaseDate = '2026-12-01';
  applyTemplate(p, 'countdown');
  assert.equal(p.endCard.cta, '{countdown}');
  assert.equal(p.texts[0].text, 'OUT {date}');
});
