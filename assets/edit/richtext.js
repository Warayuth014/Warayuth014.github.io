// Rich text box for article bodies: contenteditable + toolbar. The stored value is always the output of
// sanitizeRichText, so nothing the browser's editing commands produce can reach the repo unfiltered.
import { sanitizeRichText, escapeHtml } from '../../shared/sanitize.js';
import { el, askDialog, nextId, labelText } from './ui.js';

const SAFE_LINK = /^(https:\/\/[^\s/][^\s]*|mailto:[^\s]+)$/i;

/** Browser output -> the tags the sanitizer allows (b/i/div are what execCommand tends to emit). */
export function normalizeEditorHtml(html) {
  return html
    .replace(/<(\/?)b(?=[\s>])/gi, '<$1strong')
    .replace(/<(\/?)i(?=[\s>])/gi, '<$1em')
    .replace(/<(\/?)div(?=[\s>])/gi, '<$1p');
}

export function cleanValue(html) {
  const out = sanitizeRichText(normalizeEditorHtml(html));
  return out === '<p><br></p>' ? '' : out;
}

try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* unsupported */ }

/**
 * value: stored HTML string. onChange(cleanHtml). upload(file) -> Promise</uploads/...>.
 * Returns the root element (label + toolbar + editable area + status line).
 */
export function createRichText({ label, hint, lang, value, onChange, upload }) {
  const id = nextId('rt');
  const area = el('div', { id, class: 'rt-area', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': `${id}-l`, lang, spellcheck: 'false' });
  area.innerHTML = sanitizeRichText(value ?? '') || '<p><br></p>'; // sanitized above; never raw content
  const status = el('p', { class: 'note', role: 'status' });
  let saved = null;

  const remember = () => {
    const sel = getSelection();
    if (sel && sel.rangeCount && area.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    area.focus();
    if (saved) {
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(saved);
    }
  };
  const emit = () => onChange(cleanValue(area.innerHTML));

  area.addEventListener('input', emit);
  const onSel = () => { if (!area.isConnected) document.removeEventListener('selectionchange', onSel); else remember(); };
  document.addEventListener('selectionchange', onSel);
  area.addEventListener('blur', remember);
  area.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    if (text) document.execCommand('insertText', false, text);
  });
  area.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const text = ev.dataTransfer?.getData('text/plain') ?? '';
    if (text) document.execCommand('insertText', false, text);
  });

  const run = (fn) => () => { restore(); fn(); emit(); };
  const block = (tag) => run(() => {
    const cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    document.execCommand('formatBlock', false, cur === tag ? 'p' : tag);
  });

  const link = async () => {
    restore();
    const hasSel = saved && !saved.collapsed;
    const r = await askDialog({
      title: 'ใส่ลิงก์',
      note: 'รับเฉพาะลิงก์ที่ขึ้นต้นด้วย https:// หรือ mailto:',
      fields: [{ name: 'url', label: 'ที่อยู่ลิงก์', hint: 'URL', value: 'https://', validate: (v) => (SAFE_LINK.test(v.trim()) ? '' : 'ลิงก์ต้องขึ้นต้นด้วย https:// หรือ mailto:') }],
    });
    restore();
    if (!r) return;
    const url = r.url.trim();
    if (hasSel) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    emit();
  };

  const picker = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    status.textContent = 'กำลังอัปโหลดรูป...';
    try {
      const path = await upload(file);
      status.textContent = 'อัปโหลดแล้ว';
      const r = await askDialog({ title: 'คำอธิบายรูป', note: 'สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ (เว้นว่างได้)', fields: [{ name: 'alt', label: 'คำอธิบายรูป', hint: 'Alt text', value: '' }] });
      restore();
      document.execCommand('insertHTML', false, `<img src="${escapeHtml(path)}" alt="${escapeHtml(r?.alt ?? '')}">`);
      emit();
    } catch (e) {
      status.textContent = e.message;
    }
  });

  const tb = (text, name, handler, extra = '') => el('button', { type: 'button', class: `btn small ${extra}`.trim(), 'aria-label': name, title: name, onMousedown: (ev) => { remember(); ev.preventDefault(); }, onClick: handler }, text);
  const toolbar = el('div', { class: 'rt-tools', role: 'toolbar', 'aria-label': `เครื่องมือจัดรูปแบบ (${lang.toUpperCase()})` },
    tb('H2', 'หัวข้อใหญ่ (H2)', block('h2')),
    tb('H3', 'หัวข้อย่อย (H3)', block('h3')),
    tb('B', 'ตัวหนา', run(() => document.execCommand('bold')), 'b'),
    tb('I', 'ตัวเอียง', run(() => document.execCommand('italic')), 'i'),
    tb('• รายการ', 'รายการแบบจุด', run(() => document.execCommand('insertUnorderedList'))),
    tb('1. รายการ', 'รายการแบบตัวเลข', run(() => document.execCommand('insertOrderedList'))),
    tb('ลิงก์', 'ใส่ลิงก์', link),
    tb('รูป', 'แทรกรูป (อัปโหลด)', () => { remember(); picker.click(); }),
    tb('โค้ด', 'บล็อกโค้ด', block('pre')),
    tb('อ้างอิง', 'ข้อความอ้างอิง', block('blockquote')),
    picker);

  return el('div', { class: 'field rt' },
    el('span', { id: `${id}-l`, class: 'rt-label' }, labelText(label, hint)),
    toolbar, area, status);
}

