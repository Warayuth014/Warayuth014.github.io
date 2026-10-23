// Editor shell: login, draft state, panels, live preview, validation and saving through the Worker.
// The draft lives in memory and in localStorage ("editor.draft"); the session token only in sessionStorage.
import { validateSite, validateArticle, SECTION_TITLE_IDS } from '../../shared/schema.js';
import { renderArticlePage } from '../../shared/render-article.js';
import { createApi, ApiError } from './api.js';
import { cleanWorkerUrl, UPLOAD_FILE } from './util.js';
import { el, button, nextId, labelText } from './ui.js';
import * as sections from './panels/sections.js';
import * as texts from './panels/texts.js';
import * as theme from './panels/theme.js';
import * as projects from './panels/projects.js';
import * as skills from './panels/skills.js';
import * as journey from './panels/journey.js';
import * as articles from './panels/articles.js';
import * as resume from './panels/resume.js';
import * as contact from './panels/contact.js';
import * as settings from './panels/settings.js';

export const SAVED_MESSAGE = 'บันทึกแล้ว — เว็บจริงจะเปลี่ยนในประมาณ 1 นาที';
const PANELS = [sections, texts, theme, projects, skills, journey, articles, resume, contact, settings];
const SESSION_KEY = 'editor.session';
const DRAFT_KEY = 'editor.draft';
const URL_KEY = 'editor.workerUrl';

const app = document.getElementById('app');
const live = document.getElementById('live');

// ---------- storage helpers (every access can throw in private windows) ----------
const store = {
  get(area, key) { try { return area.getItem(key); } catch { return null; } },
  set(area, key, v) { try { area.setItem(key, v); return true; } catch { return false; } },
  del(area, key) { try { area.removeItem(key); } catch { /* ignore */ } },
};
const readJson = (area, key) => { try { return JSON.parse(store.get(area, key)); } catch { return null; } };

// ---------- state ----------
const S = {
  token: null,
  baseSha: null,
  baseline: { site: '', articles: new Map() }, // JSON text of what the repo has
  draft: { site: null, articles: [] },
  deleted: [], // slugs of saved articles removed in the draft
  pendingDeletes: [], // /uploads/... files nothing in the draft uses any more; deleted only after a successful save
  savedSlugs: new Set(),
  errors: new Map(),
  errorList: [],
  panel: 'sections',
  previewMode: 'site',
  previewArticle: null,
  articleLang: 'th',
  siteWorkerUrl: '',
  saving: false,
  ready: false,
};

