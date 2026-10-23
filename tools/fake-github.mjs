#!/usr/bin/env node
// Local stand-in for GitHub, for the editor browser check only. Usage: node tools/fake-github.mjs [port]
// Serves exactly the REST + GraphQL subset the Worker uses (the same fake the Worker tests use), backed by
// an in-memory repo seeded from this repo's content/ and articles/ files. Nothing is written to disk.
// Test controls (not part of GitHub): GET /__test/state, GET /__test/file?path=..., POST /__test/bump.
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeGitHub } from '../worker/test/fake-github.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function seed(dirs) {
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else files[relative(root, abs).split(sep).join('/')] = readFileSync(abs);
    }
  };
  for (const d of dirs) walk(join(root, d));
  return files;
}

const gh = fakeGitHub(seed(['content', 'articles']));

const readBody = (req) => new Promise((res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => res(Buffer.concat(chunks)));
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/__test/state') {
    const commits = gh.calls.filter((c) => c.method === 'POST' && c.path === '/git/commits').map((c) => c.body.message);
    return send(200, { head: gh.head, commitCount: gh.commitCount(), commits, files: [...gh.files().keys()] });
  }
  if (url.pathname === '/__test/file') return send(200, { text: gh.text(url.searchParams.get('path') ?? '') ?? null });
  if (url.pathname === '/__test/bump' && req.method === 'POST') { gh.bump(); return send(200, { head: gh.head }); }

  const body = await readBody(req);
  const r = await gh.fetch(`http://x${req.url}`, {
    method: req.method,
    headers: { Authorization: req.headers.authorization ?? '' },
    body: body.length ? body.toString('utf8') : undefined,
  });
  res.writeHead(r.status, { 'content-type': 'application/json' });
  res.end(await r.text());
});

server.listen(Number(process.argv[2] ?? 0), '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}`);
});
