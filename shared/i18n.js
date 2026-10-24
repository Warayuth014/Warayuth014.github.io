// Pure module: safe to import from the browser and from a Cloudflare Worker.

/** L = { th: string, en: string }. Falls back to the other language, then "". */
export function t(field, lang) {
  if (!field || typeof field !== 'object') return '';
  const other = lang === 'th' ? 'en' : 'th';
  const first = field[lang];
  if (typeof first === 'string' && first !== '') return first;
  const second = field[other];
  return typeof second === 'string' ? second : '';
}

/** localStorage `lang`, else navigator.language starting with "th" -> "th", else "en". */
export function detectLang() {
  try {
    const stored = globalThis.localStorage?.getItem('lang');
    if (stored === 'th' || stored === 'en') return stored;
  } catch {
    // storage blocked: fall through to navigator
  }
  try {
    const nav = globalThis.navigator?.language;
    if (typeof nav === 'string' && nav.toLowerCase().startsWith('th')) return 'th';
  } catch {
    // ignore
  }
  return 'en';
}
