import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { shell, list } from './util.js';

export function render(el, content, lang) {
  const rows = list(content.skills).map((g) => `
      <div class="skill-row">
        <h3 class="mono">${escapeHtml(t(g?.group, lang))}</h3>
        <ul class="chips">${list(g?.items).filter((x) => typeof x === 'string').map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      </div>`).join('');
  shell(el, 'skills', lang, `<div class="skill-rows">${rows}</div>`);
}
