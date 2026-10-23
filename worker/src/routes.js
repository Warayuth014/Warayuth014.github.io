// Route handlers. Each returns { status, body } (body is JSON-serialisable) and throws GitHubError
// for GitHub failures (index.js maps them to 502). Handlers never see or return secrets.
import { validateSite, validateArticle } from '../../shared/schema.js';
import { planArticles } from '../../shared/build-articles.js';
import { GENERATED_MARKER } from '../../shared/render-article.js';
import { hashPassword, verifyPassword, signSession, verifySession, fromB64 } from './auth.js';
import { checkLocked, recordFailure, clientIp } from './ratelimit.js';
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

export async function isAuthed(ctx) {
  const m = /^Bearer (.+)$/.exec(ctx.request.headers.get('Authorization') ?? '');
  if (!m || !ctx.env.SESSION_SECRET) return false;
  return verifySession(ctx.env.SESSION_SECRET, m[1], await currentVer(ctx.env), ctx.now());
}

/** Shared by /login and /password: lock check, then password check, failures counted. Returns a response on refusal, else null. */
async function checkPassword(ctx, password) {
  const ip = clientIp(ctx.request);
  const lock = await checkLocked(ctx.env.STATE, ip, ctx.now());
  if (lock.locked) return reply(429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่', retryAfter: lock.retryAfter });
  const stored = await ctx.env.STATE.get('pw:hash');
  if (!stored) return reply(503, { error: 'ยังไม่ได้ตั้งรหัสผ่าน (ดู worker/README.th.md)' });
  if (typeof password === 'string' && password.length > 0 && password.length <= 128 && (await verifyPassword(password, stored))) return null;
  await recordFailure(ctx.env.STATE, ip, ctx.now());
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
  await ctx.env.STATE.put('pw:ver', String(Number(await currentVer(ctx.env)) + 1)); // every older session stops working
  return reply(200, await newSession(ctx));
}

// ---- repo reads ---------------------------------------------------------------------------------

const articleFile = /^content\/articles\/([^/]+)\.json$/;

async function readJson(gh, files, path) {
  const sha = files.get(path);
  if (!sha) return null;
  try {
    return JSON.parse(await gh.getText(sha));
  } catch (e) {
    if (e instanceof GitHubError) throw e;
    return undefined; // present but not valid JSON
  }
}

async function readArticles(gh, files) {
  const names = [...files.keys()].filter((p) => articleFile.test(p) && p !== 'content/articles/index.json').sort();
  return Promise.all(names.map(async (p) => ({ file: p.slice('content/articles/'.length), article: await readJson(gh, files, p) })));
}

export async function state(ctx) {
  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  const files = await gh.getFiles(head.treeSha);
  const site = await readJson(gh, files, 'content/site.json');
  const entries = await readArticles(gh, files);
  return reply(200, { headSha: head.commitSha, site, articles: entries.map((e) => e.article).filter(isObj) });
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
      if (typeof s !== 'string' || !SLUG.test(s)) errors.push(`deleteArticles[${i}]: must match a-z, 0-9, - (1-60 characters)`);
      else if (payloadSlugs.has(s)) errors.push(`deleteArticles[${i}]: "${s}" is also being saved`);
    });
  }
  if (errors.length) return reply(400, { errors });
  const deleteSlugs = new Set(del);

  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  if (head.commitSha !== b.baseSha) return reply(409, { error: STALE_MESSAGE });
  const files = await gh.getFiles(head.treeSha);

  const site = b.site ?? (await readJson(gh, files, 'content/site.json'));
  if (!isObj(site)) return reply(400, { errors: ['content/site.json: missing or not valid JSON'] });

  const repoEntries = (await readArticles(gh, files)).filter((e) => {
    const slug = e.file.replace(/\.json$/, '');
    return !payloadSlugs.has(slug) && !deleteSlugs.has(slug);
  });
  const entries = [
    ...repoEntries.map((e) => (e.article === undefined ? { file: e.file, article: null } : e)),
    ...payload.map((a) => ({ file: `${a.slug}.json`, article: a })),
  ];

  // which generated pages already exist (and whether the generator made them)
  const pageRe = /^articles\/([^/]+)\/index\.html$/;
  const pages = {};
  await Promise.all([...files].filter(([p]) => pageRe.test(p)).map(async ([p, sha]) => {
    pages[pageRe.exec(p)[1]] = (await gh.getText(sha)).includes(GENERATED_MARKER);
  }));
  const listSha = files.get('articles/index.html');
  const list = listSha ? (await gh.getText(listSha)).includes(GENERATED_MARKER) : null;

  const plan = planArticles(site, entries, { pages, list });
  if (plan.errors.length) return reply(400, { errors: plan.errors });

  const changes = [];
  if (b.site !== undefined) changes.push({ path: 'content/site.json', text: json(b.site) });
  for (const a of payload) changes.push({ path: `content/articles/${a.slug}.json`, text: json(a) });
  for (const [path, text] of Object.entries(plan.files)) changes.push({ path, text });
  const deletions = [...plan.deletePaths];
  for (const slug of deleteSlugs) if (files.has(`content/articles/${slug}.json`)) deletions.push(`content/articles/${slug}.json`);
  for (const path of deletions) changes.push({ path, delete: true });

  const bad1 = changes.find((c) => !pathAllowed(c.path));
  if (bad1) return bad('ไม่อนุญาตให้เขียนไฟล์นอก content/ uploads/ articles/');

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
  try {
    await gh.commit(head, [{ path: rel, base64: b.dataBase64 }], `upload: ${rel.split('/').pop()}`);
  } catch (e) {
    if (e instanceof GitHubError && e.conflict) return reply(409, { error: STALE_MESSAGE });
    throw e;
  }
  return reply(200, { path: `/${rel}` });
}

export async function deleteUpload(ctx) {
  const p = ctx.body?.path;
  if (typeof p !== 'string' || !UPLOAD_PATH.test(p)) return bad('path ไม่ถูกต้อง');
  const rel = p.slice(1);
  if (!pathAllowed(rel)) return bad('path ไม่ถูกต้อง');
  const gh = githubClient(ctx.env);
  const head = await gh.getHead();
  const files = await gh.getFiles(head.treeSha);
  if (!files.has(rel)) return reply(404, { error: 'ไม่พบไฟล์นี้' });
  try {
    await gh.commit(head, [{ path: rel, delete: true }], `delete upload: ${rel.split('/').pop()}`);
  } catch (e) {
    if (e instanceof GitHubError && e.conflict) return reply(409, { error: STALE_MESSAGE });
    throw e;
  }
  return reply(200, { ok: true });
}
