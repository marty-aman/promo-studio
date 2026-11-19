// Minimal static server for local use. Binds to 127.0.0.1 only, so nothing is reachable
// from other machines. The app itself is static and can also be hosted on any static host.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
};

// setlist.fm pass-through for the Tours page. setlist.fm doesn't allow calls from web pages, so the
// page asks this server, which forwards only these read-only searches with the API key the page
// sends (it's kept in your browser's settings, never stored or logged here). Requests must come
// from this app on this machine: the Host and Origin are checked so other web sites can't use it.
const SETLIST_BASE = 'https://api.setlist.fm/rest/1.0/';
const SETLIST_ROUTES = { 'search/setlists': ['artistName', 'cityName', 'venueName', 'year', 'p'], 'search/artists': ['artistName', 'sort', 'p'] };
const SAME_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const json = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(body));

async function setlistProxy(req, res, url) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Only GET is allowed.' });
  const origin = req.headers.origin ? req.headers.origin.replace(/^https?:\/\//, '') : null;
  const site = req.headers['sec-fetch-site'];
  if (!SAME_HOSTS.has(req.headers.host) || (origin && !SAME_HOSTS.has(origin)) || (site && site !== 'same-origin' && site !== 'none')) {
    return json(res, 403, { error: 'Only this app, on this computer, can use the setlist.fm pass-through.' });
  }
  const route = url.pathname.slice('/api/setlistfm/'.length);
  const allowed = SETLIST_ROUTES[route];
  if (!allowed) return json(res, 404, { error: 'Not a supported setlist.fm search.' });
  const key = String(req.headers['x-setlistfm-key'] || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(key)) return json(res, 401, { error: 'Add your setlist.fm API key first.' });
  const q = new URLSearchParams();
  for (const k of allowed) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v.slice(0, 120));
  }
  try {
    const r = await fetch(`${SETLIST_BASE}${route}?${q}`, { headers: { 'x-api-key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(text.slice(0, 2_000_000));
  } catch {
    json(res, 502, { error: 'Could not reach setlist.fm.' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    if (url.pathname.startsWith('/api/setlistfm/')) return await setlistProxy(req, res, url);
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
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Band Manager running at http://${HOST}:${PORT}/`);
});
