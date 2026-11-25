// The Mac app (electron/): serving app://promo-studio (paths, Range), linked files (path checks, reads), the URL
// policy, the link-in-place choice, the shared pass-throughs, and reading MP4s in pieces for linked footage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkDecision, LINK_MIN_BYTES, holdForExport, isDesktop } from '../js/desktop.js';
import { readMp4Index, fillSamples, blobReader } from '../js/framesource.js';
import { apiRoute, TYPES } from '../server-api.js';

const require = createRequire(import.meta.url);
const { appFile, parseRange, fileResponse, mediaType, ORIGIN, CSP, BASE_HEADERS } = require('../electron/serve.cjs');
const { createLinks, checkLinkPath, validId } = require('../electron/links.cjs');
const { externalAllowed, fromApp, CAPABILITIES, NATIVE_TOOLS } = require('../electron/policy.cjs');

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('app files: only inside the app folder, never dot folders, node_modules or the Electron code', () => {
  assert.equal(appFile(ROOT, '/'), join(ROOT, 'index.html'));
  assert.equal(appFile(ROOT, '/js/app.js'), join(ROOT, 'js', 'app.js'));
  assert.equal(appFile(ROOT, '/vendor/mp4box/mp4box.all.mjs'), join(ROOT, 'vendor', 'mp4box', 'mp4box.all.mjs'));
  for (const bad of ['/../package.json', '/..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/etc/passwd', '/.git/config', '/node_modules/electron/package.json', '/electron/main.cjs', '/js/%00x', '/%E0%A4%A']) assert.equal(appFile(ROOT, bad), null, bad);
});

test('Range requests: one byte range, suffix ranges, 416 for out of range', () => {
  assert.equal(parseRange(null, 100), null);
  assert.equal(parseRange('items=0-1', 100), null);
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=50-500', 100), { start: 50, end: 99 });
  assert.equal(parseRange('bytes=100-', 100), 'bad');
  assert.equal(parseRange('bytes=9-2', 100), 'bad');
  assert.equal(parseRange('bytes=-', 100), 'bad');
});

test('file responses carry the type, the CSP and isolation headers, and answer Range with 206', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvm-serve-'));
  const f = join(dir, 'a.wasm');
  writeFileSync(f, Buffer.from('0123456789'));
  const full = await fileResponse(f, { type: TYPES['.wasm'] });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'application/wasm');
  assert.equal(full.headers.get('content-length'), '10');
  assert.equal(full.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(full.headers.get('cross-origin-embedder-policy'), 'credentialless');
  assert.equal(full.headers.get('content-security-policy'), CSP);
  assert.equal(await full.text(), '0123456789');
  const part = await fileResponse(f, { type: 'x', range: 'bytes=2-4' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-4/10');
  assert.equal(await part.text(), '234');
  assert.equal((await fileResponse(f, { type: 'x', range: 'bytes=20-' })).status, 416);
  assert.equal(mediaType('/x/Clip.MOV'), 'video/quicktime');
  rmSync(dir, { recursive: true });
});

test('the CSP keeps scripts to the app itself (no inline or remote scripts but Deezer search)', () => {
  const script = CSP.split('; ').find((d) => d.startsWith('script-src'));
  assert.ok(!script.includes("'unsafe-inline'") && !/\shttps:(\s|$)/.test(script), script);
  assert.match(CSP, /object-src 'none'/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.equal(BASE_HEADERS['X-Content-Type-Options'], 'nosniff');
});

test('linked files: paths are checked in main, the page sees ids and names only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvm-links-'));
  const cfg = join(dir, 'cfg');
  const clip = join(dir, 'Gig Night.mov');
  writeFileSync(clip, Buffer.from('ftypqt  0123456789'));
  mkdirSync(join(dir, 'folder.mp4'));
  writeFileSync(join(dir, 'notes.txt'), 'x');
  const links = createLinks({ configDir: cfg });
  await assert.rejects(links.add('m_1', 'relative/clip.mp4'), /absolute/);
  await assert.rejects(links.add('m_1', join(dir, 'notes.txt')), /media file/);
  await assert.rejects(links.add('m_1', join(dir, 'folder.mp4')), /Not a file/);
  await assert.rejects(links.add('m_1', join(dir, 'nope.mp4')), /ENOENT/);
  await assert.rejects(links.add('../x', clip), /media id/);
  await assert.rejects(links.add('m_1', `${clip}\0.mp4`), /absolute/);
  assert.deepEqual(await links.add('m_1', clip), { id: 'm_1', name: 'Gig Night.mov', size: 18, ext: '.mov' });
  const st = await links.stat('m_1');
  assert.equal(st.exists, true);
  assert.equal(st.path, undefined, 'the page never gets the path');
  assert.equal(new TextDecoder().decode(await links.read('m_1', 0, 4)), 'ftyp');
  assert.equal((await links.read('m_1', 10, 100)).length, 8, 'short at the end');
  await assert.rejects(links.read('m_1', -1, 4), /Bad range/);
  await assert.rejects(links.read('m_1', 0, 65 * 1024 * 1024), /Bad range/);
  // kept across restarts (a new instance reads links.json)
  const again = createLinks({ configDir: cfg });
  assert.equal(await again.pathOf('m_1'), clip);
  assert.deepEqual(await again.totals(), { count: 1, bytes: 18 });
  // a moved file is missing, not an error
  rmSync(clip);
  assert.equal(await again.pathOf('m_1'), null);
  assert.equal((await again.stat('m_1')).exists, false);
  await assert.rejects(again.read('m_1', 0, 4), /missing/);
  assert.equal(await again.remove('m_1'), true);
  assert.deepEqual(await again.stat('m_1'), { linked: false, exists: false });
  assert.ok(validId('m_mwvnm0nqjge3l') && !validId('a/b') && !validId(''));
  // a symlink is followed: its target must be a media file
  writeFileSync(join(dir, 'real.mp4'), 'x');
  symlinkSync(join(dir, 'real.mp4'), join(dir, 'alias.mp4'));
  assert.equal((await checkLinkPath(join(dir, 'alias.mp4'))).size, 1);
  rmSync(dir, { recursive: true });
});

