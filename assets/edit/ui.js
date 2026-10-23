// Small DOM helpers shared by the editor panels. Content strings only ever reach the page through
// textContent / .value / setAttribute, never through innerHTML.

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = Boolean(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

let uid = 0;
export const nextId = (p = 'f') => `${p}${(uid += 1)}`;

/** Thai label with an English hint: <span>ชื่อ</span><small>Name</small> */
export function labelText(label, hint) {
  return [el('span', { class: 'lbl', text: label }), hint ? el('small', { class: 'hint', text: hint }) : null];
}

/** Wraps a control with its label and (when ctx has one for `path`) an announced error message. */
function wrap(ctx, { label, hint, path, control, id, extraClass = '' }) {
  const msg = path ? ctx.errorOf(path) : '';
  const errId = `${id}-err`;
  const box = el('div', { class: `field ${extraClass}`.trim() },
    el('label', { for: id }, labelText(label, hint)),
    control,
    msg ? el('p', { class: 'err', id: errId, role: 'alert', text: msg }) : null);
  if (msg) {
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', errId);
  }
  return box;
}

export function textInput(ctx, { obj, key, path, label, hint, type = 'text', placeholder, maxlength, onInput, nullable = false, toValue, fromValue }) {
  const id = nextId();
  const control = el('input', { id, type, value: fromValue ? fromValue(obj[key]) : (obj[key] ?? ''), placeholder, maxlength, autocomplete: 'off' });
  control.addEventListener('input', () => {
    obj[key] = toValue ? toValue(control.value) : (nullable && control.value === '' ? null : control.value);
    onInput?.(control.value);
    ctx.changed();
  });
  return wrap(ctx, { label, hint, path, control, id });
}

export function textArea(ctx, { obj, key, path, label, hint, rows = 4, onInput, toValue, fromValue }) {
  const id = nextId();
  const control = el('textarea', { id, rows, value: fromValue ? fromValue(obj[key]) : (obj[key] ?? '') });
  control.addEventListener('input', () => {
    obj[key] = toValue ? toValue(control.value) : control.value;
    onInput?.(control.value);
    ctx.changed();
  });
  return wrap(ctx, { label, hint, path, control, id });
}

export function selectInput(ctx, { obj, key, path, label, hint, options }) {
  const id = nextId();
  const control = el('select', { id }, options.map(([v, text]) => el('option', { value: v, text, selected: obj[key] === v })));
  control.value = obj[key];
  control.addEventListener('change', () => {
    obj[key] = control.value;
    ctx.changed();
  });
  return wrap(ctx, { label, hint, path, control, id });
}

/** Thai and English side by side. obj[key] is { th, en }. */
export function lInput(ctx, { obj, key, path, label, hint, multiline = false, rows = 4, maxlength }) {
  if (!obj[key] || typeof obj[key] !== 'object') obj[key] = { th: '', en: '' };
  const value = obj[key];
  const msgs = [path, `${path}.th`, `${path}.en`].map((p) => ctx.errorOf(p)).filter(Boolean);
  const errId = nextId('e');
  const side = (lang, name) => {
    const id = nextId();
    const control = el(multiline ? 'textarea' : 'input', { id, value: value[lang] ?? '', rows: multiline ? rows : undefined, maxlength, lang, type: multiline ? undefined : 'text', autocomplete: 'off' });
    if (ctx.errorOf(`${path}.${lang}`) || ctx.errorOf(path)) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', errId);
    }
    control.addEventListener('input', () => {
      value[lang] = control.value;
      ctx.changed();
    });
    return el('div', { class: 'lside' }, el('label', { for: id }, el('span', { class: 'lbl', text: name })), control);
  };
  return el('fieldset', { class: 'lfield' },
    el('legend', {}, labelText(label, hint)),
    el('div', { class: 'lcols' }, side('th', 'ไทย (TH)'), side('en', 'อังกฤษ (EN)')),
    msgs.length ? el('p', { class: 'err', id: errId, role: 'alert', text: msgs.join(' / ') }) : null);
}

export function switchInput(ctx, { label, hint, get, set }) {
  const id = nextId();
  const box = el('input', { id, type: 'checkbox', role: 'switch', checked: get() });
  box.addEventListener('change', () => {
    set(box.checked);
    ctx.changed();
  });
  return el('div', { class: 'field switch-field' }, box, el('label', { for: id }, labelText(label, hint)));
}

export function button(text, onClick, { cls = '', label, type = 'button' } = {}) {
  return el('button', { type, class: `btn ${cls}`.trim(), 'aria-label': label, onClick }, text);
}

// ---------- dialogs ----------

/** Opens a modal form. fields: [{name, label, hint, value, type, validate(v) -> message|''}]. Resolves values or null. */
export function askDialog({ title, fields, okLabel = 'ตกลง', note }) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title' });
    const form = el('form', { method: 'dialog' });
    const msg = el('p', { class: 'err', role: 'alert' });
    const inputs = fields.map((f) => {
      const id = nextId('d');
      const input = el('input', { id, name: f.name, type: f.type ?? 'text', value: f.value ?? '', autocomplete: 'off' });
      form.append(el('div', { class: 'field' }, el('label', { for: id }, labelText(f.label, f.hint)), input));
      return [f, input];
    });
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    form.prepend(el('h2', { id: 'dlg-title', text: title }), note ? el('p', { class: 'note', text: note }) : null);
    form.append(msg, el('div', { class: 'row-end' },
      button('ยกเลิก', () => done(null)),
      button(okLabel, null, { cls: 'primary', type: 'submit' })));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const out = {};
      for (const [f, input] of inputs) {
        const m = f.validate?.(input.value) ?? '';
        if (m) { msg.textContent = m; input.focus(); return; }
        out[f.name] = input.value;
      }
      done(out);
    });
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); done(null); });
    dlg.append(form);
    document.body.append(dlg);
    dlg.showModal();
    inputs[0]?.[1].focus();
  });
}

