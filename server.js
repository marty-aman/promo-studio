// Minimal static server for local use. Binds to 127.0.0.1 only, so nothing is reachable
// from other machines. The app itself is static and can also be hosted on any static host.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { TYPES, apiRoute } from './server-api.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8765;
// The file types and the setlist.fm / OpenAI pass-throughs are shared with the Mac app (server-api.js). Here a
// request counts as "this app on this computer" when its Host, Origin and Sec-Fetch-Site all say so, so other web
// sites can't use the pass-throughs.
const SAME_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

function sameApp(req) {
  const origin = req.headers.origin ? req.headers.origin.replace(/^https?:\/\//, '') : null;
  const site = req.headers['sec-fetch-site'];
  return SAME_HOSTS.has(req.headers.host) && (!origin || SAME_HOSTS.has(origin)) && (!site || site === 'same-origin' || site === 'none');
}

async function readBody(req, max) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new Error('too big');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const GZ = new Map(); // gzipped text files, by path and validator (a few MB in all)

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    const api = apiRoute({ method: req.method, url, headers: req.headers, body: (max) => readBody(req, max), sameApp: sameApp(req) });
    if (api) {
      const r = await api;
      return void res.writeHead(r.status, r.headers).end(r.body);
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (/[\\/](node_modules|\.git)([\\/]|$)/.test(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    // A validator, so a reload answers 304 for every file that did not change (the app is about 200 files), and gzip for
    // text, which is a third of the size. Cache-Control stays no-cache: the browser asks each time, nothing goes stale.
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff' };
    if (req.headers['if-none-match'] === etag) return void res.writeHead(304, headers).end();
    let body = await readFile(file);
    if (/^(text\/|application\/(javascript|json))/.test(type) && body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      const key = file + etag;
      if (!GZ.has(key)) GZ.set(key, gzipSync(body));
      body = GZ.get(key);
      headers['Content-Encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Band Manager running at http://${HOST}:${PORT}/`);
});
