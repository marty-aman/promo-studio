// Export everything: the streaming zip (sha256, crc32, zip64, reading it back) and the value codec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { File as NodeFile } from 'node:buffer';
import { Sha256, Crc32, ZipWriter, blobSink, openZip, hashBlob } from '../js/zipstream.js';
import { encodeValue, decodeValue, sizeOfValue } from '../js/everything-codec.js';
import { FORMAT, SCHEMA } from '../js/everything.js';

globalThis.File ||= NodeFile;
const rnd = (n, seed = 1) => {
  const u = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) u[i] = (x = (x * 1103515245 + 12345) & 0x7fffffff) >> 16;
  return u;
};
const sha = (u) => createHash('sha256').update(u).digest('hex');

test('sha256 matches node for odd sizes and split updates', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 100000]) {
    const u = rnd(n, n + 1);
    const s = new Sha256();
    s.update(u.subarray(0, n >> 1));
    s.update(u.subarray(n >> 1));
    assert.equal(s.hex(), sha(u), `size ${n}`);
  }
});

test('crc32 of "123456789" is cbf43926', () => {
  const c = new Crc32();
  c.update(new TextEncoder().encode('123456789'));
  assert.equal(c.value, 0xcbf43926);
});

async function roundTrip(opts) {
  const sink = blobSink();
  const z = new ZipWriter(sink, opts);
  const a = rnd(5000, 3);
  const big = new Blob([rnd(9 * 1024 * 1024, 7)]);
  await z.add('a.bin', a);
  await z.add('dir/ünï.txt', new TextEncoder().encode('héllo'));
  await z.add('empty', new Uint8Array(0));
  const hb = await z.add('big', big);
  await z.finish();
  const zip = sink.result();
  const map = await openZip(zip);
  assert.deepEqual([...map.keys()], ['a.bin', 'dir/ünï.txt', 'empty', 'big']);
  assert.equal(sha(await map.get('a.bin').bytes()), sha(a));
  assert.equal(await map.get('dir/ünï.txt').text(), 'héllo');
  assert.equal(map.get('empty').size, 0);
  const got = await hashBlob(await map.get('big').slice());
  assert.equal(got.sha256, hb.sha256);
  assert.equal(got.crc, hb.crc);
  return zip;
}

test('zip round trip, normal and forced zip64', async () => {
  await roundTrip({});
  await roundTrip({ force64: true });
});

test('a zip we wrote is accepted by unzip -t (crc and structure)', async (t) => {
  const zip = await roundTrip({});
  const dir = mkdtempSync(join(tmpdir(), 'ev-'));
  const f = join(dir, 'x.zip');
  writeFileSync(f, new Uint8Array(await zip.arrayBuffer()));
  let out;
  try {
    out = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip())', f]).toString().trim();
  } catch {
    return t.skip('python3 not available');
  }
  assert.equal(out, 'None');
  const z64 = await roundTrip({ force64: true });
  writeFileSync(f, new Uint8Array(await z64.arrayBuffer()));
  assert.equal(execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip())', f]).toString().trim(), 'None');
});

test('openZip refuses things that are not our zip', async () => {
  await assert.rejects(openZip(new Blob(['not a zip at all, just text'])), /not a Promo Studio/);
});

test('codec round trip: blobs, typed arrays, dates, odd numbers, a "$" key', async () => {
  const bins = new Map();
  const addBin = async (x) => {
    const n = `bin${bins.size}`;
    bins.set(n, x instanceof Blob ? x : new Blob([x]));
    return n;
  };
  const rec = { id: 'm1', blob: new Blob(['video bytes'], { type: 'video/mp4' }), vec: new Float32Array([1.5, -2, 3]), bigvec: new Float32Array(10000).fill(0.25), when: new Date(5000), n: [NaN, Infinity, 3], nested: { $: 'x', list: [null, undefined, 'a'] }, file: new File(['f'], 'f.txt', { type: 'text/plain' }) };
  const json = JSON.parse(JSON.stringify(await encodeValue(rec, addBin)));
  assert.equal(bins.size, 3, 'blob, big vector, file; small vector inline');
  const back = await decodeValue(json, async (name, type) => bins.get(name).slice(0, undefined, type));
  assert.equal(await back.blob.text(), 'video bytes');
  assert.equal(back.blob.type, 'video/mp4');
  assert.deepEqual([...back.vec], [1.5, -2, 3]);
  assert.ok(back.vec instanceof Float32Array);
  assert.equal(back.bigvec.length, 10000);
  assert.equal(back.bigvec[9999], 0.25);
  assert.equal(back.when.getTime(), 5000);
  assert.ok(Number.isNaN(back.n[0]) && back.n[1] === Infinity && back.n[2] === 3);
  assert.equal(back.nested.$, 'x');
  assert.deepEqual(back.nested.list, [null, undefined, 'a']);
  assert.equal(back.file.name, 'f.txt');
  assert.ok(sizeOfValue(rec) > 40000);
});

test('the schema matches the databases the app opens', () => {
  assert.equal(FORMAT, 'promo-studio-everything');
  assert.deepEqual(Object.keys(SCHEMA), ['pvm-media', 'pvm-projects', 'pvm-sounds', 'pvm-ai-search']);
});
