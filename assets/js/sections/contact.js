import { escapeHtml } from '../../../shared/sanitize.js';
import { ui, shell, list, safeHref, anchorAttrs, icon, linkLabel } from './util.js';

export function render(el, content, lang) {
  const c = content.contact ?? {};
  const email = typeof c.email === 'string' ? c.email.trim() : '';
  const phone = typeof c.phone === 'string' ? c.phone.trim() : '';
  const links = list(c.links).map((l) => {
    const href = safeHref(l?.url);
    if (!href) return '';
    const label = linkLabel(l?.kind);
    return `<li><a href="${escapeHtml(href)}"${anchorAttrs(href)} aria-label="${escapeHtml(label)}">${icon(l?.kind)}<span>${escapeHtml(label)}</span></a></li>`;
  }).join('');
  shell(el, 'contact', content, lang, `
    <p class="contact-lead">${escapeHtml(ui('contactLead', lang, content))}</p>
    ${email ? `<p class="contact-mail"><a href="mailto:${escapeHtml(email)}" aria-label="${escapeHtml(ui('email', lang))}: ${escapeHtml(email)}">${icon('mail')}<span>${escapeHtml(email)}</span></a></p>` : ''}
    ${phone ? `<p class="contact-phone mono"><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">${escapeHtml(ui('phone', lang))} ${escapeHtml(phone)}</a></p>` : ''}
    <ul class="social">${links}</ul>`);
}
