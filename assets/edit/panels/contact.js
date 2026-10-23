import { LINK_KINDS } from '../../../shared/schema.js';
import { el, textInput, selectInput, listEditor } from '../ui.js';

export const id = 'contact';
export const title = 'ติดต่อ';
export const hint = 'Contact';

const KIND_NAMES = { github: 'GitHub', linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', website: 'เว็บไซต์ (Website)', other: 'อื่น ๆ (Other)' };

export function render(root, ctx) {
  const contact = ctx.draft.site.contact;
  root.append(
    textInput(ctx, { obj: contact, key: 'email', path: 'contact.email', label: 'อีเมล', hint: 'Email', type: 'email' }),
    textInput(ctx, { obj: contact, key: 'phone', path: 'contact.phone', label: 'เบอร์โทร (เว้นว่างถ้าไม่ต้องการแสดง)', hint: 'Phone, optional', type: 'tel', nullable: true }),
    el('h3', { text: 'ลิงก์' }),
    listEditor(ctx, {
      path: 'contact.links',
      items: contact.links,
      itemName: 'ลิงก์',
      addLabel: 'เพิ่มลิงก์',
      max: 20,
      newItem: () => ({ kind: 'website', url: 'https://' }),
      title: (l) => `${KIND_NAMES[l.kind] ?? l.kind} ${l.url ?? ''}`.trim(),
      renderItem: (l, i, body, retitle) => {
        const base = `contact.links[${i}]`;
        body.append(
          selectInput(ctx, { obj: l, key: 'kind', path: `${base}.kind`, label: 'ประเภท', hint: 'Kind', options: LINK_KINDS.map((k) => [k, KIND_NAMES[k] ?? k]) }),
          textInput(ctx, { obj: l, key: 'url', path: `${base}.url`, label: 'ที่อยู่ลิงก์', hint: 'URL (https://...)', type: 'url' }));
        body.addEventListener('input', retitle);
        body.addEventListener('change', retitle);
      },
    }));
}