const workerUrl = () => store.get(localStorage, URL_KEY) || S.siteWorkerUrl || '';
const api = createApi({
  getBase: workerUrl,
  getToken: () => S.token,
  onUnauthorized: () => sessionEnded('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง (ฉบับร่างของคุณยังอยู่)'),
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function announce(msg) {
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}

/** Fill in anything a hand-edited site.json might lack so every panel has something to bind to. */
function ensureShape(site) {
  const L = () => ({ th: '', en: '' });
  const o = (parent, key, make) => { if (!isObj(parent[key]) && !Array.isArray(make)) parent[key] = make; return parent[key]; };
  o(site, 'theme', { bg1: '#0b0f1d', bg2: '#1d0f2e', accent1: '#7cf3ff', accent2: '#a98bff', accent3: '#ff6fd1', mode: 'dark', fontPair: 'default', effects: {} });
  if (!isObj(site.theme.effects)) site.theme.effects = {};
  if (typeof site.theme.effects.hero3d !== 'boolean') site.theme.effects.hero3d = true;
  if (typeof site.theme.effects.threads !== 'boolean') site.theme.effects.threads = true;
  if (!Array.isArray(site.sections)) site.sections = [];
  if (!Array.isArray(site.nav)) site.nav = [];
  o(site, 'hero', {});
  for (const k of ['name', 'intro', 'ctaWork', 'ctaResume']) if (!isObj(site.hero[k])) site.hero[k] = L();
  o(site, 'about', { photo: null });
  if (!isObj(site.about.story)) site.about.story = L();
  if (!Array.isArray(site.about.facts)) site.about.facts = [];
  for (const k of ['projects', 'skills', 'journey']) if (!Array.isArray(site[k])) site[k] = [];
  o(site, 'contact', { email: '', phone: null });
  if (!Array.isArray(site.contact.links)) site.contact.links = [];
  if (site.contact.phone === undefined) site.contact.phone = null;
  o(site, 'resume', { file: null, kind: null });
  // editable texts: empty means "use the built-in text"
  o(site, 'ui', {});
  for (const k of ['tagline', 'contactLead', 'footer']) if (!isObj(site.ui[k])) site.ui[k] = L();
  o(site.ui, 'sectionTitles', {});
  for (const id of SECTION_TITLE_IDS) if (!isObj(site.ui.sectionTitles[id])) site.ui.sectionTitles[id] = L();
  o(site, 'meta', {});
  for (const k of ['title', 'description']) if (!isObj(site.meta[k])) site.meta[k] = L();
  o(site, 'resumePage', {});
  for (const k of ['title', 'comingSoon', 'comingSoonText']) if (!isObj(site.resumePage[k])) site.resumePage[k] = L();
  if (typeof site.workerUrl !== 'string') site.workerUrl = '';
  return site;
}

const ensureArticle = (a) => {
  if (!isObj(a.title)) a.title = { th: '', en: '' };
  if (!isObj(a.summary)) a.summary = { th: '', en: '' };
  if (!isObj(a.body)) a.body = { th: '', en: '' };
  if (!Array.isArray(a.tags)) a.tags = [];
  if (a.cover === undefined) a.cover = null;
  return a;
};

// ---------- dirty tracking ----------
const siteJson = () => JSON.stringify(S.draft.site);

function diff() {
  const siteDirty = siteJson() !== S.baseline.site;
  const changedArticles = S.draft.articles.filter((a) => S.baseline.articles.get(a.slug) !== JSON.stringify(a));
  const present = new Set(S.draft.articles.map((a) => a.slug));
  const deleteArticles = S.deleted.filter((s) => !present.has(s) && S.baseline.articles.has(s));
  return { siteDirty, changedArticles, deleteArticles, dirty: siteDirty || changedArticles.length > 0 || deleteArticles.length > 0 || S.pendingDeletes.length > 0 };
}

let statusKind = '';
function setStatus(text, kind = '') {
  statusKind = kind;
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = text;
  s.className = `status ${kind}`.trim();
}

function refreshDirty() {
  const saveBtn = document.getElementById('save-btn');
  if (!saveBtn) return;
  const { dirty } = diff();
  saveBtn.disabled = S.saving || !dirty;
  if (statusKind === 'ok' || statusKind === 'err') return; // keep the last result visible until the next edit
  setStatus(dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : 'ยังไม่มีการแก้ไข', dirty ? 'warn' : '');
}

// ---------- autosave of the draft ----------
let autosaveTimer = 0;
function writeDraft() {
  clearTimeout(autosaveTimer);
  if (!S.ready) return;
  if (!diff().dirty) { store.del(localStorage, DRAFT_KEY); return; }
  const ok = store.set(localStorage, DRAFT_KEY, JSON.stringify({ baseSha: S.baseSha, site: S.draft.site, articles: S.draft.articles, deleted: S.deleted, pendingDeletes: S.pendingDeletes, savedAt: new Date().toISOString() }));
  if (!ok) announce('บันทึกฉบับร่างลงเบราว์เซอร์ไม่ได้');
}

// ---------- live preview ----------
let siteFrame;
let articleFrame;
let siteReady = false;
let rafPending = false;
let articleTimer = 0;

function postSite() {
  if (!siteReady || !siteFrame?.contentWindow || !S.draft.site) return;
  siteFrame.contentWindow.postMessage({ type: 'preview', content: S.draft.site }, location.origin);
}

function renderArticlePreview() {
  if (!articleFrame) return;
  const a = S.previewArticle;
  if (!a) { articleFrame.removeAttribute('srcdoc'); return; }
  let html = '';
  try {
    html = renderArticlePage(a, S.draft.site);
  } catch (e) {
    html = `<!doctype html><meta charset="utf-8"><p>ดูตัวอย่างไม่ได้: ${String(e.message).replace(/[<>&]/g, '')}</p>`;
  }
  // The page's own scripts cannot run in the sandbox (and would only log errors), so drop them, pick the
  // language and apply the draft's colours here.
  const th = S.draft.site?.theme ?? {};
  const vars = ['bg1', 'bg2', 'accent1', 'accent2', 'accent3'].filter((k) => /^#[0-9a-f]{6}$/i.test(th[k])).map((k) => `--${k}:${th[k]}`).join(';');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<html lang="(th|en)"/, `<html lang="${S.articleLang}"`).replace('</head>', `<style>:root{${vars}}</style></head>`);
  articleFrame.srcdoc = html;
}

function schedulePreview() {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; postSite(); });
  }
  if (S.previewMode === 'article') {
    clearTimeout(articleTimer);
    articleTimer = setTimeout(renderArticlePreview, 250);
  }
}

