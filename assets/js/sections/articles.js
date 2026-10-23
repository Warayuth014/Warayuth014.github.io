import { escapeHtml } from '../../../shared/sanitize.js';
import { ui, shell } from './_util.js';

// Articles arrive in a later task; the container is left for it to fill.
export function render(el, content, lang) {
  shell(el, 'articles', lang, `
    <div data-articles-list class="articles-list"></div>
    <p class="articles-more"><a class="btn btn-ghost" href="/articles/">${escapeHtml(ui('allArticles', lang))}<span aria-hidden="true"> &rarr;</span></a></p>`);
}
