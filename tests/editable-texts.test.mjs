import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSite } from '../shared/schema.js';
import { ui } from '../assets/js/sections/util.js';
import { resumeHtml } from '../assets/js/resume.js';

const seed = () => JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
const L = (th, en) => ({ th, en });

test('seed carries the editable texts and they equal the built-in defaults', () => {
  const s = seed();
  assert.equal(validateSite(s).ok, true);
  for (const id of ['about', 'projects', 'skills', 'journey', 'articles', 'contact']) {
    assert.equal(s.ui.sectionTitles[id].th, ui(id, 'th'));
    assert.equal(s.ui.sectionTitles[id].en, ui(id, 'en'));
  }
  assert.equal(s.ui.tagline.en, ui('heroTag', 'en'));
  assert.equal(s.ui.tagline.th, ui('heroTag', 'th'));
  assert.equal(s.ui.contactLead.en, ui('contactLead', 'en'));
  assert.equal(s.ui.contactLead.th, ui('contactLead', 'th'));
});

test('old content without ui/meta/resumePage still validates', () => {
  const s = seed();
  delete s.ui; delete s.meta; delete s.resumePage;
  assert.equal(validateSite(s).ok, true);
});

test('editable text limits are enforced with a path', () => {
  const s = seed();
  s.ui.sectionTitles.about = L('x'.repeat(301), 'ok');
  s.meta.description = L('', 'y'.repeat(5001));
  s.resumePage.title = 'not an object';
  const e = validateSite(s).errors.join('\n');
  assert.match(e, /ui\.sectionTitles\.about\.th/);
  assert.match(e, /meta\.description\.en/);
  assert.match(e, /resumePage\.title/);
});

test('ui(): edited text wins, empty or missing falls back to the built-in text', () => {
  const content = { ui: { tagline: L('', 'custom tag'), sectionTitles: { about: L('เรื่องของฉัน', ''), skills: L('', '') }, contactLead: L('lead th', 'lead en') } };
  assert.equal(ui('about', 'th', content), 'เรื่องของฉัน');
  assert.equal(ui('about', 'en', content), 'เรื่องของฉัน', 'other language is the fallback inside the L');
  assert.equal(ui('skills', 'en', content), 'Skills');
  assert.equal(ui('projects', 'en', content), 'Projects');
  assert.equal(ui('heroTag', 'en', content), 'custom tag');
  assert.equal(ui('contactLead', 'th', content), 'lead th');
  assert.equal(ui('about', 'en', {}), 'About me');
  assert.equal(ui('resume', 'en', content), 'Résumé', 'nav and other chrome stay fixed');
});

test('resumeHtml uses resumePage texts for the coming-soon state', () => {
  const page = { comingSoon: L('เร็ว ๆ นี้จ้า', 'Soon!'), comingSoonText: L('', 'Back later') };
  const h = resumeHtml({ file: null, kind: null }, 'en', page);
  assert.ok(h.includes('Soon!') && h.includes('Back later'));
  assert.ok(resumeHtml({ file: null, kind: null }, 'en', {}).includes('Coming soon'));
});
