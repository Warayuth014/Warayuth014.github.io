import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { ui, shell, list, safeHref, safeAsset, anchorAttrs } from './_util.js';

function card(p, i, lang) {
  const title = t(p?.title, lang).trim();
  const summary = t(p?.summary, lang);
  const img = safeAsset(p?.image);
  const initial = Array.from(title)[0] ?? '·';
  const media = img
    ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">`
    : `<span class="ph-letter" aria-hidden="true">${escapeHtml(initial)}</span>`;
  const links = [];
  const demo = safeHref(p?.links?.demo);
  const repo = safeHref(p?.links?.repo);
  if (demo) links.push(`<a href="${escapeHtml(demo)}"${anchorAttrs(demo)}>${escapeHtml(ui('demo', lang))}<span aria-hidden="true"> &rarr;</span></a>`);
  if (repo) links.push(`<a href="${escapeHtml(repo)}"${anchorAttrs(repo)}>${escapeHtml(ui('repo', lang))}<span aria-hidden="true"> &rarr;</span></a>`);
  const tags = list(p?.tags).filter((x) => typeof x === 'string' && x).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  return `
    <article class="card" data-project-id="${escapeHtml(p?.id ?? '')}" data-i="${i}">
      <div class="card-media${img ? '' : ' no-img'}">${media}</div>
      <div class="card-body">
        <h3>${escapeHtml(title)}</h3>
        <p class="card-sum">${escapeHtml(summary)}</p>
        ${tags ? `<ul class="tags mono">${tags}</ul>` : ''}
        <p class="card-links">${links.length ? links.join('') : `<span class="mono muted">${escapeHtml(ui('noLink', lang))}</span>`}</p>
      </div>
    </article>`;
}

export function render(el, content, lang) {
  shell(el, 'projects', lang, `<div class="cards">${list(content.projects).map((p, i) => card(p, i, lang)).join('')}</div>`);
}
