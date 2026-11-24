// Media opened when used: light records, opening on demand, letting go, the eager fallback and the Clean up choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightOf, lightUsable, recordFromLight, pickRelease, unusedMedia, storageBreakdown, biggestFiles, fmtBytes, thumbSize, LIGHT_V } from '../js/medialight.js';
import { photosToIndex, hasFile } from '../js/ai/clipsearch.js';
import { mediaDB } from '../js/state.js';
import { media, restoreMedia, ensureLoaded, ensureMany, releaseMedia, releaseUnused, blobOf, idsIn, removeFiles, clearMedia, loadedCount } from '../js/media.js';

// ---------------------------------------------------------------- a fake browser: media elements that "load" at once
if (typeof navigator === 'undefined') globalThis.navigator = {};
const made = [];
globalThis.document = {
  createElement(tag) {
    const el = {
      tag,
      duration: 12,
      videoWidth: tag === 'video' ? 640 : 0,
      videoHeight: tag === 'video' ? 360 : 0,
      pause() {},
      removeAttribute(k) {
        if (k === 'src') this._src = '';
      },
      load() {},
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => 'data:image/webp;base64,AAAA',
      set currentTime(t) {
        setTimeout(() => this.onseeked && this.onseeked(), 0);
      },
      set src(v) {
        this._src = v;
        if (v)
          setTimeout(() => {
            if (this.failNext) return this.onerror && this.onerror();
            if (this.onloadedmetadata) this.onloadedmetadata();
            if (this.onloadeddata) this.onloadeddata();
          }, 0);
      },
      get src() {
        return this._src;
      },
    };
    made.push(el);
    return el;
  },
};
globalThis.Image = class {
  set src(v) {
    this._src = v;
    this.naturalWidth = 1200;
    this.naturalHeight = 800;
    setTimeout(() => this.onload && this.onload(), 0);
  }
};

// ---------------------------------------------------------------- an in-memory IndexedDB for mediaDB
const files = new Map();
const metas = new Map();
let reads = 0;
Object.assign(mediaDB, {
  put: async (rec, meta) => {
    files.set(rec.id, rec);
    if (meta) metas.set(meta.id, meta);
  },
  putMeta: async (m) => void metas.set(m.id, m),
  get: async (id) => (reads++, files.get(id)),
  keys: async () => [...files.keys()],
  metas: async () => [...metas.values()],
  delete: async (id) => (files.delete(id), metas.delete(id)),
  deleteMeta: async (id) => void metas.delete(id),
  all: async () => (reads += files.size, [...files.values()]),
  clear: async () => (files.clear(), metas.clear()),
});

const blob = (n, type) => new Blob([new Uint8Array(n)], { type });
const peaks = { v: 1, peaks: [0.1, 0.2], peaksPerSec: 50, envelope: [0.1], envRate: 100, duration: 30, thumb: null };
function storeFile(id, kind, { light = true, size = 1000 } = {}) {
  const type = kind === 'video' ? 'video/webm' : kind === 'image' ? 'image/png' : 'audio/wav';
  files.set(id, { id, name: `${id}.${kind}`, kind, blob: blob(size, type), source: 'upload', attribution: null, path: '', analysis: kind === 'audio' ? peaks : null });
  if (light) metas.set(id, { v: LIGHT_V, id, name: `${id}.${kind}`, kind, size, type, duration: kind === 'image' ? -1 : 30, width: kind === 'audio' ? 0 : 640, height: kind === 'audio' ? 0 : 360, thumb: kind === 'audio' ? null : 'data:image/webp;base64,AAAA', analysis: kind === 'audio' ? peaks : null, path: '', at: 1 });
}
const reset = () => {
  clearMedia();
  files.clear();
  metas.clear();
  reads = 0;
};
const tick = () => new Promise((r) => setTimeout(r, 40));

// ---------------------------------------------------------------- pure parts
test('light record: round trip keeps what lists need, drops the file', () => {
  const rec = { id: 'm_aaaaaa1', name: 'a.mp4', kind: 'video', blob: blob(5000, 'video/mp4'), duration: 12.5, width: 1920, height: 1080, thumb: 'data:image/jpeg;base64,x', source: 'upload' };
  const m = lightOf(rec, { v: 1, thumb: rec.thumb });
  assert.equal(m.size, 5000);
  assert.equal(m.type, 'video/mp4');
  assert.ok(!('blob' in m) && !('url' in m));
  assert.ok(lightUsable(m));
  const back = recordFromLight(m);
  assert.equal(back.loaded, false);
  assert.equal(back.blob, null);
  assert.equal(back.duration, 12.5);
  assert.equal(back.width, 1920);
});

