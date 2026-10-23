// Site shell: theme, TH/EN, nav and content-driven sections.
// boot({ content?, preview? }) can be called repeatedly (preview iframe re-renders on each call).
import { t, detectLang } from '../../shared/i18n.js';
import { validateSite, SECTION_IDS } from '../../shared/schema.js';
import { escapeHtml } from '../../shared/sanitize.js';
import { ui, pad, list, sameOriginPath } from './sections/util.js';
import * as hero from './sections/hero.js';
import * as about from './sections/about.js';
import * as projects from './sections/projects.js';
import * as skills from './sections/skills.js';
import * as journey from './sections/journey.js';
import * as articles from './sections/articles.js';
import * as contact from './sections/contact.js';
import { syncHero, syncThreads } from './hero/mount.js';
import { enableTilt } from './fx/tilt.js';
import { enableReveal } from './fx/reveal.js';
import { enableCursorGlow } from './fx/cursor-glow.js';
import { enableTimelineProgress } from './fx/timeline.js';
import { REDUCED_QUERY, COARSE_QUERY } from './fx/env.js';
import { syncProjectDialog } from './project-dialog.js';
import { applyTheme, loadFont } from './theme.js';

export { applyTheme, loadFont };

const RENDERERS = new Map(Object.entries({ hero, about, projects, skills, journey, articles, contact }));

const state = { content: null, lang: 'en', preview: false, error: false, warned: new Set() };
let listenerAttached = false;

export function setLang(lang) {
  state.lang = lang === 'th' ? 'th' : 'en';
  if (!state.preview) {
    try { localStorage.setItem('lang', state.lang); } catch { /* storage blocked */ }
  }
  renderAll();
}

// ---------- 2D effects: one registry, disposed before every re-render ----------
const fx = { disposers: [], watching: false };

function disposeFx() {
  fx.disposers.splice(0).forEach((d) => { try { d(); } catch { /* already gone */ } });
}

function enableFx() {
  disposeFx();
  const main = document.getElementById('main');
  if (!main || !state.content) return;
  try {
    fx.disposers.push(enableTilt(main), enableReveal(main), enableCursorGlow(), enableTimelineProgress(main));
  } catch (e) {
    disposeFx(); // never leave half-hidden content behind
    console.warn(`effects failed: ${e.message}`);
  }
}

function watchFxPreferences() {
  if (fx.watching || typeof matchMedia !== 'function') return;
  fx.watching = true;
  for (const q of [REDUCED_QUERY, COARSE_QUERY]) matchMedia(q).addEventListener?.('change', enableFx);
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
  disposeFx();
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
  watchFxPreferences();
  enableFx();
  try {
    syncProjectDialog(content, lang);
  } catch (e) {
    console.warn(`project dialog failed: ${e.message}`);
  }
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
  syncAmbient(content.theme);
}

// Hero scene and threads load after first paint; text is already on screen by now.
function syncAmbient(theme) {
  try {
    syncThreads(theme);
    syncHero(document.querySelector('#hero > .hero-stage'), theme);
  } catch (e) {
    console.warn(`ambient effects failed: ${e.message}`);
  }
}

if (typeof document !== 'undefined' && document.getElementById('main') && document.body.dataset.autoboot !== 'off') {
  boot({ preview: new URLSearchParams(location.search).get('preview') === '1' });
}
