import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSite, validateArticle } from '../shared/schema.js';

const seed = () => JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
const L = (th, en) => ({ th, en });
const article = () => ({
  slug: 'hello-world', title: L('สวัสดี', 'Hello'), summary: L('ย่อ', 'Short'),
  body: L('<p>ไทย</p>', '<p>English</p>'), tags: ['intro'], cover: null, date: '2026-10-23', published: true,
});
const has = (r, text) => assert.ok(r.errors.some((e) => e.includes(text)), `expected an error containing "${text}", got ${JSON.stringify(r.errors)}`);

test('seed content validates', () => {
  const r = validateSite(seed());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('rejects non-objects', () => {
  assert.equal(validateSite(null).ok, false);
  assert.equal(validateSite([]).ok, false);
  assert.equal(validateArticle('x').ok, false);
});

test('rejects missing hero.name and requires one non-empty side', () => {
  const a = seed(); delete a.hero.name;
  has(validateSite(a), 'hero.name');
  const b = seed(); b.hero.name = L('', '');
  has(validateSite(b), 'hero.name');
  const c = seed(); c.hero.name = L('', 'Only EN');
  assert.equal(validateSite(c).ok, true);
});

test('L fields need string th and en; error path names the field', () => {
  const a = seed(); a.projects[2].title = { th: 'x' };
  has(validateSite(a), 'projects[2].title.en');
  const b = seed(); b.projects[1].summary.th = 5;
  has(validateSite(b), 'projects[1].summary.th');
});

test('string length limits', () => {
  const a = seed(); a.projects[0].title.en = 'x'.repeat(301);
  has(validateSite(a), 'projects[0].title.en');
  const b = seed(); b.about.story.th = 'x'.repeat(5001);
  has(validateSite(b), 'about.story.th');
  const c = seed(); c.about.story.th = 'x'.repeat(5000);
  assert.equal(validateSite(c).ok, true);
});

test('section ids must be known; duplicates rejected', () => {
  const a = seed(); a.sections.push({ id: 'blog', visible: true });
  has(validateSite(a), 'sections[');
  const b = seed(); b.sections.push({ id: 'hero', visible: true });
  has(validateSite(b), 'duplicate');
});

test('nav must be a subset of section ids', () => {
  const a = seed(); a.nav = ['about', 'nope'];
  has(validateSite(a), 'nav[1]');
});

test('links: https or single-slash path only', () => {
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', '//evil.com', 'ftp://x.y', '']) {
    const a = seed(); a.projects[0].links.repo = bad;
    has(validateSite(a), 'projects[0].links.repo');
    const b = seed(); b.contact.links[0].url = bad;
    has(validateSite(b), 'contact.links[0].url');
  }
  const ok = seed(); ok.projects[0].links.demo = '/ig-followguide/';
  assert.equal(validateSite(ok).ok, true);
});

test('upload paths: null, /uploads/ or /projects/ only', () => {
  for (const bad of ['/etc/passwd', 'uploads/a.png', 'https://x.y/a.png', '/uploads/../x.png', '/uploadsx/a.png', '//uploads/a.png']) {
    const a = seed(); a.about.photo = bad;
    has(validateSite(a), 'about.photo');
    const b = seed(); b.projects[0].image = bad;
    has(validateSite(b), 'projects[0].image');
  }
  const ok = seed(); ok.about.photo = '/uploads/me.webp'; ok.projects[0].image = '/projects/gearupit/a.png';
  assert.equal(validateSite(ok).ok, true);
});

test('resume: file and kind must agree', () => {
  const a = seed(); a.resume = { file: '/uploads/cv.pdf', kind: null };
  has(validateSite(a), 'resume.kind');
  const b = seed(); b.resume = { file: '/uploads/cv.pdf', kind: 'pdf' };
  assert.equal(validateSite(b).ok, true);
  const c = seed(); c.resume = { file: '/uploads/cv.doc', kind: 'doc' };
  has(validateSite(c), 'resume.kind');
});

test('theme: colours, mode, fontPair, effects', () => {
  const a = seed(); a.theme.bg1 = 'red';
  has(validateSite(a), 'theme.bg1');
  const b = seed(); b.theme.mode = 'blue';
  has(validateSite(b), 'theme.mode');
  const c = seed(); c.theme.fontPair = 'comic';
  has(validateSite(c), 'theme.fontPair');
  const d = seed(); d.theme.effects.hero3d = 'yes';
  has(validateSite(d), 'theme.effects.hero3d');
});

test('contact: email, phone, link kind', () => {
  const a = seed(); a.contact.email = 'not-an-email';
  has(validateSite(a), 'contact.email');
  const b = seed(); b.contact.links[0].kind = 'tiktok';
  has(validateSite(b), 'contact.links[0].kind');
  const c = seed(); c.contact.phone = 123;
  has(validateSite(c), 'contact.phone');
});

test('workerUrl: empty or https', () => {
  const a = seed(); a.workerUrl = 'http://evil.example';
  has(validateSite(a), 'workerUrl');
  const b = seed(); b.workerUrl = 'https://w.example.workers.dev';
  assert.equal(validateSite(b).ok, true);
});

test('reports all errors, not just the first', () => {
  const a = seed(); a.hero.name = L('', ''); a.theme.mode = 'x'; a.projects[0].tags = 'nope';
  const r = validateSite(a);
  assert.ok(r.errors.length >= 3, JSON.stringify(r.errors));
});

test('version must be 1', () => {
  const a = seed(); a.version = 2;
  has(validateSite(a), 'version');
});

test('article: valid passes', () => {
  assert.deepEqual(validateArticle(article()).errors, []);
});

test('article: slug, date, cover, published, tags, body', () => {
  const bad = (mut, path) => { const a = article(); mut(a); has(validateArticle(a), path); };
  bad((a) => { a.slug = 'Bad Slug'; }, 'slug');
  bad((a) => { a.slug = 'x'.repeat(61); }, 'slug');
  bad((a) => { a.slug = 'index'; }, 'slug: "index" is reserved');
  bad((a) => { a.date = '2026-13-45'; }, 'date');
  bad((a) => { a.date = '23/10/2026'; }, 'date');
  bad((a) => { a.cover = 'https://x.y/c.png'; }, 'cover');
  bad((a) => { a.published = 'yes'; }, 'published');
  bad((a) => { a.tags = [1]; }, 'tags[0]');
  bad((a) => { a.body = { th: '<p>x</p>' }; }, 'body.en');
  bad((a) => { a.title = L('', ''); }, 'title');
  bad((a) => { delete a.summary; }, 'summary');
});
