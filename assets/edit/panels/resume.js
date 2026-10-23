import { safeAsset } from '../../../shared/schema.js';
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
      box.append(el('div', { class: 'thumb' }, safeAsset(resume.file) ? el('img', { src: safeAsset(resume.file), alt: 'ตัวอย่างเรซูเม่' }) : null));
    } else {
      box.append(el('p', {}, el('a', { href: safeAsset(resume.file) || '#', target: '_blank', rel: 'noopener', text: 'เปิดดูไฟล์ PDF ที่อัปโหลดไว้' })));
    }
    if (resume.file) {
      box.append(button('เอาเรซูเม่ออก', remove, { cls: 'danger small' }));
    }
  }

  // The live site still links the file until the owner saves, so removing only unlinks it in the draft;
  // the app deletes the file after the next successful save (files under /projects/ are never deleted).
  function remove() {
    ctx.queueDelete(resume.file);
    resume.file = null;
    resume.kind = null;
    status.textContent = 'เอาออกจากฉบับร่างแล้ว ไฟล์จะถูกลบหลังจากกดบันทึก';
    draw();
    ctx.changed();
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    status.textContent = 'กำลังอัปโหลด...';
    try {
      const old = resume.file;
      resume.file = await ctx.upload(file);
      ctx.queueDelete(old); // replaced file is deleted after the next save
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
