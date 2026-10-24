import { el, button } from '../ui.js';

export const id = 'sections';
export const title = 'ลำดับส่วน';
export const hint = 'Sections';

const NAMES = {
  hero: 'หน้าแรก (Hero)',
  about: 'เกี่ยวกับ (About)',
  projects: 'ผลงาน (Projects)',
  skills: 'ทักษะ (Skills)',
  journey: 'เส้นทาง (Journey)',
  articles: 'บทความ (Articles)',
  contact: 'ติดต่อ (Contact)',
};

export function render(root, ctx) {
  const site = ctx.draft.site;
  const list = el('ol', { class: 'items sections-list' });
  let dragFrom = -1;

  const move = (from, to, focusKind) => {
    if (to < 0 || to >= site.sections.length || from === to) return;
    const [s] = site.sections.splice(from, 1);
    site.sections.splice(to, 0, s);
    // the menu follows the page order
    site.nav = site.sections.map((x) => x.id).filter((x) => site.nav.includes(x));
    ctx.changed();
    ctx.announce(`${NAMES[s.id] ?? s.id} ย้ายไปลำดับที่ ${to + 1} จาก ${site.sections.length}`);
    draw(to, focusKind);
  };

  function draw(focusIndex = -1, focusKind = '') {
    list.replaceChildren();
    site.sections.forEach((s, i) => {
      const up = button('↑', () => move(i, i - 1, 'up'), { cls: 'small', label: `ย้ายขึ้น ${NAMES[s.id] ?? s.id}` });
      const down = button('↓', () => move(i, i + 1, 'down'), { cls: 'small', label: `ย้ายลง ${NAMES[s.id] ?? s.id}` });
      up.disabled = i === 0;
      down.disabled = i === site.sections.length - 1;
      const sw = el('input', { type: 'checkbox', role: 'switch', checked: s.visible !== false, id: `sec-vis-${s.id}` });
      sw.addEventListener('change', () => {
        s.visible = sw.checked;
        ctx.changed();
        ctx.announce(`${NAMES[s.id] ?? s.id} ${s.visible ? 'แสดง' : 'ซ่อน'}`);
      });
      const li = el('li', { class: 'section-row', draggable: 'true', 'data-id': s.id },
        el('span', { class: 'grip', 'aria-hidden': 'true', text: '⋮⋮' }),
        el('span', { class: 'sec-name', text: NAMES[s.id] ?? s.id }),
        el('span', { class: 'sec-vis' }, sw, el('label', { for: `sec-vis-${s.id}`, text: 'แสดง' })),
        up, down);
      li.addEventListener('dragstart', (ev) => {
        dragFrom = i;
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', s.id);
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (ev) => { ev.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', (ev) => {
        ev.preventDefault();
        li.classList.remove('over');
        if (dragFrom >= 0) move(dragFrom, i, 'drag');
        dragFrom = -1;
      });
      list.append(li);
      if (i === focusIndex) {
        queueMicrotask(() => {
          if (focusKind === 'up') (up.disabled ? down : up).focus();
          else if (focusKind === 'down') (down.disabled ? up : down).focus();
        });
      }
    });
  }
  draw();
  root.append(
    el('p', { class: 'note', text: 'ลากแถวเพื่อสลับลำดับ หรือใช้ปุ่ม ↑ ↓ ได้ด้วยแป้นพิมพ์ สวิตช์ "แสดง" ใช้ซ่อนส่วนที่ยังไม่พร้อม' }),
    list);
}