export function confirmDialog(message, okLabel = 'ลบ') {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'dlg', 'aria-labelledby': 'cf-title' });
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.append(el('form', { method: 'dialog' },
      el('h2', { id: 'cf-title', text: message }),
      el('div', { class: 'row-end' }, button('ยกเลิก', () => done(false)), button(okLabel, () => done(true), { cls: 'danger' }))));
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); done(false); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('button').focus();
  });
}

// ---------- image / file upload ----------

/** An upload button + preview for obj[key] (null or /uploads/... path). */
export function imageInput(ctx, { obj, key, path, label, hint, accept = 'image/png,image/jpeg,image/webp,image/gif' }) {
  const id = nextId();
  const status = el('p', { class: 'note', role: 'status' });
  const preview = el('div', { class: 'thumb' });
  const input = el('input', { id, type: 'file', accept });
  const removeBtn = button('เอารูปออก', () => { obj[key] = null; draw(); ctx.changed(); }, { cls: 'small' });
  function draw() {
    preview.replaceChildren();
    if (obj[key]) preview.append(el('img', { src: obj[key], alt: '' }), el('code', { text: obj[key] }));
    else preview.append(el('span', { class: 'note', text: 'ยังไม่มีรูป' }));
    removeBtn.hidden = !obj[key];
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    status.textContent = 'กำลังอัปโหลด...';
    try {
      obj[key] = await ctx.upload(file);
      status.textContent = 'อัปโหลดแล้ว';
      draw();
      ctx.changed();
    } catch (e) {
      status.textContent = e.message;
    }
    input.value = '';
  });
  draw();
  const box = wrap(ctx, { label, hint, path, control: input, id });
  box.append(preview, removeBtn, status);
  return box;
}

// ---------- ordered lists with add / remove / move ----------

/**
 * items: the live array. renderItem(item, index, body) fills the item's body; title(item, index) is its heading.
 * Moving works with the buttons (keyboard friendly) and announces the result.
 */
export function listEditor(ctx, { path, items, newItem, renderItem, title, addLabel, itemName, max = 100, onRemove, firstOpen = false }) {
  const wrapper = el('div', { class: 'list-editor' });
  const ul = el('ol', { class: 'items' });
  const add = button(addLabel, () => {
    if (items.length >= max) { ctx.announce(`เพิ่มได้สูงสุด ${max} รายการ`); return; }
    items.push(newItem());
    ctx.changed();
    draw(items.length - 1, 'open');
  }, { cls: 'primary' });
  wrapper.append(ul, add);

  function draw(focusIndex = -1, focusWhat = '') {
    ul.replaceChildren();
    items.forEach((item, i) => {
      const body = el('div', { class: 'item-body' });
      const head = el('span', { class: 'item-title', text: title(item, i) || `${itemName} ${i + 1}` });
      const mv = (delta, text) => button(text, () => {
        const j = i + delta;
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        ctx.changed();
        ctx.announce(`${itemName} ย้ายไปลำดับที่ ${j + 1} จาก ${items.length}`);
        draw(j, delta < 0 ? 'up' : 'down');
      }, { cls: 'small', label: `${text === '↑' ? 'ย้ายขึ้น' : 'ย้ายลง'} ${itemName} ${i + 1}` });
      const up = mv(-1, '↑');
      const down = mv(1, '↓');
      up.disabled = i === 0;
      down.disabled = i === items.length - 1;
      const del = button('ลบ', async () => {
        if (!(await confirmDialog(`ลบ${itemName} ${i + 1} ใช่ไหม`))) return;
        const [gone] = items.splice(i, 1);
        onRemove?.(gone);
        ctx.changed();
        ctx.announce(`ลบ${itemName}แล้ว`);
        draw(Math.min(i, items.length - 1), 'add');
      }, { cls: 'small danger', label: `ลบ ${itemName} ${i + 1}` });
      const details = el('details', { class: 'item', open: firstOpen && i === 0 ? true : (i === focusIndex && focusWhat === "open") || (path ? ctx.hasErrorUnder(`${path}[${i}]`) : false) },
        el('summary', {}, head),
        body);
      const li = el('li', {}, details, el('div', { class: 'item-tools' }, up, down, del));
      ul.append(li);
      renderItem(item, i, body, () => { head.textContent = title(item, i) || `${itemName} ${i + 1}`; });
      li._buttons = { up, down };
      if (i === focusIndex) {
        if (focusWhat === 'open') queueMicrotask(() => body.querySelector('input,textarea,select')?.focus());
        else if (focusWhat === 'up') queueMicrotask(() => (up.disabled ? down : up).focus());
        else if (focusWhat === 'down') queueMicrotask(() => (down.disabled ? up : down).focus());
      }
    });
    if (focusWhat === 'add' && items.length === 0) queueMicrotask(() => add.focus());
  }
  draw();
  return wrapper;
}

export const slugify = (text, max = 60) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');

export const tagsConv = {
  fromValue: (a) => (Array.isArray(a) ? a.join(', ') : ''),
  toValue: (v) => v.split(',').map((x) => x.trim()).filter(Boolean),
};
export const linesConv = {
  fromValue: (a) => (Array.isArray(a) ? a.join('\n') : ''),
  toValue: (v) => v.split('\n').map((x) => x.trim()).filter(Boolean),
};
