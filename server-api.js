// What the local web server (server.js) and the Mac app (electron/main.cjs) share: the file types, and the two
// pass-throughs (setlist.fm for the Tours page, OpenAI for the writing assistant). Each caller decides whether a
// request comes from this app on this computer (`sameApp`), because they check it differently: server.js looks at
// the Host, Origin and Sec-Fetch-Site headers; the Mac app only serves its own app:// pages.
//
// apiRoute(req) takes { method, url: URL, headers: { lower-case name: value }, body(max) -> Promise<string>, sameApp }
// and resolves { status, headers, body } or null when the path is not a pass-through.

export const TYPES = {
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

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status, body) => ({ status, headers: JSON_HEADERS, body: JSON.stringify(body) });

// setlist.fm doesn't allow calls from web pages, so the page asks the app, which forwards only these read-only
// searches with the API key the page sends (it's kept in the app's settings, never stored or logged here).
const SETLIST_BASE = 'https://api.setlist.fm/rest/1.0/';
const SETLIST_ROUTES = { 'search/setlists': ['artistName', 'cityName', 'venueName', 'year', 'p'], 'search/artists': ['artistName', 'sort', 'p'] };

async function setlistProxy(req) {
  if (req.method !== 'GET') return json(405, { error: 'Only GET is allowed.' });
  if (!req.sameApp) return json(403, { error: 'Only this app, on this computer, can use the setlist.fm pass-through.' });
  const route = req.url.pathname.slice('/api/setlistfm/'.length);
  const allowed = SETLIST_ROUTES[route];
  if (!allowed) return json(404, { error: 'Not a supported setlist.fm search.' });
  const key = String(req.headers['x-setlistfm-key'] || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(key)) return json(401, { error: 'Add your setlist.fm API key first.' });
  const q = new URLSearchParams();
  for (const k of allowed) {
    const v = req.url.searchParams.get(k);
    if (v) q.set(k, v.slice(0, 120));
  }
  try {
    const r = await fetch(`${SETLIST_BASE}${route}?${q}`, { headers: { 'x-api-key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    return { status: r.status, headers: JSON_HEADERS, body: text.slice(0, 2_000_000) };
  } catch {
    return json(502, { error: 'Could not reach setlist.fm.' });
  }
}

// OpenAI's API does not send CORS headers on its error replies, so a web page cannot read them (a bad key looks
// like a network failure). The page sends the owner's key in a header; it is forwarded to OpenAI and never stored
// or logged here. Only the chat fields the assistant uses are forwarded, and an error reply is cut down to its
// code, because OpenAI's own message quotes part of the key.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MAX_BODY = 256 * 1024;

async function openaiProxy(req) {
  if (req.method !== 'POST') return json(405, { error: { code: 'method' } });
  if (!req.sameApp) return json(403, { error: { code: 'forbidden', message: 'Only this app, on this computer, can use the OpenAI pass-through.' } });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(415, { error: { code: 'content_type' } });
  const key = String(req.headers['x-openai-key'] || '');
  if (!/^[A-Za-z0-9_-]{20,300}$/.test(key)) return json(401, { error: { code: 'invalid_api_key' } });
  let input;
  try {
    input = JSON.parse(await req.body(OPENAI_MAX_BODY));
  } catch {
    return json(400, { error: { code: 'bad_request' } });
  }
  const model = typeof input.model === 'string' && /^[\w.:-]{1,80}$/.test(input.model) ? input.model : null;
  const messages = Array.isArray(input.messages) ? input.messages.slice(0, 4).filter((m) => m && (m.role === 'system' || m.role === 'user') && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content.slice(0, 20000) })) : [];
  if (!model || !messages.length) return json(400, { error: { code: 'bad_request' } });
  const max = Math.min(4000, Math.max(16, Number(input.max_completion_tokens) || 1500));
  try {
    const r = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model, messages, max_completion_tokens: max }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await r.text();
    if (r.ok) return { status: 200, headers: JSON_HEADERS, body: text.slice(0, 2_000_000) };
    let code = '';
    let type = '';
    try {
      const e = JSON.parse(text).error || {};
      code = typeof e.code === 'string' ? e.code.slice(0, 60) : '';
      type = typeof e.type === 'string' ? e.type.slice(0, 60) : '';
    } catch {
      /* not JSON: send the status only */
    }
    return json(r.status, { error: { code, type } });
  } catch {
    return json(502, { error: { code: 'unreachable' } });
  }
}

/** The pass-through for this request, or null when the path is not one. */
export function apiRoute(req) {
  if (req.url.pathname.startsWith('/api/setlistfm/')) return setlistProxy(req);
  if (req.url.pathname === '/api/openai/chat') return openaiProxy(req);
  return null;
}