function applyPreviewMode() {
  const article = S.previewMode === 'article' && S.previewArticle;
  siteFrame.hidden = Boolean(article);
  articleFrame.hidden = !article;
  document.getElementById('pv-site')?.setAttribute('aria-pressed', String(!article));
  const pvArticle = document.getElementById('pv-article');
  if (pvArticle) {
    pvArticle.disabled = !S.previewArticle;
    pvArticle.setAttribute('aria-pressed', String(Boolean(article)));
  }
  const langs = document.getElementById('pv-langs');
  if (langs) langs.hidden = !article;
  document.getElementById('pv-th')?.setAttribute('aria-pressed', String(S.articleLang === 'th'));
  document.getElementById('pv-en')?.setAttribute('aria-pressed', String(S.articleLang === 'en'));
}

function setPreview(article) {
  S.previewArticle = article;
  S.previewMode = article ? 'article' : 'site';
  applyPreviewMode();
  if (article) renderArticlePreview();
}

window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || !siteFrame || ev.source !== siteFrame.contentWindow) return;
  if (ev.data?.type === 'preview-ready') {
    siteReady = true;
    postSite(); // every ready (also after the frame reloads) gets the latest draft
  }
});

// ---------- validation ----------
const THAI = [
  [/needs text in Thai or English/, 'ต้องกรอกอย่างน้อยหนึ่งภาษา'],
  [/too long \(max (\d+) characters\)/, (m) => `ยาวเกินไป (สูงสุด ${m[1]} ตัวอักษร)`],
  [/too many items \(max (\d+)\)/, (m) => `มีมากเกินไป (สูงสุด ${m[1]} รายการ)`],
  [/must not be empty/, 'ห้ามเว้นว่าง'],
  [/must be an email address/, 'ต้องเป็นอีเมลที่ถูกต้อง'],
  [/must be an https:\/\/ link or a site path/, 'ต้องเป็นลิงก์ https:// หรือพาธในเว็บที่ขึ้นต้นด้วย /'],
  [/must be null or a path under/, 'รูปต้องอัปโหลดผ่านหน้านี้ (พาธขึ้นต้นด้วย /uploads/ หรือ /projects/)'],
  [/"index" is reserved/, 'ห้ามใช้ชื่อ index'],
  [/must match a-z, 0-9/, 'ใช้ได้เฉพาะ a-z 0-9 และ - (1 ถึง 60 ตัว)'],
  [/must be a real date/, 'วันที่ไม่ถูกต้อง'],
  [/must be a colour/, 'สีไม่ถูกต้อง'],
  [/duplicate/, 'ซ้ำกับรายการอื่น'],
  [/required when resume.file is set|must be pdf, image or null|must be null when/, 'ชนิดไฟล์เรซูเม่ไม่สอดคล้องกับไฟล์'],
];
function thaiMessage(msg) {
  for (const [re, out] of THAI) {
    const m = re.exec(msg);
    if (m) return typeof out === 'function' ? out(m) : out;
  }
  return msg;
}

function addError(key, msg) {
  const text = thaiMessage(msg);
  S.errors.set(key, S.errors.has(key) ? `${S.errors.get(key)} / ${text}` : text);
  S.errorList.push({ key, text });
}

function splitError(s) {
  const i = s.indexOf(': ');
  return i === -1 ? ['(root)', s] : [s.slice(0, i), s.slice(i + 2)];
}

function panelOf(key) {
  const k = key.replace(/^(\(root\)|site\.)/, '');
  if (key.startsWith('articles[')) return 'articles';
  if (/^(hero|about)/.test(k)) return 'texts';
  if (/^(sections|nav)/.test(k)) return 'sections';
  if (/^theme/.test(k)) return 'theme';
  for (const id of ['projects', 'skills', 'journey', 'resume', 'contact']) if (k.startsWith(id)) return id;
  return 'texts';
}

function validateAll() {
  S.errors = new Map();
  S.errorList = [];
  const v = validateSite(S.draft.site);
  for (const e of v.errors) { const [k, m] = splitError(e); addError(k, m); }
  const slugs = new Map();
  S.draft.articles.forEach((a, i) => {
    const r = validateArticle(a);
    for (const e of r.errors) { const [k, m] = splitError(e); addError(`articles[${i}].${k}`, m); }
    if (typeof a.slug === 'string' && a.slug) {
      if (slugs.has(a.slug)) addError(`articles[${i}].slug`, 'duplicate slug (ซ้ำกับบทความอื่น)');
      slugs.set(a.slug, i);
    }
  });
  return S.errorList.length === 0;
}

