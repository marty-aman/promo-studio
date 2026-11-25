// Step 2: an export written straight to a file the person picks, piece by piece, so a long export is never held
// in memory. Plain Node (unit-tested with a fake dialog and the real fs); main.cjs wires it to ipc.
//
// What the page can do: ask for a save dialog (begin), send pieces (write), finish or abort. What it cannot do:
// name a path (only the dialog gives one), write anywhere else, write outside the file's own bytes (a piece starts
// at or before the end of what is written: the muxer patches its header at the start), or send a piece over
// MAX_CHUNK. The bytes go to "<chosen>.partial" and are renamed only at finish, so a cancel, an error, a closed
// window or a quit deletes the partial and an older file at the chosen path stays as it was.
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

/** A file name from the page: its last part only, no control characters, at most 120 characters. */
function cleanName(name, ext) {
  let n = path.basename(String(name || 'promo-video')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/^\.+/, '').trim();
  n = n.replace(new RegExp(`\\.${ext}$`, 'i'), '').slice(0, 120) || 'promo-video';
  return `${n}.${ext}`;
}

/**
 * @param pickPath async ({ owner, defaultName, ext }) -> absolute path | null (null: the person cancelled)
 * @param freeBytes async (dir) -> number | null (null: unknown, allowed)
 */
function createExportStreams({ pickPath, freeBytes = async () => null, fsApi = fs } = {}) {
  const streams = new Map(); // id -> { owner, final, partial, fh, size, queue, dead }
  const saved = new Set(); // final paths this module wrote (the only paths reveal() accepts)

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
    /** Ask where to save. Resolves { id, name, path } or null when the person cancelled. */
    async begin(owner, opts = {}) {
      const ext = opts && typeof opts.ext === 'string' ? opts.ext.toLowerCase() : 'mp4';
      if (!EXTS.has(ext)) throw new Error('This file type cannot be saved straight to disk');
      if ([...streams.values()].filter((s) => s.owner === owner).length >= MAX_OPEN) throw new Error('Too many exports are writing at once');
      let final = await pickPath({ owner, defaultName: cleanName(opts && opts.name, ext), ext });
      if (!final) return null;
      final = path.resolve(String(final));
      if (path.extname(final).toLowerCase() !== `.${ext}`) final += `.${ext}`;
      const free = await freeBytes(path.dirname(final));
      if (free != null && free < MIN_FREE) throw new Error('There is not enough free space where you chose to save');
      const partial = final + PARTIAL;
      const fh = await fsApi.open(partial, 'w');
      const id = crypto.randomUUID();
      streams.set(id, { id, owner, final, partial, fh, size: 0, queue: Promise.resolve(), dead: false });
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
      await Promise.all([...streams.values()].filter((s) => owner == null || s.owner === owner).map(discard));
    },

    /** The path of a file this module finished (for "Show in Finder"), else null. */
    isSaved: (p) => saved.has(String(p)),
    openCount: () => streams.size,
  };
}

module.exports = { createExportStreams, cleanName, MAX_CHUNK, MAX_TOTAL, PARTIAL };
