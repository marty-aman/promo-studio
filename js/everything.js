// "Export everything" and "Import everything": the whole library of this browser (every pvm.* localStorage key and the
// four IndexedDB databases) as ONE zip, to move it into the Mac app. No AI model caches (they download again).
//
// Zip layout (stored, not compressed; see zipstream.js):
//   localStorage.json                         { key: string } for every pvm.* key
//   idb/<db>/<store>/part-000001.json         records: one JSON line each { k: key, v: value } (codec: everything-codec.js)
//   idb/<db>/<store>/bin/000001 ...           every Blob and big typed array of the records, raw
//   manifest.json                             LAST: format, app version, counts, and size + sha256 of every other file
import { ZipWriter, openZip, hashBlob, Sha256, bytesOf, cancelled } from './zipstream.js';
import { encodeValue, decodeValue, sizeOfValue } from './everything-codec.js';
import { desktop, isDesktop, LINK_MIN_BYTES } from './desktop.js';

export const FORMAT = 'promo-studio-everything';
export const FORMAT_VERSION = 1;
const PART_CHARS = 4 * 1024 * 1024;
const PAGE = 25;
const SAMPLE = 1024 * 1024;
/** Device settings that stay as they are on this machine. */
export const KEEP_KEYS = ['pvm.desktopLink.v1', 'pvm.welcomeDesktop.v1'];

/** The databases, as the app itself creates them (same versions and stores). */
export const SCHEMA = {
  'pvm-media': { version: 2, stores: { media: 'id', meta: 'id' } },
  'pvm-projects': { version: 1, stores: { projects: 'id', versions: 'key' } },
  'pvm-sounds': { version: 1, stores: { sounds: 'id' } },
  'pvm-ai-search': { version: 2, stores: { frames: 'id', meta: 'id', photos: 'id' } },
};

// ---------------------------------------------------------------- IndexedDB helpers
function openDb(name) {
  const s = SCHEMA[name];
  const create = (d) => {
    for (const [st, kp] of Object.entries(s.stores)) if (!d.objectStoreNames.contains(st)) d.createObjectStore(st, { keyPath: kp });
  };
  const open = (version) =>
    new Promise((resolve, reject) => {
      const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
      req.onupgradeneeded = () => create(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close the app’s other tabs, then try again.'));
    });
  return open(s.version).catch((e) => (e && e.name === 'VersionError' ? open() : Promise.reject(e))); // a newer app version made it: use it as it is
}

const run = (db, stores, mode, fn) =>
  new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const reqs = fn(...stores.map((n) => t.objectStore(n)));
    t.oncomplete = () => resolve(Array.isArray(reqs) ? reqs.map((r) => r && r.result) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(new Error(`${t.error ? t.error.name + ': ' + t.error.message : 'The browser could not store the data (is it full?)'}`));
  });

/** Pages of [key, value] pairs of one store, PAGE records at a time (a Blob in a record is a handle, not read). */
async function* pagesOf(db, store) {
  let last;
  for (;;) {
    const range = last === undefined ? undefined : IDBKeyRange.lowerBound(last, true);
    const [keys, vals] = await run(db, [store], 'readonly', (s) => [s.getAllKeys(range, PAGE), s.getAll(range, PAGE)]);
    if (!keys.length) return;
    yield keys.map((k, i) => [k, vals[i]]);
    last = keys[keys.length - 1];
    if (keys.length < PAGE) return;
  }
}

export const localKeys = () => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('pvm.')) out.push(k);
  }
  return out.sort();
};

