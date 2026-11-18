import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../js/state.js';
import { suggestCaptions, hashtags, bestLyric, captionFacts } from '../js/captions.js';
import { HOOK_OPENERS, HOOK_KINDS, applyHookOpener } from '../js/hooks.js';
import { loudestSections, evenSections, planBatch, applyBatchItem, zipStore, crc32, postingSchedule, toICS } from '../js/batch.js';
import { PLAYBOOK, PLAYBOOK_ACTIONS, applyPlaybook } from '../js/inspiration.js';
import { parseSpotifyUrl, largerCover, fetchSpotifyInfo } from '../js/spotify.js';

function project() {
  const p = newProject();
  p.endCard.title = 'Static';
  p.endCard.artist = 'Arc Flash';
  p.song = { mediaId: 's', offset: 20, volume: 1 };
  p.duration = 15;
  p.endCard.duration = 3;
  p.lyrics = [
    { id: 'a', text: 'And the static in my head won’t let me sleep tonight at all', start: 5, end: 8 },
    { id: 'b', text: 'We light it up tonight', start: 22, end: 24 },
    { id: 'c', text: 'Go', start: 25, end: 26 },
  ];
  return p;
}

test('captions follow the research: hook first, ≤5 hashtags, short TikTok, searchable words', () => {
  const p = project();
  p.template = 'rock';
  const ideas = suggestCaptions(p, { similar: 'Bad Omens, Spiritbox', city: 'Seattle' });
  assert.ok(ideas.length >= 6);
  for (const i of ideas) {
    assert.ok(i.tags.length <= 5, `${i.id} tags`);
    assert.ok((i.instagram.match(/#\S+/g) || []).length <= 5, `${i.id} ig tags`);
    assert.ok(i.tiktok.length <= 150, `${i.id} tiktok ${i.tiktok.length}`);
    assert.ok(i.instagram.split('\n')[0].length <= 70, `${i.id} first line`);
  }
  assert.equal(new Set(ideas.map((i) => i.id)).size, ideas.length);
  assert.ok(ideas.some((i) => i.id === 'ifyoulike' && i.instagram.includes('Bad Omens & Spiritbox') && i.instagram.includes('metalcore song from Seattle')));
  assert.ok(ideas.find((i) => i.id === 'lyric').instagram.startsWith('“We light it up tonight”'), 'hook-window lyric');
  assert.ok(ideas[0].tags.includes('#metalcore') && ideas[0].tags.includes('#seattlemusic'));
  assert.equal(ideas[0].id, 'share', 'share ask first by default');
  // a tab layer makes "save to learn" first; a release date adds a countdown
  p.layers = [{ type: 'tab', mediaId: 'g', name: 'Guitar tab', visible: true }];
  p.endCard.releaseDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const two = suggestCaptions(p, {});
  assert.equal(two[0].id, 'learn');
  assert.ok(two.some((i) => i.id === 'countdown' && /out in \d days/i.test(i.instagram)));
  assert.ok(suggestCaptions(p, { kind: 'carousel', slides: 7 }).some((i) => i.id === 'swipe' && i.instagram.includes('7 slides')));
  assert.deepEqual(hashtags(['#A', 'b c', '#a', 'd', 'e', 'f', 'g']), ['#a', '#bc', '#d', '#e', '#f']);
  assert.equal(bestLyric(p.lyrics, 20, 32).id, 'b');
  assert.equal(captionFacts(newProject()).title, '', 'placeholder title ignored');
});

test('hook openers: only filmable / licensed / app-native ideas, and Add as intro', () => {
  assert.ok(HOOK_OPENERS.length >= 12);
  for (const hk of HOOK_OPENERS) assert.ok(HOOK_KINDS[hk.kind], hk.id);
  assert.ok(HOOK_OPENERS.filter((x) => x.kind === 'stock').every((x) => x.stock && x.stock.length));
  const p = project();
  p.clips = [{ id: 'c1', mediaId: 'v', kind: 'video', in: 0, duration: 4, transition: { type: 'none' } }];
  const sfx = applyHookOpener(p, HOOK_OPENERS.find((x) => x.id === 'trip'), { clipMediaId: 'v2', clipKind: 'video', clipDuration: 10 });
  assert.equal(sfx, 'impact');
  assert.equal(p.clips[0].mediaId, 'v2');
  assert.equal(p.clips[0].duration, 2);
  assert.equal(p.clips[1].transition.type, 'shake');
  assert.equal(p.texts[0].text, 'WAIT FOR IT');
  assert.equal(p.texts[0].start, 0);
  // applying another replaces the hook text instead of stacking
  applyHookOpener(p, HOOK_OPENERS.find((x) => x.id === 'crowd'), { similar: 'Bad Omens' });
  assert.equal(p.texts.filter((t) => t.hook).length, 1);
  assert.equal(p.texts[0].text, 'IF YOU LIKE BAD OMENS');
});

test('batch: loudest non-overlapping sections, music-video sync, zip and calendar', () => {
  const rate = 10;
  const env = new Float32Array(600).fill(0.1); // 60 s
  for (let i = 200; i < 350; i++) env[i] = 1; // loud 20-35 s
  for (let i = 450; i < 500; i++) env[i] = 0.6; // medium 45-50 s
  const s = loudestSections(env, rate, 10, 3);
  assert.equal(s.length, 3);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] >= 10, JSON.stringify(s));
  assert.ok(s.some((t) => t >= 20 && t <= 25), 'covers the loud part');
  assert.ok(s.every((t) => t <= 50));
  assert.deepEqual(evenSections(100, 10, 4), [0, 30, 60, 90]);
  const song = { envelope: env, envRate: rate, duration: 60 };
  assert.equal(planBatch({ song, len: 10, count: 4 }).length, 4);
  const mvPlan = planBatch({ mode: 'mv', mv: { id: 'mv', duration: 60 }, song, len: 10, count: 3 });
  assert.ok(mvPlan.every((x) => x.mvIn === x.songOffset));
  const p = project();
  applyBatchItem(p, mvPlan[0], { len: 10, mvId: 'mv', mvDuration: 60 });
  assert.equal(p.song.offset, mvPlan[0].songOffset);
  assert.equal(p.clips[0].in, mvPlan[0].mvIn);
  assert.equal(p.duration, 13);
  // zip: a valid store archive
  const enc = new TextEncoder();
  const z = zipStore([{ name: 'a.txt', bytes: enc.encode('hello') }, { name: 'b.txt', bytes: enc.encode('world!') }]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(z.length - 12, true), 2);
  assert.equal(crc32(enc.encode('hello')), 0x3610a686);
  // calendar
  const dates = postingSchedule(new Date(2026, 10, 23), 4, 6, 18);
  assert.equal(dates.length, 24);
  assert.equal(dates[0].getHours(), 18);
  const ics = toICS([{ date: dates[0], title: 'Post: Rate, the chorus', note: 'a;b' }]);
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261123T180000/);
  assert.match(ics, /SUMMARY:Post: Rate\\, the chorus/);
  assert.match(ics, /DESCRIPTION:a\\;b/);
});

