import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProjectFile, parseProjectFile, projectFileName, pushRecent, hasContent, describeProject, PROJECT_FILE_KIND } from '../js/projectfile.js';
import { newProject, newText } from '../js/state.js';

const sample = () => {
  const p = newProject();
  p.name = 'Arc Flash: Static Bloom!';
  p.clips.push({ id: 'c1', mediaId: 'm_abc123', kind: 'video', in: 0, duration: 4, speed: 1 });
  p.song = { mediaId: 'm_song99', offset: 3, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.lyrics.push({ id: 'l1', text: 'we light it up', start: 3.5, end: 6 });
  p.texts.push({ ...newText(1), id: 't1' });
  p.layers.push({ id: 'L1', type: 'viz', name: 'Visualizer', visible: true, source: 'm_viz4567' });
  return p;
};

test('a project file round-trips the whole edit and keeps the names of the media it uses', () => {
  const p = sample();
  const names = { m_abc123: ['riff.mp4', '', 'video'], m_song99: ['song.wav', 'Stems/song.wav', 'audio'], m_unused1: ['other.png', '', 'image'] };
  const text = makeProjectFile(p, names, new Date('2026-11-23T05:00:00Z'));
  const raw = JSON.parse(text);
  assert.equal(raw.kind, PROJECT_FILE_KIND);
  assert.deepEqual(Object.keys(raw.mediaNames).sort(), ['m_abc123', 'm_song99']); // only what the edit points at
  const back = parseProjectFile(text);
  assert.deepEqual(back.project, p);
  assert.equal(back.names.m_song99[1], 'Stems/song.wav');
  assert.equal(back.savedAt, '2026-11-23T05:00:00.000Z');
});

test('an old or partial project fills in what newer versions added', () => {
  const old = { kind: PROJECT_FILE_KIND, version: 1, project: { name: 'Old', aspect: '9:16', duration: 12, clips: [], look: { safeZones: true } } };
  const { project } = parseProjectFile(JSON.stringify(old));
  assert.equal(project.look.overlay, 'tiktok');
  assert.equal(project.look.safeGuide, 'off');
  assert.ok(Array.isArray(project.layers) && Array.isArray(project.audioTracks));
  assert.equal(project.endCard.enabled, true);
});

test('files that are not project files are refused with a sentence', () => {
  for (const bad of ['not json', '{}', JSON.stringify({ kind: 'something-else', project: {} }), JSON.stringify({ kind: PROJECT_FILE_KIND })]) assert.throws(() => parseProjectFile(bad), /isn’t a Video Studio project file/);
  assert.throws(() => parseProjectFile(JSON.stringify({ kind: PROJECT_FILE_KIND, version: 9, project: {} })), /newer version/);
  assert.throws(() => parseProjectFile(JSON.stringify({ kind: PROJECT_FILE_KIND, version: 1, project: { clips: 'x' } })), /damaged/);
});

test('file names are safe', () => {
  assert.equal(projectFileName(sample()), 'arc-flash-static-bloom.promo.json');
  assert.equal(projectFileName({ name: '???' }), 'promo.promo.json');
});

test('earlier projects: newest first, no blanks, no repeats, capped', () => {
  const a = sample();
  let list = pushRecent([], newProject(), 1);
  assert.equal(list.length, 0);
  assert.equal(hasContent(newProject()), false);
  list = pushRecent(list, a, 10);
  const b = { ...sample(), name: 'B' };
  list = pushRecent(list, b, 20);
  assert.deepEqual(list.map((r) => r.name), ['B', 'Arc Flash: Static Bloom!']);
  list = pushRecent(list, a, 30); // the same edit again moves up instead of repeating
  assert.deepEqual(list.map((r) => r.name), ['Arc Flash: Static Bloom!', 'B']);
  for (let i = 0; i < 8; i++) list = pushRecent(list, { ...sample(), name: `P${i}` }, 40 + i);
  assert.equal(list.length, 5);
  assert.equal(list[0].name, 'P7');
  assert.match(describeProject(a), /1 clip · 1 lyric line · 1 text · song · 1 layer/);
  assert.equal(describeProject(newProject()), 'empty');
});
