import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, login, call, PIN, TOKEN_SECRET, token, repoFiles } from './helpers.js';
import { hashPassword, verifyPassword, signSession, verifySession } from '../src/auth.js';

test('hash format and verification', async () => {
  const h = await hashPassword('abcdef', 1000);
  assert.match(h, /^pbkdf2-sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal((await hashPassword('abcdef', 1000)) === h, false, 'fresh salt each time');
  assert.equal(await verifyPassword('abcdef', h), true);
  assert.equal(await verifyPassword('abcdeg', h), false);
  assert.equal(await verifyPassword('abcdef', 'garbage'), false);
  assert.match(await hashPassword('x'), /^pbkdf2-sha256\$100000\$/);
});

test('session token: tamper, expiry, version', async () => {
  const { token: t } = await signSession('s', '1', 1_000_000);
  assert.equal(await verifySession('s', t, '1', 1_000_000 + 1000), true);
  assert.equal(await verifySession('other', t, '1', 1_000_000), false);
  assert.equal(await verifySession('s', t, '2', 1_000_000), false);
  assert.equal(await verifySession('s', t, '1', 1_000_000 + 2 * 3600 * 1000 + 1000), false);
  const [p, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ exp: 9999999999, ver: '1' })).toString('base64url');
  assert.equal(await verifySession('s', `${forged}.${sig}`, '1', 1_000_000), false);
  assert.equal(await verifySession('s', `${p}.AAAA`, '1', 1_000_000), false);
  assert.equal(await verifySession('s', 'nodot', '1', 1_000_000), false);
});

test('correct PIN gives a token valid for 2 hours; wrong PIN is a generic 401', async () => {
  const { env, clock } = await makeEnv();
  const ok = await login(env);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.expiresAt, clock.t + 2 * 3600 * 1000);
  assert.ok(ok.json.token.includes('.'));
  const bad = await login(env, 'nope');
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.json, { error: 'รหัสไม่ถูกต้อง', code: 'bad_password' });
});

test('successful logins write nothing to KV', async () => {
  const { env, kv } = await makeEnv();
  const before = kv.store.size;
  await login(env); await login(env);
  assert.equal(kv.store.size, before);
});

test('5 wrong PINs lock the IP: 6th is 429 even with the right PIN, works after 15 min', async () => {
  const { env, clock } = await makeEnv();
  for (let i = 0; i < 5; i += 1) assert.equal((await login(env, 'bad')).status, 401);
  const locked = await login(env, PIN);
  assert.equal(locked.status, 429);
  assert.ok(locked.json.retryAfter > 0 && locked.json.retryAfter <= 900);
  assert.equal(locked.headers.get('Retry-After'), String(locked.json.retryAfter));
  assert.equal((await login(env, PIN, { ip: '9.9.9.9' })).status, 200, 'another IP is unaffected');
  clock.t += 15 * 60 * 1000 + 1000;
  assert.equal((await login(env, PIN)).status, 200);
});

test('the IP window does not slide: failures spread over time still end at the first failure + 15 min', async () => {
  const { env, clock } = await makeEnv();
  await login(env, 'bad');
  clock.t += 10 * 60 * 1000;
  for (let i = 0; i < 4; i += 1) await login(env, 'bad');
  const locked = await login(env, PIN);
  assert.equal(locked.status, 429);
  assert.ok(locked.json.retryAfter <= 5 * 60);
});

test('more than 50 failures in an hour lock everyone until the hour ends', async () => {
  const { env, clock } = await makeEnv();
  for (let i = 0; i < 51; i += 1) await login(env, 'bad', { ip: `10.0.0.${i}` });
  const res = await login(env, PIN, { ip: '77.7.7.7' });
  assert.equal(res.status, 429);
  assert.ok(res.json.retryAfter <= 3600);
  clock.t += 3600 * 1000;
  assert.equal((await login(env, PIN, { ip: '77.7.7.7' })).status, 200);
});

test('more than 150 failures in a UTC day lock everyone until the day ends', async () => {
  const { env, clock } = await makeEnv(); // clock starts 10:00 UTC
  for (let h = 0; h < 3; h += 1) {
    for (let i = 0; i < 50; i += 1) await login(env, 'bad', { ip: `10.${h}.0.${i}` });
    clock.t += 3600 * 1000; // new hour, so the hourly cap resets
  }
  assert.equal((await login(env, 'bad', { ip: '10.9.0.1' })).status, 401, '151st failure still reaches the check');
  const res = await login(env, PIN, { ip: '77.7.7.7' });
  assert.equal(res.status, 429);
  assert.ok(res.json.retryAfter > 3600 && res.json.retryAfter <= 11 * 3600);
  clock.t += 11 * 3600 * 1000; // next UTC day
  assert.equal((await login(env, PIN, { ip: '77.7.7.7' })).status, 200);
});

