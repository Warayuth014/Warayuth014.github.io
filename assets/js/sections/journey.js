import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { shell, list } from './_util.js';

export function render(el, content, lang) {
  const items = list(content.journey).map((j) => `
      <li class="step">
        <p class="when mono">${escapeHtml(t(j?.when, lang))}</p>
        <h3>${escapeHtml(t(j?.title, lang))}</h3>
        <p class="place">${escapeHtml(t(j?.place, lang))}</p>
      </li>`).join('');
  shell(el, 'journey', lang, `<ol class="timeline">${items}</ol>`);
}
