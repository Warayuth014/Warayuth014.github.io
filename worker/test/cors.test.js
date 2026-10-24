import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, ORIGIN, PIN } from './helpers.js';
import { originAllowed } from '../src/index.js';

const preflight = (env, origin) => call(env, 'OPTIONS', '/save', { origin, headers: { 'Access-Control-Request-Method': 'POST' } });

test('preflight from the site: allowed with methods and headers', async () => {
  const { env } = await makeEnv();
  const r = await preflight(env, ORIGIN);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Vary'), 'Origin');
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assert.equal(r.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
});

test('preflight from another origin: no Access-Control-Allow-Origin', async () => {
  const { env } = await makeEnv();
  for (const o of ['https://evil.example', 'https://warayuth014.github.io.evil.com', 'http://warayuth014.github.io', 'null', 'http://localhost.evil.com']) {
    const r = await preflight(env, o);
    assert.equal(r.status, 403, o);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null, o);
  }
});

test('local dev origins on any port are allowed; lookalikes are not', async () => {
  const env = { ALLOWED_ORIGINS: ORIGIN };
  for (const o of ['http://localhost:8000', 'http://localhost', 'http://127.0.0.1:5173', ORIGIN]) assert.equal(originAllowed(o, env), true, o);
  for (const o of ['https://localhost:8000', 'http://localhost:8000/', 'http://user@localhost:80', 'http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'http://0.0.0.0:80', '', null, 'https://warayuth014.github.io/x']) assert.equal(originAllowed(o, env), false, String(o));
});

test('real requests echo the origin; foreign browser origins are refused before any work', async () => {
  const { env, kv } = await makeEnv();
  const ok = await call(env, 'POST', '/login', { body: { password: PIN }, origin: 'http://localhost:3000' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assert.equal(ok.headers.get('Vary'), 'Origin');
  const before = kv.store.size;
  const evil = await call(env, 'POST', '/login', { body: { password: 'bad' }, origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(kv.store.size, before, 'no failure counted');
});

test('unknown route is 404', async () => {
  const { env } = await makeEnv();
  assert.equal((await call(env, 'GET', '/nope')).status, 404);
});
