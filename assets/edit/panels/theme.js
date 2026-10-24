import { FONT_PAIRS } from '../../../shared/schema.js';
import { el, button, switchInput, nextId } from '../ui.js';

export const id = 'theme';
export const title = 'ธีมและสี';
export const hint = 'Theme';

// Defaults from the project brief (the shipped content/site.json uses the same values).
export const DEFAULT_THEME = {
  bg1: '#0b0f1d',
  bg2: '#1d0f2e',
  accent1: '#7cf3ff',
  accent2: '#a98bff',
  accent3: '#ff6fd1',
  mode: 'dark',
  fontPair: 'default',
  effects: { hero3d: true, threads: true },
};

const COLORS = [
  ['bg1', 'สีพื้นหลังบน', 'Background top'],
  ['bg2', 'สีพื้นหลังล่าง', 'Background bottom'],
  ['accent1', 'สีเน้น 1', 'Accent 1'],
  ['accent2', 'สีเน้น 2', 'Accent 2'],
  ['accent3', 'สีเน้น 3', 'Accent 3'],
];

const FONTS = {
  default: ['ชุดมาตรฐาน', 'IBM Plex Sans Thai + Space Grotesk', '"IBM Plex Sans Thai", system-ui, sans-serif'],
  soft: ['ชุดนุ่ม', 'Noto Sans Thai + Sora', '"Noto Sans Thai", system-ui, sans-serif'],
  tech: ['ชุดเทค', 'Anuphan + JetBrains Mono', '"Anuphan", system-ui, sans-serif'],
};

export function render(root, ctx) {
  const theme = ctx.draft.site.theme;
  const body = el('div');

  function draw() {
    body.replaceChildren();
    const grid = el('div', { class: 'colors' });
    for (const [key, th, en] of COLORS) {
      const cid = nextId();
      const picker = el('input', { id: cid, type: 'color', value: theme[key] });
      const code = el('code', { text: theme[key] });
      picker.addEventListener('input', () => {
        theme[key] = picker.value;
        code.textContent = picker.value;
        ctx.changed();
      });
      grid.append(el('div', { class: 'field color-field' }, el('label', { for: cid }, el('span', { class: 'lbl', text: th }), el('small', { class: 'hint', text: en })), picker, code));
    }

    const mode = el('fieldset', { class: 'choice' }, el('legend', {}, el('span', { class: 'lbl', text: 'โหมดสี' }), el('small', { class: 'hint', text: 'Mode' })));
    for (const [v, text] of [['dark', 'มืด (Dark)'], ['light', 'สว่าง (Light)']]) {
      const rid = nextId();
      const r = el('input', { id: rid, type: 'radio', name: 'theme-mode', value: v, checked: theme.mode === v });
      r.addEventListener('change', () => { theme.mode = v; ctx.changed(); });
      mode.append(el('div', { class: 'radio' }, r, el('label', { for: rid, text })));
    }

    const fonts = el('fieldset', { class: 'choice' }, el('legend', {}, el('span', { class: 'lbl', text: 'ชุดฟอนต์' }), el('small', { class: 'hint', text: 'Font pair' })));
    for (const pair of FONT_PAIRS) {
      const [name, families, stack] = FONTS[pair] ?? [pair, pair, 'system-ui'];
      const rid = nextId();
      const r = el('input', { id: rid, type: 'radio', name: 'theme-font', value: pair, checked: theme.fontPair === pair });
      r.addEventListener('change', () => { theme.fontPair = pair; ctx.changed(); });
      fonts.append(el('div', { class: 'radio font-opt' }, r,
        el('label', { for: rid }, el('strong', { text: name }), el('small', { class: 'hint', text: families }),
          el('span', { class: 'sample', lang: 'th', style: `font-family:${stack}`, text: 'สวัสดีครับ กลางวันเขียนโค้ด กลางคืนเล่นเกม' }))));
    }

    body.append(
      grid, mode, fonts,
      el('fieldset', { class: 'choice' }, el('legend', {}, el('span', { class: 'lbl', text: 'เอฟเฟกต์' }), el('small', { class: 'hint', text: 'Effects' })),
        switchInput(ctx, { label: 'ฉาก 3 มิติหน้าแรก', hint: 'Hero 3D scene', get: () => theme.effects.hero3d, set: (v) => { theme.effects.hero3d = v; } }),
        switchInput(ctx, { label: 'เส้นแสงพื้นหลัง', hint: 'Threads of light', get: () => theme.effects.threads, set: (v) => { theme.effects.threads = v; } })),
      button('รีเซ็ตเป็นธีมเริ่มต้น', () => {
        Object.assign(ctx.draft.site.theme, structuredClone(DEFAULT_THEME));
        ctx.changed();
        ctx.announce('รีเซ็ตเป็นธีมเริ่มต้นแล้ว');
        draw();
      }));
  }
  draw();
  root.append(body);
}
