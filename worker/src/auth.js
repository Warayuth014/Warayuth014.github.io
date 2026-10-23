// Password hashing (PBKDF2-SHA256) and signed sessions (HMAC-SHA256). WebCrypto only.
const enc = new TextEncoder();

export const HASH_ITERATIONS = 210000;
export const SESSION_SECONDS = 2 * 60 * 60;

export function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
const toB64Url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  return fromB64(p + '='.repeat((4 - (p.length % 4)) % 4));
};

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>" with a fresh 16-byte salt. */
export async function hashPassword(password, iterations = HASH_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1000000) return false;
  let salt;
  let expected;
  try {
    salt = fromB64(parts[2]);
    expected = fromB64(parts[3]);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return equalBytes(actual, expected);
}

const hmacKey = (secret, usages) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);

/** token = base64url(JSON{exp, ver}) + "." + base64url(HMAC-SHA256). exp in epoch seconds. */
export async function signSession(secret, ver, nowMs) {
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const payload = toB64Url(enc.encode(JSON.stringify({ exp, ver })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), enc.encode(payload));
  return { token: `${payload}.${toB64Url(new Uint8Array(sig))}`, expiresAt: exp * 1000 };
}

/** Returns true only for an intact, unexpired token whose ver equals currentVer. */
export async function verifySession(secret, token, currentVer, nowMs) {
  if (typeof token !== 'string' || token.length > 2000) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), fromB64Url(parts[1]), enc.encode(parts[0]));
    if (!ok) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(parts[0])));
    return Number.isFinite(data.exp) && data.exp * 1000 > nowMs && String(data.ver) === String(currentVer);
  } catch {
    return false;
  }
}
