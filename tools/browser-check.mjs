#!/usr/bin/env node
// Usage: node tools/browser-check.mjs <url> [--mobile] [--shot <path>] [--fixture <site.json>] [--lang th|en]
// Opens the page in an installed Edge/Chrome (playwright-core, no download), then prints console
// errors, failed requests, external hosts, horizontal overflow, and saves a full-page screenshot.
// Exits 1 on console errors or page errors.
import { chromium } from 'playwright-core';
import { mkdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
let url = null;
let mobile = false;
let shot = null;
let fixture = null;
let lang = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mobile') mobile = true;
  else if (a === '--shot') shot = args[++i];
  else if (a === '--fixture') fixture = args[++i];
  else if (a === '--lang') lang = args[++i];
  else if (!url) url = a;
}
if (!url) {
  console.error('usage: node tools/browser-check.mjs <url> [--mobile] [--shot <path>] [--fixture <path>] [--lang th|en]');
  process.exit(2);
}

if (fixture) {
  const rel = relative(root, resolve(fixture)).split('\\').join('/');
  if (rel.startsWith('..') || !existsSync(resolve(fixture))) {
    console.error('fixture must exist inside the repo');
    process.exit(2);
  }
  const u = new URL(url);
  u.searchParams.set('content', `/${rel}`);
  url = u.href;
}

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel }); } catch { /* try next */ }
  }
  throw new Error('no Edge or Chrome found for playwright-core');
}

const browser = await launch();
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 800 } },
);
if (lang) await context.addInitScript((l) => { try { localStorage.setItem('lang', l); } catch { /* ignore */ } }, lang);
const page = await context.newPage();

const problems = [];
const failed = [];
const hosts = new Set();
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); if (m.type() === 'warning') console.log(`console.warn: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));
page.on('request', (r) => { try { const h = new URL(r.url()); if (/^https?:$/.test(h.protocol) && h.host !== new URL(url).host) hosts.add(h.host); } catch { /* ignore */ } });

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts?.ready);

const metrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  title: document.title,
  sections: [...document.querySelectorAll('main > section')].map((s) => s.id),
}));
const overflow = metrics.scrollWidth > metrics.clientWidth;

if (shot) {
  mkdirSync(dirname(resolve(shot)), { recursive: true });
  let out = resolve(shot);
  const png = await page.screenshot({ fullPage: true, type: 'png' });
  if (png.length > 400 * 1024) {
    out = out.replace(/\.png$/i, '') + '.jpg';
    writeFileSync(out, await page.screenshot({ fullPage: true, type: 'jpeg', quality: 28 }));
  } else {
    writeFileSync(out, png);
  }
  console.log(`screenshot: ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
}

await browser.close();

console.log(`url: ${url}`);
console.log(`title: ${metrics.title}`);
console.log(`sections: ${metrics.sections.join(', ')}`);
console.log(`horizontal overflow: ${overflow ? `YES (${metrics.scrollWidth} > ${metrics.clientWidth})` : 'no'}`);
console.log(`external hosts: ${[...hosts].join(', ') || '(none)'}`);
for (const f of failed) console.log(`failed request: ${f}`);
for (const p of problems) console.log(p);
if (problems.length) process.exit(1);
console.log('ok');
