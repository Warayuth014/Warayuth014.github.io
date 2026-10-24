import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepLinkId, bodyParagraphs, projectDetailHtml, projectHash, projectIdFromHash } from '../assets/js/sections/projects.js';

test('only safe ids get a deep link', () => {
  for (const ok of ['ariadne', 'sp333-cafe', 'a', 'x'.repeat(60)]) assert.equal(isDeepLinkId(ok), true, ok);
  for (const bad of ['', 'A', 'a b', 'a_b', 'x'.repeat(61), '<b>', 'ก', null, undefined, 5]) assert.equal(isDeepLinkId(bad), false, String(bad));
});

test('hash helpers round-trip and reject junk', () => {
  assert.equal(projectHash('ariadne'), '#project-ariadne');
  assert.equal(projectHash('Bad Id'), '');
  assert.equal(projectIdFromHash('#project-ariadne'), 'ariadne');
  for (const bad of ['', '#', '#about', '#project-', '#project-A', '#project-a%20b', '#project-<x>']) assert.equal(projectIdFromHash(bad), '', bad);
});

test('body becomes escaped paragraphs from line breaks', () => {
  assert.deepEqual(bodyParagraphs('one\n\n  two \r\nthree'), ['one', 'two', 'three']);
  assert.deepEqual(bodyParagraphs(''), []);
  assert.deepEqual(bodyParagraphs(null), []);
});

test('detail html escapes text, uses safe links and notes private projects', () => {
  const p = {
    id: 'x', title: { th: '', en: '<img src=x onerror=1>' }, body: { th: '', en: 'a <b>b</b>\nsecond' },
    tags: ['T<1>'], image: '/uploads/a.png', links: { demo: 'javascript:alert(1)', repo: 'https://github.com/x/y' },
  };
  const h = projectDetailHtml(p, 'en');
  assert.ok(!h.includes('<img src=x'));
  assert.ok(!h.includes('<b>b'));
  assert.ok(!h.includes('javascript:'));
  assert.match(h, /<p>a &lt;b&gt;b&lt;\/b&gt;<\/p><p>second<\/p>/);
  assert.match(h, /href="https:\/\/github.com\/x\/y"/);
  assert.match(h, /src="\/uploads\/a.png"/);
  assert.ok(!h.includes('proj-private'));
  const priv = projectDetailHtml({ id: 'a', title: { en: 'A' }, body: { en: 'b' }, links: {} }, 'en');
  assert.match(priv, /proj-private/);
});
