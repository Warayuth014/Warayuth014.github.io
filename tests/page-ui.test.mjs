import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeHtml } from '../assets/js/resume.js';
import { cardsHtml } from '../assets/js/sections/articles.js';

test('resumeHtml: pdf -> object with download button', () => {
  const h = resumeHtml({ file: '/uploads/cv.pdf', kind: 'pdf' }, 'en');
  assert.ok(h.includes('<object class="resume-pdf" type="application/pdf" data="/uploads/cv.pdf"'));
  assert.ok(/<a class="btn btn-primary" href="\/uploads\/cv\.pdf" download>/.test(h));
});

test('resumeHtml: image -> img with alt and download button', () => {
  const h = resumeHtml({ file: '/uploads/cv.png', kind: 'image' }, 'th');
  assert.ok(/<img class="resume-img" src="\/uploads\/cv\.png" alt="[^"]+">/.test(h));
  assert.ok(h.includes('download'));
});

test('resumeHtml: null shows the coming soon state', () => {
  const h = resumeHtml({ file: null, kind: null }, 'en');
  assert.ok(h.includes('Coming soon') && h.includes('href="/"'));
  assert.ok(!h.includes('<object') && !h.includes('<img'));
  assert.ok(resumeHtml({ file: null, kind: null }, 'th').includes('เร็ว ๆ นี้'));
});

test('resumeHtml: unsafe file paths fall back to coming soon', () => {
  for (const file of ['javascript:alert(1)', 'https://evil.example/x.pdf', '/uploads/../secret.pdf', '/other/x.pdf', '/uploads/a b.pdf', 42, undefined]) {
    const h = resumeHtml({ file, kind: 'pdf' }, 'en');
    assert.ok(h.includes('Coming soon') && !h.includes('<object'), String(file));
  }
  assert.ok(resumeHtml(undefined, 'en').includes('Coming soon'));
});

test('cardsHtml: escapes text, skips bad slugs, shows latest 3 only', () => {
  const item = (slug, over = {}) => ({ slug, title: { th: 't', en: 'T' }, summary: { th: 's', en: 'S' }, tags: ['x'], date: '2026-10-24', ...over });
  const h = cardsHtml([
    item('ok', { title: { th: '', en: '<script>alert(1)</script>' }, summary: { en: '<img src=x onerror=1>' }, tags: ['<b>'] }),
    item('Bad Slug'),
    item('../evil'),
    item('"><x'),
    item('two'), item('three'), item('four'),
  ], 'en');
  assert.ok(!h.includes('<script>') && !h.includes('<img') && !h.includes('<b>'));
  assert.ok(h.includes('&lt;script&gt;'));
  assert.ok(!/evil|Bad Slug|"><x/.test(h));
  assert.equal((h.match(/class="art-card"/g) || []).length, 3);
  assert.ok(h.includes('href="/articles/ok/"'));
  assert.equal(cardsHtml('nope', 'en'), '');
});
