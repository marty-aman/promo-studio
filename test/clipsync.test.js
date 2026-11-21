import test from 'node:test';
import assert from 'node:assert/strict';
import { syncPoint, inForSyncPoint, autoLineUp, describeSyncPoint } from '../js/clipsync.js';

// a 60 s "song": hits on a grid with random accents, as an energy envelope at 100 per second
function makeSong(seed = 5, secs = 60) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = secs * 100;
  const env = new Float64Array(n);
  for (let t = 1; t < secs - 2; t += 0.25) {
    if (rnd() >= 0.7) continue;
    const k = Math.round(t * 100);
    for (let d = 0; d < 12; d++) if (k + d < n) env[k + d] += (0.6 + rnd() * 0.4) * Math.exp(-d / 4);
  }
  for (let i = 0; i < n; i++) env[i] += 0.02 * rnd();
  return env;
}

test('the sync point: the video second where the song’s 0:00 plays', () => {
  assert.equal(syncPoint({ in: 12 }, 0, 0), 12);
  assert.equal(syncPoint({ in: 12 }, 2, 30), -20); // the edit starts 30 s into the song, the clip 2 s into the edit
  assert.equal(syncPoint({}, 1.5), -1.5);
});

test('the in-point for a sync point, clamped to the file', () => {
  assert.equal(inForSyncPoint(12, 0, 0), 12);
  assert.equal(inForSyncPoint(-20, 2, 30), 12);
  assert.equal(inForSyncPoint(-50, 0, 0), 0); // can't play before the file starts
  assert.equal(inForSyncPoint(100, 0, 0, 40, 10), 30); // nor past its end
  // round trip
  for (const [pt, start, off] of [[3.25, 1, 10], [-4, 0, 7.5], [0, 3, 0]]) {
    assert.equal(syncPoint({ in: inForSyncPoint(pt, start, off) }, start, off), pt);
  }
});

test('describing the sync point', () => {
  assert.match(describeSyncPoint(0), /start together/);
  assert.match(describeSyncPoint(12.4), /0:00 is 12\.40 s into this video/);
  assert.match(describeSyncPoint(-3.2), /video starts 3\.20 s into the song/);
});

test('lining up by listening: the errors', () => {
  const song = { envelope: makeSong(), envRate: 100 };
  const video = { envelope: makeSong(9), envRate: 100, duration: 60 };
  assert.match(autoLineUp(song, video, { speed: 2, duration: 5 }, 0).error, /1× speed/);
  assert.match(autoLineUp({}, video, { duration: 5 }, 0).error, /still being analysed/);
  assert.match(autoLineUp(song, { duration: 5 }, { duration: 5 }, 0).error, /no sound/);
  assert.match(autoLineUp(song, { envelope: new Float64Array(10), envRate: 100 }, { duration: 5 }, 0).error, /too short/);
});

test('lining up by listening finds a video that starts into the song, and one with a lead-in', () => {
  const env = makeSong();
  const song = { envelope: env, envRate: 100 };
  // the video starts 7.5 s into the song
  const late = new Float64Array(env.length - 750);
  for (let i = 0; i < late.length; i++) late[i] = env[i + 750] * 0.8;
  let r = autoLineUp(song, { envelope: late, envRate: 100, duration: late.length / 100 }, { duration: 10 }, 20, 0);
  assert.ok(Math.abs(r.point + 7.5) <= 0.02, `point ${r.point}`);
  assert.ok(Math.abs(r.in - 12.5) <= 0.02, `in ${r.in}`); // at timeline 20 the song is at 20 s, 12.5 s into the video
  assert.notEqual(r.sure, 'unsure');
  // the video has a 4 s intro before the song begins
  const lead = new Float64Array(env.length + 400);
  for (let i = 0; i < env.length; i++) lead[i + 400] = env[i] * 0.8;
  r = autoLineUp(song, { envelope: lead, envRate: 100, duration: lead.length / 100 }, { duration: 10 }, 0, 15);
  assert.ok(Math.abs(r.point - 4) <= 0.02, `point ${r.point}`);
  assert.ok(Math.abs(r.in - 19) <= 0.02, `in ${r.in}`);
});
