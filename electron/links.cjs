// Files "linked in place": big footage the app reads where it is instead of copying it into its own storage.
// The paths live here, in the main process, in links.json; the page only ever names a media id. Plain Node, no
// Electron, so the unit tests in test/ can run it. main.cjs is the only caller.
//
// A path gets in only from the native open dialog or from a dropped/picked File through webUtils.getPathForFile
// (in the preload), and it is checked here: absolute, a media type the app reads, a regular file.
'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');

/** A media id (the key of a linked file). */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
/** File types that can be linked (what the app imports). */
const LINK_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|jpe?g|png|gif|webp|heic|avif|bmp|tiff?)$/i;
/** The most one read() hands back (jobs read big files in pieces). */
const MAX_READ = 64 * 1024 * 1024;

const validId = (id) => typeof id === 'string' && ID_RE.test(id);

/**
 * Check a path the user picked: absolute, no NUL, a media type the app reads, a regular file (a symlink is
 * followed and its target must be a regular file). Resolves { path, size, mtime } or throws.
 */
async function checkLinkPath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0') || !path.isAbsolute(p)) throw new Error('Not an absolute path');
  const norm = path.resolve(p);
  if (!LINK_EXT.test(norm)) throw new Error('Not a media file the app can link');
  const st = await fsp.stat(norm);
  if (!st.isFile()) throw new Error('Not a file');
  return { path: norm, size: st.size, mtime: st.mtimeMs };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** The linked files of one install, kept in `<configDir>/links.json` as { id: { path, size, mtime } }. */
function createLinks({ configDir }) {
  const file = path.join(configDir, 'links.json');
  let links = null;
  let saving = Promise.resolve();

  async function load() {
    if (links) return links;
    const saved = await readJson(file, {});
    links = new Map(Object.entries(saved && typeof saved === 'object' ? saved : {}).filter(([id, v]) => validId(id) && v && typeof v.path === 'string' && path.isAbsolute(v.path)));
    return links;
  }
  function save() {
    const body = JSON.stringify(Object.fromEntries(links), null, 1);
    // one write at a time, through a temp file, so a crash never leaves half a links.json
    saving = saving.then(async () => {
      await fsp.mkdir(configDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, body);
      await fsp.rename(tmp, file);
    });
    return saving;
  }
  const need = (id) => {
    if (!validId(id)) throw new Error('Not a media id');
  };

  return {
    /** Link media `id` to the file at `p` (from the dialog or getPathForFile). Resolves { id, name, size, type }. */
    async add(id, p) {
      need(id);
      const st = await checkLinkPath(p);
      (await load()).set(id, { path: st.path, size: st.size, mtime: st.mtime });
      await save();
      return { id, name: path.basename(st.path), size: st.size, ext: path.extname(st.path).toLowerCase() };
    },
    async remove(id) {
      need(id);
      const had = (await load()).delete(id);
      if (had) await save();
      return had;
    },
    /** The checked path of a linked file, or null (not linked, or not a readable file any more). Main only. */
    async pathOf(id) {
      need(id);
      const l = (await load()).get(id);
      if (!l) return null;
      try {
        return (await checkLinkPath(l.path)).path;
      } catch {
        return null;
      }
    },
    /** { linked, exists, size, mtime, name } for the page: never the path. */
    async stat(id) {
      need(id);
      const l = (await load()).get(id);
      if (!l) return { linked: false, exists: false };
      try {
        const st = await checkLinkPath(l.path);
        return { linked: true, exists: true, size: st.size, mtime: st.mtime, changed: st.size !== l.size, name: path.basename(st.path) };
      } catch {
        return { linked: true, exists: false, size: l.size || 0, mtime: l.mtime || 0, name: path.basename(l.path) };
      }
    },
    /** Bytes [start, end) of a linked file (end exclusive, at most MAX_READ). Resolves a Uint8Array (short at the end). */
    async read(id, start, end) {
      need(id);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end - start > MAX_READ) throw new Error('Bad range');
      const p = await this.pathOf(id);
      if (!p) throw new Error('The linked file is missing');
      const fh = await fsp.open(p, 'r');
      try {
        const buf = new Uint8Array(end - start);
        const { bytesRead } = await fh.read(buf, 0, buf.length, start);
        return bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    },
    /** How many files are linked and their size when linked (the storage meter). */
    async totals() {
      let bytes = 0;
      const m = await load();
      for (const v of m.values()) bytes += v.size || 0;
      return { count: m.size, bytes };
    },
  };
}

module.exports = { createLinks, checkLinkPath, validId, LINK_EXT, MAX_READ };
