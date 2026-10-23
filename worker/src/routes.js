// Route handlers. Each returns { status, body } (body is JSON-serialisable) and throws GitHubError
// for GitHub failures (index.js maps them to 502). Handlers never see or return secrets.
import { validateSite, validateArticle } from '../../shared/schema.js';
import { planArticles } from '../../shared/build-articles.js';
import { hashPassword, verifyPassword, signSession, verifySession, fromB64 } from './auth.js';
import { reserveAttempt, releaseAttempt, clientIp } from './ratelimit.js';
import { githubClient, GitHubError } from './github.js';

export const STALE_MESSAGE = 'มีคนบันทึกก่อนหน้า กดโหลดใหม่';
const BAD_PASSWORD = 'รหัสไม่ถูกต้อง';

export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BODY = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4096;
export const MAX_PASSWORD_BODY = 4096;

const SLUG = /^[a-z0-9-]{1,60}$/;
const ALLOWED_PREFIXES = ['content/', 'uploads/', 'articles/'];
const UPLOAD_PATH = /^\/uploads\/\d{4}\/[a-z0-9-]+\.(png|jpe?g|webp|gif|pdf)$/;

const reply = (status, body) => ({ status, body });
const bad = (error) => reply(400, { error });
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** Writes and deletions may only touch content/, uploads/, articles/ — no traversal, no absolute or backslash paths. */
export function pathAllowed(p) {
  if (typeof p !== 'string' || p === '' || p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  if (p.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return false;
  return ALLOWED_PREFIXES.some((pre) => p.startsWith(pre));
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---- auth ---------------------------------------------------------------------------------------

async function currentVer(env) {
  return (await env.STATE.get('pw:ver')) ?? '1';
}

/** pw:ver + 1; anything that is not a number counts as 1 */
async function nextVer(env) {
  const n = Number(await currentVer(env));
  return String((Number.isFinite(n) ? n : 1) + 1);
}

export async function isAuthed(ctx) {
  const m = /^Bearer (.+)$/.exec(ctx.request.headers.get('Authorization') ?? '');
  if (!m || !ctx.env.SESSION_SECRET) return false;
  return verifySession(ctx.env.SESSION_SECRET, m[1], await currentVer(ctx.env), ctx.now());
}

/**
 * Shared by /login and /password. The attempt is reserved in the LoginGuard Durable Object BEFORE the
 * slow check (so parallel guesses are counted), and released again when the password is right.
 * Returns a response on refusal, else null.
 */
async function checkPassword(ctx, password) {
  const ip = clientIp(ctx.request);
  const lock = await reserveAttempt(ctx.env, ip, ctx.now());
  if (lock.locked) return reply(429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่', retryAfter: lock.retryAfter });
  const stored = await ctx.env.STATE.get('pw:hash');
  if (!stored) {
    await releaseAttempt(ctx.env, ip, ctx.now());
    return reply(503, { error: 'ยังไม่ได้ตั้งรหัสผ่าน (ดู worker/README.th.md)' });
  }
  if (typeof password === 'string' && password.length > 0 && password.length <= 128 && (await verifyPassword(password, stored))) {
    await releaseAttempt(ctx.env, ip, ctx.now());
    return null;
  }
  return reply(401, { error: BAD_PASSWORD });
}

async function newSession(ctx) {
  return signSession(ctx.env.SESSION_SECRET, await currentVer(ctx.env), ctx.now());
}

export async function login(ctx) {
  const refused = await checkPassword(ctx, ctx.body?.password);
  if (refused) return refused;
  return reply(200, await newSession(ctx));
}

export async function changePassword(ctx) {
  const refused = await checkPassword(ctx, ctx.body?.current);
  if (refused) return refused;
  const next = ctx.body?.next;
  if (typeof next !== 'string' || next.length < 6 || next.length > 128) return bad('รหัสใหม่ต้องยาว 6 ถึง 128 ตัวอักษร');
  await ctx.env.STATE.put('pw:hash', await hashPassword(next));
  await ctx.env.STATE.put('pw:ver', await nextVer(ctx.env)); // every older session stops working
  return reply(200, await newSession(ctx));
}

// ---- repo reads ---------------------------------------------------------------------------------

const tryParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // present but not valid JSON
  }
};

/** Everything a save or /state needs from the repo at the head: 2 subrequests (tree listing + one GraphQL read). */
async function readRepo(gh, head) {
  const [files, content] = await Promise.all([gh.getFiles(head.treeSha), gh.getContent(head.commitSha)]);
  const site = content.site === null ? null : tryParse(content.site);
  const entries = content.articles
    .filter((f) => f.name.endsWith('.json') && f.name !== 'index.json')
    .sort((x, y) => (x.name < y.name ? -1 : 1))
    .map((f) => ({ file: f.name, article: tryParse(f.text) }));
  const prev = tryParse(content.articles.find((f) => f.name === 'index.json')?.text ?? '[]');
  const indexedSlugs = new Set(Array.isArray(prev) ? prev.map((x) => x?.slug) : []);
  return { files, site, entries, indexedSlugs };
}

export async function state(ctx) {
  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  const { site, entries } = await readRepo(gh, head);
  return reply(200, { headSha: head.commitSha, site: site ?? null, articles: entries.map((e) => e.article).filter(isObj) });
}

/** git's blob id of a text, so unchanged files can be skipped without reading them back */
async function gitBlobSha(text) {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}${String.fromCharCode(0)}`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ---- save ---------------------------------------------------------------------------------------

function commitMessage({ site, articles, deleted }) {
  const parts = [];
  if (site) parts.push('site');
  if (articles.length) {
    const shown = articles.slice(0, 3).join(', ');
    parts.push(`articles ${shown}${articles.length > 3 ? ` +${articles.length - 3}` : ''}`);
  }
  if (deleted.length) parts.push(`delete ${deleted.slice(0, 3).join(', ')}${deleted.length > 3 ? ` +${deleted.length - 3}` : ''}`);
  return `edit: ${parts.join(', ') || 'content'}`;
}

export async function save(ctx) {
  const b = ctx.body;
  if (!isObj(b)) return bad('ข้อมูลไม่ถูกต้อง');
  if (typeof b.baseSha !== 'string' || b.baseSha === '') return bad('ไม่มี baseSha');

  const errors = [];
  if (b.site !== undefined) {
    const v = validateSite(b.site);
    if (!v.ok) errors.push(...v.errors.map((m) => `site: ${m}`));
  }
  const payload = b.articles === undefined ? [] : b.articles;
  if (!Array.isArray(payload)) errors.push('articles: must be a list');
  const payloadSlugs = new Set();
  if (Array.isArray(payload)) {
    payload.forEach((a, i) => {
      const v = validateArticle(a);
      if (!v.ok) errors.push(...v.errors.map((m) => `articles[${i}]: ${m}`));
      else if (payloadSlugs.has(a.slug)) errors.push(`articles[${i}]: duplicate slug "${a.slug}"`);
      else payloadSlugs.add(a.slug);
    });
  }
  const del = b.deleteArticles === undefined ? [] : b.deleteArticles;
  if (!Array.isArray(del) || del.length > 200) errors.push('deleteArticles: must be a list of slugs');
  else {
    del.forEach((s, i) => {
      if (typeof s !== 'string' || !SLUG.test(s) || s === 'index') errors.push(`deleteArticles[${i}]: must match a-z, 0-9, - (1-60 characters)`);
      else if (payloadSlugs.has(s)) errors.push(`deleteArticles[${i}]: "${s}" is also being saved`);
    });
  }
  if (errors.length) return reply(400, { errors });
  const deleteSlugs = new Set(del);

  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  if (head.commitSha !== b.baseSha) return reply(409, { error: STALE_MESSAGE });
  const repo = await readRepo(gh, head);
  const { files } = repo;

  const site = b.site ?? repo.site;
  if (!isObj(site)) return reply(400, { errors: ['content/site.json: missing or not valid JSON'] });

  const entries = [
    ...repo.entries.filter((e) => {
      const slug = e.file.replace(/\.json$/, '');
      return !payloadSlugs.has(slug) && !deleteSlugs.has(slug);
    }),
    ...payload.map((a) => ({ file: `${a.slug}.json`, article: a })),
  ];

  // Which pages exist is decided from the tree listing, never by reading page bodies: an existing
  // articles/<slug>/index.html counts as generated when its article JSON exists at the head or the
  // previous index.json lists it; anything else is a hand-made page and is never overwritten.
  const pageRe = /^articles\/([^/]+)\/index\.html$/;
  const pages = {};
  for (const p of files.keys()) {
    const m = pageRe.exec(p);
    if (m) pages[m[1]] = files.has(`content/articles/${m[1]}.json`) || repo.indexedSlugs.has(m[1]);
  }
  const list = files.has('articles/index.html') ? files.has('content/articles/index.json') : null;

  const plan = planArticles(site, entries, { pages, list });
  if (plan.errors.length) return reply(400, { errors: plan.errors });

  const wanted = [];
  if (b.site !== undefined) wanted.push({ path: 'content/site.json', text: json(b.site) });
  for (const a of payload) wanted.push({ path: `content/articles/${a.slug}.json`, text: json(a) });
  for (const [path, text] of Object.entries(plan.files)) wanted.push({ path, text });
  const deletions = [...plan.deletePaths];
  for (const slug of deleteSlugs) deletions.push(`content/articles/${slug}.json`);

  // only what actually changes goes into the commit (keeps subrequests small)
  const changes = [];
  for (const w of wanted) if (files.get(w.path) !== (await gitBlobSha(w.text))) changes.push(w);
  for (const path of deletions) if (files.has(path)) changes.push({ path, delete: true });

  if (changes.some((c) => !pathAllowed(c.path))) return bad('ไม่อนุญาตให้เขียนไฟล์นอก content/ uploads/ articles/');
  if (changes.length === 0) return reply(200, { commitSha: head.commitSha });

  const message = commitMessage({ site: b.site !== undefined, articles: payload.map((a) => a.slug), deleted: [...deleteSlugs] });
  try {
    return reply(200, { commitSha: await gh.commit(head, changes, message) });
  } catch (e) {
    if (e instanceof GitHubError && e.conflict) return reply(409, { error: STALE_MESSAGE });
    throw e;
  }
}

// ---- uploads ------------------------------------------------------------------------------------

const TYPES = {
  'image/png': { ext: 'png', magic: (u) => startsWith(u, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/jpeg': { ext: 'jpg', magic: (u) => startsWith(u, [0xff, 0xd8, 0xff]) },
  'image/webp': { ext: 'webp', magic: (u) => startsWith(u, [0x52, 0x49, 0x46, 0x46]) && startsWith(u, [0x57, 0x45, 0x42, 0x50], 8) },
  'image/gif': { ext: 'gif', magic: (u) => startsWith(u, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(u, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) },
  'application/pdf': { ext: 'pdf', magic: (u) => startsWith(u, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
};
function startsWith(bytes, sig, at = 0) {
  return sig.every((v, i) => bytes[at + i] === v);
}

function safeName(name) {
  const base = String(name ?? '').replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return base || 'file';
}

export async function upload(ctx) {
  const b = ctx.body;
  if (!isObj(b)) return bad('ข้อมูลไม่ถูกต้อง');
  const type = TYPES[b.contentType];
  if (!type) return bad('รองรับเฉพาะรูป PNG, JPG, WebP, GIF และไฟล์ PDF');
  if (typeof b.dataBase64 !== 'string' || b.dataBase64 === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.dataBase64)) return bad('ไฟล์ไม่ถูกต้อง');
  if (b.dataBase64.length > MAX_UPLOAD_BODY) return bad('ไฟล์ใหญ่เกิน 8 MB');
  let bytes;
  try {
    bytes = fromB64(b.dataBase64);
  } catch {
    return bad('ไฟล์ไม่ถูกต้อง');
  }
  if (bytes.length > MAX_UPLOAD_BYTES) return bad('ไฟล์ใหญ่เกิน 8 MB');
  if (!type.magic(bytes)) return bad('เนื้อไฟล์ไม่ตรงกับชนิดที่ระบุ');

  const rand = [...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const year = new Date(ctx.now()).getUTCFullYear();
  const rel = `uploads/${year}/${rand}-${safeName(b.name)}.${type.ext}`;
  if (!pathAllowed(rel)) return bad('ชื่อไฟล์ไม่ถูกต้อง');

  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  if (typeof b.baseSha === 'string' && b.baseSha !== head.commitSha) return reply(409, { error: STALE_MESSAGE });
  try {
    const commitSha = await gh.commit(head, [{ path: rel, base64: b.dataBase64 }], `upload: ${rel.split('/').pop()}`);
    return reply(200, { path: `/${rel}`, commitSha });
  } catch (e) {
    if (e instanceof GitHubError && e.conflict) return reply(409, { error: STALE_MESSAGE });
    throw e;
  }
}

export async function deleteUpload(ctx) {
  const p = ctx.body?.path;
  if (typeof p !== 'string' || !UPLOAD_PATH.test(p)) return bad('path ไม่ถูกต้อง');
  const rel = p.slice(1);
  if (!pathAllowed(rel)) return bad('path ไม่ถูกต้อง');
  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  if (typeof ctx.body.baseSha === 'string' && ctx.body.baseSha !== head.commitSha) return reply(409, { error: STALE_MESSAGE });
  const files = await gh.getFiles(head.treeSha);
  if (!files.has(rel)) return reply(404, { error: 'ไม่พบไฟล์นี้' });
  try {
    const commitSha = await gh.commit(head, [{ path: rel, delete: true }], `delete upload: ${rel.split('/').pop()}`);
    return reply(200, { ok: true, commitSha });
  } catch (e) {
    if (e instanceof GitHubError && e.conflict) return reply(409, { error: STALE_MESSAGE });
    throw e;
  }
}
