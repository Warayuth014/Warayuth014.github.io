// Theme application (colour tokens, light-mode derivation, font pair) shared by the home page,
// the résumé page and the static article pages. Browser only: touches document when called.
const FONT_PAIRS = {
  default: {
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap',
    body: '"IBM Plex Sans Thai", system-ui, sans-serif',
    display: '"Space Grotesk", "IBM Plex Sans Thai", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace',
  },
  soft: {
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600&family=Sora:wght@500;700&display=swap',
    body: '"Noto Sans Thai", system-ui, sans-serif',
    display: '"Sora", "Noto Sans Thai", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", Consolas, monospace',
  },
  tech: {
    href: 'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    body: '"Anuphan", system-ui, sans-serif',
    display: '"Anuphan", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  },
};
let listenerAttached = false;

// ---------- colour helpers (light mode derives its palette from the tokens) ----------
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, w) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v * (1 - w) + y[i] * w));
};
const lum = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
const darkenUntil = (hex, bg, min) => {
  let c = hex;
  for (let i = 0; i < 24 && contrast(c, bg) < min; i++) c = mix(c, '#000000', 0.07);
  return c;
};
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const pick = (v, d) => (isHex(v) ? v : d);

export function loadFont(pair) {
  const def = FONT_PAIRS[pair] ?? FONT_PAIRS.default;
  let link = document.getElementById('font-pair');
  if (!link) {
    link = document.createElement('link');
    link.id = 'font-pair';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== def.href) link.setAttribute('href', def.href);
  return def;
}

export function applyTheme(theme) {
  const th = theme && typeof theme === 'object' ? theme : {};
  const light = th.mode === 'light';
  const bg1 = pick(th.bg1, '#0b0f1d');
  const bg2 = pick(th.bg2, '#1d0f2e');
  const acc = [pick(th.accent1, '#7cf3ff'), pick(th.accent2, '#a98bff'), pick(th.accent3, '#ff6fd1')];
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  root.dataset.mode = light ? 'light' : 'dark';

  if (light) {
    const l1 = mix(bg1, '#ffffff', 0.95);
    const l2 = mix(bg2, '#ffffff', 0.9);
    const fg = lum(bg1) < 0.25 ? mix(bg1, '#000000', 0.35) : '#10131f';
    set('--bg1', l1);
    set('--bg2', l2);
    acc.forEach((a, i) => set(`--accent${i + 1}`, darkenUntil(a, l1, 4.5)));
    set('--fg', fg);
    set('--muted', mix(fg, l1, 0.38));
    set('--card', 'rgba(255,255,255,.72)');
    set('--line', mix(fg, l1, 0.8));
    set('--on-accent', '#ffffff');
  } else {
    set('--bg1', bg1);
    set('--bg2', bg2);
    acc.forEach((a, i) => set(`--accent${i + 1}`, a));
    set('--fg', '#eef1ff');
    set('--muted', '#a8aecb');
    set('--card', 'rgba(255,255,255,.045)');
    set('--line', 'rgba(255,255,255,.12)');
    set('--on-accent', '#0b0f1d');
  }

  const f = loadFont(th.fontPair);
  set('--font-body', f.body);
  set('--font-display', f.display);
  set('--font-mono', f.mono);
}
