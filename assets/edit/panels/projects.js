import { listEditor, lInput, textInput, imageInput, tagsConv, slugify } from '../ui.js';

export const id = 'projects';
export const title = 'ผลงาน';
export const hint = 'Projects';

export function render(root, ctx) {
  const projects = ctx.draft.site.projects;
  const auto = new WeakSet(); // new projects keep their id in step with the English title until it is edited by hand

  const uniqueId = (base, self) => {
    let candidate = base || 'project';
    for (let n = 2; projects.some((p) => p !== self && p.id === candidate); n += 1) candidate = `${base || 'project'}-${n}`.slice(0, 60);
    return candidate;
  };

  root.append(listEditor(ctx, {
    path: 'projects',
    items: projects,
    itemName: 'ผลงาน',
    addLabel: 'เพิ่มผลงาน',
    max: 100,
    newItem: () => {
      const p = { id: '', title: { th: '', en: '' }, summary: { th: '', en: '' }, body: { th: '', en: '' }, tags: [], image: null, links: {} };
      p.id = uniqueId('project', p);
      auto.add(p);
      return p;
    },
    title: (p) => p.title?.th || p.title?.en || '',
    renderItem: (p, i, body, retitle) => {
      const base = `projects[${i}]`;
      if (!p.links || typeof p.links !== 'object') p.links = {};
      const idField = textInput(ctx, { obj: p, key: 'id', path: `${base}.id`, label: 'รหัสผลงาน (ใช้ในลิงก์)', hint: 'Id: a-z 0-9 -', maxlength: 60, onInput: () => auto.delete(p) });
      body.append(
        lInput(ctx, { obj: p, key: 'title', path: `${base}.title`, label: 'ชื่อผลงาน', hint: 'Title' }),
        idField,
        lInput(ctx, { obj: p, key: 'summary', path: `${base}.summary`, label: 'สรุปสั้น ๆ', hint: 'Summary', multiline: true, rows: 3 }),
        lInput(ctx, { obj: p, key: 'body', path: `${base}.body`, label: 'รายละเอียด', hint: 'Details', multiline: true, rows: 6 }),
        textInput(ctx, { obj: p, key: 'tags', path: `${base}.tags`, label: 'แท็ก (คั่นด้วยเครื่องหมายจุลภาค)', hint: 'Tags, comma separated', ...tagsConv }),
        imageInput(ctx, { obj: p, key: 'image', path: `${base}.image`, label: 'รูปปก', hint: 'Cover image' }),
        textInput(ctx, { obj: p.links, key: 'repo', path: `${base}.links.repo`, label: 'ลิงก์โค้ด', hint: 'Repo URL (https://...)', onInput: (v) => { if (v === '') delete p.links.repo; } }),
        textInput(ctx, { obj: p.links, key: 'demo', path: `${base}.links.demo`, label: 'ลิงก์ตัวอย่าง', hint: 'Demo URL (https://... or /path)', onInput: (v) => { if (v === '') delete p.links.demo; } }));
      const idInput = idField.querySelector('input');
      const titleEn = body.querySelector('.lfield input[lang="en"]');
      body.addEventListener('input', (ev) => {
        if (ev.target === titleEn && auto.has(p)) {
          p.id = uniqueId(slugify(p.title.en) || 'project', p);
          idInput.value = p.id;
        }
        retitle();
      });
    },
  }));
}