test('light record: a photo keeps an endless length and needs a real thumbnail; audio needs its waveform', () => {
  const img = lightOf({ id: 'm_bbbbbb1', name: 'p.png', kind: 'image', blob: blob(10, 'image/png'), duration: Infinity, width: 10, height: 10, thumb: 'data:image/webp;base64,x' });
  assert.equal(img.duration, -1);
  assert.equal(recordFromLight(img).duration, Infinity);
  assert.ok(lightUsable(img));
  assert.ok(!lightUsable({ ...img, thumb: 'blob:http://x/1' }), 'an object URL does not survive a reload');
  const au = lightOf({ id: 'm_cccccc1', name: 's.wav', kind: 'audio', blob: blob(10, 'audio/wav'), duration: 30 }, null);
  assert.ok(!lightUsable(au), 'no waveform: read the old way once');
  assert.ok(lightUsable({ ...au, analysis: peaks }));
  assert.ok(!lightUsable({ ...au, analysis: peaks, kind: 'tab' }), 'tabs are always parsed');
  assert.ok(!lightUsable({ ...au, analysis: peaks, v: 0 }), 'another version is read the old way');
});

test('pickRelease: only open lazy files not kept, not held and not used since', () => {
  const recs = [
    { id: 'a', kind: 'video', loaded: true, blob: 1, lastUse: 10 },
    { id: 'b', kind: 'video', loaded: true, blob: 1, lastUse: 500 },
    { id: 'c', kind: 'image', loaded: true, blob: 1, lastUse: 10 },
    { id: 'd', kind: 'audio', loaded: false, blob: null, lastUse: 0 },
    { id: 'e', kind: 'tab', loaded: true, blob: 1, lastUse: 0 },
    { id: 'f', kind: 'audio', loaded: true, blob: 1, lastUse: 0, holds: 1 },
  ];
  assert.deepEqual(pickRelease(recs, { keep: new Set(['c']), before: 100 }), ['a']);
});

test('clean up: unused files biggest first; breakdown and biggest files', () => {
  const recs = [
    { id: 'a', name: 'a', kind: 'video', size: 300 },
    { id: 'b', name: 'b', kind: 'image', size: 50 },
    { id: 'c', name: 'c', kind: 'audio', size: 900 },
    { id: 'd', name: 'd', kind: 'font', size: 5 },
  ];
  assert.deepEqual(unusedMedia(recs, new Set(['c'])).map((f) => f.id), ['a', 'b', 'd']);
  const g = storageBreakdown(recs, { models: 100, projects: 20, usage: 2000 });
  assert.deepEqual([g.video, g.audio, g.photos, g.models, g.projects], [300, 900, 50, 100, 20]);
  assert.equal(g.other, 2000 - (300 + 900 + 50 + 100 + 20 + 5) + 5);
  assert.deepEqual(biggestFiles(recs, 2).map((f) => f.id), ['c', 'a']);
  assert.equal(fmtBytes(0), '0 MB');
  assert.equal(fmtBytes(5 * 1048576), '5 MB');
  assert.equal(fmtBytes(3 * 1073741824), '3.0 GB');
  assert.deepEqual(thumbSize(4000, 3000), { w: 480, h: 360 });
  assert.deepEqual(thumbSize(100, 50), { w: 100, h: 50 }, 'never upscaled');
});

test('smart photo search: a photo that is stored but not open still gets looked at', () => {
  assert.ok(hasFile({ loaded: false }));
  assert.ok(!hasFile({}));
  assert.deepEqual(photosToIndex([{ id: 'a', loaded: false }, { id: 'b' }, { id: 'c', blob: 1 }], () => false).map((r) => r.id), ['a', 'c']);
});

// ---------------------------------------------------------------- the library
test('start-up reads light records only; a file opens when used and is let go again', async () => {
  reset();
  for (let i = 0; i < 20; i++) storeFile(`m_lazy${String(i).padStart(3, '0')}`, ['video', 'image', 'audio'][i % 3]);
  await restoreMedia();
  assert.equal(media.all().length, 20);
  assert.equal(reads, 0, 'no file was read at start-up');
  assert.deepEqual(loadedCount(), { total: 20, loaded: 0 });
  const v = media.peek('m_lazy000');
  assert.equal(v.loaded, false);
  assert.equal(v.duration, 30);
  assert.ok(media.has('m_lazy000'), 'not open is not missing');
  // get() opens in the background; ensureLoaded resolves the open record
  media.get('m_lazy000');
  const r = await ensureLoaded('m_lazy000');
  assert.equal(r, v, 'same record object');
  assert.equal(r.loaded, true);
  assert.ok(r.url && r.blob && r.el);
  assert.equal(reads, 1);
  // two callers at once read the file once
  await Promise.all([ensureLoaded('m_lazy003'), ensureLoaded('m_lazy003')]);
  assert.equal(reads, 2);
  // release lets go of the element, address and data, and keeps the light fields
  assert.ok(releaseMedia('m_lazy000'));
  assert.equal(r.loaded, false);
  assert.equal(r.url, null);
  assert.equal(r.blob, null);
  assert.equal(r.duration, 12, 'the length the opened file reported is kept');
  assert.ok(media.has('m_lazy000'));
});

