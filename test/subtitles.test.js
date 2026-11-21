import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStamp, stamp, parseSubtitles, toSRT, toVTT, videoCues, setCaptions, styleCaptions, shiftCaptions, captionY, CAPTION_STYLES } from '../js/subtitles.js';
import { newProject } from '../js/state.js';
import { GAME_THEMES, GAME_THEME_LIST, gameTheme } from '../js/rhythmgame.js';

test('time stamps', () => {
  assert.equal(parseStamp('00:01:02,500'), 62.5);
  assert.equal(parseStamp('01:02.5'), 62.5);
  assert.equal(parseStamp('1:00:00.000'), 3600);
  assert.ok(Number.isNaN(parseStamp('soon')));
  assert.equal(stamp(62.5), '00:01:02,500');
  assert.equal(stamp(3725.04, '.'), '01:02:05.040');
});

test('SRT and VTT in', () => {
  const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i> there\r\nfriend\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n{\\an8}Top &amp; up\r\n\r\n3\r\n00:00:06,000 --> 00:00:05,000\r\nbackwards\r\n';
  assert.deepEqual(parseSubtitles(srt), [{ start: 1, end: 3.5, text: 'Hello there friend' }, { start: 4, end: 5, text: 'Top & up' }]);
  const vtt = 'WEBVTT\n\nNOTE made by hand\n\nintro\n00:01.000 --> 00:02.000 align:center line:80%\n<c.yellow>Burn</c> it down\n\n00:02.500 --> 00:04.000\n<v Sam>Again</v>\n';
  assert.deepEqual(parseSubtitles(vtt), [{ start: 1, end: 2, text: 'Burn it down' }, { start: 2.5, end: 4, text: 'Again' }]);
  assert.deepEqual(parseSubtitles(''), []);
});

test('SRT and VTT out, long lines wrapped', () => {
  const cues = [{ start: 0.5, end: 2, text: 'Short' }, { start: 2, end: 5, text: 'This caption is long enough that it needs to wrap onto two lines' }];
  const srt = toSRT(cues);
  assert.match(srt, /^1\n00:00:00,500 --> 00:00:02,000\nShort\n\n2\n00:00:02,000 --> 00:00:05,000\n/);
  assert.equal(srt.split('\n')[6].length <= 42, true);
  assert.deepEqual(parseSubtitles(srt).map((c) => c.text), ['Short', cues[1].text]);
  assert.match(toVTT([{ start: 1, end: 2, text: 'a < b' }]), /^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.000\na &lt; b\n/);
});

test('the lyrics and captions in a video, in video time', () => {
  const p = newProject();
  p.song = { mediaId: 's', offset: 40, volume: 1 };
  p.duration = 20;
  p.endCard.enabled = true;
  p.endCard.duration = 4;
  p.lyrics = [{ id: 'a', text: 'Before', start: 30, end: 39 }, { id: 'b', text: 'First', start: 41, end: 43 }, { id: 'c', text: 'Into the card', start: 55, end: 58 }, { id: 'd', text: 'After', start: 70, end: 72 }];
  p.texts = [{ id: 't', text: 'NEW SINGLE', start: 0, end: 2 }, { id: 'u', caption: true, text: 'we wrote this in a van', start: 3, end: 5 }];
  assert.deepEqual(videoCues(p), [{ start: 1, end: 3, text: 'First' }, { start: 3, end: 5, text: 'we wrote this in a van' }, { start: 15, end: 16, text: 'Into the card' }]);
  assert.equal(videoCues(p, { which: 'lyrics' }).length, 2);
  assert.equal(videoCues(p, { which: 'captions' }).length, 1);
  p.layerVis = { lyrics: false };
  assert.equal(videoCues(p).length, 1); // hidden lyrics aren't in the file
});

test('captions as on-screen texts: set, restyle, shift; other texts stay', () => {
  const d = newProject();
  d.texts = [{ id: 'keep', text: 'OUT NOW', start: 0, end: 2 }];
  assert.equal(setCaptions(d, [{ start: 1, end: 2, text: 'one' }, { start: 2, end: 3, text: 'two' }], { style: 'boxed', y: 70 }), 2);
  assert.equal(d.texts.length, 3);
  const c = d.texts.filter((t) => t.caption);
  assert.ok(c.every((t) => t.box && t.y === 70 && t.captionStyle === 'boxed'));
  setCaptions(d, [{ start: 1, end: 2, text: 'only' }]);
  assert.equal(d.texts.filter((t) => t.caption).length, 1); // replaced, not added
  assert.equal(styleCaptions(d, 'highlight'), 1);
  assert.equal(d.texts.find((t) => t.caption).boxColor, '#ffd400');
  shiftCaptions(d, -2);
  assert.equal(d.texts.find((t) => t.caption).start, 0);
  assert.equal(d.texts.find((t) => t.id === 'keep').start, 0);
  assert.equal(CAPTION_STYLES.length, 5);
  assert.equal(captionY(null), 78);
  assert.equal(captionY([0.04, 0.11, 0.83, 0.79]), 69.5);
});

test('rhythm game themes', () => {
  assert.ok(GAME_THEME_LIST.length >= 6);
  for (const [id] of GAME_THEME_LIST) {
    const t = GAME_THEMES[id];
    assert.equal(t.lanes.length, 5, id);
    assert.equal(t.pads.length, 4, id);
    assert.equal(new Set(t.lanes).size >= 3, true, id);
    for (const k of ['kick', 'star', 'rail', 'flame', 'spark', 'hud', 'font', 'gem']) assert.ok(t[k], `${id}.${k}`);
  }
  assert.equal(gameTheme({}).name, 'Classic');
  assert.equal(gameTheme({ gameTheme: 'arcade' }).gem, 'square');
  const themed = gameTheme({ gameTheme: 'neon', themeColors: { bg: '#050505', deep: '#5c0009', accent: '#e0182d', light: '#f2ece4' } });
  assert.equal(themed.rail, '#e0182d');
  assert.equal(themed.lanes, GAME_THEMES.neon.lanes); // frets keep their colours
  assert.equal(gameTheme({ gameTheme: 'neon', followTheme: false, themeColors: { accent: '#e0182d' } }).rail, GAME_THEMES.neon.rail);
});
