import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, login, token, repoFiles, PIN } from './helpers.js';

test('errors carry stable codes: bad_password, locked, conflict, unauthorized', async () => {
  const { env, gh } = await makeEnv({ files: repoFiles() });
  const bad = await login(env, 'nope-nope');
  assert.equal(bad.status, 401);
  assert.equal(bad.json.code, 'bad_password');

  const tok = await token(env);
  const wrongCurrent = await call(env, 'POST', '/password', { token: tok, body: { current: 'wrong', next: 'abcdef' } });
  assert.equal(wrongCurrent.json.code, 'bad_password');

  const noAuth = await call(env, 'GET', '/state');
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.json.code, 'unauthorized');

  const stale = gh.head;
  gh.bump();
  const save = await call(env, 'POST', '/save', { token: tok, body: { baseSha: stale } });
  assert.equal(save.status, 409);
  assert.equal(save.json.code, 'conflict');

  for (let i = 0; i < 5; i += 1) await login(env, `bad-${i}`, { ip: '9.9.9.9' });
  const locked = await login(env, PIN, { ip: '9.9.9.9' });
  assert.equal(locked.status, 429);
  assert.equal(locked.json.code, 'locked');
});
