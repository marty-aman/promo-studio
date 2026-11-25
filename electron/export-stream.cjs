// Step 2: an export written straight to a file the person picks, piece by piece, so a long export is never held
// in memory. Plain Node (unit-tested with a fake dialog and the real fs); main.cjs wires it to ipc.
//
// What the page can do: ask for a save dialog (begin), send pieces (write), finish or abort. What it cannot do:
// name a path (only the dialog gives one), write anywhere else, write outside the file's own bytes (a piece starts
// at or before the end of what is written: the muxer patches its header at the start), or send a piece over
// MAX_CHUNK. The bytes go to "<chosen>.partial" and are renamed only at finish, so a cancel, an error, a closed
// window or a quit deletes the partial and an older file at the chosen path stays as it was.
//
// A folder (section exports, many files at once): pickFolder() asks once and gives the page a token, never a way
// to name a path. begin() with that token writes directly inside the folder under a cleaned name, adding " 2",
// " 3"… when the name is taken (a file there, or one still being written), so nothing there is overwritten.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_CHUNK = 16 * 1024 * 1024; // the page sends 8 MB pieces
const MAX_TOTAL = 256 * 1024 * 1024 * 1024; // a file this big is a bug, not an export
const MAX_OPEN = 2; // per window
const MIN_FREE = 256 * 1024 * 1024;
const EXTS = new Set(['mp4']);
const PARTIAL = '.partial';
const MAX_FOLDERS = 8; // per window: one is picked per section export

/** A file name from the page: its last part only, no control characters, at most 120 characters. */
function cleanName(name, ext) {
  let n = path.basename(String(name || 'promo-video')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/^\.+/, '').trim();
  n = n.replace(new RegExp(`\\.${ext}$`, 'i'), '').slice(0, 120) || 'promo-video';
  return `${n}.${ext}`;
}

/**
 * A free path for `name` (already cleaned) directly inside `dir`: "name.mp4", else "name 2.mp4", "name 3.mp4"…
 * `taken(path)` says a path is in use (a file there, or one being written). Throws if the name would leave `dir`.
 */
async function freeIn(dir, name, taken) {
  const root = path.resolve(dir);
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 1; i <= 999; i++) {
    const p = path.join(root, i === 1 ? name : `${base} ${i}${ext}`);
    if (path.dirname(p) !== root) throw new Error('That file name is not allowed');
    if (!(await taken(p))) return p;
  }
  throw new Error('Too many files with that name in the folder');
}

/**
 * @param pickPath async ({ owner, defaultName, ext }) -> absolute path | null (null: the person cancelled)
 * @param pickFolder async ({ owner }) -> absolute folder path | null (null: the person cancelled)
 * @param freeBytes async (dir) -> number | null (null: unknown, allowed)
 */