function showErrors(heading) {
  const box = document.getElementById('err-summary');
  box.replaceChildren();
  if (!S.errorList.length) { box.hidden = true; return; }
  box.hidden = false;
  const ul = el('ul');
  S.errorList.slice(0, 12).forEach((e) => {
    const panel = PANELS.find((p) => p.id === panelOf(e.key));
    ul.append(el('li', {}, el('button', { type: 'button', class: 'linklike', onClick: () => showPanel(panel.id, true) }, `${panel.title}: ${e.text}`),
      el('span', { class: 'mono path', text: ` ${e.key}` })));
  });
  box.append(el('h2', { tabindex: '-1', text: heading ?? `ต้องแก้ ${S.errorList.length} จุดก่อนบันทึก` }), ul,
    S.errorList.length > 12 ? el('p', { class: 'note', text: `และอีก ${S.errorList.length - 12} จุด` }) : null);
  box.querySelector('h2').focus();
}

// ---------- worker-side errors ----------
function mapServerErrors(errors, sentSlugs) {
  S.errors = new Map();
  S.errorList = [];
  for (const raw of errors) {
    if (typeof raw !== 'string') continue;
    if (raw.startsWith('site: ')) {
      const [k, m] = splitError(raw.slice(6));
      addError(k, m);
      continue;
    }
    const m = /^articles\[(\d+)\]: (.*)$/s.exec(raw);
    if (m) {
      const slug = sentSlugs[Number(m[1])];
      const idx = S.draft.articles.findIndex((a) => a.slug === slug);
      const [k, msg] = splitError(m[2]);
      addError(idx === -1 ? '(root)' : `articles[${idx}].${k}`, msg);
      continue;
    }
    addError('(root)', raw);
  }
}

// ---------- banner ----------
function banner(text, kind, ...actions) {
  const b = document.getElementById('banner');
  b.replaceChildren();
  if (!text) { b.hidden = true; return; }
  b.hidden = false;
  b.className = `banner ${kind}`;
  b.append(el('p', { text }), el('div', { class: 'row-end' }, ...actions));
  announce(text);
}

// ---------- state load ----------
function adopt(st) {
  if (!isObj(st.site)) throw new ApiError('ไม่พบ content/site.json ใน repo');
  S.baseSha = st.headSha;
  const site = ensureShape(structuredClone(st.site));
  const arts = (Array.isArray(st.articles) ? st.articles : []).filter((a) => isObj(a) && typeof a.slug === 'string').map((a) => ensureArticle(structuredClone(a)));
  S.draft = { site, articles: arts };
  S.baseline = { site: JSON.stringify(site), articles: new Map(arts.map((a) => [a.slug, JSON.stringify(a)])) };
  S.savedSlugs = new Set(arts.map((a) => a.slug));
  S.deleted = [];
  S.pendingDeletes = [];
  S.errors = new Map();
  S.errorList = [];
}

const CORRUPT_DRAFT = 'ฉบับร่างที่เก็บไว้ในเบราว์เซอร์เสียหาย จึงลบทิ้งแล้ว (ข้อมูลบนเว็บไม่ได้รับผลกระทบ)';

/** The stored draft with every part checked and cloned, or null when anything has the wrong shape. */
function readStoredDraft(stored) {
  if (!isObj(stored) || !isObj(stored.site) || !Array.isArray(stored.articles)) return null;
  const s = stored.site;
  const listOk = (v) => v === undefined || (Array.isArray(v) && v.every(isObj));
  if (![s.sections, s.projects, s.skills, s.journey].every(listOk) || !listOk(s.about?.facts) || !listOk(s.contact?.links)) return null;
  if (!stored.articles.every((a) => isObj(a) && typeof a.slug === 'string')) return null;
  if (stored.deleted !== undefined && !(Array.isArray(stored.deleted) && stored.deleted.every((x) => typeof x === 'string'))) return null;
  const pending = stored.pendingDeletes === undefined ? [] : stored.pendingDeletes;
  if (!Array.isArray(pending) || !pending.every((x) => typeof x === 'string' && UPLOAD_FILE.test(x))) return null;
  return {
    baseSha: typeof stored.baseSha === 'string' ? stored.baseSha : '',
    site: ensureShape(structuredClone(s)),
    articles: stored.articles.map((a) => ensureArticle(structuredClone(a))),
    deleted: stored.deleted ?? [],
    pendingDeletes: pending,
    savedAt: typeof stored.savedAt === 'string' ? stored.savedAt : '',
  };
}

