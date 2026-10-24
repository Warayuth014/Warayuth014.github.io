import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAll } from '../tools/render-articles.mjs';
import { GENERATED_MARKER } from '../shared/render-article.js';

const art = (slug, over = {}) => ({
  slug,
  title: { th: 'หัวข้อ', en: 'Title' },
  summary: { th: 's', en: 's' },
  body: { th: '<p>x</p>', en: '<p>y</p>' },
  tags: [],
  cover: null,
  date: '2026-10-24',
  published: true,
  ...over,
});

function sandbox(articles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'render-articles-'));
  mkdirSync(join(root, 'content', 'articles'), { recursive: true });
  writeFileSync(join(root, 'content', 'site.json'), JSON.stringify({ hero: { name: { th: 'W', en: 'W' } } }));
  for (const [file, a] of Object.entries(articles)) writeFileSync(join(root, 'content', 'articles', file), JSON.stringify(a));
  return root;
}
const snapshot = (root) => JSON.stringify(readdirSync(root, { recursive: true }).sort());

test('renders published articles, list and index.json', () => {
  const root = sandbox({ 'a.json': art('a'), 'b.json': art('b', { date: '2026-11-01' }) });
  try {
    const r = renderAll(root);
    assert.deepEqual(r.written.sort(), ['a', 'b']);
    assert.ok(readFileSync(join(root, 'articles', 'a', 'index.html'), 'utf8').includes(GENERATED_MARKER));
    assert.ok(existsSync(join(root, 'articles', 'index.html')));
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'content', 'articles', 'index.json'), 'utf8')).map((x) => x.slug), ['b', 'a']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an invalid article throws and nothing is written', () => {
  const root = sandbox({ 'ok.json': art('ok'), 'bad.json': { slug: 'bad' } });
  try {
    const before = snapshot(root);
    assert.throws(() => renderAll(root), /bad\.json/);
    assert.equal(snapshot(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('slug that differs from the file name is rejected', () => {
  const root = sandbox({ 'one.json': art('two') });
  try {
    assert.throws(() => renderAll(root), /must match the file name/);
    assert.ok(!existsSync(join(root, 'articles')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stale generated folder is removed, unmarked folder is kept', () => {
  const root = sandbox({ 'a.json': art('a') });
  try {
    mkdirSync(join(root, 'articles', 'gone'), { recursive: true });
    writeFileSync(join(root, 'articles', 'gone', 'index.html'), `<!doctype html>\n${GENERATED_MARKER}\n<html></html>`);
    mkdirSync(join(root, 'articles', 'handmade'), { recursive: true });
    writeFileSync(join(root, 'articles', 'handmade', 'index.html'), '<html>mine</html>');
    const r = renderAll(root);
    assert.deepEqual(r.removed, ['gone']);
    assert.ok(!existsSync(join(root, 'articles', 'gone')));
    assert.equal(readFileSync(join(root, 'articles', 'handmade', 'index.html'), 'utf8'), '<html>mine</html>');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hand-made page at an article slug is never overwritten: error, nothing written', () => {
  const root = sandbox({ 'a.json': art('a'), 'b.json': art('b') });
  try {
    mkdirSync(join(root, 'articles', 'b'), { recursive: true });
    writeFileSync(join(root, 'articles', 'b', 'index.html'), '<html>mine</html>');
    assert.throws(() => renderAll(root), /refusing to overwrite/);
    assert.equal(readFileSync(join(root, 'articles', 'b', 'index.html'), 'utf8'), '<html>mine</html>');
    assert.ok(!existsSync(join(root, 'articles', 'a')));
    assert.ok(!existsSync(join(root, 'content', 'articles', 'index.json')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('drafts get no page, a previously generated page is removed, and the list omits them', () => {
  const root = sandbox({ 'd.json': art('d', { published: false }), 'p.json': art('p') });
  try {
    mkdirSync(join(root, 'articles', 'd'), { recursive: true });
    writeFileSync(join(root, 'articles', 'd', 'index.html'), `${GENERATED_MARKER}\nold`);
    const r = renderAll(root);
    assert.deepEqual(r.written, ['p']);
    assert.deepEqual(r.removed, ['d']);
    assert.ok(!existsSync(join(root, 'articles', 'd')));
    assert.ok(!readFileSync(join(root, 'articles', 'index.html'), 'utf8').includes('/articles/d/'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
