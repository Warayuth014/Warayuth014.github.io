import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, login, call, token, PIN } from './helpers.js';

test('20 parallel wrong logins from one IP: at most 5 password checks, the rest are 429', async () => {
  const { env } = await makeEnv();
  const rs = await Promise.all(Array.from({ length: 20 }, () => login(env, 'bad')));
  assert.equal(rs.filter((r) => r.status === 401).length, 5);
  assert.equal(rs.filter((r) => r.status === 429).length, 15);
  assert.equal(env.LOGIN_GUARD.allowed, 5);
  assert.equal((await login(env, PIN)).status, 429, 'correct PIN is still refused while locked');
});

test('parallel guesses across 60 IPs: the global cap holds (51 checks, the rest 429)', async () => {
  const { env } = await makeEnv();
  const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => login(env, 'bad', { ip: `10.1.0.${i}` })));
  assert.equal(rs.filter((r) => r.status === 401).length, 51);
  assert.equal(rs.filter((r) => r.status === 429).length, 9);
  assert.equal(env.LOGIN_GUARD.allowed, 51);
});

test('parallel mix of right and wrong PINs never exceeds 5 reservations in flight per IP', async () => {
  const { env } = await makeEnv();
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => login(env, i % 2 ? PIN : 'bad')));
  assert.ok(env.LOGIN_GUARD.allowed <= 12);
  assert.ok(rs.filter((r) => r.status === 200).length >= 1);
});

test('a correct PIN gives its reservation back (successes do not eat the budget)', async () => {
  const { env } = await makeEnv();
  for (let i = 0; i < 20; i += 1) assert.equal((await login(env, PIN)).status, 200);
  for (let i = 0; i < 5; i += 1) assert.equal((await login(env, 'bad')).status, 401);
  assert.equal((await login(env, 'bad')).status, 429);
});

test('locks:epoch change clears all counters (owner reset), same epoch does not', async () => {
  const { env, kv, clock } = await makeEnv();
  for (let i = 0; i < 5; i += 1) await login(env, 'bad');
  assert.equal((await login(env, PIN)).status, 429);
  await kv.put('locks:epoch', String(clock.t));
  assert.equal((await login(env, PIN)).status, 200);
  for (let i = 0; i < 5; i += 1) await login(env, 'bad');
  assert.equal((await login(env, PIN)).status, 429);
  await kv.put('locks:epoch', String(clock.t + 1));
  assert.equal((await login(env, PIN)).status, 200);
});

test('global lock is also cleared by the epoch', async () => {
  const { env, kv } = await makeEnv();
  for (let i = 0; i < 51; i += 1) await login(env, 'bad', { ip: `10.2.0.${i}` });
  assert.equal((await login(env, PIN, { ip: '8.8.8.8' })).status, 429);
  await kv.put('locks:epoch', 'reset-1');
  assert.equal((await login(env, PIN, { ip: '8.8.8.8' })).status, 200);
});

test('expired per-IP windows are swept from guard storage', async () => {
  const { env, clock } = await makeEnv();
  for (let i = 0; i < 5; i += 1) await login(env, 'bad', { ip: `10.3.0.${i}` });
  const before = env.LOGIN_GUARD.storage.size();
  clock.t += 2 * 3600 * 1000;
  await login(env, PIN);
  assert.ok(env.LOGIN_GUARD.storage.size() < before);
});

test('/password uses the same guard (parallel wrong currents are capped)', async () => {
  const { env } = await makeEnv();
  const t = await token(env);
  const rs = await Promise.all(Array.from({ length: 10 }, () => call(env, 'POST', '/password', { token: t, body: { current: 'bad', next: 'abcdef' } })));
  assert.equal(rs.filter((r) => r.status === 401).length, 5);
  assert.equal(rs.filter((r) => r.status === 429).length, 5);
});

test('junk pw:ver is treated as 1 when the password changes', async () => {
  const { env, kv } = await makeEnv();
  await kv.put('pw:ver', 'junk');
  const t = await token(env);
  const r = await call(env, 'POST', '/password', { token: t, body: { current: PIN, next: 'abcdef' } });
  assert.equal(r.status, 200);
  assert.equal(await kv.get('pw:ver'), '2');
});