test('every playbook rule has an Apply action; edit actions change the project', () => {
  for (const r of PLAYBOOK) assert.ok(PLAYBOOK_ACTIONS[r.action], r.rule);
  const p = project();
  p.duration = 30;
  p.texts = [];
  applyPlaybook(p, 'length', { hookStart: (len) => (len === 12 ? 21 : 0) });
  assert.equal(p.duration, 14.5);
  assert.equal(p.endCard.duration, 2.5);
  assert.equal(p.song.offset, 21);
  applyPlaybook(p, 'hook', { hookStart: () => 22, lyric: 'We light it up tonight' });
  assert.equal(p.texts[0].text, 'WE LIGHT IT UP TONIGHT');
  assert.equal(p.texts[0].start, 0);
  applyPlaybook(p, 'shares', {});
  applyPlaybook(p, 'shares', {});
  assert.equal(p.texts.filter((t) => t.kind === 'share').length, 1);
  assert.equal(p.captionStyle, 'share');
  applyPlaybook(p, 'sound', {});
  assert.ok(p.texts.some((t) => t.kind === 'sound'));
  p.clips = [{ id: 'c', effects: { shake: 1 }, grade: { preset: 'mono' }, kenBurns: {}, transition: { type: 'flash' } }];
  applyPlaybook(p, 'raw', {});
  assert.deepEqual(p.clips[0].effects, {});
  assert.equal(p.clips[0].grade, null);
  assert.throws(() => applyPlaybook(p, 'batch', {}));
});

test('Spotify links: parse, bigger cover, and lookup without audio', async () => {
  const id = '4cOdK2wGLETKBW3PvgPWqT';
  for (const u of [`https://open.spotify.com/track/${id}`, `https://open.spotify.com/intl-de/track/${id}?si=abc`, `spotify:track:${id}`, `https://open.spotify.com/embed/track/${id}`]) {
    assert.deepEqual(parseSpotifyUrl(u), { type: 'track', id, url: `https://open.spotify.com/track/${id}` }, u);
  }
  assert.equal(parseSpotifyUrl(`https://open.spotify.com/album/${id}`).type, 'album');
  for (const bad of ['', 'https://evil.example/track/' + id, `https://open.spotify.com/track/${id}x`, 'https://open.spotify.com.evil.example/track/' + id]) assert.equal(parseSpotifyUrl(bad), null, bad);
  assert.equal(largerCover('https://i.scdn.co/image/ab67616d00001e02xyz'), 'https://i.scdn.co/image/ab67616d0000b273xyz');
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.startsWith('https://open.spotify.com/oembed')) return { ok: true, json: async () => ({ title: 'Static', thumbnail_url: 'https://i.scdn.co/image/ab67616d00001e02abc' }) };
    return { ok: true, blob: async () => new Blob(['img'], { type: 'image/jpeg' }) };
  };
  const info = await fetchSpotifyInfo(`https://open.spotify.com/track/${id}?si=1`, fake);
  assert.equal(info.title, 'Static');
  assert.ok(info.coverBlob);
  assert.equal(calls[0], `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`);
  assert.equal(calls[1], 'https://i.scdn.co/image/ab67616d0000b273abc', 'asks for the 640 px cover');
  await assert.rejects(fetchSpotifyInfo('not a link', fake), /Spotify track or album link/);
  await assert.rejects(fetchSpotifyInfo(`spotify:track:${id}`, async () => ({ ok: false, status: 404 })), /can’t find/);
});
