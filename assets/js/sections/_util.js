// Shared helpers for section renderers. Everything that reaches innerHTML goes through escapeHtml.
import { escapeHtml } from '../../../shared/sanitize.js';

const UI = {
  about: { th: 'เกี่ยวกับผม', en: 'About me' },
  projects: { th: 'ผลงาน', en: 'Projects' },
  skills: { th: 'ทักษะ', en: 'Skills' },
  journey: { th: 'เส้นทาง', en: 'Journey' },
  articles: { th: 'บทความ', en: 'Articles' },
  contact: { th: 'ติดต่อ', en: 'Contact' },
  resume: { th: 'เรซูเม่', en: 'Résumé' },
  allArticles: { th: 'ดูบทความทั้งหมด', en: 'See all articles' },
  demo: { th: 'ดูเดโม', en: 'Live demo' },
  repo: { th: 'ซอร์สโค้ด', en: 'Source code' },
  noLink: { th: 'ยังไม่เปิดให้ดู', en: 'no public link yet' },
  photo: { th: 'รูปโปรไฟล์ เร็ว ๆ นี้', en: 'photo coming soon' },
  email: { th: 'อีเมล', en: 'Email' },
  phone: { th: 'โทร', en: 'Phone' },
  contactLead: { th: 'มีงานหรืออยากคุยกัน ส่งข้อความมาได้เลย', en: 'Got a project or just want to talk? Drop me a line.' },
  heroTag: { th: 'กลางวัน dev · กลางคืน gamer', en: 'dev by day · gamer by night' },
  menu: { th: 'เมนู', en: 'Menu' },
  switchTo: { th: 'Switch to English', en: 'เปลี่ยนเป็นภาษาไทย' },
  skip: { th: 'ข้ามไปเนื้อหา', en: 'Skip to content' },
  loading: { th: 'กำลังโหลด…', en: 'Loading…' },
  loadFail: { th: 'โหลดเนื้อหาไม่สำเร็จ ลองรีเฟรชอีกครั้ง', en: 'Could not load the content. Please refresh.' },
  waiting: { th: 'รอเนื้อหาตัวอย่างจากหน้าแก้ไข…', en: 'Waiting for preview content from the editor…' },
};

const LINK_LABELS = {
  github: 'GitHub', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', website: 'Website', other: 'Link',
};

export function ui(key, lang) {
  const v = UI[key];
  if (!v) return '';
  return v[lang] ?? v.en;
}

export function linkLabel(kind) {
  return LINK_LABELS[kind] ?? LINK_LABELS.other;
}

export const list = (v) => (Array.isArray(v) ? v : []);
export const pad = (n) => String(n).padStart(2, '0');

/** https:// or a site path with a single leading slash; anything else -> ''. */
export function safeHref(u) {
  if (typeof u !== 'string') return '';
  if (/[\s\u0000-\u001f\\]/.test(u)) return '';
  if (/^https:\/\/[^/]/i.test(u) || /^\/(?!\/)/.test(u)) return u;
  return '';
}

export function safeAsset(p) {
  if (typeof p !== 'string' || p.includes('..') || /[\s\u0000-\u001f\\]/.test(p)) return '';
  return /^\/(uploads|projects)\/[^/]/.test(p) ? p : '';
}

export function anchorAttrs(u) {
  return /^https:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : '';
}

/** Section heading block: mono index label + title. el.dataset.index is set by site.js. */
export function head(el, id, lang) {
  const idx = el.dataset.index ? `${el.dataset.index} / ${id}` : id;
  return `<header class="sec-head"><p class="idx mono">${escapeHtml(idx)}</p><h2 id="${id}-title">${escapeHtml(ui(id, lang))}</h2></header>`;
}

export function shell(el, id, lang, bodyHtml) {
  el.className = `sec sec-${id}`;
  el.setAttribute('aria-labelledby', `${id}-title`);
  el.innerHTML = `<div class="sec-inner">${head(el, id, lang)}<div class="sec-body">${bodyHtml}</div></div>`;
}

const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const ICONS = {
  github: `<svg ${S}><circle cx="6" cy="5.5" r="2.2"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 7.7v8.6M18 11.2c0 4-6 2.6-11 5.6"/></svg>`,
  linkedin: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V16M8 7.8v.1M12 16v-5.5M12 13c0-1.6 1-2.6 2.4-2.6S17 11.3 17 13v3"/></svg>`,
  facebook: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M15.5 21v-7M13 14h4.8M15.5 14v-3.5c0-1.4.8-2 2-2"/></svg>`,
  instagram: `<svg ${S}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.4 6.7v.1"/></svg>`,
  website: `<svg ${S}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`,
  other: `<svg ${S}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  mail: `<svg ${S}><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>`,
  pin: `<svg ${S}><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>`,
  language: `<svg ${S}><path d="M4 6h9M8.5 4v2M6 6c.5 3.5 3 6 6 7M12 6c-.5 3.5-3 6.5-7 8M13 20l4-9 4 9M14.5 17h5"/></svg>`,
  gamepad: `<svg ${S}><path d="M7 7h10a4 4 0 0 1 4 4.3l-.5 4.2a2.5 2.5 0 0 1-4.2 1.5L15 15.5H9L7.700 17a2.5 2.5 0 0 1-4.200-1.500L3 11.300A4 4 0 0 1 7 7Z"/><path d="M8 10v3M6.500 11.500h3M15.500 11h.1M17.500 12.500h.1"/></svg>`,
  dot: `<svg ${S}><circle cx="12" cy="12" r="3"/></svg>`,
};

export function icon(name) {
  return ICONS[name] ?? ICONS.dot;
}

/**
 * Same-origin guard for the ?content= parameter. Returns "path?query" or null.
 * Control characters, spaces and backslashes are rejected first (URL parsing would strip
 * tab/LF/CR and turn "/\t/host" into "//host"), then the resolved origin must match.
 */
export function sameOriginPath(p, origin) {
  if (typeof p !== 'string' || !p.startsWith('/') || /[\u0000-\u0020\u007f\\]/.test(p)) return null;
  try {
    const u = new URL(p, origin);
    if (u.origin !== origin) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}
