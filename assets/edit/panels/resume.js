import { el, button, nextId } from '../ui.js';

export const id = 'resume';
export const title = 'เรซูเม่';
export const hint = 'Résumé';

export function render(root, ctx) {
  const resume = ctx.draft.site.resume;
  const status = el('p', { class: 'note', role: 'status' });
  const box = el('div', { class: 'resume-box' });
  const inputId = nextId();
  const input = el('input', { id: inputId, type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp,image/gif' });
  const err = ctx.errorOf('resume.file') || ctx.errorOf('resume.kind');

  function draw() {
    box.replaceChildren();
    if (!resume.file) {
      box.append(el('p', { class: 'note', text: 'ยังไม่มีไฟล์เรซูเม่ หน้าเว็บจะแสดงว่า "เร็ว ๆ นี้"' }));
    } else if (resume.kind === 'image') {
      box.append(el('div', { class: 'thumb' }, el('img', { src: resume.file, alt: 'ตัวอย่างเรซูเม่' })));
    } else {
      box.append(el('p', {}, el('a', { href: resume.file, target: '_blank', rel: 'noopener', text: 'เปิดดูไฟล์ PDF ที่อัปโหลดไว้' })));
    }
    if (resume.file) {
      box.append(button('เอาเรซูเม่ออก', remove, { cls: 'danger small' }));
    }
  }

  async function remove() {
    status.textContent = 'กำลังลบไฟล์...';
    try {
      // files under /projects/ ship with the site and are not deletable through the Worker; just unlink them
      if (resume.file.startsWith('/uploads/')) await ctx.deleteUpload(resume.file);
      resume.file = null;
      resume.kind = null;
      status.textContent = 'ลบไฟล์แล้ว (กดบันทึกเพื่อให้เว็บจริงเปลี่ยนตาม)';
      draw();
      ctx.changed();
    } catch (e) {
      status.textContent = e.message;
    }
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    status.textContent = 'กำลังอัปโหลด...';
    try {
      resume.file = await ctx.upload(file);
      resume.kind = file.type === 'application/pdf' ? 'pdf' : 'image';
      status.textContent = 'อัปโหลดแล้ว (กดบันทึกเพื่อให้เว็บจริงเปลี่ยนตาม)';
      draw();
      ctx.changed();
    } catch (e) {
      status.textContent = e.message;
    }
    input.value = '';
  });

  draw();
  root.append(
    el('div', { class: 'field' },
      el('label', { for: inputId }, el('span', { class: 'lbl', text: 'อัปโหลดเรซูเม่ (PDF หรือรูป ไม่เกิน 8 MB)' }), el('small', { class: 'hint', text: 'Upload résumé' })),
      input),
    err ? el('p', { class: 'err', role: 'alert', text: err }) : null,
    box, status);
}
