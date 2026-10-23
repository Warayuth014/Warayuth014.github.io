// Site shell: theme, TH/EN, nav and content-driven sections.
// boot({ content?, preview? }) can be called repeatedly (preview iframe re-renders on each call).
import { t, detectLang } from '../../shared/i18n.js';
import { validateSite, SECTION_IDS } from '../../shared/schema.js';
import { escapeHtml } from '../../shared/sanitize.js';
import { ui, pad, list, sameOriginPath } from './sections/_util.js';
import * as hero from './sections/hero.js';
import * as about from './sections/about.js';
import * as projects from './sections/projects.js';
import * as skills from './sections/skills.js';
import * as journey from './sections/journey.js';
import * as articles from './sections/articles.js';
import * as contact from './sections/contact.js';

const RENDERERS = new Map(Object.entries({ hero, about, projects, skills, journey, articles, contact }));

const FONT_PAIRS = {
  default: {
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap',
    body: '"IBM Plex Sans Thai", system-ui, sans-serif',
    display: '"Space Grotesk", "IBM Plex Sans Thai", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace',
  },
  soft: {
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600&family=Sora:wght@500;700&display=swap',
    body: '"Noto Sans Thai", system-ui, sans-serif',
    display: '"Sora", "Noto Sans Thai", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace',
  },
  tech: {
    href: 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    body: '"Anuphan", system-ui, sans-serif',
    display: '"Anuphan", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  },
};

const state = { content: null, lang: 'en', preview: false, error: false, warned: new Set() };
let listenerAttached = false;

// ---------- colour helpers (light mode derives its palette from the tokens) ----------
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, w) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v * (1 - w) + y[i] * w));
};
const lum = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
const darkenUntil = (hex, bg, min) => {
  let c = hex;
  for (let i = 0; i < 24 && contrast(c, bg) < min; i++) c = mix(c, '#000000', 0.07);
  return c;
};
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const pick = (v, d) => (isHex(v) ? v : d);

export function loadFont(pair) {
  const def = FONT_PAIRS[pair] ?? FONT_PAIRS.default;
  let link = document.getElementById('font-pair');
  if (!link) {
    link = document.createElement('link');
    link.id = 'font-pair';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== def.href) link.setAttribute('href', def.href);
  return def;
}

export function applyTheme(theme) {
  const th = theme && typeof theme === 'object' ? theme : {};
  const light = th.mode === 'light';
  const bg1 = pick(th.bg1, '#0b0f1d');
  const bg2 = pick(th.bg2, '#1d0f2e');
  const acc = [pick(th.accent1, '#7cf3ff'), pick(th.accent2, '#a98bff'), pick(th.accent3, '#ff6fd1')];
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  root.dataset.mode = light ? 'light' : 'dark';

  if (light) {
    const l1 = mix(bg1, '#ffffff', 0.95);
    const l2 = mix(bg2, '#ffffff', 0.9);
    const fg = lum(bg1) < 0.25 ? mix(bg1, '#000000', 0.35) : '#10131f';
    set('--bg1', l1);
    set('--bg2', l2);
    acc.forEach((a, i) => set(`--accent${i + 1}`, darkenUntil(a, l1, 4.5)));
    set('--fg', fg);
    set('--muted', mix(fg, l1, 0.38));
    set('--card', 'rgba(255,255,255,.72)');
    set('--line', mix(fg, l1, 0.8));
    set('--on-accent', '#ffffff');
  } else {
    set('--bg1', bg1);
    set('--bg2', bg2);
    acc.forEach((a, i) => set(`--accent${i + 1}`, a));
    set('--fg', '#eef1ff');
    set('--muted', '#a8aecb');
    set('--card', 'rgba(255,255,255,.045)');
    set('--line', 'rgba(255,255,255,.12)');
    set('--on-accent', '#0b0f1d');
  }

  const f = loadFont(th.fontPair);
  set('--font-body', f.body);
  set('--font-display', f.display);
  set('--font-mono', f.mono);
}

export function setLang(lang) {
  state.lang = lang === 'th' ? 'th' : 'en';
  if (!state.preview) {
    try { localStorage.setItem('lang', state.lang); } catch { /* storage blocked */ }
  }
  renderAll();
}

