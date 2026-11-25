// How the Mac app answers its own app://promo-studio/ requests: which file a path names (never outside the app
// folder), Range requests (206, which <video> seeking needs), and the headers every response carries (types from
// server-api.js, a Content-Security-Policy, cross-origin isolation). Plain Node so the unit tests can run it.
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');

/** The fixed origin. Changing it (or productName / appId) makes the app look empty: storage is kept per origin. */
const SCHEME = 'app';
const HOST = 'promo-studio';
const ORIGIN = `${SCHEME}://${HOST}`;
/** Linked files are served at /__media/<id> on the same origin, so a <video> drawn on the export canvas is not cross-origin. */
const MEDIA_PREFIX = '/__media/';

/**
 * The CSP. Scripts come only from the app itself (no inline scripts, nothing remote except Deezer's JSONP search,
 * which runs in a sandboxed frame). 'unsafe-eval' is there because the vendored ONNX runtime (AI features) builds
 * functions with new Function; 'wasm-unsafe-eval' for every WebAssembly module. Network reads (connect, img,
 * media) are any https host: the app calls many APIs and image CDNs (stock photos, Spotify, Hugging Face, Google
 * APIs, Freesound, Wikimedia, lyrics), and a stale list would quietly break a feature.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' https://api.deezer.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: blob:",
  "connect-src 'self' data: blob: https:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Headers on every app response: no sniffing, the CSP, and cross-origin isolation (multithreaded WASM). */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
  // credentialless, not require-corp: stock images and other https resources still load (without cookies)
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-cache',
};

/** The app file a URL path names, or null (outside the app folder, dot folders, node_modules, the Electron code). */
function appFile(root, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel.endsWith('/')) rel += 'index.html';
  const base = path.resolve(root);
  const file = path.normalize(path.join(base, rel));
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  const inside = path.relative(base, file).split(path.sep);
  if (inside.some((p) => p.startsWith('.') || p === 'node_modules') || inside[0] === 'electron' || inside[0] === 'dist-desktop') return null;
  return file;
}

/**
 * A Range header for a file of `size` bytes: null (none or not bytes: send it all), 'bad' (416) or { start, end }
 * (inclusive). One range only; a suffix range (bytes=-500) is the last 500 bytes.
 */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  let start;
  let end;
  if (m[1] === '' && m[2] === '') return 'bad';
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!(n > 0)) return 'bad';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return 'bad';
  return { start, end };
}

/** A Response for a file on disk, with Range support. `type` is its Content-Type; `extra` more headers. */
async function fileResponse(file, { type, range, extra = {} }) {
  const st = await fsp.stat(file);
  if (!st.isFile()) return new Response('Not found', { status: 404 });
  const headers = { ...BASE_HEADERS, ...extra, 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  const r = parseRange(range, st.size);
  if (r === 'bad') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${st.size}` } });
  if (!r) {
    headers['Content-Length'] = String(st.size);
    return new Response(st.size ? Readable.toWeb(fs.createReadStream(file)) : null, { status: 200, headers });
  }
  headers['Content-Range'] = `bytes ${r.start}-${r.end}/${st.size}`;
  headers['Content-Length'] = String(r.end - r.start + 1);
  return new Response(Readable.toWeb(fs.createReadStream(file, { start: r.start, end: r.end })), { status: 206, headers });
}

/** Content-Type of a media file by its extension (linked files: video, audio, pictures). */
const MEDIA_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.avif': 'image/avif', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
};
const mediaType = (file) => MEDIA_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

module.exports = { SCHEME, HOST, ORIGIN, MEDIA_PREFIX, CSP, BASE_HEADERS, appFile, parseRange, fileResponse, mediaType };
