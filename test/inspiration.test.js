import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../js/state.js';
import { applyLayout, TEMPLATES } from '../js/templates.js';
import { TRENDS, SOURCES, PLAYBOOK, CALENDAR, HASHTAG_SETS, applyRecipe, fillTokens } from '../js/inspiration.js';

const clip = (id) => ({ id, mediaId: 'm', kind: 'video', in: 0, duration: 4, speed: 1, fit: 'cover', zoom: 1, transition: { type: 'none', duration: 0.4 } });
function project() {
  const p = newProject();
  p.clips = [clip('a'), clip('b'), clip('c')];
  p.song = { mediaId: 's', offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.endCard.title = 'Spark';
  return p;
}

test('every trend has sources, steps and a valid template', () => {
  const tpl = new Set(TEMPLATES.map((t) => t.id));
  for (const t of TRENDS) {
    assert.ok(tpl.has(t.recipe.template), t.id);
    assert.ok(t.sources.length && t.sources.every((s) => SOURCES[s] && /^https:\/\//.test(SOURCES[s].url)), `${t.id} sources`);
    assert.ok(t.steps.length >= 2 && t.why.length > 40, t.id);
  }
  for (const r of PLAYBOOK) assert.ok(r.sources.every((s) => SOURCES[s]), r.rule);
  for (const [, id] of CALENDAR) assert.ok(TRENDS.some((t) => t.id === id), id);
  for (const s of HASHTAG_SETS) assert.ok(s.tags.split(' ').length <= 5, s.name);
});

test('recipes set duration, hook section and on-screen text inside the video', () => {
  for (const t of TRENDS) {
    const p = project();
    applyRecipe(p, t, { similar: 'Bad Omens & Spiritbox', hookStart: (len) => 42 });
    assert.equal(p.inspiration, t.id);
    assert.equal(p.duration, +(t.recipe.duration + p.endCard.duration).toFixed(2), t.id);
    if (t.recipe.hook) assert.equal(p.song.offset, 42, `${t.id} hook`);
    const contentEnd = p.duration - p.endCard.duration;
    for (const tx of p.texts) {
      assert.ok(tx.end <= contentEnd + 1e-9 && tx.end > tx.start, `${t.id} text timing`);
      assert.ok(!/\{(similar|title|artist)\}/.test(tx.text), `${t.id} unfilled token ${tx.text}`);
    }
  }
});

test('“If you like” fills in the similar bands', () => {
  const p = project();
  applyRecipe(p, TRENDS.find((t) => t.id === 'ifyoulike'), { similar: 'Bad Omens & Spiritbox' });
  assert.equal(p.texts[0].text, 'IF YOU LIKE BAD OMENS & SPIRITBOX');
});

test('cleans → screams makes the first clip calm and the rest harsh', () => {
  const p = project();
  applyRecipe(p, TRENDS.find((t) => t.id === 'cleanscream'), {});
  assert.deepEqual(p.clips[0].effects, {});
  assert.equal(p.clips[1].transition.type, 'flash');
  assert.equal(p.clips[2].grade.preset, 'mono');
});

test('recipes keep the chosen app layout', () => {
  const p = project();
  applyLayout(p, 'reels');
  applyRecipe(p, TRENDS.find((t) => t.id === 'tag'), {});
  assert.equal(p.layout, 'reels');
  assert.ok(p.texts.every((t) => t.y >= 10 && t.y <= 79));
});

test('fillTokens', () => {
  assert.equal(fillTokens('“{title}” by {artist}', { title: 'Spark', artist: 'Arc Flash' }), '“Spark” by Arc Flash');
});
