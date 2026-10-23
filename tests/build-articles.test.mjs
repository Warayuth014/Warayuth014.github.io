import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planArticles } from '../shared/build-articles.js';

const site = { hero: { name: { th: 'ก', en: 'A' } } };
const art = (slug, over = {}) => ({
  slug, title: { th: 't', en: 't' }, summary: { th: '', en: '' }, body: { th: '<p>x</p>', en: '' },
  tags: [], cover: null, date: '2026-10-24', published: true, ...over,
});
const entry = (a) => ({ file: `${a.slug}.json`, article: a });

test('published get pages; list and index always; drafts none', () => {
  const p = planArticles(site, [entry(art('a')), entry(art('b', { published: false }))]);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(Object.keys(p.files).sort(), ['articles/a/index.html', 'articles/index.html', 'content/articles/index.json']);
  assert.deepEqual(JSON.parse(p.files['content/articles/index.json']).map((x) => x.slug), ['a']);
});

test('stale generated pages are removed; hand-made ones are kept or refuse overwrite', () => {
  const p = planArticles(site, [entry(art('a'))], { pages: { a: true, old: true, mine: false }, list: true });
  assert.deepEqual(p.removeSlugs, ['old']);
  assert.deepEqual(p.deletePaths, ['articles/old/index.html']);
  const clash = planArticles(site, [entry(art('mine'))], { pages: { mine: false }, list: false });
  assert.equal(clash.errors.length, 2);
  assert.deepEqual(clash.files, {});
});

test('invalid article or slug/file mismatch is reported with the file name', () => {
  const p = planArticles(site, [entry({ ...art('a'), date: 'x' }), { file: 'zzz.json', article: art('b') }]);
  assert.ok(p.errors.some((m) => m.startsWith('a.json: date')));
  assert.ok(p.errors.some((m) => m.startsWith('zzz.json: slug "b"')));
});
