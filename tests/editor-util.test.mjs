import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWorkerUrl, autoSlug, normalizeEditorHtml, slugify, UPLOAD_FILE } from '../assets/edit/util.js';
import { sanitizeRichText } from '../shared/sanitize.js';

test('cleanWorkerUrl accepts https and local http only, and trims trailing slashes', () => {
  assert.equal(cleanWorkerUrl(' https://w.example.workers.dev/ '), 'https://w.example.workers.dev');
  assert.equal(cleanWorkerUrl('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(cleanWorkerUrl('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234');
  for (const bad of ['http://evil.example', 'javascript:alert(1)', 'ftp://x.y', '//x.y', 'https://', '', null, undefined, 'https://a b.c', 'http://localhost.evil.com']) {
    assert.equal(cleanWorkerUrl(bad), null, String(bad));
  }
});

test('slugify keeps a-z 0-9 and single dashes, max 60', () => {
  assert.equal(slugify('Hello, Editor!!'), 'hello-editor');
  assert.equal(slugify('--a   b--'), 'a-b');
  assert.equal(slugify('ภาษาไทยล้วน'), '');
  assert.ok(slugify('x'.repeat(100)).length <= 60);
});

test('autoSlug: from the English title, unique, never "index"', () => {
  const mk = (en, th = '', date = '2026-10-24') => ({ slug: '', title: { en, th }, date });
  assert.equal(autoSlug(mk('Hello Editor!'), []), 'hello-editor');
  assert.equal(autoSlug(mk('', ''), []), '');
  assert.equal(autoSlug(mk('', 'ภาษาไทย'), []), 'post-20261024');
  assert.equal(autoSlug(mk('Index'), []), 'index-post');
  const other = { slug: 'hello', title: { en: 'Hello' } };
  assert.equal(autoSlug(mk('Hello'), [other]), 'hello-2');
  const self = mk('Hello');
  self.slug = 'hello';
  assert.equal(autoSlug(self, [self]), 'hello', 'an article does not clash with itself');
  const out = autoSlug(mk('y'.repeat(80)), [{ slug: 'y'.repeat(60) }]);
  assert.ok(out.length <= 60 && out !== 'y'.repeat(60));
});

test('normalizeEditorHtml turns b/i/div into strong/em/p and the sanitizer keeps them', () => {
  const html = '<div>one <b>bold</b> <i>it</i></div><div><br></div>';
  const n = normalizeEditorHtml(html);
  assert.equal(n, '<p>one <strong>bold</strong> <em>it</em></p><p><br></p>');
  assert.equal(sanitizeRichText(n), n);
  assert.equal(normalizeEditorHtml('<br><button>x</button><bdo>y</bdo>'), '<br><button>x</button><bdo>y</bdo>', 'tags that merely start with b/i/div are untouched');
});

test('UPLOAD_FILE matches only Worker-made upload paths', () => {
  assert.ok(UPLOAD_FILE.test('/uploads/2026/ab12cd34ef56-my-cv.pdf'));
  for (const bad of ['/uploads/2026/../x.png', '/projects/a.png', '/uploads/26/a.png', '/uploads/2026/a.svg', 'uploads/2026/a.png']) assert.ok(!UPLOAD_FILE.test(bad), bad);
});
