import { SECTION_TITLE_IDS } from '../../../shared/schema.js';
import { el, lInput, imageInput, listEditor, selectInput } from '../ui.js';

export const id = 'texts';
export const title = 'ข้อความหน้าแรก';
export const hint = 'Hero & About';

const ICONS = [['pin', 'หมุดสถานที่ (pin)'], ['language', 'ภาษา (language)'], ['gamepad', 'จอยเกม (gamepad)'], ['dot', 'จุด (dot)']];

export function render(root, ctx) {
  const { hero, about, ui, meta } = ctx.draft.site;
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
    }),
    el('h3', { text: 'ข้อความทั่วไป (Texts)' }),
    lInput(ctx, { obj: ui, key: 'tagline', path: 'ui.tagline', label: 'ประโยคสั้นเหนือชื่อ', hint: 'Tagline (empty = default)' }),
    lInput(ctx, { obj: ui, key: 'contactLead', path: 'ui.contactLead', label: 'ประโยคเชิญติดต่อ', hint: 'Contact lead (empty = default)' }),
    lInput(ctx, { obj: ui, key: 'footer', path: 'ui.footer', label: 'ข้อความท้ายหน้า', hint: 'Footer (empty = default)' }),
    el('h3', { text: 'หัวข้อแต่ละส่วนของหน้าแรก (Section titles)' }),
    ...SECTION_TITLE_IDS.map((sid) => lInput(ctx, { obj: ui.sectionTitles, key: sid, path: `ui.sectionTitles.${sid}`, label: `หัวข้อส่วน ${sid}`, hint: 'Section title (empty = default)' })),
    el('h3', { text: 'ชื่อแท็บและคำอธิบายเว็บ (Title & description)' }),
    lInput(ctx, { obj: meta, key: 'title', path: 'meta.title', label: 'ข้อความบนแท็บเบราว์เซอร์', hint: 'Page title (empty = name | tagline)' }),
    lInput(ctx, { obj: meta, key: 'description', path: 'meta.description', label: 'คำอธิบายสำหรับ Google/แชร์ลิงก์', hint: 'Description', multiline: true, rows: 3 }));
}
