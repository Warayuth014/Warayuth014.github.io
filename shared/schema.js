// Pure module (no DOM, no Node globals): shared by the site, the editor and the Worker.
// validateSite / validateArticle return { ok, errors } where every error names its path,
// e.g. "projects[2].title.en: ...". All errors are reported, not just the first.

export const SECTION_IDS = ['hero', 'about', 'projects', 'skills', 'journey', 'articles', 'contact'];
export const FONT_PAIRS = ['default', 'soft', 'tech'];
export const LINK_KINDS = ['github', 'linkedin', 'facebook', 'instagram', 'website', 'other'];

const MAX_TITLE = 300;
const MAX_TEXT = 5000;
const MAX_ARTICLE_BODY = 100000;
const MAX_URL = 500;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]{1,60}$/;
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

/** https:// URL or a site path with a single leading slash (not //). */
export function isLink(v) {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_URL) return false;
  if (/[\s\u0000-\u001f\\]/.test(v)) return false;
  if (/^https:\/\/[^/]/i.test(v)) return true;
  return /^\/(?!\/)/.test(v);
}

/** /uploads/... or /projects/... (no traversal). */
export function isAssetPath(v) {
  if (typeof v !== 'string' || v.length > MAX_URL) return false;
  if (/[\s\u0000-\u001f\\]/.test(v) || v.includes('..')) return false;
  return /^\/(uploads|projects)\/[^/]/.test(v);
}

/** The path when it passes isAssetPath, else '' (for rendering untrusted content). */
export const safeAsset = (p) => (isAssetPath(p) ? p : '');

function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function makeCtx() {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  const str = (v, path, max, { allowEmpty = true } = {}) => {
    if (typeof v !== 'string') return err(path, 'must be a string');
    if (v.length > max) return err(path, `too long (max ${max} characters)`);
    if (!allowEmpty && v.trim() === '') err(path, 'must not be empty');
  };
  const bool = (v, path) => { if (typeof v !== 'boolean') err(path, 'must be true or false'); };
  const oneOf = (v, list, path) => { if (!list.includes(v)) err(path, `must be one of: ${list.join(', ')}`); };
  const arr = (v, path, max, each) => {
    if (!Array.isArray(v)) return err(path, 'must be a list');
    if (v.length > max) err(path, `too many items (max ${max})`);
    v.slice(0, 1000).forEach((x, i) => each(x, `${path}[${i}]`));
  };
  const obj = (v, path) => {
    if (!isObj(v)) { err(path, 'must be an object'); return false; }
    return true;
  };
  /** L = { th: string, en: string }; atLeastOne requires one non-empty side. */
  const L = (v, path, max, { atLeastOne = false } = {}) => {
    if (!obj(v, path)) return;
    str(v.th, `${path}.th`, max);
    str(v.en, `${path}.en`, max);
    if (atLeastOne && !(typeof v.th === 'string' && v.th.trim()) && !(typeof v.en === 'string' && v.en.trim())) {
      err(path, 'needs text in Thai or English');
    }
  };
  const link = (v, path) => { if (!isLink(v)) err(path, 'must be an https:// link or a site path starting with a single /'); };
  const asset = (v, path) => { if (v !== null && !isAssetPath(v)) err(path, 'must be null or a path under /uploads/ or /projects/'); };
  const tags = (v, path) => arr(v, path, 20, (x, p) => str(x, p, 40, { allowEmpty: false }));

  return { errors, err, str, bool, oneOf, arr, obj, L, link, asset, tags };
}