function createExportStreams({ pickPath, pickFolder = async () => null, freeBytes = async () => null, fsApi = fs } = {}) {
  const streams = new Map(); // id -> { owner, final, partial, fh, size, queue, dead }
  const saved = new Set(); // final paths this module wrote (the only paths reveal() accepts)
  const folders = new Map(); // token -> { owner, dir }: folders the person picked, by the window that asked
  const exists = (p) => fsApi.access(p).then(() => true, () => false);
  const busy = (p) => [...streams.values()].some((s) => s.final === p);

  const get = (owner, id) => {
    const s = typeof id === 'string' ? streams.get(id) : null;
    if (!s || s.owner !== owner) throw new Error('No such export file');
    return s;
  };

  async function discard(s) {
    if (s.dead) return;
    s.dead = true;
    streams.delete(s.id);
    await s.queue.catch(() => {});
    await s.fh.close().catch(() => {});
    await fsApi.unlink(s.partial).catch(() => {});
  }

  return {
    /** Ask once for a folder. Resolves { folder (a token for begin), name, path } or null when the person cancelled. */
    async pickFolder(owner) {
      const dir = await pickFolder({ owner });
      if (!dir) return null;
      const abs = path.resolve(String(dir));
      const st = await fsApi.stat(abs).catch(() => null);
      if (!st || !st.isDirectory()) throw new Error('That folder cannot be used');
      const mine = [...folders].filter(([, f]) => f.owner === owner);
      if (mine.length >= MAX_FOLDERS) folders.delete(mine[0][0]); // the oldest one goes
      const folder = crypto.randomUUID();
      folders.set(folder, { owner, dir: abs });
      return { folder, name: path.basename(abs) || abs, path: abs };
    },

    /**
     * Ask where to save (the save dialog), or with `opts.folder` (a pickFolder token) straight into that folder
     * under a name that is free. Resolves { id, name, path } or null when the person cancelled.
     */
    async begin(owner, opts = {}) {
      const ext = opts && typeof opts.ext === 'string' ? opts.ext.toLowerCase() : 'mp4';
      if (!EXTS.has(ext)) throw new Error('This file type cannot be saved straight to disk');
      if ([...streams.values()].filter((s) => s.owner === owner).length >= MAX_OPEN) throw new Error('Too many exports are writing at once');
      let final;
      const wanted = cleanName(opts && opts.name, ext);
      if (opts && opts.folder != null) {
        const f = typeof opts.folder === 'string' ? folders.get(opts.folder) : null;
        if (!f || f.owner !== owner) throw new Error('No such folder');
        final = await freeIn(f.dir, wanted, async (p) => busy(p) || (await exists(p)) || (await exists(p + PARTIAL)));
      } else {
        final = await pickPath({ owner, defaultName: wanted, ext });
        if (!final) return null;
        final = path.resolve(String(final));
        if (path.extname(final).toLowerCase() !== `.${ext}`) final += `.${ext}`;
      }
      const free = await freeBytes(path.dirname(final));
      if (free != null && free < MIN_FREE) throw new Error('There is not enough free space where you chose to save');
      const partial = final + PARTIAL;
      const fh = await fsApi.open(partial, opts && opts.folder != null ? 'wx' : 'w'); // in a folder: never over a file
      const id = crypto.randomUUID();
      streams.set(id, { id, owner, final, partial, fh, size: 0, queue: Promise.resolve(), dead: false, noClobber: !!(opts && opts.folder != null), wanted });
      return { id, name: path.basename(final), path: final };
    },

    /** Write `bytes` at `position` (0 .. the bytes written so far). A bad piece or a failed write discards the file. */
    async write(owner, id, position, bytes) {
      const s = get(owner, id);
      const bad = !Number.isSafeInteger(position) || position < 0 || position > s.size || !ArrayBuffer.isView(bytes) || bytes.byteLength < 1 || bytes.byteLength > MAX_CHUNK || position + bytes.byteLength > MAX_TOTAL;
      if (bad) {
        await discard(s);
        throw new Error('Rejected a piece of the export file');
      }
      const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const run = s.queue.then(async () => {
        if (s.dead) throw new Error('The export file was closed');
        const { bytesWritten } = await s.fh.write(view, 0, view.byteLength, position);
        if (bytesWritten !== view.byteLength) throw new Error('Could not write the whole piece');
        s.size = Math.max(s.size, position + view.byteLength);
      });
      s.queue = run.catch(() => {});
      try {
        await run;
      } catch (e) {
        await discard(s);
        throw e;
      }
      return s.size;
    },

    /** The file is complete: move it into place. Resolves { path, name, bytes }. */
    async finish(owner, id) {
      const s = get(owner, id);
      try {
        await s.queue;
        if (s.dead || s.size === 0) throw new Error('The export file is empty');
        await s.fh.sync().catch(() => {});
        await s.fh.close();
        s.dead = true;
        streams.delete(id);
        // in a picked folder a file that appeared at that name meanwhile stays: this one takes the next free name
        if (s.noClobber && (await exists(s.final))) s.final = await freeIn(path.dirname(s.final), s.wanted, async (p) => busy(p) || (await exists(p)));
        await fsApi.rename(s.partial, s.final);
      } catch (e) {
        await discard(s);
        await fsApi.unlink(s.partial).catch(() => {});
        throw e;
      }
      saved.add(s.final);
      return { path: s.final, name: path.basename(s.final), bytes: s.size };
    },

    /** Cancel or error: close and delete the partial file. Always resolves. */
    async abort(owner, id) {
      const s = typeof id === 'string' ? streams.get(id) : null;
      if (s && s.owner === owner) await discard(s);
      return true;
    },

    /** A window closed or the app is quitting: delete every partial that window left. */
    async abortOwner(owner) {
      for (const [k, f] of folders) if (owner == null || f.owner === owner) folders.delete(k);
      await Promise.all([...streams.values()].filter((s) => owner == null || s.owner === owner).map(discard));
    },

    /** The path of a file this module finished (for "Show in Finder"), else null. */
    isSaved: (p) => saved.has(String(p)),
    openCount: () => streams.size,
  };
}

module.exports = { createExportStreams, cleanName, freeIn, MAX_CHUNK, MAX_TOTAL, PARTIAL };