/** Loads the repo state; returns { stored, notice }: a usable stored draft (or null) and a Thai notice if one was discarded. */
async function loadState() {
  const st = await api.state();
  adopt(st);
  S.ready = true;
  const raw = store.get(localStorage, DRAFT_KEY);
  if (raw === null) return { stored: null, notice: '' };
  try {
    const stored = readStoredDraft(JSON.parse(raw));
    if (!stored) throw new Error('bad shape');
    const same = JSON.stringify(stored.site) === S.baseline.site
      && stored.articles.length === S.draft.articles.length
      && stored.articles.every((a) => S.baseline.articles.get(a.slug) === JSON.stringify(a))
      && stored.deleted.length === 0 && stored.pendingDeletes.length === 0;
    if (same) { store.del(localStorage, DRAFT_KEY); return { stored: null, notice: '' }; }
    return { stored, notice: '' };
  } catch {
    store.del(localStorage, DRAFT_KEY);
    return { stored: null, notice: CORRUPT_DRAFT };
  }
}

function offerRestore(stored) {
  const stale = stored.baseSha !== S.baseSha;
  const when = stored.savedAt ? ` (บันทึกไว้เมื่อ ${new Date(stored.savedAt).toLocaleString('th-TH')})` : '';
  banner(
    `พบฉบับร่างที่ยังไม่ได้บันทึก${when}${stale ? ' — ฉบับร่างนี้สร้างจากเว็บเวอร์ชันเก่า การกู้คืนอาจเขียนทับการแก้ไขที่เกิดขึ้นหลังจากนั้น' : ''}`,
    stale ? 'warn' : 'info',
    button('กู้คืนฉบับร่าง', () => {
      S.draft = { site: stored.site, articles: stored.articles };
      S.deleted = stored.deleted.filter((s) => S.savedSlugs.has(s));
      S.pendingDeletes = [...stored.pendingDeletes];
      banner('');
      afterDraftReplaced();
      writeDraft();
      announce('กู้คืนฉบับร่างแล้ว');
    }, { cls: 'primary' }),
    button('ทิ้งฉบับร่าง', () => { store.del(localStorage, DRAFT_KEY); banner(''); announce('ทิ้งฉบับร่างแล้ว'); }));
}

function afterDraftReplaced() {
  articles.closeEditor();
  S.errors = new Map();
  S.errorList = [];
  document.getElementById('err-summary').hidden = true;
  setPreview(null);
  renderPanel();
  schedulePreview();
  refreshDirty();
}

// ---------- session ----------
function readSession() {
  const s = readJson(sessionStorage, SESSION_KEY);
  return isObj(s) && typeof s.token === 'string' && Number(s.expiresAt) > Date.now() ? s : null;
}

function storeSession(res) {
  S.token = res.token;
  store.set(sessionStorage, SESSION_KEY, JSON.stringify({ token: res.token, expiresAt: res.expiresAt }));
}

function sessionEnded(message) {
  writeDraft();
  S.token = null;
  S.ready = false;
  store.del(sessionStorage, SESSION_KEY);
  showLogin(message);
}

// ---------- ctx handed to the panels ----------
const ctx = {
  get draft() { return S.draft; },
  get savedSlugs() { return S.savedSlugs; },
  changed() {
    if (statusKind === 'ok' || statusKind === 'err') statusKind = '';
    refreshDirty();
    schedulePreview();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeDraft, 400);
  },
  rerender(focus = false) { renderPanel(focus); },
  errorOf: (path) => S.errors.get(path) ?? '',
  hasErrorUnder: (prefix) => [...S.errors.keys()].some((k) => k === prefix || k.startsWith(`${prefix}.`) || k.startsWith(`${prefix}[`)),
  announce,
  setPreview,
  markDeleted(slug) { if (!S.deleted.includes(slug)) S.deleted.push(slug); },
  workerUrl,
  setWorkerUrl(v) { store.set(localStorage, URL_KEY, v); },
  logout() { sessionEnded('ออกจากระบบแล้ว'); },
  upload: (file) => serial(async () => {
    try {
      const res = await api.upload(file, S.baseSha);
      if (res.commitSha) S.baseSha = res.commitSha; // uploads commit at once and move the branch head
      return res.path;
    } catch (e) { throw guard(e); }
  }),
  /** The draft stopped using this file. It is only deleted after the next successful save (the live site may still use it). */
  queueDelete(path) {
    if (typeof path === 'string' && UPLOAD_FILE.test(path) && !S.pendingDeletes.includes(path)) S.pendingDeletes.push(path);
  },
  async changePassword(current, next) {
    storeSession(await api.changePassword(current, next));
  },
};

