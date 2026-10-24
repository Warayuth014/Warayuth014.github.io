#!/usr/bin/env node
// Usage: node tools/browser-check.mjs <url> [--mobile] [--shot <path>] [--fixture <site.json>] [--lang th|en]
//        [--no-webgl] [--reduced-motion] [--frames] [--wait <ms>] [--scroll <px>]
//   --no-webgl        launch Edge with GPU/3D APIs disabled so hasWebGL() is false
//   --reduced-motion  emulate prefers-reduced-motion: reduce
//   --frames          average requestAnimationFrame interval over 3 s, after the hero scene is up
//   --pointer         with --frames: move the mouse across the hero while measuring
//   --timing        cold cache + 10 Mbps / 40 ms throttling; print site.json, desk.js, three.js and first-frame times
//   --wait <ms>      extra settle time before measuring / screenshot (default 0)
//   --scroll <px>     scroll the page before the screenshot
//   --viewport        screenshot only the visible viewport (default: full page)
//   --device-memory <GB>  override navigator.deviceMemory (emulated phones report the desktop value)
// The hero mode (live | poster | loading | off) is always printed.
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
let noWebgl = false;
let reducedMotion = false;
let frames = false;
let timing = false;
let movePointer = false;
let wait = 0;
let scroll = 0;
let deviceMemory = null;
let viewportOnly = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mobile') mobile = true;
  else if (a === '--no-webgl') noWebgl = true;
  else if (a === '--reduced-motion') reducedMotion = true;
  else if (a === '--frames') frames = true;
  else if (a === '--timing') timing = true;
  else if (a === '--pointer') movePointer = true;
  else if (a === '--viewport') viewportOnly = true;
  else if (a === '--device-memory') deviceMemory = Number(args[++i]);
  else if (a === '--wait') wait = Number(args[++i]) || 0;
  else if (a === '--scroll') scroll = Number(args[++i]) || 0;
  else if (a === '--shot') shot = args[++i];
  else if (a === '--fixture') fixture = args[++i];
  else if (a === '--lang') lang = args[++i];
  else if (!url) url = a;
}
if (!url) {
  console.error('usage: node tools/browser-check.mjs <url> [--mobile] [--shot <path>] [--fixture <path>] [--lang th|en] [--no-webgl] [--reduced-motion] [--frames] [--wait <ms>] [--scroll <px>]');
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
    try {
      const launchArgs = noWebgl ? ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] : [];
      return await chromium.launch({ channel, args: launchArgs });
    } catch { /* try next */ }
  }
  throw new Error('no Edge or Chrome found for playwright-core');
}

const browser = await launch();
if (timing) { wait = Math.max(wait, 500); }
const context = await browser.newContext({
  ...(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1366, height: 800 } }),
  ...(reducedMotion ? { reducedMotion: 'reduce' } : {}),
});
if (deviceMemory !== null) await context.addInitScript((m) => Object.defineProperty(navigator, 'deviceMemory', { get: () => m }), deviceMemory);
if (lang) await context.addInitScript((l) => { try { localStorage.setItem('lang', l); } catch { /* ignore */ } }, lang);
const page = await context.newPage();

const problems = [];
const failed = [];
const hosts = new Set();
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); if (m.type() === 'warning') console.log(`console.warn: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));
page.on('request', (r) => { try { const h = new URL(r.url()); if (/^https?:$/.test(h.protocol) && h.host !== new URL(url).host) hosts.add(h.host); } catch { /* ignore */ } });

if (timing) {
  // cold cache + ~10 Mbps down / 40 ms latency, through the DevTools protocol
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
}
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts?.ready);
// the hero scene mounts after first paint: wait until it settles on live / poster / off
await page.waitForFunction(() => {
  const m = document.querySelector('.hero-stage')?.dataset.heroMode;
  return !document.querySelector('.hero-stage') || m === 'live' || m === 'poster' || m === 'off';
}, null, { timeout: 15000 }).catch(() => {});
if (wait) await page.waitForTimeout(wait);

const heroMode = await page.evaluate(() => {
  const s = document.querySelector('.hero-stage');
  return s ? `${s.dataset.heroMode ?? 'none'} (canvas: ${Boolean(s.querySelector('canvas'))}, poster: ${Boolean(s.querySelector('.hero-poster'))}, threads: ${Boolean(document.querySelector('canvas.threads'))})` : 'no hero';
});

let timings = null;
if (timing) {
  // every number is milliseconds since navigation start (performance.now() / resource entries share that origin)
  timings = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const find = (re) => res.find((r) => re.test(r.name));
    const round = (v) => (typeof v === 'number' && v > 0 ? Math.round(v) : null);
    const site = find(/content\/site\.json/);
    const entry = find(/hero\/desk\.js/);
    const three = find(/three\.module\.js/);
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const stage = document.querySelector('.hero-stage');
    return {
      'first contentful paint': round(fcp?.startTime),
      'site.js fetched': round(find(/js\/site\.js/)?.responseEnd),
      'site.json fetched': round(site?.responseEnd),
      'desk.js start': round(entry?.startTime),
      'three.module.js start': round(three?.startTime),
      'three.module.js end': round(three?.responseEnd),
      'first live frame': round(Number(stage?.dataset.heroFirstFrame)),
    };
  });
}

let frameMs = null;
if (frames) {
  let measuring = true;
  // --pointer: sweep the mouse over the hero while measuring (hover raycasts, key glow, parallax)
  const sweep = !movePointer ? Promise.resolve() : (async () => {
    for (let t = 0; measuring; t += 0.12) {
      await page.mouse.move(683 + Math.cos(t) * 560, 400 + Math.sin(t * 1.3) * 300);
      await page.waitForTimeout(16);
    }
  })();
  frameMs = await page.evaluate(() => new Promise((done) => {
    let n = 0;
    let first = 0;
    const loop = (now) => {
      if (!first) first = now;
      n++;
      if (now - first >= 3000) done((now - first) / (n - 1));
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }));
  measuring = false;
  await sweep;
}
if (scroll) {
  await page.evaluate((y) => window.scrollTo(0, y), scroll);
  await page.waitForTimeout(1500);
}

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
  const png = await page.screenshot({ fullPage: !viewportOnly, type: 'png' });
  if (png.length > 400 * 1024) {
    out = out.replace(/\.png$/i, '') + '.jpg';
    writeFileSync(out, await page.screenshot({ fullPage: !viewportOnly, type: 'jpeg', quality: 28 }));
  } else {
    writeFileSync(out, png);
  }
  console.log(`screenshot: ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
}

await browser.close();

console.log(`url: ${url}`);
console.log(`title: ${metrics.title}`);
console.log(`hero: ${heroMode}`);
if (timings) {
  console.log('timing (ms since navigation, cold cache, 10 Mbps / 40 ms):');
  for (const [k, v] of Object.entries(timings)) console.log(`  ${k.padEnd(24)} ${v ?? 'n/a'}`);
}
if (frameMs !== null) console.log(`average frame time over 3 s: ${frameMs.toFixed(2)} ms (${(1000 / frameMs).toFixed(1)} fps)`);
console.log(`sections: ${metrics.sections.join(', ')}`);
console.log(`horizontal overflow: ${overflow ? `YES (${metrics.scrollWidth} > ${metrics.clientWidth})` : 'no'}`);
console.log(`external hosts: ${[...hosts].join(', ') || '(none)'}`);
for (const f of failed) console.log(`failed request: ${f}`);
for (const p of problems) console.log(p);
if (problems.length) process.exit(1);
console.log('ok');