test('only web, mail and phone links open outside the app; app pages are app://promo-studio', () => {
  for (const u of ['https://open.spotify.com/x', 'http://example.com', 'mailto:a@b.c', 'tel:+15555550100']) assert.ok(externalAllowed(u), u);
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'blob:app://promo-studio/x', 'smb://host/share', 'https://user:pw@example.com', 'vscode://x', '', null]) assert.ok(!externalAllowed(u), String(u));
  assert.ok(fromApp(`${ORIGIN}/index.html`));
  assert.ok(!fromApp('app://other/index.html') && !fromApp('https://promo-studio/') && !fromApp('nonsense'));
  assert.ok(CAPABILITIES.includes('media.link') && !CAPABILITIES.includes('files.saveStream'));
  assert.deepEqual(NATIVE_TOOLS, []);
});

test('link in place: only big videos that are files on disk, in the Mac app, unless the choice says otherwise', async () => {
  const big = LINK_MIN_BYTES;
  assert.equal(linkDecision({ kind: 'video', size: big, onDisk: true, desktopApp: true }), 'link');
  assert.equal(linkDecision({ kind: 'video', size: big - 1, onDisk: true, desktopApp: true }), 'copy');
  assert.equal(linkDecision({ kind: 'video', size: big, onDisk: false, desktopApp: true }), 'copy');
  assert.equal(linkDecision({ kind: 'audio', size: big, onDisk: true, desktopApp: true }), 'copy');
  assert.equal(linkDecision({ kind: 'video', size: big, onDisk: true, desktopApp: false }), 'copy', 'the web build never links');
  assert.equal(linkDecision({ kind: 'video', size: 10, onDisk: true, desktopApp: true, choice: 'ask' }), 'ask');
  assert.equal(linkDecision({ kind: 'video', size: big, onDisk: true, desktopApp: true, choice: 'never' }), 'copy');
  // no bridge here: a no-op hold
  assert.equal(isDesktop, false);
  const release = await holdForExport(true);
  assert.equal(typeof release, 'function');
  release();
});