// ---------- rendering ----------
function renderNav(content, lang, visibleIds) {
  const home = visibleIds.includes('hero') ? '#hero' : visibleIds[0] ? `#${visibleIds[0]}` : '#';
  const nav = document.getElementById('site-nav');
  if (!nav) return;
  const name = t(content?.hero?.name, lang).trim().split(/\s+/)[0] || 'home';
  const links = list(content?.nav).filter((id) => id !== 'hero' && visibleIds.includes(id) && SECTION_IDS.includes(id))
    .map((id) => `<li><a href="#${id}">${escapeHtml(ui(id, lang))}</a></li>`).join('');
  const open = nav.classList.contains('open');
  nav.innerHTML = `
    <a class="brand mono" href="${home}" aria-label="${escapeHtml(name)}">${escapeHtml(name.toLowerCase())}<span class="cursor" aria-hidden="true">_</span></a>
    <button class="menu-btn" type="button" aria-expanded="${open}" aria-controls="primary-nav">${escapeHtml(ui('menu', lang))}</button>
    <nav id="primary-nav" aria-label="${escapeHtml(ui('menu', lang))}">
      <ul>${links}<li><a class="nav-resume" href="/resume/">${escapeHtml(ui('resume', lang))}</a></li></ul>
    </nav>
    <button class="lang-btn mono" type="button" lang="${lang === 'th' ? 'en' : 'th'}" aria-label="${escapeHtml(ui('switchTo', lang))}">${lang === 'th' ? 'EN' : 'TH'}</button>`;
}

function renderAll() {
  const main = document.getElementById('main');
  if (!main) return;
  const { content, lang } = state;
  document.documentElement.lang = lang;

  const skip = document.querySelector('.skip-link');
  if (skip) skip.textContent = ui('skip', lang);

  if (!content) {
    main.innerHTML = `<p class="status" role="status">${escapeHtml(ui(state.error ? 'loadFail' : state.preview ? 'waiting' : 'loading', lang))}</p>`;
    renderNav(null, lang, []);
    return;
  }

  const order = list(content.sections).filter((s) => s && s.visible !== false && typeof s.id === 'string' && RENDERERS.has(s.id));
  const existing = new Map([...main.querySelectorAll(':scope > section')].map((s) => [s.id, s]));
  main.querySelectorAll(':scope > :not(section)').forEach((n) => n.remove());
  const keep = new Set(order.map((s) => s.id));
  existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });

  order.forEach((s, i) => {
    let el = existing.get(s.id);
    if (!el) {
      el = document.createElement('section');
      el.id = s.id;
    }
    el.dataset.index = pad(i + 1);
    main.appendChild(el); // appendChild also reorders existing nodes
    try {
      RENDERERS.get(s.id).render(el, content, lang);
    } catch (e) {
      if (!state.warned.has(s.id)) { state.warned.add(s.id); console.warn(`section "${s.id}" failed to render: ${e.message}`); }
    }
  });

  renderNav(content, lang, order.map((s) => s.id));
  const name = t(content.hero?.name, lang).trim();
  document.title = name ? `${name} | ${ui('heroTag', lang)}` : document.title;
}

function sameOriginContentUrl() {
  return sameOriginPath(new URLSearchParams(location.search).get('content'), location.origin);
}

async function fetchContent() {
  const url = sameOriginContentUrl() ?? new URL('../../content/site.json', import.meta.url).href;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function attachPreviewListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    const d = ev.data;
    if (d && d.type === 'preview' && d.content && typeof d.content === 'object') {
      boot({ content: d.content, preview: true });
    }
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'preview-ready' }, location.origin);
}

function attachUiListeners() {
  if (document.body.dataset.wired) return;
  document.body.dataset.wired = '1';
  document.addEventListener('click', (ev) => {
    const lang = ev.target.closest?.('.lang-btn');
    if (lang) {
      setLang(state.lang === 'th' ? 'en' : 'th');
      document.querySelector('.lang-btn')?.focus(); // nav is re-rendered; keep keyboard focus
      return;
    }
    const menu = ev.target.closest?.('.menu-btn');
    const nav = document.getElementById('site-nav');
    if (menu && nav) {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
      return;
    }
    if (nav && ev.target.closest?.('#primary-nav a')) {
      nav.classList.remove('open');
      nav.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (ev) => {
    const nav = document.getElementById('site-nav');
    if (ev.key === 'Escape' && nav?.classList.contains('open')) {
      nav.classList.remove('open');
      const b = nav.querySelector('.menu-btn');
      b?.setAttribute('aria-expanded', 'false');
      b?.focus();
    }
  });
}

export async function boot({ content, preview } = {}) {
  state.preview = Boolean(preview);
  if (!state.lang || !state.content) state.lang = detectLang();
  attachUiListeners();
  if (state.preview) attachPreviewListener();

  if (!content && !state.preview) {
    renderAll();
    try {
      content = await fetchContent();
    } catch {
      state.error = true;
      renderAll();
      return;
    }
  }
  if (!content) { renderAll(); return; }

  const check = validateSite(content);
  if (!check.ok) console.warn(`site content has ${check.errors.length} problem(s):\n${check.errors.join('\n')}`);
  state.content = content;
  state.error = false;
  applyTheme(content.theme);
  renderAll();
}

if (typeof document !== 'undefined' && document.getElementById('main') && document.body.dataset.autoboot !== 'off') {
  boot({ preview: new URLSearchParams(location.search).get('preview') === '1' });
}
