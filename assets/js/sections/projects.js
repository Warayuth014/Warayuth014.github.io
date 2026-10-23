import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { ui, shell, list, safeHref, safeAsset, anchorAttrs } from './util.js';

const ID_RE = /^[a-z0-9-]{1,60}$/;

/** Only ids that are safe in a URL hash get a deep link. */
export const isDeepLinkId = (id) => typeof id === 'string' && ID_RE.test(id);
export const projectHash = (id) => (isDeepLinkId(id) ? `#project-${id}` : '');
export function projectIdFromHash(hash) {
  const m = /^#project-(.+)$/.exec(typeof hash === 'string' ? hash : '');
  return m && isDeepLinkId(m[1]) ? m[1] : '';
}

/** body is plain text (an L field, not rich text): line breaks become paragraphs. */
export function bodyParagraphs(text) {
  return typeof text === 'string' ? text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

function linkItems(p, lang) {
  const out = [];
  const demo = safeHref(p?.links?.demo);
  const repo = safeHref(p?.links?.repo);
  if (demo) out.push(`<a href="${escapeHtml(demo)}"${anchorAttrs(demo)}>${escapeHtml(ui('demo', lang))}<span aria-hidden="true"> &rarr;</span></a>`);
  if (repo) out.push(`<a href="${escapeHtml(repo)}"${anchorAttrs(repo)}>${escapeHtml(ui('repo', lang))}<span aria-hidden="true"> &rarr;</span></a>`);
  return out;
}

/** Inner HTML of the project dialog (everything except the close button). */
export function projectDetailHtml(p, lang) {
  const title = t(p?.title, lang).trim() || String(p?.id ?? '');
  const img = safeAsset(p?.image);
  const paras = bodyParagraphs(t(p?.body, lang)).map((x) => `<p>${escapeHtml(x)}</p>`).join('');
  const tags = list(p?.tags).filter((x) => typeof x === 'string' && x).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  const links = linkItems(p, lang);
  return `${img ? `<img class="proj-img" src="${escapeHtml(img)}" alt="" decoding="async">` : ''}<h3 id="project-dialog-title" class="proj-title" tabindex="-1">${escapeHtml(title)}</h3><div class="proj-body">${paras || `<p>${escapeHtml(t(p?.summary, lang))}</p>`}</div>${tags ? `<ul class="tags mono">${tags}</ul>` : ''}${links.length ? `<p class="proj-links">${links.join('')}</p>` : `<p class="proj-private mono muted">${escapeHtml(ui('privateProject', lang))}</p>`}`;
}

function card(p, i, lang) {
  const title = t(p?.title, lang).trim();
  const summary = t(p?.summary, lang);
  const img = safeAsset(p?.image);
  const initial = Array.from(title)[0] ?? '·';
  const media = img
    ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">`
    : `<span class="ph-letter" aria-hidden="true">${escapeHtml(initial)}</span>`;
  const links = linkItems(p, lang);
  const tags = list(p?.tags).filter((x) => typeof x === 'string' && x).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  return `
    <article class="card" data-project-id="${escapeHtml(isDeepLinkId(p?.id) ? p.id : '')}" data-i="${i}">
      <div class="card-media${img ? '' : ' no-img'}">${media}</div>
      <div class="card-body">
        <h3><button class="card-open" type="button" aria-haspopup="dialog" data-i="${i}">${escapeHtml(title)}</button></h3>
        <p class="card-sum">${escapeHtml(summary)}</p>
        ${tags ? `<ul class="tags mono">${tags}</ul>` : ''}
        <p class="card-links">${links.length ? links.join('') : `<span class="mono muted">${escapeHtml(ui('noLink', lang))}</span>`}</p>
      </div>
    </article>`;
}

export function render(el, content, lang) {
  shell(el, 'projects', content, lang, `<div class="cards">${list(content.projects).map((p, i) => card(p, i, lang)).join('')}</div>`);
}
