// Cloudflare Worker entry: CORS, routing, error mapping. Testable without wrangler:
// env.GITHUB_FETCH (fetch for GitHub) and env.NOW (clock, ms) can be injected.
import { GitHubError } from './github.js';
import * as routes from './routes.js';

export { LoginGuard } from './loginguard.js'; // Durable Object class must be exported from the entry module

const STATIC_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** Exact origin match (parsed, not substring): ALLOWED_ORIGINS plus http://localhost:* and http://127.0.0.1:* */
export function originAllowed(origin, env) {
  if (typeof origin !== 'string' || origin === '') return false;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false; // rejects paths, userinfo, trailing slash, "null"
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  return String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((a) => {
      try {
        return new URL(a).origin === origin;
      } catch {
        return false;
      }
    });
}

function respond(status, body, origin, extra = {}) {
  const headers = { ...STATIC_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

// public: no token. protected: valid session. maxBody: bytes of request text allowed.
const ROUTES = {
  'GET /health': { handler: async () => ({ status: 200, body: { ok: true } }), auth: false },
  'POST /login': { handler: routes.login, auth: false, maxBody: routes.MAX_PASSWORD_BODY },
  'GET /state': { handler: routes.state, auth: true },
  'POST /save': { handler: routes.save, auth: true, maxBody: routes.MAX_SAVE_BYTES },
  'POST /upload': { handler: routes.upload, auth: true, maxBody: 16 * 1024 * 1024 }, // bigger files get a friendly 400 from the handler; this is only a hard ceiling,
  'POST /delete-upload': { handler: routes.deleteUpload, auth: true, maxBody: routes.MAX_PASSWORD_BODY },
  'POST /password': { handler: routes.changePassword, auth: true, maxBody: routes.MAX_PASSWORD_BODY },
};

async function handle(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = originAllowed(origin, env);
  const cors = allowed ? origin : null;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    if (!allowed) return respond(403, { error: 'origin not allowed' }, null);
    return new Response(null, {
      status: 204,
      headers: {
        ...STATIC_HEADERS,
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      },
    });
  }
  // A browser request from some other site is refused outright (curl sends no Origin header).
  if (origin && !allowed) return respond(403, { error: 'origin not allowed' }, null);

  const route = ROUTES[`${request.method} ${url.pathname}`];
  if (!route) return respond(404, { error: 'not found' }, cors);

  const ctx = { env, request, now: env.NOW ?? Date.now, body: undefined };
  if (route.auth && !(await routes.isAuthed(ctx))) return respond(401, { error: 'กรุณาเข้าสู่ระบบ', code: 'unauthorized' }, cors);

  if (route.maxBody) {
    const declared = Number(request.headers.get('Content-Length'));
    if (declared > route.maxBody) return respond(413, { error: 'ข้อมูลใหญ่เกินไป' }, cors);
    const text = await request.text();
    if (text.length > route.maxBody) return respond(413, { error: 'ข้อมูลใหญ่เกินไป' }, cors);
    try {
      ctx.body = JSON.parse(text);
    } catch {
      return respond(400, { error: 'ข้อมูลไม่ถูกต้อง' }, cors);
    }
  }

  const { status, body } = await route.handler(ctx);
  const extra = status === 429 && body.retryAfter ? { 'Retry-After': String(body.retryAfter) } : {};
  return respond(status, body, cors, extra);
}

export default {
  async fetch(request, env) {
    let origin = null;
    try {
      const o = request.headers.get('Origin');
      origin = originAllowed(o, env) ? o : null;
      return await handle(request, env);
    } catch (e) {
      // Never log the error object itself: it could echo request data. Name only.
      console.error('worker error:', e instanceof GitHubError ? `github ${e.status}` : e?.name ?? 'Error');
      if (e instanceof GitHubError) return respond(502, { error: 'GitHub ไม่ตอบรับ ลองใหม่อีกครั้ง' }, origin);
      return respond(500, { error: 'เกิดข้อผิดพลาดในระบบ' }, origin);
    }
  },
};