/** Upload, delete and save run one at a time so each one sends the baseSha the previous one produced. */
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

/** A 409 anywhere means the repo moved: offer the reload. Returns the error for the caller to show. */
function guard(e) {
  if (e instanceof ApiError && e.code === 'conflict') showStale(e.message);
  return e;
}

/** Deletes queued uploads that neither the draft nor the saved content uses. Failures stay queued. */
async function flushPendingDeletes() {
  const inUse = (p) => siteJson().includes(p) || S.baseline.site.includes(p) || S.draft.articles.some((a) => JSON.stringify(a).includes(p));
  let failed = 0;
  for (const path of [...S.pendingDeletes]) {
    if (!inUse(path)) {
      try {
        const res = await serial(() => api.deleteUpload(path, S.baseSha));
        if (res.commitSha) S.baseSha = res.commitSha;
      } catch (e) {
        guard(e);
        if (!(e instanceof ApiError && e.status === 404)) { failed += 1; continue; } // already gone counts as done
      }
    }
    S.pendingDeletes = S.pendingDeletes.filter((p) => p !== path);
  }
  return failed;
}

function showStale(message) {
  setStatus(message, 'err');
  writeDraft();
  banner(message, 'warn', button('โหลดใหม่', async () => {
    writeDraft(); // the local draft stays available; it is offered again after the reload
    try {
      const { stored, notice } = await loadState();
      banner('');
      setStatus('โหลดข้อมูลล่าสุดแล้ว', '');
      afterDraftReplaced();
      if (stored) offerRestore(stored);
      else if (notice) banner(notice, 'warn');
    } catch (err) {
      banner(err.message, 'warn');
    }
  }, { cls: 'primary' }));
}

