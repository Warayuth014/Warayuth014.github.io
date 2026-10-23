// Test doubles: in-memory KV (with expirationTtl + metadata) and a fake GitHub Git Data API.
import { fakeGitHub } from './fake-github.js';
import worker from '../src/index.js';
import { hashPassword } from '../src/auth.js';
import { LoginGuard } from '../src/loginguard.js';

export const TOKEN_SECRET = 'FAKE-GH-TOKEN-for-tests-123';
export const ORIGIN = 'https://warayuth014.github.io';
export const PIN = '123456';

export function fakeKV(nowFn) {
  const m = new Map();
  const live = (k) => {
    const e = m.get(k);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt <= nowFn()) { m.delete(k); return null; }
    return e;
  };
  return {
    store: m,
    async get(k) { return live(k)?.value ?? null; },
    async getWithMetadata(k) { const e = live(k); return { value: e?.value ?? null, metadata: e?.metadata ?? null }; },
    async put(k, v, opts = {}) {
      if (opts.expirationTtl !== undefined && opts.expirationTtl < 60) throw new Error('KV: expirationTtl must be >= 60');
      m.set(k, { value: String(v), metadata: opts.metadata, expiresAt: opts.expirationTtl ? nowFn() + opts.expirationTtl * 1000 : 0 });
    },
    async delete(k) { m.delete(k); },
  };
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/** In-memory stand-in for DO storage (the subset LoginGuard uses). Every op yields, so races would show. */
export function fakeStorage() {
  const m = new Map();
  const tick = () => new Promise((r) => setImmediate(r));
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  return {
    async get(k) { await tick(); return clone(m.get(k)); },
    async put(k, v) { await tick(); m.set(k, clone(v)); },
    async delete(k) { await tick(); for (const x of Array.isArray(k) ? k : [k]) m.delete(x); },
    async deleteAll() { await tick(); m.clear(); },
    async list({ prefix = '' } = {}) { await tick(); return new Map([...m].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, clone(v)])); },
    size: () => m.size,
  };
}

/** Fake DurableObjectNamespace with one LoginGuard instance; counts reservations that were let through. */
export function fakeGuardNamespace() {
  const storage = fakeStorage();
  const guard = new LoginGuard({ storage });
  const ns = {
    storage,
    allowed: 0,
    idFromName: (n) => n,
    get: () => ({
      async fetch(url, init) {
        const res = await guard.fetch(new Request(url, init));
        if (new URL(url).pathname === '/attempt') {
          const clone = res.clone();
          if ((await clone.json()).locked === false) ns.allowed += 1;
        }
        return res;
      },
    }),
  };
  return ns;
}

export async function makeEnv({ files = {}, ghOpts = {}, withPassword = true } = {}) {
  const clock = { t: Date.UTC(2026, 9, 24, 10, 0, 0) };
  const now = () => clock.t;
  const kv = fakeKV(now);
  if (withPassword) await kv.put('pw:hash', await hashPassword(PIN, 1000)); // low iterations: test speed
  const gh = fakeGitHub(files, ghOpts);
  const env = {
    LOGIN_GUARD: fakeGuardNamespace(),
    STATE: kv, REPO: 'Warayuth014/Warayuth014.github.io', BRANCH: 'main', ALLOWED_ORIGINS: ORIGIN,
    GITHUB_TOKEN: TOKEN_SECRET, SESSION_SECRET: 'test-session-secret', GITHUB_FETCH: gh.fetch, NOW: now,
  };
  return { env, kv, gh, clock };
}

export async function call(env, method, path, { body, token, ip = '1.2.3.4', origin, headers = {} } = {}) {
  const h = { 'CF-Connecting-IP': ip, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  if (origin) h.Origin = origin;
  const res = await worker.fetch(new Request(`https://w.example${path}`, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* none */ }
  return { status: res.status, json, text, headers: res.headers };
}

export async function login(env, password = PIN, opts = {}) {
  return call(env, 'POST', '/login', { body: { password }, ...opts });
}
export async function token(env) { return (await login(env)).json.token; }

export const site = (over = {}) => ({
  version: 1,
  theme: { bg1: '#0b0f1d', bg2: '#1d0f2e', accent1: '#7cf3ff', accent2: '#a98bff', accent3: '#ff6fd1', mode: 'dark', fontPair: 'default', effects: { hero3d: true, threads: true } },
  sections: [{ id: 'hero', visible: true }],
  nav: ['hero'],
  hero: { name: { th: 'วารุฒ', en: 'Warayuth' }, intro: { th: '', en: '' }, ctaWork: { th: '', en: '' }, ctaResume: { th: '', en: '' } },
  about: { photo: null, story: { th: '', en: '' }, facts: [] },
  projects: [], skills: [], journey: [],
  contact: { email: 'a@b.co', phone: null, links: [] },
  resume: { file: null, kind: null },
  workerUrl: '',
  ...over,
});

export const article = (slug, over = {}) => ({
  slug, title: { th: 'หัวข้อ', en: 'Title' }, summary: { th: 's', en: 's' }, body: { th: '<p>x</p>', en: '<p>y</p>' },
  tags: [], cover: null, date: '2026-10-24', published: true, ...over,
});

export const repoFiles = () => ({ 'content/site.json': JSON.stringify(site(), null, 2) + '\n', 'content/articles/index.json': '[]\n' });
export { b64, fakeGitHub };
