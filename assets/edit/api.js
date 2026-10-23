// Client for the Cloudflare Worker (worker/README.th.md). Pure fetch wrapper: no DOM.
// Every failure is an ApiError with a Thai message ready to show.
import { cleanWorkerUrl } from './util.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, errors = null, retryAfter = null, network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code; // stable machine-readable reason from the Worker (bad_password, locked, conflict, unauthorized)
    this.errors = errors; // 400 from /save: list of "site: path: message" strings
    this.retryAfter = retryAfter;
    this.network = network;
  }
}

export const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * getBase(): worker URL (string, may be empty); getToken(): session token or null;
 * onUnauthorized(): called when a protected call comes back 401 (session expired or revoked).
 */
export function createApi({ getBase, getToken, onUnauthorized, fetchFn }) {
  const doFetch = fetchFn ?? ((...a) => globalThis.fetch(...a));

  async function request(method, path, body, { auth = true } = {}) {
    const base = cleanWorkerUrl(getBase());
    if (!base) throw new ApiError('ยังไม่ได้ตั้งค่า Worker URL (ตั้งได้ที่ปุ่ม "ตั้งค่า Worker URL" ด้านล่าง)');
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
    let res;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError('เชื่อมต่อ Worker ไม่ได้ ตรวจอินเทอร์เน็ตหรือ Worker URL แล้วลองใหม่ (ฉบับร่างยังอยู่ครบ)', { network: true });
    }
    let data = null;
    try {
      data = await res.json();
    } catch { /* not JSON */ }
    if (res.ok) return data ?? {};
    const message = (data && (data.error || (Array.isArray(data.errors) && 'ข้อมูลบางส่วนไม่ถูกต้อง'))) || `Worker ตอบกลับผิดปกติ (${res.status})`;
    // code bad_password on /password is a wrong current password, not an expired session
    if (res.status === 401 && auth && data?.code !== 'bad_password') onUnauthorized?.();
    throw new ApiError(message, { status: res.status, code: data?.code ?? null, errors: data?.errors ?? null, retryAfter: data?.retryAfter ?? null });
  }

  return {
    /** -> { token, expiresAt } */
    login: (password) => request('POST', '/login', { password }, { auth: false }),
    /** -> { headSha, site, articles } */
    state: () => request('GET', '/state'),
    /** payload: { baseSha, site?, articles?, deleteArticles? } -> { commitSha } */
    save: (payload) => request('POST', '/save', payload),
    /** -> { path, commitSha }. baseSha (optional) makes the Worker refuse with 409 if the repo moved. */
    async upload(file, baseSha) {
      if (!UPLOAD_TYPES.includes(file.type)) throw new ApiError('รองรับเฉพาะรูป PNG, JPG, WebP, GIF และไฟล์ PDF');
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('ไฟล์ใหญ่เกิน 8 MB');
      const dataBase64 = toBase64(new Uint8Array(await file.arrayBuffer()));
      return request('POST', '/upload', { name: file.name, contentType: file.type, dataBase64, ...(baseSha ? { baseSha } : {}) });
    },
    deleteUpload: (path, baseSha) => request('POST', '/delete-upload', { path, ...(baseSha ? { baseSha } : {}) }),
    /** -> { token, expiresAt } (a fresh session; the old ones stop working) */
    changePassword: (current, next) => request('POST', '/password', { current, next }),
  };
}
