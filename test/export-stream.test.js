// Step 2 (Mac app): an export written straight to disk. The main-process file writer (electron/export-stream.cjs),
// the page-side queue (js/streamsink.js), the muxer's streamed output against its in-memory output, and the HEVC list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSinkWriter } from '../js/streamsink.js';
import { videoCodecs, codecLabel } from '../js/exportplan.js';

const require = createRequire(import.meta.url);
const { createExportStreams, cleanName, MAX_CHUNK } = require('../electron/export-stream.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pvm-stream-'));
const make = (dir, over = {}) => createExportStreams({ pickPath: async ({ defaultName }) => path.join(dir, defaultName), ...over });
const bytes = (n, v = 1) => new Uint8Array(n).fill(v);

test('save stream: a cancelled dialog opens nothing; a finished file is renamed into place with the pieces in order', async () => {
  const dir = tmp();
  assert.equal(await make(dir, { pickPath: async () => null }).begin(1, { name: 'x', ext: 'mp4' }), null);
  const s = make(dir);
  const f = await s.begin(1, { name: 'My song.mp4', ext: 'mp4' });
  assert.equal(f.name, 'My song.mp4');
  assert.ok(fs.existsSync(`${f.path}.partial`) && !fs.existsSync(f.path)); // only the partial exists while writing
  await s.write(1, f.id, 0, bytes(10, 1));
  await s.write(1, f.id, 10, bytes(10, 2));
  await s.write(1, f.id, 0, bytes(4, 9)); // the muxer goes back to fill in a header
  const r = await s.finish(1, f.id);
  assert.deepEqual([r.bytes, r.path], [20, f.path]);
  const out = fs.readFileSync(f.path);
  assert.deepEqual([...out.subarray(0, 6)], [9, 9, 9, 9, 1, 1]);
  assert.equal(out[19], 2);
  assert.ok(!fs.existsSync(`${f.path}.partial`) && s.isSaved(f.path) && !s.isSaved('/etc/passwd') && s.openCount() === 0);
});

test('save stream: abort deletes the partial and leaves an older file at that path alone', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.mp4'), 'old');
  const s = make(dir);
  const f = await s.begin(1, { name: 'a', ext: 'mp4' });
  await s.write(1, f.id, 0, bytes(100));
  await s.abort(1, f.id);
  assert.ok(!fs.existsSync(`${f.path}.partial`));
  assert.equal(fs.readFileSync(f.path, 'utf8'), 'old');
  await s.abort(1, f.id); // again, and an unknown id: nothing happens
  await s.abort(1, 'nope');
  await assert.rejects(() => s.write(1, f.id, 0, bytes(1)), /No such export file/);
});

test('save stream: a bad piece discards the file (a gap, too big, empty, not bytes, negative), and only the opening window can use it', async () => {
  const dir = tmp();
  const s = make(dir);
  const bad = [[5, bytes(4)], [-1, bytes(4)], [0, bytes(MAX_CHUNK + 1)], [0, new Uint8Array(0)], [0, 'text'], [1.5, bytes(2)], [NaN, bytes(2)]];
  for (const [pos, data] of bad) {
    const f = await s.begin(1, { name: 'b', ext: 'mp4' });
    await assert.rejects(() => s.write(1, f.id, pos, data), /Rejected/);
    assert.ok(!fs.existsSync(`${f.path}.partial`), `partial gone after ${String(pos)}`);
  }
  const f = await s.begin(1, { name: 'c', ext: 'mp4' });
  await assert.rejects(() => s.write(2, f.id, 0, bytes(2)), /No such export file/); // another window
  await assert.rejects(() => s.finish(2, f.id), /No such export file/);
  await s.abort(2, f.id); // another window cannot abort it either
  assert.equal(s.openCount(), 1);
  await s.abortOwner(1);
  assert.equal(s.openCount(), 0);
  assert.ok(!fs.existsSync(`${f.path}.partial`));
});

test('save stream: only mp4, two open files per window, names cleaned, a full disk refused, an empty file is not kept', async () => {
  const dir = tmp();
  const s = make(dir);
  await assert.rejects(() => s.begin(1, { name: 'x', ext: 'exe' }), /cannot be saved/);
  await s.begin(1, { name: 'a', ext: 'mp4' });
  await s.begin(1, { name: 'b', ext: 'mp4' });
  await assert.rejects(() => s.begin(1, { name: 'c', ext: 'mp4' }), /Too many/);
  await s.abortOwner(1);
  assert.equal(cleanName('../../etc/passwd', 'mp4'), 'passwd.mp4');
  assert.equal(cleanName('a:b*c?.mp4', 'mp4'), 'a-b-c-.mp4');
  assert.equal(cleanName('', 'mp4'), 'promo-video.mp4');
  assert.equal(cleanName('x'.repeat(500), 'mp4').length, 124);
  const small = make(dir, { freeBytes: async () => 1000 });
  await assert.rejects(() => small.begin(1, { name: 'full', ext: 'mp4' }), /not enough free space/);
  assert.ok(!fs.existsSync(path.join(dir, 'full.mp4.partial')));
  const e = make(dir);
  const f = await e.begin(1, { name: 'empty', ext: 'mp4' });
  await assert.rejects(() => e.finish(1, f.id), /empty/);
  assert.ok(!fs.existsSync(f.path) && !fs.existsSync(`${f.path}.partial`));
});