/** What is stored here: { local: { count }, dbs: { name: { store: { count, bytes } } }, bytes, mediaCount, mediaBytes }. Reads no file bytes. */
export async function inventory() {
  const inv = { local: { count: localKeys().length }, dbs: {}, bytes: 0, mediaCount: 0, mediaBytes: 0 };
  for (const [name, s] of Object.entries(SCHEMA)) {
    const db = await openDb(name);
    inv.dbs[name] = {};
    for (const st of Object.keys(s.stores)) {
      let count = 0;
      let bytes = 0;
      for await (const page of pagesOf(db, st)) for (const [k, v] of page) (count++, (bytes += sizeOfValue(v)));
      inv.dbs[name][st] = { count, bytes };
      inv.bytes += bytes;
      if (name === 'pvm-media' && st === 'media') (inv.mediaCount = count), (inv.mediaBytes = bytes);
    }
    db.close();
  }
  for (const k of localKeys()) inv.bytes += (localStorage.getItem(k) || '').length * 2;
  return inv;
}

// ---------------------------------------------------------------- export
async function sampleOf(blob) {
  const sha = new Sha256();
  const head = blob.slice(0, SAMPLE);
  const tail = blob.slice(Math.max(SAMPLE, blob.size - SAMPLE));
  for (const b of [head, tail]) sha.update(new Uint8Array(await b.arrayBuffer()));
  return sha.hex();
}

/**
 * Write everything into `sink` (zipstream.js sinks). onProgress({ done, total, label }) in bytes; `total` is
 * inventory().bytes. signal: AbortSignal. Resolves { manifest, size }.
 */
export async function exportEverything({ sink, onProgress = () => {}, signal, total = 0, force64 = false, version = 'web' }) {
  const zip = new ZipWriter(sink, { force64 });
  const files = [];
  let done = 0;
  let label = 'Starting';
  const tick = (n) => {
    done += n;
    onProgress({ done: Math.min(done, total || done), total, label });
  };
  const add = async (name, data, extra = {}) => {
    const h = await zip.add(name, data, { onBytes: tick, signal });
    files.push({ name, size: h.size, sha256: h.sha256, ...extra });
    return h;
  };
  const json = (o) => bytesOf(JSON.stringify(o));
  label = 'Settings';
  const local = {};
  for (const k of localKeys()) local[k] = localStorage.getItem(k);
  await add('localStorage.json', json(local));
  const manifest = { format: FORMAT, version: FORMAT_VERSION, createdAt: new Date().toISOString(), app: { name: 'Promo Studio', version, platform: isDesktop ? 'desktop' : 'web' }, localStorage: { count: Object.keys(local).length }, dbs: {}, counts: { media: 0, mediaBytes: 0, linked: 0 } };
  for (const [name, s] of Object.entries(SCHEMA)) {
    const db = await openDb(name);
    manifest.dbs[name] = { version: db.version, stores: {} };
    for (const st of Object.keys(s.stores)) {
      label = `${name} / ${st}`;
      const base = `idb/${name}/${st}`;
      let nBin = 0;
      let nPart = 0;
      let count = 0;
      let lines = [];
      let chars = 0;
      const parts = [];
      const flush = async () => {
        if (!lines.length) return;
        const pn = `${base}/part-${String(++nPart).padStart(6, '0')}.json`;
        parts.push(pn);
        await add(pn, bytesOf(lines.join('\n')));
        lines = [];
        chars = 0;
      };
      const addBin = async (x) => {
        const bn = `${base}/bin/${String(++nBin).padStart(6, '0')}`;
        await add(bn, x, x.size >= LINK_MIN_BYTES ? { sample: await sampleOf(x) } : {});
        return bn;
      };
      for await (const page of pagesOf(db, st)) {
        for (const [k, v] of page) {
          if (signal && signal.aborted) throw cancelled();
          const line = JSON.stringify({ k: await encodeValue(k, addBin), v: await encodeValue(v, addBin) });
          lines.push(line);
          chars += line.length;
          count++;
          if (name === 'pvm-media' && st === 'media') {
            manifest.counts.media++;
            manifest.counts.mediaBytes += v && v.blob ? v.blob.size : 0;
            if (v && v.linked) manifest.counts.linked++;
          }
          if (chars > PART_CHARS) await flush();
        }
      }
      await flush();
      manifest.dbs[name].stores[st] = { keyPath: s.stores[st], count, parts };
    }
    db.close();
  }
  manifest.files = files;
  await zip.add('manifest.json', json(manifest), { signal });
  const size = await zip.finish();
  return { manifest, size };
}

