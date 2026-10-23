import { cleanWorkerUrl } from '../api.js';
import { el, button, nextId, labelText } from '../ui.js';

export const id = 'settings';
export const title = 'ตั้งค่า';
export const hint = 'Settings';

function passwordField(label, hint) {
  const fid = nextId();
  const input = el('input', { id: fid, type: 'password', autocomplete: label.includes('ใหม่') ? 'new-password' : 'current-password' });
  return { input, box: el('div', { class: 'field' }, el('label', { for: fid }, labelText(label, hint)), input) };
}

export function render(root, ctx) {
  // ---- Worker URL
  const urlId = nextId();
  const urlInput = el('input', { id: urlId, type: 'url', value: ctx.workerUrl() ?? '', autocomplete: 'off', placeholder: 'https://....workers.dev' });
  const urlMsg = el('p', { class: 'note', role: 'status' });
  const urlForm = el('form', { class: 'card' },
    el('h3', { text: 'Worker URL' }),
    el('div', { class: 'field' }, el('label', { for: urlId }, labelText('ที่อยู่ Worker', 'Worker URL, https://')), urlInput),
    button('บันทึกที่อยู่ Worker', null, { type: 'submit', cls: 'primary' }), urlMsg);
  urlForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const clean = cleanWorkerUrl(urlInput.value);
    if (!clean) { urlMsg.textContent = 'ต้องขึ้นต้นด้วย https:// (หรือ http://localhost สำหรับทดสอบในเครื่อง)'; urlMsg.className = 'err'; return; }
    ctx.setWorkerUrl(clean);
    urlInput.value = clean;
    urlMsg.className = 'note';
    urlMsg.textContent = 'บันทึกที่อยู่ Worker ในเบราว์เซอร์นี้แล้ว';
  });

  // ---- change password
  const cur = passwordField('รหัสผ่านปัจจุบัน', 'Current password');
  const next = passwordField('รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)', 'New password, min 6 characters');
  const again = passwordField('ยืนยันรหัสผ่านใหม่', 'Confirm new password');
  const pwMsg = el('p', { class: 'note', role: 'status' });
  const pwForm = el('form', { class: 'card' }, el('h3', { text: 'เปลี่ยนรหัสผ่าน' }), cur.box, next.box, again.box,
    button('เปลี่ยนรหัสผ่าน', null, { type: 'submit', cls: 'primary' }), pwMsg);
  const pwFail = (m) => { pwMsg.className = 'err'; pwMsg.setAttribute('role', 'alert'); pwMsg.textContent = m; };
  pwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (next.input.value.length < 6) return pwFail('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
    if (next.input.value !== again.input.value) return pwFail('รหัสผ่านใหม่สองช่องไม่ตรงกัน');
    try {
      await ctx.changePassword(cur.input.value, next.input.value);
      pwForm.reset();
      pwMsg.className = 'note';
      pwMsg.setAttribute('role', 'status');
      pwMsg.textContent = 'เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ';
    } catch (e) {
      pwFail(e.message);
    }
  });

  root.append(urlForm, pwForm,
    el('div', { class: 'card' }, el('h3', { text: 'ออกจากระบบ' }), button('ออกจากระบบ', () => ctx.logout(), { cls: 'danger' })));
}
