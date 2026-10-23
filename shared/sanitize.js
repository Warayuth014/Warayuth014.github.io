// Pure module (no DOM, no globals): safe in the browser and in a Cloudflare Worker.
// Small tokenizer + allowlist. Output attributes are always double-quoted and escaped.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const ALLOWED = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'img', 'pre', 'code', 'blockquote', 'br']);
const VOID = new Set(['br', 'img']);
// Content of these is dropped entirely (not just the tags).
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'template']);
// Void-like tags with no content: tag is dropped.
const DROP_VOID = new Set(['embed']);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function escapeText(s) {
  return s.replace(/&(?![a-zA-Z]+;|#\d+;|#[xX][0-9a-fA-F]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// Strip whitespace/control chars browsers ignore inside a scheme before testing it.
const COMPACT_RE = /[\s\x00-\x1f\x7f-\x9f​-‏﻿]/g;
const compact = (v) => v.replace(COMPACT_RE, "");

function safeHref(v) {
  const c = compact(v);
  if (/^https:\/\/[^/]/i.test(c)) return { value: v.trim(), https: true };
  if (/^mailto:[^\s]+/i.test(c)) return { value: v.trim(), https: false };
  return null;
}

function safeImgSrc(v) {
  const c = compact(v);
  if (/^https:\/\/[^/]/i.test(c)) return v.trim();
  if (/^\/uploads\/[^/]/.test(v) && !/\.\./.test(v) && !/[\\\s]/.test(v)) return v;
  return null;
}

function openTag(name, attrs) {
  if (name === 'a') {
    const h = attrs.href !== undefined ? safeHref(attrs.href) : null;
    if (!h) return '<a>';
    return `<a href="${escapeHtml(h.value)}" rel="noopener noreferrer"${h.https ? ' target="_blank"' : ''}>`;
  }
  if (name === 'img') {
    const src = attrs.src !== undefined ? safeImgSrc(attrs.src) : null;
    if (!src) return null;
    const alt = attrs.alt !== undefined ? ` alt="${escapeHtml(attrs.alt)}"` : '';
    return `<img src="${escapeHtml(src)}"${alt}>`;
  }
  if (name === 'br') return '<br>';
  return `<${name}>`;
}

// Sticky + bounded attribute run: linear work per "<", no slicing of the remaining input.
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"']){0,2000})>/y;

export function sanitizeRichText(html) {
  if (typeof html !== 'string') return '';
  let out = '';
  const stack = [];
  let i = 0;
  const lastGt = html.lastIndexOf('>');
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { out += escapeText(html.slice(i)); break; }
    if (lt > i) out += escapeText(html.slice(i, lt));
    i = lt;

    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    TAG_RE.lastIndex = i;
    const m = i < lastGt ? TAG_RE.exec(html) : null;
    if (!m) {
      // Not a tag (e.g. "1 < 2" or unterminated "<p title=..."): literal text.
      out += '&lt;';
      i += 1;
      continue;
    }
    i += m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();

    if (!closing && DROP_CONTENT.has(name)) {
      const close = new RegExp(`</${name}(?=[\\s/>])`, 'gi');
      close.lastIndex = i;
      const cm = close.exec(html);
      if (!cm) { i = html.length; continue; }
      const gt = html.indexOf('>', cm.index);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }
    if (DROP_VOID.has(name) || !ALLOWED.has(name)) continue;

    if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx === -1) continue;
      while (stack.length > idx) out += `</${stack.pop()}>`;
      continue;
    }
    const tag = openTag(name, parseAttrs(m[3].replace(/\/\s*$/, '')));
    if (tag === null) continue;
    out += tag;
    if (!VOID.has(name)) stack.push(name);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}