test('pass-throughs are shared: other paths are not routes, and only this app may use them', async () => {
  const url = (p) => new URL(p, 'http://x');
  assert.equal(apiRoute({ method: 'GET', url: url('/index.html'), headers: {}, sameApp: true }), null);
  assert.equal((await apiRoute({ method: 'GET', url: url('/api/setlistfm/search/setlists'), headers: { 'x-setlistfm-key': 'abcdef12-3456' }, sameApp: false })).status, 403);
  assert.equal((await apiRoute({ method: 'GET', url: url('/api/setlistfm/search/setlists'), headers: {}, sameApp: true })).status, 401);
  assert.equal((await apiRoute({ method: 'POST', url: url('/api/openai/chat'), headers: {}, sameApp: false })).status, 403);
  assert.equal((await apiRoute({ method: 'GET', url: url('/api/openai/chat'), headers: {}, sameApp: true })).status, 405);
});

// ---- reading MP4s in pieces (linked footage is never read whole)
const fileReader = (path) => {
  const buf = readFileSync(path);
  const reads = [];
  return { reads, size: buf.length, read: async (s, e) => (reads.push([s, e]), new Uint8Array(buf.subarray(s, Math.min(e, buf.length)))) };
};

for (const name of ['h264-moov-at-end.mp4', 'h264-faststart.mp4']) {
  test(`MP4 index and frame bytes read in pieces match mp4box's own extraction (${name})`, async () => {
    const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
    const mp4box = await import('../vendor/mp4box/mp4box.all.mjs');
    const reader = fileReader(path);
    const idx = await readMp4Index(reader, mp4box);
    assert.ok(idx && idx.info.videoTracks.length === 1);
    const trak = idx.file.getTrackById(idx.info.videoTracks[0].id);
    const order = trak.samples.map((x) => ({ offset: x.offset, size: x.size, data: null }));
    assert.equal(order.length, 90);
    for (let i = 0; i < order.length; i++) await fillSamples(order, i, reader);
    // the reference: the whole file at once, with mp4box extracting the samples itself
    const whole = readFileSync(path);
    const ref = mp4box.createFile();
    const got = [];
    ref.onReady = (info) => {
      ref.setExtractionOptions(info.videoTracks[0].id, null, { nbSamples: Infinity });
      ref.start();
    };
    ref.onSamples = (_id, _u, list) => got.push(...list.map((s) => new Uint8Array(s.data)));
    ref.appendBuffer(mp4box.MP4BoxBuffer.fromArrayBuffer(whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.length), 0), true);
    ref.flush();
    assert.equal(got.length, 90);
    for (let i = 0; i < 90; i++) assert.deepEqual(order[i].data, got[i], `sample ${i}`);
    // frames come in a few big reads, not one per frame, and nothing read is larger than the batch
    assert.ok(reader.reads.length < 20, `${reader.reads.length} reads`);
    assert.ok(reader.reads.every(([s, e]) => e - s <= 8 * 1024 * 1024));
  });
}

test('a Blob reads in pieces the same way', async () => {
  const b = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
  const r = blobReader(b);
  assert.equal(r.size, 5);
  assert.deepEqual([...(await r.read(1, 3))], [2, 3]);
});

test('a linked file keeps its "linked" mark in its light record, so it opens from disk after a restart', async () => {
  const { lightOf, recordFromLight, lightUsable, pickRelease } = await import('../js/medialight.js');
  const meta = lightOf({ id: 'm_1', name: 'gig.mov', kind: 'video', linked: true, size: 5e9, duration: 60, width: 3840, height: 2160, thumb: 'data:image/jpeg;base64,x' });
  assert.equal(meta.linked, true);
  assert.ok(lightUsable(meta));
  const rec = recordFromLight(meta);
  assert.equal(rec.linked, true);
  assert.equal(rec.blob, null);
  assert.equal('linked' in recordFromLight(lightOf({ id: 'm_2', name: 'a.mp4', kind: 'video', size: 1, duration: 1, width: 1, height: 1, thumb: null })), false, 'uploads are unchanged');
  // an open linked file (no Blob, only its element) can be let go of like any other
  assert.deepEqual(pickRelease([{ ...rec, loaded: true }], { before: 1 }), ['m_1']);
});
