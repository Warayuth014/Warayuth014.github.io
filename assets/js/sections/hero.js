import { escapeHtml } from '../../../shared/sanitize.js';
import { t } from '../../../shared/i18n.js';
import { ui } from './util.js';

export function render(el, content, lang) {
  const h = content.hero ?? {};
  const name = t(h.name, lang).trim();
  const words = name.split(/\s+/).filter(Boolean);
  const first = words.length > 1 ? words[0] : name;
  const rest = words.length > 1 ? words.slice(1).join(' ') : '';
  el.className = 'sec sec-hero';
  el.setAttribute('aria-label', name);
  // .hero-stage must survive re-renders (a WebGL canvas is mounted there later); only the text grid is rebuilt.
  let stage = el.querySelector(':scope > .hero-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'hero-stage';
    stage.setAttribute('aria-hidden', 'true');
    el.prepend(stage);
  }
  let grid = el.querySelector(':scope > .hero-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'hero-grid';
    el.appendChild(grid);
  }
  const thai = /[\u0E00-\u0E7F]/.test(name) ? ' lang="th"' : '';
  grid.innerHTML = `
      <div class="hero-copy">
        <p class="hero-tag mono"><span class="prompt" aria-hidden="true">&gt;</span> ${escapeHtml(ui('heroTag', lang))}<span class="cursor" aria-hidden="true">_</span></p>
        <h1 class="hero-name"${thai}><span class="n1">${escapeHtml(first)}</span>${rest ? ` <span class="n2">${escapeHtml(rest)}</span>` : ''}</h1>
        <p class="hero-intro">${escapeHtml(t(h.intro, lang))}</p>
        <p class="hero-cta">
          <a class="btn btn-primary" href="#projects">${escapeHtml(t(h.ctaWork, lang) || ui('projects', lang))}</a>
          <a class="btn btn-ghost" href="/resume/">${escapeHtml(t(h.ctaResume, lang) || ui('resume', lang))}</a>
        </p>
      </div>
      <p class="hero-side mono" aria-hidden="true">v1.0<br>bkk // 13.75N 100.50E</p>`;
}
