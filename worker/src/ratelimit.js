// Client for the LoginGuard Durable Object (see loginguard.js). KV only contributes `locks:epoch`,
// the owner's "clear all locks" marker (written by scripts/set-password.mjs --reset-locks).
async function callGuard(env, action, payload) {
  const stub = env.LOGIN_GUARD.get(env.LOGIN_GUARD.idFromName('global'));
  const res = await stub.fetch(`https://login-guard/${action}`, { method: 'POST', body: JSON.stringify(payload) });
  return res.json();
}

/** Reserve one password attempt. { locked:false } or { locked:true, retryAfter } (seconds). */
export async function reserveAttempt(env, ip, now) {
  const epoch = (await env.STATE.get('locks:epoch')) ?? '';
  return callGuard(env, 'attempt', { ip, now, epoch });
}

/** Give a reservation back (the password was right, so it was not a failure). */
export async function releaseAttempt(env, ip, now) {
  await callGuard(env, 'release', { ip, now });
}

export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';