test('save stream: a failed write discards the file and surfaces the error', async () => {
  const dir = tmp();
  const real = fs.promises;
  const s = make(dir, { fsApi: { ...real, open: async (p, m) => { const fh = await real.open(p, m); return { write: async () => { throw new Error('disk full'); }, close: () => fh.close(), sync: () => fh.sync() }; }, unlink: real.unlink, rename: real.rename } });
  const f = await s.begin(1, { name: 'z', ext: 'mp4' });
  await assert.rejects(() => s.write(1, f.id, 0, bytes(8)), /disk full/);
  assert.ok(!fs.existsSync(`${f.path}.partial`) && s.openCount() === 0);
});

test('sink writer: pieces go out in order one at a time, the queue is bounded, a failed piece throws', async () => {
  const seen = [];
  let active = 0;
  let maxActive = 0;
  const sink = { write: async (pos, data) => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 2)); seen.push([pos, data.byteLength]); active--; } };
  const w = createSinkWriter(sink, { maxPending: 25 });
  for (let i = 0; i < 10; i++) {
    w.onData(bytes(10), i * 10);
    const wait = w.room();
    if (wait) await wait;
  }
  await w.drain();
  assert.deepEqual(seen.map((x) => x[0]), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.equal(maxActive, 1);
  assert.ok(w.peakPending <= 35, `peak ${w.peakPending}`); // never more than the limit plus the piece that crossed it
  assert.equal(w.bytes, 100);
  const bad = createSinkWriter({ write: async () => { throw new Error('nope'); } });
  bad.onData(bytes(3), 0);
  await assert.rejects(() => bad.drain(), /nope/);
  assert.throws(() => bad.check(), /nope/);
});

for (const codec of ['avc', 'hevc']) {
  test(`muxer to a stream: the streamed ${codec} MP4 has no gaps and is the size of the in-memory one`, async () => {
    const { Muxer, ArrayBufferTarget, StreamTarget } = await import('../vendor/mp4-muxer/mp4-muxer.mjs');
    const desc = new Uint8Array(codec === 'avc' ? [1, 100, 0, 40, 255, 225, 0, 4, 103, 100, 0, 40, 1, 0, 2, 104, 235] : new Array(23).fill(1));
    const meta = { decoderConfig: { codec: codec === 'avc' ? 'avc1.640028' : 'hvc1.1.6.L120.B0', description: desc } };
    const feed = (muxer) => {
      for (let i = 0; i < 300; i++) muxer.addVideoChunkRaw(bytes(2000 + (i % 7) * 50, i % 250), i % 30 === 0 ? 'key' : 'delta', i * 33333, 33333, i === 0 ? meta : undefined);
      muxer.finalize();
    };
    // streamed, with small pieces so the output crosses many of them, written the way main.cjs writes them
    const written = [];
    const target = new StreamTarget({ onData: (d, pos) => written.push([pos, d.slice()]), chunked: true, chunkSize: 64 * 1024 });
    feed(new Muxer({ target, video: { codec, width: 1920, height: 1080, frameRate: 30 }, fastStart: false }));
    let size = 0;
    for (const [pos, d] of written) {
      assert.ok(pos <= size, `no gap: piece at ${pos}, file ${size} bytes`);
      size = Math.max(size, pos + d.byteLength);
    }
    const file = new Uint8Array(size);
    for (const [pos, d] of written) file.set(d, pos);
    assert.ok(written.length > 8 && written.every(([, d]) => d.byteLength <= 64 * 1024), 'many pieces, none over the chunk size');
    assert.equal(new TextDecoder().decode(file.subarray(4, 8)), 'ftyp');
    const text = new TextDecoder('latin1').decode(file);
    assert.ok(text.includes('moov') && text.includes('mdat') && text.includes(codec === 'avc' ? 'avc1' : 'hvc1'));
    // the same samples held in memory: the media data is identical, only the layout differs (index first)
    const mem = new ArrayBufferTarget();
    feed(new Muxer({ target: mem, video: { codec, width: 1920, height: 1080, frameRate: 30 }, fastStart: 'in-memory' }));
    const payload = 300 * 2000 + [...Array(300).keys()].reduce((a, i) => a + (i % 7) * 50, 0);
    assert.ok(file.byteLength > payload && mem.buffer.byteLength > payload);
    assert.ok(Math.abs(file.byteLength - mem.buffer.byteLength) < 2048, `${file.byteLength} vs ${mem.buffer.byteLength}`);
  });
}

test('codecs: HEVC is hvc1 then hev1 at level 4.0 (4.1 at 60 fps), H.264 stays the default, and the used codec has a name', () => {
  assert.deepEqual(videoCodecs('mp4', 30, 'hevc').map((c) => c.codec), ['hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0']);
  assert.ok(videoCodecs('mp4', 60, 'hevc').every((c) => c.codec.includes('L123') && c.mux === 'hevc'));
  assert.deepEqual(videoCodecs('mp4', 30), videoCodecs('mp4', 30, 'h264'));
  assert.deepEqual(videoCodecs('webm', 30, 'hevc').map((c) => c.mux), ['V_VP8', 'V_VP9', 'V_VP9']); // HEVC is MP4 only
  assert.equal(codecLabel('hvc1.1.6.L120.B0'), 'HEVC (H.265)');
  assert.equal(codecLabel('avc1.640028'), 'H.264');
});
