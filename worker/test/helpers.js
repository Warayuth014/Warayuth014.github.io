// Test doubles: in-memory KV (with expirationTtl + metadata) and a fake GitHub Git Data API.
import { createHash } from 'node:crypto';
import worker from '../src/index.js';
import { hashPassword } from '../src/auth.js';

export const TOKEN_SECRET = 'ghp_SECRET_TOKEN_VALUE_123';
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

const gitSha = (s) => createHash('sha1').update(s).digest('hex');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/** Fake GitHub. files: path -> string (utf8 text) or Buffer. */
export function fakeGitHub(initial = {}, { failRefPatch = 0, failAll = false } = {}) {
  const blobs = new Map(); // sha -> Buffer
  const trees = new Map(); // sha -> Map(path -> blobSha)
  const commits = new Map(); // sha -> {tree, parents}
  const calls = [];
  let n = 0;
  const addBlob = (buf) => { const sha = gitSha(`blob${n += 1}${buf.toString('base64')}`); blobs.set(sha, buf); return sha; };
  const addTree = (map) => { const sha = gitSha(`tree${n += 1}`); trees.set(sha, map); return sha; };
  const addCommit = (tree, parents) => { const sha = gitSha(`commit${n += 1}`); commits.set(sha, { tree, parents }); return sha; };

  const t0 = new Map(Object.entries(initial).map(([p, c]) => [p, addBlob(Buffer.isBuffer(c) ? c : Buffer.from(c, 'utf8'))]));
  const state = { head: addCommit(addTree(t0), []) };
  const out = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, headers: init.headers });
    if (failAll) return out(500, { message: 'boom', leaked: init.headers.Authorization });
    let m;
    if (method === 'GET' && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) return out(200, { object: { sha: state.head } });
    if (method === 'GET' && (m = /^\/git\/commits\/(.+)$/.exec(path))) return out(200, { tree: { sha: commits.get(m[1]).tree } });
    if (method === 'GET' && (m = /^\/git\/trees\/(.+)$/.exec(path))) {
      return out(200, { truncated: false, tree: [...trees.get(m[1])].map(([p, sha]) => ({ path: p, type: 'blob', sha })) });
    }
    if (method === 'GET' && (m = /^\/git\/blobs\/(.+)$/.exec(path))) return out(200, { content: blobs.get(m[1]).toString('base64'), encoding: 'base64' });
    if (method === 'POST' && path === '/git/blobs') return out(201, { sha: addBlob(Buffer.from(body.content, 'base64')) });
    if (method === 'POST' && path === '/git/trees') {
      const next = new Map(trees.get(body.base_tree));
      for (const e of body.tree) { if (e.sha === null) next.delete(e.path); else next.set(e.path, e.sha); }
      return out(201, { sha: addTree(next) });
    }
    if (method === 'POST' && path === '/git/commits') return out(201, { sha: addCommit(body.tree, body.parents) });
    if (method === 'PATCH' && path.startsWith('/git/refs/heads/')) {
      if (failRefPatch > 0) { failRefPatch -= 1; return out(422, { message: 'Update is not a fast forward' }); }
      if (commits.get(body.sha).parents[0] !== state.head) return out(422, { message: 'Update is not a fast forward' });
      state.head = body.sha;
      return out(200, {});
    }
    return out(404, { message: 'unknown' });
  };

  return {
    fetch,
    calls,
    get head() { return state.head; },
    /** advance head with an unrelated commit (simulates a concurrent save) */
    bump() { const t = new Map(trees.get(commits.get(state.head).tree)); t.set('content/other.txt', addBlob(Buffer.from('x'))); state.head = addCommit(addTree(t), [state.head]); },
    files() { return new Map([...trees.get(commits.get(state.head).tree)].map(([p, s]) => [p, blobs.get(s)])); },
    text(p) { return this.files().get(p)?.toString('utf8'); },
    commitCount() { return calls.filter((c) => c.method === 'POST' && c.path === '/git/commits').length; },
    writes() { return calls.filter((c) => c.method !== 'GET'); },
  };
}

export async function makeEnv({ files = {}, ghOpts = {}, withPassword = true } = {}) {
  const clock = { t: Date.UTC(2026, 9, 24, 10, 0, 0) };
  const now = () => clock.t;
  const kv = fakeKV(now);
  if (withPassword) await kv.put('pw:hash', await hashPassword(PIN, 1000)); // low iterations: test speed
  const gh = fakeGitHub(files, ghOpts);
  const env = {
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
export { b64 };