export function validateSite(site) {
  const c = makeCtx();
  const { err, str, bool, oneOf, arr, obj, L, link, asset, tags } = c;
  if (!isObj(site)) return { ok: false, errors: ['(root): must be an object'] };

  if (site.version !== 1) err('version', 'must be 1');

  // theme
  if (obj(site.theme, 'theme')) {
    const th = site.theme;
    for (const k of ['bg1', 'bg2', 'accent1', 'accent2', 'accent3']) {
      if (typeof th[k] !== 'string' || !HEX.test(th[k])) err(`theme.${k}`, 'must be a colour like #0b0f1d');
    }
    oneOf(th.mode, ['dark', 'light'], 'theme.mode');
    oneOf(th.fontPair, FONT_PAIRS, 'theme.fontPair');
    if (obj(th.effects, 'theme.effects')) {
      bool(th.effects.hero3d, 'theme.effects.hero3d');
      bool(th.effects.threads, 'theme.effects.threads');
    }
  }

  // sections + nav
  const seen = new Set();
  arr(site.sections, 'sections', SECTION_IDS.length, (s, p) => {
    if (!obj(s, p)) return;
    if (!SECTION_IDS.includes(s.id)) err(`${p}.id`, `must be one of: ${SECTION_IDS.join(', ')}`);
    else if (seen.has(s.id)) err(`${p}.id`, `duplicate section "${s.id}"`);
    else seen.add(s.id);
    bool(s.visible, `${p}.visible`);
  });
  arr(site.nav, 'nav', SECTION_IDS.length, (id, p) => {
    if (!SECTION_IDS.includes(id)) err(p, `must be one of: ${SECTION_IDS.join(', ')}`);
  });

  // hero
  if (obj(site.hero, 'hero')) {
    L(site.hero.name, 'hero.name', MAX_TITLE, { atLeastOne: true });
    L(site.hero.intro, 'hero.intro', MAX_TEXT);
    L(site.hero.ctaWork, 'hero.ctaWork', MAX_TITLE);
    L(site.hero.ctaResume, 'hero.ctaResume', MAX_TITLE);
  }

  // about
  if (obj(site.about, 'about')) {
    asset(site.about.photo, 'about.photo');
    L(site.about.story, 'about.story', MAX_TEXT);
    arr(site.about.facts, 'about.facts', 20, (f, p) => {
      if (!obj(f, p)) return;
      str(f.icon, `${p}.icon`, 40);
      L(f.label, `${p}.label`, MAX_TITLE);
      L(f.value, `${p}.value`, MAX_TITLE);
    });
  }

  // projects
  const projectIds = new Set();
  arr(site.projects, 'projects', 100, (pr, p) => {
    if (!obj(pr, p)) return;
    if (typeof pr.id !== 'string' || !ID.test(pr.id)) err(`${p}.id`, 'must match a-z, 0-9, - (1-60 characters)');
    else if (projectIds.has(pr.id)) err(`${p}.id`, `duplicate project id "${pr.id}"`);
    else projectIds.add(pr.id);
    L(pr.title, `${p}.title`, MAX_TITLE, { atLeastOne: true });
    L(pr.summary, `${p}.summary`, MAX_TEXT);
    L(pr.body, `${p}.body`, MAX_TEXT);
    tags(pr.tags, `${p}.tags`);
    asset(pr.image, `${p}.image`);
    if (obj(pr.links, `${p}.links`)) {
      for (const k of ['repo', 'demo']) if (pr.links[k] !== undefined) link(pr.links[k], `${p}.links.${k}`);
    }
  });

  // skills
  arr(site.skills, 'skills', 30, (g, p) => {
    if (!obj(g, p)) return;
    L(g.group, `${p}.group`, MAX_TITLE);
    arr(g.items, `${p}.items`, 60, (x, ip) => str(x, ip, 60, { allowEmpty: false }));
  });

  // journey
  arr(site.journey, 'journey', 50, (j, p) => {
    if (!obj(j, p)) return;
    L(j.when, `${p}.when`, MAX_TITLE);
    L(j.title, `${p}.title`, MAX_TITLE);
    L(j.place, `${p}.place`, MAX_TITLE);
  });

  // contact
  if (obj(site.contact, 'contact')) {
    const ct = site.contact;
    if (typeof ct.email !== 'string' || ct.email.length > 254 || !EMAIL.test(ct.email)) err('contact.email', 'must be an email address');
    if (ct.phone !== null) str(ct.phone, 'contact.phone', 30);
    arr(ct.links, 'contact.links', 20, (l, p) => {
      if (!obj(l, p)) return;
      oneOf(l.kind, LINK_KINDS, `${p}.kind`);
      link(l.url, `${p}.url`);
    });
  }

  // resume
  if (obj(site.resume, 'resume')) {
    const r = site.resume;
    asset(r.file, 'resume.file');
    if (r.kind !== null && r.kind !== 'pdf' && r.kind !== 'image') err('resume.kind', 'must be pdf, image or null');
    else if (r.file !== null && r.kind === null) err('resume.kind', 'required when resume.file is set');
    else if (r.file === null && r.kind !== null) err('resume.kind', 'must be null when resume.file is null');
  }

  // workerUrl: "" or https (http only for local dev)
  if (typeof site.workerUrl !== 'string') err('workerUrl', 'must be a string');
  else if (site.workerUrl !== '' && !/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)[^\s]*$/.test(site.workerUrl)) {
    err('workerUrl', 'must be empty or an https:// URL');
  }

  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateArticle(a) {
  const c = makeCtx();
  const { err, str, bool, obj, L, tags, asset } = c;
  if (!isObj(a)) return { ok: false, errors: ['(root): must be an object'] };

  if (typeof a.slug !== 'string' || !/^[a-z0-9-]{1,60}$/.test(a.slug)) err('slug', 'must match a-z, 0-9, - (1-60 characters)');
  else if (a.slug === 'index') err('slug', '"index" is reserved (content/articles/index.json is the generated list)');
  L(a.title, 'title', MAX_TITLE, { atLeastOne: true });
  L(a.summary, 'summary', MAX_TEXT);
  if (obj(a.body, 'body')) {
    str(a.body.th, 'body.th', MAX_ARTICLE_BODY);
    str(a.body.en, 'body.en', MAX_ARTICLE_BODY);
  }
  tags(a.tags, 'tags');
  asset(a.cover, 'cover');
  if (!isIsoDate(a.date)) err('date', 'must be a real date in YYYY-MM-DD form');
  bool(a.published, 'published');
  return { ok: c.errors.length === 0, errors: c.errors };
}
