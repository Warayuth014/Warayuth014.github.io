#!/usr/bin/env node
// Tiny dev static server (no deps). Usage: node tools/serve.mjs [port]
// Serves the repo root; a missing path gets 404.html with status 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (p.includes('\0')) return null;
  const abs = normalize(join(root, p));
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  try {
    const s = await stat(abs);
    if (s.isDirectory()) {
      const idx = join(abs, 'index.html');
      return (await stat(idx)).isFile() ? idx : null;
    }
    return s.isFile() ? abs : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/');
  const target = file ?? join(root, '404.html');
  try {
    const body = await readFile(target);
    res.writeHead(file ? 200 : 404, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const port = Number(process.argv[2] ?? 0);
server.listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}/`);
});
