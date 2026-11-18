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
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
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
  console.log(`Promo Studio running at http://${HOST}:${PORT}/`);
});