// ---------------------------------------------------------------- reading a bundle
/** Open a zip (File/Blob) made by exportEverything: { file, entries, manifest }. Throws a readable error otherwise. */
export async function openBundle(file) {
  const entries = await openZip(file);
  const m = entries.get('manifest.json');
  if (!m) throw new Error('This zip has no manifest.json: it was not made by “Export everything”.');
  let manifest;
  try {
    manifest = JSON.parse(await m.text());
  } catch {
    throw new Error('The manifest in this zip is damaged.');
  }
  if (manifest.format !== FORMAT) throw new Error('This zip was not made by “Export everything”.');
  if (manifest.version > FORMAT_VERSION) throw new Error('This zip was made by a newer Promo Studio. Update the app first.');
  const missing = manifest.files.filter((f) => !entries.has(f.name) || entries.get(f.name).size !== f.size);
  if (missing.length) throw new Error(`The zip is incomplete (${missing.length} file${missing.length === 1 ? ' is' : 's are'} missing or cut short, such as ${missing[0].name}). Was the download finished?`);
  return { file, entries, manifest };
}

/** Check every file's sha256 against the manifest. Resolves the list of files that do not match (empty = fine). */
export async function verifyBundle(bundle, { onProgress = () => {}, signal } = {}) {
  const total = bundle.manifest.files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  const bad = [];
  for (const f of bundle.manifest.files) {
    const blob = await bundle.entries.get(f.name).slice();
    const h = await hashBlob(blob, { signal, onBytes: (n) => onProgress({ done: (done += n), total, label: f.name }) });
    if (h.sha256 !== f.sha256) bad.push(f.name);
  }
  return bad;
}

async function* recordsOf(bundle, db, store) {
  const info = bundle.manifest.dbs[db] && bundle.manifest.dbs[db].stores[store];
  if (!info) return;
  const getBin = (name, type) => bundle.entries.get(name).slice(type);
  for (const part of info.parts) {
    const text = await bundle.entries.get(part).text();
    for (const line of text.split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      yield [await decodeValue(r.k, getBin), await decodeValue(r.v, getBin)];
    }
  }
}

/** Videos in the bundle big enough to link in place: [{ id, name, size, sample }]. Desktop app only; else []. */
export async function bigVideos(bundle) {
  if (!isDesktop) return [];
  const out = [];
  const info = bundle.manifest.dbs['pvm-media'] && bundle.manifest.dbs['pvm-media'].stores.media;
  if (!info) return out;
  for (const part of info.parts) {
    for (const line of (await bundle.entries.get(part).text()).split('\n')) {
      if (!line) continue;
      const v = JSON.parse(line).v;
      const b = v && v.blob && v.blob.$ === 'blob' ? v.blob : null;
      const f = b && bundle.manifest.files.find((x) => x.name === b.e);
      if (v && v.kind === 'video' && f && f.size >= LINK_MIN_BYTES) out.push({ id: v.id, name: v.name, size: f.size, sample: f.sample || '' });
    }
  }
  return out;
}

/**
 * Link `picked` ({ token, name, size } from desktop.media.pick) as media `big.id` and check its first and last
 * megabyte against the bundle. Resolves true when linked; false (and the link undone) when it is another file.
 */
export async function linkBig(big, picked) {
  if (!desktop || picked.size !== big.size) return false;
  try {
    await desktop.media.link(big.id, { token: picked.token });
    if (big.sample) {
      const sha = new Sha256();
      const head = await desktop.media.read(big.id, 0, Math.min(SAMPLE, big.size));
      const tail = await desktop.media.read(big.id, Math.max(SAMPLE, big.size - SAMPLE), big.size);
      sha.update(head);
      sha.update(tail);
      if (sha.hex() !== big.sample) throw new Error('different file');
    }
    return true;
  } catch {
    await desktop.media.unlink(big.id).catch(() => {});
    return false;
  }
}