// ---------- save ----------
async function save() {
  if (S.saving) return;
  if (!validateAll()) {
    setStatus('มีช่องที่ต้องแก้ก่อนบันทึก', 'err');
    renderPanel();
    showErrors();
    return;
  }
  document.getElementById('err-summary').hidden = true;
  let d = diff();
  if (!d.dirty) { setStatus('ยังไม่มีการแก้ไข', ''); return; }
  // the first save after deploy records the Worker URL in the site config (other devices then find it)
  const currentUrl = cleanWorkerUrl(workerUrl());
  if (currentUrl && S.draft.site.workerUrl !== currentUrl) {
    S.draft.site.workerUrl = currentUrl;
    d = diff();
  }

  const siteSnapshot = siteJson();
  const sent = d.changedArticles.map((a) => JSON.parse(JSON.stringify(a)));

  S.saving = true;
  setStatus('กำลังบันทึก...', '');
  refreshDirty();
  try {
    // queued behind any upload still in flight, so baseSha is read only when this request is sent
    const hasContent = d.siteDirty || sent.length > 0 || d.deleteArticles.length > 0;
    if (hasContent) {
      await serial(async () => {
        const payload = { baseSha: S.baseSha };
        if (d.siteDirty) payload.site = JSON.parse(siteSnapshot);
        if (sent.length) payload.articles = sent;
        if (d.deleteArticles.length) payload.deleteArticles = d.deleteArticles;
        S.baseSha = (await api.save(payload)).commitSha;
      });
    }
    if (d.siteDirty) S.baseline.site = siteSnapshot;
    for (const a of sent) { S.baseline.articles.set(a.slug, JSON.stringify(a)); S.savedSlugs.add(a.slug); }
    for (const s of d.deleteArticles) { S.baseline.articles.delete(s); S.savedSlugs.delete(s); }
    S.deleted = S.deleted.filter((s) => !d.deleteArticles.includes(s));
    const failedDeletes = await flushPendingDeletes(); // the live site no longer points at these files
    S.saving = false;
    banner('');
    setStatus(SAVED_MESSAGE, 'ok');
    announce(SAVED_MESSAGE);
    if (failedDeletes) announce(`ลบไฟล์เก่าไม่สำเร็จ ${failedDeletes} ไฟล์ จะลองใหม่ตอนบันทึกครั้งหน้า`);
    writeDraft(); // clean -> removes the stored draft; edits made while saving stay in it
    renderPanel();
    refreshDirty();
  } catch (e) {
    S.saving = false;
    refreshDirty();
    if (e instanceof ApiError && e.code === 'conflict') {
      showStale(e.message);
    } else if (e instanceof ApiError && e.status === 400 && Array.isArray(e.errors)) {
      mapServerErrors(e.errors, sent.map((a) => a.slug));
      setStatus('Worker ตรวจพบข้อมูลที่ไม่ถูกต้อง', 'err');
      renderPanel();
      showErrors('Worker ไม่รับข้อมูลนี้ ต้องแก้ก่อนบันทึก');
    } else if (e instanceof ApiError && e.status === 401) {
      /* onUnauthorized already moved to the login screen */
    } else {
      writeDraft();
      setStatus(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง (ฉบับร่างยังอยู่ครบ)', 'err');
      announce(statusText());
    }
  }
}
const statusText = () => document.getElementById('status')?.textContent ?? '';

// ---------- views ----------
function showLogin(message = '') {
  app.replaceChildren();
  document.title = 'เข้าสู่ระบบ | Editor';
  const pwId = nextId();
  const urlId = nextId();
  const pw = el('input', { id: pwId, type: 'password', autocomplete: 'current-password', required: true, inputmode: 'text' });
  const msg = el('p', { class: message.startsWith('ออก') ? 'note' : 'err', id: 'login-msg', role: 'alert', text: message });
  const url = el('input', { id: urlId, type: 'url', value: workerUrl(), autocomplete: 'off', placeholder: 'https://....workers.dev' });
  const submit = button('เข้าสู่ระบบ', null, { type: 'submit', cls: 'primary' });
  const form = el('form', { class: 'login card' },
    el('h1', { text: 'แก้ไขเว็บ' }),
    el('p', { class: 'note', text: 'ใส่รหัส PIN เพื่อเข้าแก้ไขเว็บของคุณ (แนะนำ PIN อย่างน้อย 8 ตัวอักษร ไม่ใช่ตัวเลขล้วน)' }),
    el('div', { class: 'field' }, el('label', { for: pwId }, labelText('รหัส PIN', 'PIN')), pw),
    el('details', { class: 'worker-url', open: !workerUrl() },
      el('summary', { text: 'ตั้งค่า Worker URL' }),
      el('div', { class: 'field' }, el('label', { for: urlId }, labelText('ที่อยู่ Worker', 'Worker URL, https://')), url)),
    msg, submit);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.className = 'note';
    msg.textContent = '';
    const typed = url.value.trim();
    if (typed) {
      const clean = cleanWorkerUrl(typed);
      if (!clean) { msg.className = 'err'; msg.textContent = 'Worker URL ต้องขึ้นต้นด้วย https:// (หรือ http://localhost สำหรับทดสอบ)'; return; }
      store.set(localStorage, URL_KEY, clean);
    }
    submit.disabled = true;
    msg.textContent = 'กำลังเข้าสู่ระบบ...';
    try {
      storeSession(await api.login(pw.value));
      pw.value = '';
      await enter();
    } catch (e) {
      submit.disabled = false;
      msg.className = 'err';
      const wait = e instanceof ApiError && e.code === 'locked' && Number(e.retryAfter) > 0 ? ` (รออีกประมาณ ${Math.ceil(e.retryAfter / 60)} นาที)` : '';
      msg.textContent = `${e.message}${wait}`;
      if (e.status === 401) { pw.value = ''; pw.focus(); }
    }
  });
  app.append(el('main', { class: 'login-wrap' }, form));
  pw.focus();
  if (message) announce(message);
}

async function enter() {
  const { stored, notice } = await loadState();
  buildEditor();
  if (stored) offerRestore(stored);
  else if (notice) banner(notice, 'warn');
}

