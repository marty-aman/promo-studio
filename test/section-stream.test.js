// Section exports: the real-time note, and (Mac app) many videos written into one folder picked once.
// electron/export-stream.cjs pickFolder/begin({ folder }) with the real fs, and js/streamsink.js writeBlob.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { realtimeNote } from '../js/exportplan.js';
import { writeBlob } from '../js/streamsink.js';

const require = createRequire(import.meta.url);
const { createExportStreams, freeIn, PARTIAL } = require('../electron/export-stream.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pvm-folder-'));
const bytes = (n, v = 1) => new Uint8Array(n).fill(v);
const make = (dir) => createExportStreams({ pickPath: async () => { throw new Error('no save dialog in folder mode'); }, pickFolder: async () => dir });

test('real-time note: the reason from onFallback in one sentence', () => {
  assert.equal(realtimeNote('a sped-up or slowed clip has its sound on'), 'Recorded in real time because a sped-up or slowed clip has its sound on.');
  assert.equal(realtimeNote('the fast export stopped (boom).'), 'Recorded in real time because the fast export stopped (boom).');
  assert.equal(realtimeNote(''), 'Recorded in real time because the fast export is not available here.');
});

test('folder: picked once, each file lands directly inside under its own name, no dialog', async () => {
  const dir = tmp();
  const s = make(dir);
  const f = await s.pickFolder(1);
  assert.deepEqual([f.path, f.name], [dir, path.basename(dir)]);
  assert.equal(typeof f.folder, 'string');
  const names = [];
  for (const n of ['song-01-intro.mp4', 'song-02-verse.mp4', 'song-03-chorus.mp4']) {
    const st = await s.begin(1, { name: n, ext: 'mp4', folder: f.folder });
    await s.write(1, st.id, 0, bytes(10));
    names.push((await s.finish(1, st.id)).name);
  }
  assert.deepEqual(names, ['song-01-intro.mp4', 'song-02-verse.mp4', 'song-03-chorus.mp4']);
  assert.deepEqual(fs.readdirSync(dir).sort(), names);
});

test('folder: a name cannot leave the folder (slashes, .., absolute, control characters)', async () => {
  const dir = tmp();
  const s = make(dir);
  const { folder } = await s.pickFolder(1);
  for (const n of ['../../escape.mp4', '/etc/passwd', '..', 'a/b\\c.mp4', 'x\u0000y.mp4', '....hidden', 'C:\\evil.mp4']) {
    const st = await s.begin(1, { name: n, ext: 'mp4', folder });
    assert.equal(path.dirname(st.path), dir, n);
    assert.ok(!st.name.startsWith('.') && st.name.endsWith('.mp4'), st.name);
    await s.abort(1, st.id);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
  await assert.rejects(() => freeIn(dir, '../x.mp4', async () => false), /not allowed/);
});

test('folder: an existing file or one being written is never overwritten: " 2", " 3"…', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'song-chorus.mp4'), 'old');
  const s = make(dir);
  const { folder } = await s.pickFolder(1);
  const a = await s.begin(1, { name: 'song-chorus', ext: 'mp4', folder });
  const b = await s.begin(1, { name: 'song-chorus', ext: 'mp4', folder }); // while a is still open
  assert.deepEqual([a.name, b.name], ['song-chorus 2.mp4', 'song-chorus 3.mp4']);
  await s.write(1, a.id, 0, bytes(5));
  // a file appears at a's name before it finishes: it stays, a takes the next free name
  fs.writeFileSync(path.join(dir, 'song-chorus 2.mp4'), 'other');
  const done = await s.finish(1, a.id);
  assert.equal(done.name, 'song-chorus 4.mp4');
  assert.equal(fs.readFileSync(path.join(dir, 'song-chorus.mp4'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(dir, 'song-chorus 2.mp4'), 'utf8'), 'other');
  await s.abort(1, b.id);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['song-chorus 2.mp4', 'song-chorus 4.mp4', 'song-chorus.mp4']);
});

test('folder: cancel and a bad piece delete the partial; finished files stay', async () => {
  const dir = tmp();
  const s = make(dir);
  const { folder } = await s.pickFolder(1);
  const ok = await s.begin(1, { name: 'one', ext: 'mp4', folder });
  await s.write(1, ok.id, 0, bytes(8));
  await s.finish(1, ok.id);
  const c = await s.begin(1, { name: 'two', ext: 'mp4', folder });
  await s.write(1, c.id, 0, bytes(8));
  assert.ok(fs.existsSync(c.path + PARTIAL));
  await s.abort(1, c.id);
  const e = await s.begin(1, { name: 'three', ext: 'mp4', folder });
  await assert.rejects(() => s.write(1, e.id, 99, bytes(8)), /Rejected/);
  assert.deepEqual(fs.readdirSync(dir), ['one.mp4']);
});

test('folder: the token belongs to the window that picked it; a closed window forgets it; only mp4', async () => {
  const dir = tmp();
  const s = make(dir);
  const { folder } = await s.pickFolder(1);
  await assert.rejects(() => s.begin(2, { name: 'x', ext: 'mp4', folder }), /No such folder/);
  await assert.rejects(() => s.begin(1, { name: 'x', ext: 'mp4', folder: 'made-up' }), /No such folder/);
  await assert.rejects(() => s.begin(1, { name: 'x', ext: 'sh', folder }), /cannot be saved/);
  await s.abortOwner(1);
  await assert.rejects(() => s.begin(1, { name: 'x', ext: 'mp4', folder }), /No such folder/);
  assert.equal(await createExportStreams({ pickFolder: async () => null }).pickFolder(1), null); // cancelled
  await assert.rejects(() => createExportStreams({ pickFolder: async () => path.join(dir, 'nope') }).pickFolder(1), /cannot be used/);
});

test('writeBlob: a real-time video goes through the sink in pieces; a failed piece aborts', async () => {
  const got = [];
  let aborted = false;
  const sink = { write: async (pos, b) => got.push([pos, b.byteLength]), finish: async () => ({ name: 'a.mp4', bytes: 25 }), abort: async () => (aborted = true) };
  const r = await writeBlob(sink, new Blob([bytes(25)]), 10);
  assert.deepEqual(got, [[0, 10], [10, 10], [20, 5]]);
  assert.equal(r.name, 'a.mp4');
  const bad = { write: async () => { throw new Error('disk full'); }, finish: async () => assert.fail('no finish'), abort: async () => (aborted = true) };
  await assert.rejects(() => writeBlob(bad, new Blob([bytes(5)])), /disk full/);
  assert.ok(aborted);
});
