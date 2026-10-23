import { el, button, lInput, textInput, imageInput, switchInput, confirmDialog, tagsConv } from '../ui.js';
import { autoSlug, today } from '../util.js';
import { createRichText } from '../richtext.js';

export const id = 'articles';
export const title = 'บทความ';
export const hint = 'Articles';

let current = null; // the article object being edited (null = list view)
const slugManual = new WeakSet(); // articles whose slug the owner typed by hand

export function render(root, ctx) {
  const articles = ctx.draft.articles;
  if (current && !articles.includes(current)) current = null;
  if (current) renderEditor(root, ctx, current);
  else renderList(root, ctx);
}

function renderList(root, ctx) {
  const articles = ctx.draft.articles;
  ctx.setPreview(null);
  const add = () => {
    const a = { slug: '', title: { th: '', en: '' }, summary: { th: '', en: '' }, body: { th: '', en: '' }, tags: [], cover: null, date: today(), published: false };
    articles.push(a);
    current = a;
    ctx.changed();
    ctx.rerender(true);
  };
  const ul = el('ul', { class: 'items article-list' });
  [...articles].sort((x, y) => String(y.date).localeCompare(String(x.date))).forEach((a) => {
    const saved = ctx.savedSlugs.has(a.slug);
    ul.append(el('li', {},
      el('button', { type: 'button', class: 'article-row', onClick: () => { current = a; ctx.rerender(true); } },
        el('strong', { text: a.title.th || a.title.en || '(ยังไม่ตั้งชื่อ)' }),
        el('span', { class: 'meta mono', text: `${a.date} · ${a.slug || 'ยังไม่มี slug'}` }),
        el('span', { class: `badge ${a.published ? 'on' : ''}`, text: a.published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง' }),
        saved ? null : el('span', { class: 'badge new', text: 'ใหม่ ยังไม่บันทึก' }))));
  });
  root.append(
    button('เพิ่มบทความ', add, { cls: 'primary' }),
    articles.length ? ul : el('p', { class: 'note', text: 'ยังไม่มีบทความ กด "เพิ่มบทความ" เพื่อเริ่มเขียน' }));
}

function renderEditor(root, ctx, a) {
  const articles = ctx.draft.articles;
  const idx = articles.indexOf(a);
  const base = `articles[${idx}]`;
  const saved = ctx.savedSlugs.has(a.slug);
  ctx.setPreview(a);

  const slugField = saved
    ? el('div', { class: 'field' }, el('label', { for: 'slug-ro' }, el('span', { class: 'lbl', text: 'Slug (ล็อกแล้ว เพราะบทความนี้ถูกบันทึกไว้แล้ว)' })),
      el('input', { id: 'slug-ro', value: a.slug, readonly: true }))
    : textInput(ctx, { obj: a, key: 'slug', path: `${base}.slug`, label: 'Slug (ส่วนท้ายของลิงก์)', hint: 'a-z 0-9 - only, max 60', maxlength: 60, onInput: () => slugManual.add(a) });
  const slugInput = slugField.querySelector('input');

  const titleBox = lInput(ctx, { obj: a, key: 'title', path: `${base}.title`, label: 'หัวข้อ', hint: 'Title' });
  const titleEn = titleBox.querySelector('input[lang="en"]');
  titleEn.addEventListener('input', () => {
    if (saved || slugManual.has(a)) return;
    a.slug = autoSlug(a, articles);
    slugInput.value = a.slug;
  });

  const rich = (lang, name) => {
    const rt = createRichText({
      label: `เนื้อหา ${name}`, hint: `Body (${lang.toUpperCase()})`, lang, value: a.body[lang],
      onChange: (html) => { a.body[lang] = html; ctx.changed(); },
      upload: (file) => ctx.upload(file),
    });
    const msg = ctx.errorOf(`${base}.body.${lang}`);
    if (msg) rt.append(el('p', { class: 'err', role: 'alert', text: msg }));
    return rt;
  };

  const del = button('ลบบทความนี้', async () => {
    if (!(await confirmDialog('ลบบทความนี้ใช่ไหม'))) return;
    articles.splice(articles.indexOf(a), 1);
    if (ctx.savedSlugs.has(a.slug)) ctx.markDeleted(a.slug);
    current = null;
    ctx.changed();
    ctx.announce('ลบบทความแล้ว (กดบันทึกเพื่อให้เว็บจริงเปลี่ยนตาม)');
    ctx.rerender(true);
  }, { cls: 'danger' });

  root.append(
    button('← กลับไปรายการบทความ', () => { current = null; ctx.rerender(true); }),
    titleBox,
    slugField,
    lInput(ctx, { obj: a, key: 'summary', path: `${base}.summary`, label: 'สรุปสั้น ๆ', hint: 'Summary', multiline: true, rows: 3 }),
    textInput(ctx, { obj: a, key: 'date', path: `${base}.date`, label: 'วันที่', hint: 'Date', type: 'date' }),
    textInput(ctx, { obj: a, key: 'tags', path: `${base}.tags`, label: 'แท็ก (คั่นด้วยเครื่องหมายจุลภาค)', hint: 'Tags, comma separated', ...tagsConv }),
    imageInput(ctx, { obj: a, key: 'cover', path: `${base}.cover`, label: 'รูปปก', hint: 'Cover image' }),
    switchInput(ctx, { label: 'เผยแพร่', hint: 'Published (off = draft, not shown on the site)', get: () => a.published, set: (v) => { a.published = v; } }),
    rich('th', 'ภาษาไทย'),
    rich('en', 'ภาษาอังกฤษ'),
    del);
}

/** Called by the app when the owner leaves the articles panel. */
export function closeEditor() { current = null; }
