import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { ui, shell, list, safeAsset, icon } from './util.js';

export function render(el, content, lang) {
  const a = content.about ?? {};
  const photo = safeAsset(a.photo);
  const paras = t(a.story, lang).split(/\n+/).map((s) => s.trim()).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const facts = list(a.facts).map((f) => `
      <div class="fact">
        <dt>${icon(f?.icon)}<span>${escapeHtml(t(f?.label, lang))}</span></dt>
        <dd>${escapeHtml(t(f?.value, lang))}</dd>
      </div>`).join('');
  const photoHtml = photo
    ? `<img class="photo" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async">`
    : `<div class="photo photo-empty" role="img" aria-label="${escapeHtml(ui('photo', lang))}"><span class="mono">${escapeHtml(ui('photo', lang))}</span></div>`;
  shell(el, 'about', content, lang, `
    <div class="about-grid">
      <div class="about-story">${paras}</div>
      <aside class="about-side">
        <figure class="photo-wrap">${photoHtml}</figure>
        <dl class="facts">${facts}</dl>
      </aside>
    </div>`);
}