// ---------------------------------------------------------------- restore
/**
 * Replace this browser's library with the bundle: the four databases first, then the settings (which the caller
 * follows with a reload). `linked` is a Set of media ids already linked with linkBig() (`skipBytes`: their size): their records
 * are stored as linked records without the bytes. onProgress({ done, total, label }) in zip bytes.
 */
export async function restoreBundle(bundle, { linked = new Set(), skipBytes = 0, onProgress = () => {}, signal } = {}) {
  const total = Math.max(1, bundle.manifest.files.reduce((n, f) => n + f.size, 0) - skipBytes);
  let done = 0;
  const fileSize = (name) => (bundle.entries.get(name) || { size: 0 }).size;
  const seen = new Set();
  const countBlobs = (v) => {
    // credit progress for the blob parts a record points at (when they are written)
    if (!v || typeof v !== 'object') return 0;
    if (v.blob && v.blob instanceof Blob) return v.blob.size;
    return 0;
  };
  if (isDesktop) {
    // links the replaced library held end here (the files stay where they are)
    const old = await openDb('pvm-media');
    for await (const page of pagesOf(old, 'media')) for (const [, v] of page) if (v && v.linked && !linked.has(v.id)) await desktop.media.unlink(v.id).catch(() => {});
    old.close();
  }
  for (const [name, s] of Object.entries(SCHEMA)) {
    const db = await openDb(name);
    for (const st of Object.keys(s.stores)) {
      if (signal && signal.aborted) throw cancelled();
      await run(db, [st], 'readwrite', (store) => [store.clear()]);
      const info = bundle.manifest.dbs[name] && bundle.manifest.dbs[name].stores[st];
      if (!info) continue;
      let batch = [];
      let batchBytes = 0;
      const flush = async () => {
        if (!batch.length) return;
        const items = batch;
        batch = [];
        batchBytes = 0;
        await run(db, [st], 'readwrite', (store) => items.map(([k, v]) => (typeof s.stores[st] === 'string' ? store.put(v) : store.put(v, k))));
      };
      for (const part of info.parts) done += fileSize(part);
      for await (let [k, v] of recordsOf(bundle, name, st)) {
        if (signal && signal.aborted) throw cancelled();
        if (name === 'pvm-media' && st === 'media' && v && linked.has(v.id)) v = { ...v, blob: null, linked: true };
        const bytes = countBlobs(v);
        batch.push([k, v]);
        batchBytes += bytes;
        if (batch.length >= PAGE || batchBytes > 64 * 1024 * 1024) await flush();
        done += bytes;
        seen.add(`${st}:${k}`);
        onProgress({ done, total, label: `${name} / ${st}` });
      }
      await flush();
    }
    db.close();
  }
  return { records: seen.size };
}

/**
 * The last step, synchronous so no timer of the old page runs in between: replace the pvm.* settings and then make
 * every later write of this page a no-op, so the old page cannot save over what was just restored before it reloads.
 */
export async function commitLocalStorage(bundle) {
  const saved = JSON.parse(await bundle.entries.get('localStorage.json').text());
  const keep = {};
  for (const k of KEEP_KEYS) if (localStorage.getItem(k) !== null) keep[k] = localStorage.getItem(k);
  for (const k of localKeys()) localStorage.removeItem(k);
  for (const [k, v] of Object.entries({ ...saved, ...keep })) if (k.startsWith('pvm.')) localStorage.setItem(k, v);
  localStorage.setItem('pvm.welcomeDesktop.v1', '1');
  Storage.prototype.setItem = () => {};
  Storage.prototype.removeItem = () => {};
  Storage.prototype.clear = () => {};
}