function buildEditor() {
  app.replaceChildren();
  document.title = 'แก้ไขเว็บ | Editor';
  siteReady = false;

  const tabs = el('nav', { class: 'tabs', 'aria-label': 'หมวดที่แก้ไข' },
    PANELS.map((p) => el('button', { type: 'button', class: 'tab', id: `tab-${p.id}`, 'data-panel': p.id, onClick: () => showPanel(p.id, true) },
      el('span', { text: p.title }), el('small', { text: p.hint }))));

  siteFrame = el('iframe', { class: 'frame', title: 'ตัวอย่างหน้าเว็บ (Live preview)', src: '/index.html?preview=1' });
  articleFrame = el('iframe', { class: 'frame', title: 'ตัวอย่างบทความ', sandbox: '', hidden: true });

  const pvBtn = (id, text, fn, extra = {}) => el('button', { type: 'button', class: 'btn small', id, 'aria-pressed': 'false', onClick: fn, ...extra }, text);
  const preview = el('aside', { class: 'preview', 'aria-label': 'ตัวอย่างสด' },
    el('div', { class: 'pv-head' },
      pvBtn('pv-site', 'หน้าเว็บ', () => setPreviewMode('site')),
      pvBtn('pv-article', 'บทความ', () => setPreviewMode('article')),
      el('span', { id: 'pv-langs', class: 'pv-langs', hidden: true }, pvBtn('pv-th', 'TH', () => setArticleLang('th')), pvBtn('pv-en', 'EN', () => setArticleLang('en')))),
    siteFrame, articleFrame);

  const header = el('header', { class: 'top' },
    el('h1', { text: 'แก้ไขเว็บ' }),
    el('p', { id: 'status', class: 'status', role: 'status', 'aria-live': 'polite' }),
    el('button', { type: 'button', class: 'btn', id: 'pv-toggle', 'aria-pressed': 'false', onClick: togglePreviewPane }, 'ดูตัวอย่าง'),
    el('button', { type: 'button', class: 'btn primary', id: 'save-btn', onClick: save }, 'บันทึก'));

  app.append(header,
    el('div', { id: 'banner', class: 'banner', hidden: true }),
    el('div', { id: 'err-summary', class: 'err-summary', role: 'alert', hidden: true }),
    el('div', { class: 'layout' },
      el('div', { class: 'edit-col' }, tabs, el('section', { id: 'panel', class: 'panel', 'aria-labelledby': 'panel-title' })),
      preview));
  siteFrame.addEventListener('load', () => { siteReady = false; }); // wait for the frame's own preview-ready
  showPanel(S.panel, false);
  applyPreviewMode();
  refreshDirty();
}

function setPreviewMode(mode) {
  S.previewMode = mode === 'article' && S.previewArticle ? 'article' : 'site';
  applyPreviewMode();
  if (S.previewMode === 'article') renderArticlePreview();
}

function setArticleLang(lang) {
  S.articleLang = lang;
  applyPreviewMode();
  renderArticlePreview();
}

function togglePreviewPane() {
  const on = document.body.classList.toggle('show-preview');
  const b = document.getElementById('pv-toggle');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? 'กลับไปแก้ไข' : 'ดูตัวอย่าง';
}

function showPanel(id, focus) {
  if (S.panel === 'articles' && id !== 'articles') articles.closeEditor();
  S.panel = id;
  if (id !== 'articles') setPreview(null);
  document.body.classList.remove('show-preview');
  const t = document.getElementById('pv-toggle');
  if (t) { t.setAttribute('aria-pressed', 'false'); t.textContent = 'ดูตัวอย่าง'; }
  renderPanel(focus);
}

function renderPanel(focus = false) {
  const root = document.getElementById('panel');
  if (!root) return;
  const mod = PANELS.find((p) => p.id === S.panel) ?? PANELS[0];
  for (const b of document.querySelectorAll('.tab')) {
    const on = b.dataset.panel === mod.id;
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  const scroll = root.scrollTop;
  root.replaceChildren(el('h2', { id: 'panel-title', tabindex: '-1' }, mod.title, ' ', el('small', { text: mod.hint })));
  mod.render(root, ctx);
  root.scrollTop = scroll;
  if (focus) document.getElementById('panel-title').focus();
}

window.addEventListener('beforeunload', (ev) => {
  if (S.ready && diff().dirty) {
    writeDraft();
    ev.preventDefault();
    ev.returnValue = '';
  }
});

// ---------- boot ----------
(async function boot() {
  try {
    const res = await fetch('/content/site.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      if (typeof j.workerUrl === 'string') S.siteWorkerUrl = j.workerUrl;
    }
  } catch { /* the login screen still lets the owner type the URL */ }

  const s = readSession();
  if (s && workerUrl()) {
    S.token = s.token;
    try {
      await enter();
      return;
    } catch (e) {
      if (e.status === 401) return; // onUnauthorized already showed the login
      S.token = null;
      showLogin(e.message);
      return;
    }
  }
  showLogin();
})();
