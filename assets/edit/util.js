// Pure helpers for the editor (no DOM, so they can be unit tested in Node).

export const slugify = (text, max = 60) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');

/** https:// URL, or http://localhost / 127.0.0.1 for local development. Returns the cleaned URL or null. */
export function cleanWorkerUrl(v) {
  const s = String(v ?? '').trim().replace(/\/+$/, '');
  return /^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/[^\s]*)?$/.test(s) ? s : null;
}

const todayText = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export { todayText as today };

/** Slug from the English title; unique among the other articles; never "index". '' while both titles are empty. */
export function autoSlug(a, articles) {
  let base = slugify(a.title?.en);
  if (!base && (a.title?.en || '').trim() === '' && (a.title?.th || '').trim() === '') return '';
  if (!base) base = `post-${String(a.date || todayText()).replace(/-/g, '')}`;
  if (base === 'index') base = 'index-post';
  let slug = base;
  for (let n = 2; articles.some((x) => x !== a && x.slug === slug); n += 1) slug = `${base.slice(0, 56)}-${n}`;
  return slug;
}

/** Browser output -> the tags the sanitizer allows (b/i/div are what execCommand tends to emit). */
export function normalizeEditorHtml(html) {
  return html
    .replace(/<(\/?)b(?=[\s>])/gi, '<$1strong')
    .replace(/<(\/?)i(?=[\s>])/gi, '<$1em')
    .replace(/<(\/?)div(?=[\s>])/gi, '<$1p');
}

export const UPLOAD_FILE = /^\/uploads\/\d{4}\/[a-z0-9-]+\.(png|jpe?g|webp|gif|pdf)$/;
