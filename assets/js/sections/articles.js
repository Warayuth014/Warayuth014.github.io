import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { ui, shell, list } from './util.js';

const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const LATEST = 3;

// The index is fetched once per page load; later renders (language toggle) reuse it.
let loaded = null;
let started = false;

export function cardsHtml(items, lang) {
  return list(items).filter((a) => a && typeof a.slug === 'string' && SLUG_RE.test(a.slug)).slice(0, LATEST).map((a) => {
    const sum = t(a.summary, lang).trim();
    const tags = list(a.tags).filter((x) => typeof x === 'string' && x).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
    return `<li class="art-card">
        <p class="idx mono">${escapeHtml(a.date)}</p>
        <h3><a href="/articles/${a.slug}/">${escapeHtml(t(a.title, lang))}</a></h3>
        ${sum ? `<p class="card-sum">${escapeHtml(sum)}</p>` : ''}
        ${tags ? `<ul class="tags">${tags}</ul>` : ''}
      </li>`;
  }).join('');
}

function fill(container, lang) {
  if (!container || !loaded) return;
  const html = cardsHtml(loaded, lang);
  container.innerHTML = html ? `<ul class="art-cards">${html}</ul>` : '';
}

function load() {
  if (started) return;
  started = true;
  fetch('/content/articles/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => {
      loaded = Array.isArray(data) ? data : [];
      fill(document.querySelector('[data-articles-list]'), document.documentElement.lang === 'th' ? 'th' : 'en');
    })
    .catch(() => { loaded = null; /* keep the "see all" link only */ });
}

export function render(el, content, lang) {
  shell(el, 'articles', content, lang, `
    <div data-articles-list class="articles-list"></div>
    <p class="articles-more"><a class="btn btn-ghost" href="/articles/">${escapeHtml(ui('allArticles', lang))}<span aria-hidden="true"> &rarr;</span></a></p>`);
  fill(el.querySelector('[data-articles-list]'), lang);
  load();
}