test('releaseUnused keeps the open edit\'s files and what the screen used since', async () => {
  reset();
  ['m_keep001', 'm_keep002', 'm_keep003'].forEach((id) => storeFile(id, 'video'));
  await restoreMedia();
  await ensureMany(['m_keep001', 'm_keep002', 'm_keep003']);
  const since = performance.now();
  await tick();
  media.get('m_keep003'); // the screen in front used it after the change
  const n = releaseUnused(idsIn({ clips: [{ mediaId: 'm_keep001' }] }), since);
  assert.equal(n, 1);
  assert.equal(media.isLoaded('m_keep001'), true);
  assert.equal(media.isLoaded('m_keep002'), false);
  assert.equal(media.isLoaded('m_keep003'), true);
});

test('old saves (no light record) load the old way and get a light record for next time', async () => {
  reset();
  storeFile('m_old0001', 'video', { light: false });
  storeFile('m_old0002', 'audio', { light: false });
  await restoreMedia();
  assert.equal(media.isLoaded('m_old0001'), true, 'read and opened as before');
  assert.equal(media.isLoaded('m_old0002'), true);
  await new Promise((r) => setTimeout(r, 300)); // background back-fill
  assert.ok(metas.has('m_old0001') && metas.has('m_old0002'));
  assert.equal(metas.get('m_old0001').size, 1000);
  assert.ok(lightUsable(metas.get('m_old0002')), 'the song is light next visit');
});

test('a light record whose file is gone is missing (Replace missing files can find it); a stray light record is dropped', async () => {
  reset();
  storeFile('m_gone001', 'image');
  metas.set('m_stray01', { ...metas.get('m_gone001'), id: 'm_stray01' });
  await restoreMedia();
  assert.ok(!media.has('m_stray01'));
  assert.ok(!metas.has('m_stray01'));
  files.delete('m_gone001'); // the browser dropped the file after start-up
  assert.equal(await ensureLoaded('m_gone001'), null);
  assert.ok(!media.has('m_gone001'));
});

test('when the light records cannot be read, every file is read (the old path)', async () => {
  reset();
  storeFile('m_fall001', 'video');
  const metasFn = mediaDB.metas;
  mediaDB.metas = async () => {
    throw new Error('no meta store');
  };
  try {
    await restoreMedia();
  } finally {
    mediaDB.metas = metasFn;
  }
  assert.equal(media.isLoaded('m_fall001'), true);
});

test('a file that will not open from its light record falls back to the full read and analysis', async () => {
  reset();
  storeFile('m_fbak001', 'video');
  await restoreMedia();
  let calls = 0;
  const orig = document.createElement;
  document.createElement = (tag) => {
    const el = orig(tag);
    if (++calls === 1) el.failNext = true; // the first element errors, the fallback's works
    return el;
  };
  try {
    const r = await ensureLoaded('m_fbak001');
    assert.ok(r && r.loaded !== false && r.url);
    assert.ok(media.has('m_fbak001'));
  } finally {
    document.createElement = orig;
  }
});

test('blobOf reads a file without keeping it open; removeFiles deletes and undo puts them back', async () => {
  reset();
  storeFile('m_blob001', 'audio');
  storeFile('m_del0001', 'image');
  await restoreMedia();
  const b = await blobOf('m_blob001');
  assert.equal(b.size, 1000);
  assert.equal(media.isLoaded('m_blob001'), false);
  const undo = await removeFiles(['m_del0001'], { undoMs: 60 });
  assert.ok(!media.has('m_del0001'), 'gone from the library at once');
  assert.ok(files.has('m_del0001'), 'the stored file waits for the undo time');
  assert.equal(await undo(), 1);
  assert.ok(media.has('m_del0001'));
  await tick();
  await tick();
  assert.ok(files.has('m_del0001') && metas.has('m_del0001'), 'undone: never deleted');
  const undo2 = await removeFiles(['m_del0001'], { undoMs: 30 });
  await tick();
  assert.ok(!files.has('m_del0001') && !metas.has('m_del0001'), 'deleted for good after the undo time');
  assert.equal(await undo2(), 0);
  assert.ok(!media.has('m_del0001'));
});
