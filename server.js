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

// OpenAI pass-through for the optional writing assistant. OpenAI's API does not send CORS headers on its
// error replies, so a web page cannot read them (a bad key looks like a network failure). The page sends
// the owner's key in a header; it is forwarded to OpenAI and never stored or logged here. Same checks as
// setlist.fm above: only this app, on this computer. Only the chat fields the assistant uses are forwarded,
// and an error reply is cut down to its code, because OpenAI's own message quotes part of the key.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MAX_BODY = 256 * 1024;

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

async function openaiProxy(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: { code: 'method' } });
  if (!sameApp(req)) return json(res, 403, { error: { code: 'forbidden', message: 'Only this app, on this computer, can use the OpenAI pass-through.' } });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: { code: 'content_type' } });
  const key = String(req.headers['x-openai-key'] || '');
  if (!/^[A-Za-z0-9_-]{20,300}$/.test(key)) return json(res, 401, { error: { code: 'invalid_api_key' } });
  let input;
  try {
    input = JSON.parse(await readBody(req, OPENAI_MAX_BODY));
  } catch {
    return json(res, 400, { error: { code: 'bad_request' } });
  }
  const model = typeof input.model === 'string' && /^[\w.:-]{1,80}$/.test(input.model) ? input.model : null;
  const messages = Array.isArray(input.messages) ? input.messages.slice(0, 4).filter((m) => m && (m.role === 'system' || m.role === 'user') && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content.slice(0, 20000) })) : [];
  if (!model || !messages.length) return json(res, 400, { error: { code: 'bad_request' } });
  const max = Math.min(4000, Math.max(16, Number(input.max_completion_tokens) || 1500));
  try {
    const r = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model, messages, max_completion_tokens: max }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await r.text();
    if (r.ok) return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(text.slice(0, 2_000_000));
    let code = '';
    let type = '';
    try {
      const e = JSON.parse(text).error || {};
      code = typeof e.code === 'string' ? e.code.slice(0, 60) : '';
      type = typeof e.type === 'string' ? e.type.slice(0, 60) : '';
    } catch {
      /* not JSON: send the status only */
    }
    json(res, r.status, { error: { code, type } });
  } catch {
    json(res, 502, { error: { code: 'unreachable' } });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    if (url.pathname.startsWith('/api/setlistfm/')) return await setlistProxy(req, res, url);
    if (url.pathname === '/api/openai/chat') return await openaiProxy(req, res);
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
