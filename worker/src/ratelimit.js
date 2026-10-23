// Login failure limits kept in KV. Only failures write; successful logins touch nothing.
//   fail:ip:<ip>            count (metadata.reset = window end, epoch ms); 5 failures -> that IP is refused until reset
//   fail:global:<YYYYMMDDHH> count; more than 50 in the hour -> every login is refused until the hour ends
// KV is not atomic, so a burst of parallel guesses can slip a few extra tries past the counter; the
// PBKDF2 cost and the global cap bound that.
export const IP_LIMIT = 5;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const GLOBAL_LIMIT = 50;
const HOUR_MS = 60 * 60 * 1000;

const ipKey = (ip) => `fail:ip:${ip}`;
const hourKey = (nowMs) => `fail:global:${new Date(nowMs).toISOString().slice(0, 13).replace(/\D/g, '')}`;
const secondsUntil = (ms, nowMs) => Math.max(1, Math.ceil((ms - nowMs) / 1000));
// KV refuses a TTL below 60 seconds
const ttl = (ms, nowMs) => Math.max(60, secondsUntil(ms, nowMs));

async function read(kv, key) {
  const { value, metadata } = await kv.getWithMetadata(key);
  return { count: Number(value) || 0, reset: Number(metadata?.reset) || 0 };
}

/** { locked: false } or { locked: true, retryAfter } (seconds). Call before checking the password. */
export async function checkLocked(kv, ip, nowMs) {
  const ipState = await read(kv, ipKey(ip));
  if (ipState.count >= IP_LIMIT && ipState.reset > nowMs) return { locked: true, retryAfter: secondsUntil(ipState.reset, nowMs) };
  const g = await read(kv, hourKey(nowMs));
  if (g.count > GLOBAL_LIMIT) {
    const hourEnd = (Math.floor(nowMs / HOUR_MS) + 1) * HOUR_MS;
    return { locked: true, retryAfter: secondsUntil(hourEnd, nowMs) };
  }
  return { locked: false };
}

export async function recordFailure(kv, ip, nowMs) {
  const s = await read(kv, ipKey(ip));
  const live = s.reset > nowMs;
  const reset = live ? s.reset : nowMs + IP_WINDOW_MS;
  await kv.put(ipKey(ip), String((live ? s.count : 0) + 1), { expirationTtl: ttl(reset, nowMs), metadata: { reset } });

  const hourEnd = (Math.floor(nowMs / HOUR_MS) + 1) * HOUR_MS;
  const g = await read(kv, hourKey(nowMs));
  await kv.put(hourKey(nowMs), String(g.count + 1), { expirationTtl: ttl(hourEnd, nowMs) });
}

export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';

// key names, used by scripts/set-password.mjs --reset-locks
export { hourKey as globalKey, ipKey };
