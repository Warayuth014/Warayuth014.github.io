import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, token, repoFiles } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 2)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20)]);

const setup = async () => {
  const e = await makeEnv({ files: repoFiles() });
  e.tok = await token(e.env);
  return e;
};
const up = (e, b) => call(e.env, 'POST', '/upload', { token: e.tok, body: b });
const send = (name, contentType, buf) => ({ name, contentType, dataBase64: buf.toString('base64') });

test('each allowed type uploads as one commit under uploads/<year>/<12 hex>-<safe-name>.<ext>', async () => {
  const e = await setup();
  const cases = [['My Photo!.PNG', 'image/png', PNG, 'png'], ['x.jpeg', 'image/jpeg', JPG, 'jpg'], ['a.gif', 'image/gif', GIF, 'gif'], ['b.webp', 'image/webp', WEBP, 'webp'], ['Résumé CV.pdf', 'application/pdf', PDF, 'pdf']];
  for (const [name, type, buf, ext] of cases) {
    const before = e.gh.commitCount();
    const r = await up(e, send(name, type, buf));
    assert.equal(r.status, 200, name);
    assert.match(r.json.path, new RegExp(`^/uploads/2026/[0-9a-f]{12}-[a-z0-9-]+\\.${ext}$`));
    assert.equal(e.gh.commitCount(), before + 1);
    assert.deepEqual(e.gh.text(r.json.path.slice(1)) !== undefined, true);
    assert.deepEqual(e.gh.files().get(r.json.path.slice(1)), buf);
  }
  const r = await up(e, send('My Photo!.PNG', 'image/png', PNG));
  assert.match(r.json.path, /-my-photo\.png$/);
});

test('hostile names are reduced to a-z0-9-', async () => {
  const e = await setup();
  const r = await up(e, send('../../.github/<x>"..png', 'image/png', PNG));
  assert.equal(r.status, 200);
  assert.match(r.json.path, /^\/uploads\/2026\/[0-9a-f]{12}-[a-z0-9-]+\.png$/);
  const r2 = await up(e, send('ภาพ.png', 'image/png', PNG));
  assert.match(r2.json.path, /^\/uploads\/2026\/[0-9a-f]{12}-file\.png$/);
});

test('svg, html and unknown types are rejected with no writes', async () => {
  const e = await setup();
  for (const t of ['image/svg+xml', 'text/html', 'application/javascript', 'image/png ', undefined]) {
    assert.equal((await up(e, { name: 'a', contentType: t, dataBase64: PNG.toString('base64') })).status, 400, String(t));
  }
  assert.equal(e.gh.writes().length, 0);
});

test('magic bytes must match the declared type (svg/html disguised as png)', async () => {
  const e = await setup();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal((await up(e, send('a.png', 'image/png', svg))).status, 400);
  assert.equal((await up(e, send('a.png', 'image/png', Buffer.from('<html><script>x</script>')))).status, 400);
  assert.equal((await up(e, send('a.png', 'image/png', JPG))).status, 400);
  assert.equal((await up(e, send('a.pdf', 'application/pdf', PNG))).status, 400);
  assert.equal((await up(e, send('a.webp', 'image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])))).status, 400);
  assert.equal(e.gh.writes().length, 0);
});

test('size: 8 MB passes, 9 MB is 400; bad base64 is 400', async () => {
  const e = await setup();
  const big = (n) => Buffer.concat([PNG, Buffer.alloc(n - PNG.length, 3)]);
  assert.equal((await up(e, send('ok.png', 'image/png', big(8 * 1024 * 1024)))).status, 200);
  const r9 = await up(e, send('big.png', 'image/png', big(9 * 1024 * 1024)));
  assert.equal(r9.status, 400);
  assert.equal((await up(e, send('big.png', 'image/png', big(8 * 1024 * 1024 + 1)))).status, 400);
  assert.equal((await up(e, { name: 'a', contentType: 'image/png', dataBase64: 'not base64!!' })).status, 400);
  assert.equal((await up(e, { name: 'a', contentType: 'image/png', dataBase64: '' })).status, 400);
});

test('/delete-upload: deletes in one commit, 404 when absent, rejects other paths', async () => {
  const e = await setup();
  const { json } = await up(e, send('a.png', 'image/png', PNG));
  const before = e.gh.commitCount();
  const del = await call(e.env, 'POST', '/delete-upload', { token: e.tok, body: { path: json.path } });
  assert.equal(del.status, 200);
  assert.equal(e.gh.commitCount(), before + 1);
  assert.equal(e.gh.text(json.path.slice(1)), undefined);
  assert.equal((await call(e.env, 'POST', '/delete-upload', { token: e.tok, body: { path: json.path } })).status, 404);
  for (const p of ['/content/site.json', 'uploads/2026/a-b.png', '/uploads/2026/../../content/site.json', '/uploads/2026/a.svg', '/uploads/26/a.png', '/uploads/2026/sub/a.png', '/uploads/2026/A.png', 42, undefined]) {
    assert.equal((await call(e.env, 'POST', '/delete-upload', { token: e.tok, body: { path: p } })).status, 400, String(p));
  }
  assert.ok(e.gh.text('content/site.json'));
});
