// Résumé page: shows the PDF or image chosen in /edit, or a friendly "coming soon" state.
import { escapeHtml } from '../../shared/sanitize.js';
import { t } from '../../shared/i18n.js';
import { safeAsset, sameOriginPath } from './sections/util.js';
import { applyTheme } from './theme.js';

const TEXT = {
  download: { th: 'ดาวน์โหลดเรซูเม่', en: 'Download résumé' },
  alt: { th: 'เรซูเม่ของ Warayuth', en: "Warayuth's résumé" },
  fallback: { th: 'เบราว์เซอร์นี้แสดง PDF ในหน้าไม่ได้ กดดาวน์โหลดเพื่อเปิดดูได้เลย', en: 'This browser cannot show the PDF inline. Use the download button to open it.' },
  soon: { th: 'เร็ว ๆ นี้', en: 'Coming soon' },
  soonSub: { th: 'เรซูเม่กำลังจัดให้เรียบร้อย ไว้กลับมาดูใหม่นะครับ', en: 'My résumé is still being put together. Please check back soon.' },
  home: { th: 'กลับหน้าแรก', en: 'Back home' },
  fail: { th: 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง', en: 'Could not load the page data. Please refresh.' },
  label: { th: 'Switch to English', en: 'เปลี่ยนเป็นภาษาไทย' },
};
const tx = (k, lang) => TEXT[k][lang];

const state = { resume: undefined, site: null, lang: 'en' };

/** Owner-edited text from content.resumePage, falling back to the built-in text. */
const pageText = (page, key, fallbackKey, lang) => t(page?.[key], lang).trim() || tx(fallbackKey, lang);

function soon(lang, page) {
  return `<div class="resume-soon">
    <p class="big">${escapeHtml(pageText(page, 'comingSoon', 'soon', lang))}</p>
    <p class="muted">${escapeHtml(pageText(page, 'comingSoonText', 'soonSub', lang))}</p>
    <p><a class="btn btn-ghost" href="/">${escapeHtml(tx('home', lang))}</a></p>
  </div>`;
}

export function resumeHtml(resume, lang, page) {
  const file = safeAsset(resume?.file);
  const dl = `<p class="resume-actions"><a class="btn btn-primary" href="${escapeHtml(file)}" download>${escapeHtml(tx('download', lang))}</a></p>`;
  if (file && resume.kind === 'pdf') {
    return `${dl}<object class="resume-pdf" type="application/pdf" data="${escapeHtml(file)}" aria-label="${escapeHtml(tx('alt', lang))}"><p class="resume-pdf-fallback">${escapeHtml(tx('fallback', lang))} <a href="${escapeHtml(file)}" download>${escapeHtml(tx('download', lang))}</a></p></object>`;
  }
  if (file && resume.kind === 'image') {
    return `${dl}<img class="resume-img" src="${escapeHtml(file)}" alt="${escapeHtml(tx('alt', lang))}">`;
  }
  return soon(lang, page);
}

function paint() {
  const { lang } = state;
  document.documentElement.lang = lang;
  const page = state.site?.resumePage;
  const title = t(page?.title, lang).trim();
  const owner = t(state.site?.hero?.name, lang).trim() || 'Warayuth Bunbanlu';
  document.title = `${title || (lang === 'th' ? 'เรซูเม่' : 'Résumé')} | ${owner}`;
  if (title) { const h1 = document.querySelector('.doc-head h1'); if (h1) h1.textContent = title; }
  const footer = t(state.site?.ui?.footer, lang).trim();
  const footerEl = document.querySelector('.site-foot span');
  if (footer && footerEl) footerEl.textContent = footer;
  const body = document.getElementById('resume-body');
  if (state.resume === undefined) return;
  body.dataset.state = state.resume === null ? 'error' : 'ready';
  body.innerHTML = state.resume === null ? `<p class="status" role="status">${escapeHtml(tx('fail', lang))}</p>` : resumeHtml(state.resume, lang, page);
  document.getElementById('lang-toggle')?.setAttribute('aria-label', tx('label', lang));
}

async function load() {
  const custom = sameOriginPath(new URLSearchParams(location.search).get('content'), location.origin);
  try {
    const res = await fetch(custom ?? '/content/site.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const site = await res.json();
    state.site = site && typeof site === 'object' ? site : null;
    state.resume = site && typeof site.resume === 'object' && site.resume ? site.resume : { file: null, kind: null };
    try { applyTheme(site?.theme, { persist: !custom }); } catch { /* default theme */ }
  } catch {
    state.resume = null;
  }
  paint();
}

if (typeof document !== 'undefined' && document.getElementById('resume-body')) {
  state.lang = document.documentElement.lang === 'th' ? 'th' : 'en';
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    state.lang = state.lang === 'th' ? 'en' : 'th';
    try { localStorage.setItem('lang', state.lang); } catch { /* storage blocked */ }
    paint();
  });
  load();
}
