import { listEditor, lInput } from '../ui.js';

export const id = 'journey';
export const title = 'เส้นทาง';
export const hint = 'Journey';

export function render(root, ctx) {
  root.append(listEditor(ctx, {
    path: 'journey',
    items: ctx.draft.site.journey,
    itemName: 'ช่วงเวลา',
    addLabel: 'เพิ่มช่วงเวลา',
    max: 50,
    newItem: () => ({ when: { th: '', en: '' }, title: { th: '', en: '' }, place: { th: '', en: '' } }),
    title: (j) => j.title?.th || j.title?.en || '',
    renderItem: (j, i, body, retitle) => {
      const base = `journey[${i}]`;
      body.append(
        lInput(ctx, { obj: j, key: 'when', path: `${base}.when`, label: 'ช่วงเวลา', hint: 'When' }),
        lInput(ctx, { obj: j, key: 'title', path: `${base}.title`, label: 'ตำแหน่งหรือหลักสูตร', hint: 'Title' }),
        lInput(ctx, { obj: j, key: 'place', path: `${base}.place`, label: 'สถานที่', hint: 'Place' }));
      body.addEventListener('input', retitle);
    },
  }));
}
