import { listEditor, lInput, textArea, linesConv } from '../ui.js';

export const id = 'skills';
export const title = 'ทักษะ';
export const hint = 'Skills';

export function render(root, ctx) {
  root.append(listEditor(ctx, {
    path: 'skills',
    items: ctx.draft.site.skills,
    itemName: 'กลุ่มทักษะ',
    addLabel: 'เพิ่มกลุ่มทักษะ',
    max: 30,
    newItem: () => ({ group: { th: '', en: '' }, items: [] }),
    title: (g) => g.group?.th || g.group?.en || '',
    renderItem: (g, i, body, retitle) => {
      const base = `skills[${i}]`;
      body.append(
        lInput(ctx, { obj: g, key: 'group', path: `${base}.group`, label: 'ชื่อกลุ่ม', hint: 'Group name' }),
        textArea(ctx, { obj: g, key: 'items', path: `${base}.items`, label: 'ทักษะ (หนึ่งบรรทัดต่อหนึ่งทักษะ)', hint: 'Skills, one per line', rows: 5, ...linesConv }));
      body.addEventListener('input', retitle);
    },
  }));
}
