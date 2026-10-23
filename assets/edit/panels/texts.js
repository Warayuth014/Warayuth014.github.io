import { el, lInput, imageInput, listEditor, selectInput } from '../ui.js';

export const id = 'texts';
export const title = 'ข้อความหน้าแรก';
export const hint = 'Hero & About';

const ICONS = [['pin', 'หมุดสถานที่ (pin)'], ['language', 'ภาษา (language)'], ['gamepad', 'จอยเกม (gamepad)'], ['dot', 'จุด (dot)']];

export function render(root, ctx) {
  const { hero, about } = ctx.draft.site;
  root.append(
    el('h3', { text: 'หน้าแรก (Hero)' }),
    lInput(ctx, { obj: hero, key: 'name', path: 'hero.name', label: 'ชื่อ', hint: 'Name' }),
    lInput(ctx, { obj: hero, key: 'intro', path: 'hero.intro', label: 'คำแนะนำตัว', hint: 'Intro', multiline: true, rows: 4 }),
    lInput(ctx, { obj: hero, key: 'ctaWork', path: 'hero.ctaWork', label: 'ปุ่มดูผลงาน', hint: 'Work button' }),
    lInput(ctx, { obj: hero, key: 'ctaResume', path: 'hero.ctaResume', label: 'ปุ่มเรซูเม่', hint: 'Résumé button' }),
    el('h3', { text: 'เกี่ยวกับ (About)' }),
    imageInput(ctx, { obj: about, key: 'photo', path: 'about.photo', label: 'รูปถ่าย', hint: 'Photo' }),
    lInput(ctx, { obj: about, key: 'story', path: 'about.story', label: 'เรื่องราว', hint: 'Story', multiline: true, rows: 8 }),
    el('h3', { text: 'ข้อมูลสั้น ๆ (Facts)' }),
    listEditor(ctx, {
      path: 'about.facts',
      items: about.facts,
      itemName: 'ข้อมูล',
      addLabel: 'เพิ่มข้อมูล',
      max: 20,
      newItem: () => ({ icon: 'dot', label: { th: '', en: '' }, value: { th: '', en: '' } }),
      title: (f) => f.label?.th || f.label?.en || '',
      renderItem: (f, i, body, retitle) => {
        const base = `about.facts[${i}]`;
        const known = ICONS.some(([v]) => v === f.icon);
        body.append(
          selectInput(ctx, { obj: f, key: 'icon', path: `${base}.icon`, label: 'ไอคอน', hint: 'Icon', options: known ? ICONS : [...ICONS, [f.icon, f.icon]] }),
          lInput(ctx, { obj: f, key: 'label', path: `${base}.label`, label: 'หัวข้อ', hint: 'Label' }),
          lInput(ctx, { obj: f, key: 'value', path: `${base}.value`, label: 'ค่า', hint: 'Value' }));
        body.addEventListener('input', retitle);
      },
    }));
}
