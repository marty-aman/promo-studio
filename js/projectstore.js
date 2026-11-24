// Where the Projects library lives in this browser: IndexedDB database `pvm-projects`.
//   projects: saved Video Studio edits { id, kind: 'video', name, createdAt, updatedAt, thumb, info, data }
//   versions: { key: '<kind>:<id>', list: [{ at, data }] } newest first, for Video Studio edits and Photo Studio designs
// A save (the project, its new version, and the trimmed version list) is ONE transaction: the browser applies all of
// it or none of it, so a crash or a full disk mid-save leaves the previous save as it was. The list is also kept in
// memory (all()), so a backup can be written without waiting.
import { pushVersion, VERSION_CAP } from './projectlib.js';

const DB = 'pvm-projects';
let dbp = null;
let ok = typeof indexedDB !== 'undefined';
const mem = { projects: new Map(), versions: new Map() }; // the fallback when the browser has no IndexedDB (private windows in some browsers)

function db() {
  if (!ok) return Promise.reject(new Error('no IndexedDB'));
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('projects', { keyPath: 'id' });
        req.result.createObjectStore('versions', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          dbp = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    }).catch((e) => {
      dbp = null;
      throw e;
    });
  }
  return dbp;
}

/** Run fn(stores) in one readwrite (or readonly) transaction over both stores; resolves with fn's result once committed. */
function run(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(['projects', 'versions'], mode);
        let out;
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error || new Error('The browser could not save the project'));
        t.onabort = () => reject(t.error || new Error('The browser could not save the project (storage full?)'));
        out = fn({ projects: t.objectStore('projects'), versions: t.objectStore('versions') });
      }),
  );
}
const req = (r) => new Promise((resolve, reject) => ((r.onsuccess = () => resolve(r.result)), (r.onerror = () => reject(r.error))));

const cache = new Map(); // id -> entry (no versions)
let loaded = null;

export const projectStore = {
  /** True when saves only last until the page closes (no IndexedDB in this browser). */
  get memoryOnly() {
    return !ok;
  },
  /** Load the list once (later calls get the same promise). */
  load() {
    if (!loaded)
      loaded = run('readonly', (s) => req(s.projects.getAll()))
        .then((p) => p)
        .catch(() => {
          ok = false;
          return [...mem.projects.values()];
        })
        .then((list) => {
          cache.clear();
          for (const e of list || []) if (e && e.id && e.data) cache.set(e.id, e);
          return this.all();
        });
    return loaded;
  },
  /** Every saved video project (from memory: call load() once first). */
  all: () => [...cache.values()],
  get: (id) => cache.get(id) || null,
  /**
   * Save a project entry; with `version` also keep its data as a version of `kind:id` (VERSION_CAP kept).
   * Resolves true once stored, false when the browser refused (the earlier save is still there).
   */
  async put(entry, { version = false } = {}) {
    try {
      if (!ok) throw new Error('memory');
      await run('readwrite', (s) => {
        s.projects.put(entry);
        if (version) {
          const key = `video:${entry.id}`;
          const r = s.versions.get(key);
          r.onsuccess = () => s.versions.put({ key, list: pushVersion((r.result || {}).list, entry.data, Date.now(), VERSION_CAP) });
        }
      });
    } catch (e) {
      if (ok) return false;
      mem.projects.set(entry.id, entry);
      if (version) mem.versions.set(`video:${entry.id}`, pushVersion(mem.versions.get(`video:${entry.id}`), entry.data));
    }
    cache.set(entry.id, entry);
    return true;
  },
  /** Delete a project and its versions together. */
  async remove(id) {
    try {
      if (!ok) throw new Error('memory');
      await run('readwrite', (s) => {
        s.projects.delete(id);
        s.versions.delete(`video:${id}`);
      });
    } catch {
      if (ok) return false;
      mem.projects.delete(id);
      mem.versions.delete(`video:${id}`);
    }
    cache.delete(id);
    return true;
  },
  /** The versions of `kind:id`, newest first: [{ at, data }]. */
  async versions(kind, id) {
    const key = `${kind}:${id}`;
    try {
      if (!ok) throw new Error('memory');
      const r = await run('readonly', (s) => req(s.versions.get(key)));
      return (r && r.list) || [];
    } catch {
      return mem.versions.get(key) || [];
    }
  },
  /** Keep `data` as a version of `kind:id` (photo designs; the video ones come with put). False when refused. */
  async addVersion(kind, id, data) {
    const key = `${kind}:${id}`;
    try {
      if (!ok) throw new Error('memory');
      await run('readwrite', (s) => {
        const r = s.versions.get(key);
        r.onsuccess = () => s.versions.put({ key, list: pushVersion((r.result || {}).list, data, Date.now(), VERSION_CAP) });
      });
      return true;
    } catch {
      if (ok) return false;
      mem.versions.set(key, pushVersion(mem.versions.get(key), data));
      return true;
    }
  },
  async dropVersions(kind, id) {
    try {
      if (!ok) throw new Error('memory');
      await run('readwrite', (s) => s.versions.delete(`${kind}:${id}`));
    } catch {
      mem.versions.delete(`${kind}:${id}`);
    }
  },
  /** The newest version's time for `kind:id` (0 when none), without loading the data more than once per call. */
  async lastVersionAt(kind, id) {
    const l = await this.versions(kind, id);
    return l.length ? l[0].at : 0;
  },
};

/** How much of the browser's storage this site uses: { usage, quota } in bytes (nulls when it can't tell). */
export async function storageEstimate() {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? null, quota: e.quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}