test('daily lock is cleared by the owner reset (epoch)', async () => {
  const { env, clock, kv } = await makeEnv();
  for (let h = 0; h < 4; h += 1) {
    for (let i = 0; i < 50; i += 1) await login(env, 'bad', { ip: `10.${h}.0.${i}` });
    clock.t += 3600 * 1000;
  }
  assert.equal((await login(env, PIN, { ip: '77.7.7.7' })).status, 429);
  await kv.put('locks:epoch', 'reset-day');
  assert.equal((await login(env, PIN, { ip: '77.7.7.7' })).status, 200);
});

test('a failing PBKDF2 derive is a 500 hash_error and the reserved attempt is released', async () => {
  const { env } = await makeEnv();
  const real = crypto.subtle.deriveBits;
  crypto.subtle.deriveBits = async () => { throw new Error('iterations refused'); };
  let res;
  try {
    res = await login(env, PIN);
  } finally {
    crypto.subtle.deriveBits = real;
  }
  assert.equal(res.status, 500);
  assert.equal(res.json.code, 'hash_error');
  for (let i = 0; i < 5; i += 1) assert.equal((await login(env, 'bad')).status, 401, 'budget intact');
});

test('exactly 50 global failures do not lock', async () => {
  const { env } = await makeEnv();
  for (let i = 0; i < 50; i += 1) await login(env, 'bad', { ip: `10.0.0.${i}` });
  assert.equal((await login(env, PIN, { ip: '77.7.7.7' })).status, 200);
});

test('no password set yet is a clear 503; malformed bodies are rejected', async () => {
  const { env } = await makeEnv({ withPassword: false });
  assert.equal((await login(env)).status, 503);
  const r = await call(env, 'POST', '/login', { body: 'not json' });
  assert.equal(r.status, 400);
});

test('protected routes need a valid bearer token', async () => {
  const { env } = await makeEnv({ files: repoFiles() });
  assert.equal((await call(env, 'GET', '/state')).status, 401);
  assert.equal((await call(env, 'POST', '/save', { body: { baseSha: 'x' } })).status, 401);
  assert.equal((await call(env, 'POST', '/upload', { body: {} })).status, 401);
  assert.equal((await call(env, 'POST', '/delete-upload', { body: {} })).status, 401);
  assert.equal((await call(env, 'POST', '/password', { body: {} })).status, 401);
  assert.equal((await call(env, 'GET', '/state', { token: 'abc.def' })).status, 401);
  assert.equal((await call(env, 'GET', '/health')).status, 200);
});

test('/password: needs current, validates next, revokes old sessions, returns a fresh one', async () => {
  const { env } = await makeEnv();
  const old = await token(env);
  assert.equal((await call(env, 'POST', '/password', { token: old, body: { current: 'wrong', next: 'abcdef' } })).status, 401);
  assert.equal((await call(env, 'POST', '/password', { token: old, body: { current: PIN, next: '123' } })).status, 400);
  assert.equal((await call(env, 'POST', '/password', { token: old, body: { current: PIN, next: 'x'.repeat(129) } })).status, 400);
  const ok = await call(env, 'POST', '/password', { token: old, body: { current: PIN, next: 'newpass1' } });
  assert.equal(ok.status, 200);
  assert.equal((await call(env, 'POST', '/password', { token: old, body: { current: 'newpass1', next: 'again123' } })).status, 401, 'old token revoked');
  assert.equal((await call(env, 'POST', '/password', { token: ok.json.token, body: { current: 'newpass1', next: 'again123' } })).status, 200);
  assert.equal((await login(env, PIN)).status, 401);
  assert.equal((await login(env, 'again123')).status, 200);
});

test('/password failures count toward the rate limit', async () => {
  const { env } = await makeEnv();
  const t = await token(env);
  for (let i = 0; i < 5; i += 1) await call(env, 'POST', '/password', { token: t, body: { current: 'bad', next: 'abcdef' } });
  assert.equal((await call(env, 'POST', '/password', { token: t, body: { current: PIN, next: 'abcdef' } })).status, 429);
});

test('GitHub token never appears in responses or logs', async () => {
  const { env } = await makeEnv({ files: repoFiles(), ghOpts: { failAll: true } });
  const logs = [];
  const orig = [console.error, console.log, console.warn];
  console.error = console.log = console.warn = (...a) => logs.push(a.map(String).join(' '));
  try {
    const t = await token(env);
    const r = await call(env, 'GET', '/state', { token: t });
    assert.equal(r.status, 502);
    assert.deepEqual(r.json, { error: 'GitHub ไม่ตอบรับ ลองใหม่อีกครั้ง' });
    assert.equal(r.text.includes(TOKEN_SECRET), false);
    assert.equal(r.text.includes('boom'), false);
  } finally {
    [console.error, console.log, console.warn] = orig;
  }
  assert.ok(logs.length > 0);
  assert.equal(logs.join('\n').includes(TOKEN_SECRET), false);
  assert.equal(logs.join('\n').includes('boom'), false);
});
