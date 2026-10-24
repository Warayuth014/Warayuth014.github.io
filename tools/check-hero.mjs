#!/usr/bin/env node
// Usage: node tools/check-hero.mjs [baseUrl] [--shots]
// Browser pass for the interactive night-desk hero (starts tools/serve.mjs itself when no baseUrl is given):
//   desktop: hover monitor -> body cursor pointer; click monitor -> scrolls to #projects; click controller ->
//            neon colour steps and cycles back after three clicks; keyboard hover/click; empty canvas does nothing;
//            CTA buttons still work; frame time with the pointer moving; dispose/re-boot never stacks listeners
//   touch:   tap on the controller works, a vertical swipe still scrolls the page
//   reduced-motion emulation: hero still live, desk state and threads present (nothing switches off)
//   weak phone (390 px, deviceMemory 2): hero goes live
//   console: no errors or warnings in any of the runs
// --shots writes docs/superpowers/shots/hero-*.jpg. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const shots = args.includes('--shots');
let base = args.find((a) => /^https?:/.test(a)) ?? null;
let server = null;

if (!base) {
  server = spawn(process.execPath, [resolve(root, 'tools/serve.mjs'), '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  base = await new Promise((res, rej) => {
    server.stdout.once('data', (d) => res(String(d).trim()));
    server.once('error', rej);
    setTimeout(() => rej(new Error('server did not start')), 8000);
  });
}
base = base.replace(/\/$/, '');

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel }); } catch { /* next */ }
  }
  throw new Error('no Edge or Chrome found for playwright-core');
}

const browser = await launch();
const logs = [];
async function open(opts = {}, init = null) {
  const ctx = await browser.newContext(opts);
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(() => { try { localStorage.setItem('lang', 'en'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => ['live', 'poster', 'off'].includes(document.querySelector('.hero-stage')?.dataset.heroMode), null, { timeout: 20000 });
  return { ctx, page };
}

const stageData = (page, key) => page.evaluate((k) => document.querySelector('.hero-stage')?.dataset[k] ?? '', key);
const cursor = (page) => page.evaluate(() => document.body.style.cursor);

// Find where each target sits on screen by sweeping synthetic pointer moves over the hero; the desk reports
// what it hit in data-hero-hover. Returns the centre of the hits per target.
async function locate(page, vw, vh) {
  return page.evaluate(async ({ vw, vh }) => {
    const hero = document.getElementById('hero');
    const stage = document.querySelector('.hero-stage');
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hits = {};
    for (let y = 90; y < vh - 20; y += 36) {
      for (let x = Math.round(vw * 0.3); x < vw - 10; x += 36) {
        hero.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
        await frame();
        const k = stage.dataset.heroHover;
        if (k) (hits[k] ??= []).push([x, y]);
      }
    }
    hero.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    const mean = (a) => a && [Math.round(a.reduce((s, p) => s + p[0], 0) / a.length), Math.round(a.reduce((s, p) => s + p[1], 0) / a.length)];
    return { monitor: mean(hits.monitor), pad: mean(hits.pad), keyboard: mean(hits.keyboard), counts: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v.length])) };
  }, { vw, vh });
}

// listeners the desk keeps on the hero section (pointermove, pointerleave, click)
async function heroListeners(page) {
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send('Runtime.evaluate', { expression: "document.getElementById('hero')" });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  await cdp.detach();
  return listeners.filter((l) => ['pointermove', 'pointerleave', 'click'].includes(l.type)).length;
}

// ---------- desktop ----------
{
  const { ctx, page } = await open({ viewport: { width: 1366, height: 800 } });
  check(await stageData(page, 'heroMode') === 'live', 'desktop: hero is live');
  check(/^#[0-9a-f]{6}$/.test(await stageData(page, 'heroNeon')), 'desktop: neon strip colour is published');
  check((await page.locator('.hero-canvas').getAttribute('aria-hidden')) === 'true', 'desktop: canvas stays aria-hidden');
  await sleep(1200); // let the camera settle

  const spots = await locate(page, 1366, 800);
  console.log(`      located: ${JSON.stringify(spots)}`);
  check(Boolean(spots.monitor), 'desktop: monitor is hit somewhere on screen');
  check(Boolean(spots.pad), 'desktop: controller is hit somewhere on screen');
  check(Boolean(spots.keyboard), 'desktop: keyboard is hit somewhere on screen');

  // elsewhere: default cursor, no behaviour
  await page.mouse.move(1330, 100);
  await sleep(150);
  check(await cursor(page) === '' && await stageData(page, 'heroHover') === '', 'elsewhere: default cursor, nothing hovered');
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.click(1330, 100);
  await sleep(500);
  check(await page.evaluate(() => scrollY) === y0, 'elsewhere: click does nothing');

  // monitor
  await page.mouse.move(...spots.monitor);
  await sleep(250);
  check(await cursor(page) === 'pointer' && await stageData(page, 'heroHover') === 'monitor', 'monitor: hover -> body cursor pointer');
  if (shots) {
    mkdirSync(resolve(root, 'docs/superpowers/shots'), { recursive: true });
    const file = resolve(root, 'docs/superpowers/shots/hero-monitor-hover.jpg');
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 60 }));
    console.log(`      shot: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
  }
  await page.mouse.click(...spots.monitor);
  const target = await page.evaluate(() => document.getElementById('projects').getBoundingClientRect().top + scrollY);
  const reached = await page.waitForFunction((t) => Math.abs(scrollY - (t - 72)) < 120, target, { timeout: 5000 }).then(() => true, () => false);
  check(reached, `monitor: click scrolls to #projects (scrollY ${await page.evaluate(() => Math.round(scrollY))}, target ${Math.round(target)})`);
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(1500);

  // controller
  await page.mouse.move(...spots.pad);
  await sleep(250);
  check(await cursor(page) === 'pointer' && await stageData(page, 'heroHover') === 'pad', 'controller: hover -> body cursor pointer');
  const colours = [await stageData(page, 'heroNeon')];
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(...spots.pad);
    await sleep(200);
    colours.push(await stageData(page, 'heroNeon'));
  }
  check(colours[1] !== colours[0] && colours[2] !== colours[1] && colours[2] !== colours[0], `controller: each click steps the neon colour (${colours.join(' -> ')})`);
  check(colours[3] === colours[0], 'controller: three clicks cycle back to accent1');
  if (shots) {
    await page.mouse.click(...spots.pad);
    await sleep(90); // mid-pulse
    const file = resolve(root, 'docs/superpowers/shots/hero-controller-click.jpg');
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 60 }));
    console.log(`      shot: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
    await page.mouse.click(...spots.pad);
    await page.mouse.click(...spots.pad); // back to accent1
  }

  // keyboard
  await page.mouse.move(...spots.keyboard);
  await sleep(250);
  check(await stageData(page, 'heroHover') === 'keyboard' && await cursor(page) === '', 'keyboard: hover lights keys, cursor stays default');
  if (shots) { // lit keys fade ~400 ms after the last move, so wiggle and grab the crop straight away
    const [kx, ky] = spots.keyboard;
    let wiggling = true;
    const wiggle = (async () => { for (let i = 0; wiggling; i++) { await page.mouse.move(kx - 60 + (i % 9) * 14, ky); await sleep(20); } })();
    await sleep(150);
    const file = resolve(root, 'docs/superpowers/shots/hero-keyboard-hover.jpg');
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 70, clip: { x: kx - 220, y: ky - 70, width: 440, height: 140 } }));
    wiggling = false;
    await wiggle;
    console.log(`      shot: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
  }
  await page.mouse.click(...spots.keyboard);
  await sleep(400);
  check((await page.evaluate(() => scrollY)) === 0, 'keyboard: click does not scroll or navigate');

  // CTA buttons stay clickable and never trigger the desk
  const cta = page.locator('.hero-cta .btn-primary');
  const box = await cta.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(250);
  check(await stageData(page, 'heroHover') === '' && await cursor(page) === '', 'CTA: hovering it leaves the desk idle');
  await cta.click();
  const ctaWorked = await page.waitForFunction(() => location.hash === '#projects' && scrollY > 300, null, { timeout: 5000 }).then(() => true, () => false);
  check(ctaWorked, 'CTA: "See my work" button still scrolls to #projects');
  await page.evaluate(() => { history.replaceState(null, '', '/'); scrollTo(0, 0); });
  await sleep(500);
  const resume = page.locator('.hero-cta .btn-ghost');
  await Promise.all([page.waitForURL(/\/resume\/$/, { timeout: 8000 }).then(() => true, () => false).then((ok) => check(ok, 'CTA: résumé button still navigates')), resume.click()]);
  await ctx.close();
}

// ---------- frame time with the pointer moving ----------
{
  const { ctx, page } = await open({ viewport: { width: 1366, height: 800 } });
  await sleep(800);
  let measuring = true;
  const sweep = (async () => {
    for (let t = 0; measuring; t += 0.12) {
      await page.mouse.move(683 + Math.cos(t) * 560, 400 + Math.sin(t * 1.3) * 300);
      await sleep(16);
    }
  })();
  const ms = await page.evaluate(() => new Promise((done) => {
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
  check(ms <= 20, `perf: average frame ${ms.toFixed(1)} ms over 3 s with the pointer moving (limit 20)`);
  await ctx.close();
}

// ---------- listeners never stack across re-boots / theme switches ----------
{
  const { ctx, page } = await open({ viewport: { width: 1366, height: 800 } });
  const n0 = await heroListeners(page);
  check(n0 === 3, `listeners: desk keeps exactly 3 on the hero section (${n0})`);
  const reboot = (theme) => page.evaluate(async (th) => {
    const site = await (await fetch('/content/site.json')).json();
    const { boot } = await import('/assets/js/site.js');
    await boot({ content: { ...site, theme: { ...site.theme, ...th } }, preview: true });
  }, theme);
  for (let i = 0; i < 3; i++) await reboot({});
  await sleep(300);
  check(await heroListeners(page) === n0, 'listeners: three preview re-boots do not stack');
  await reboot({ mode: 'light' });
  await sleep(300);
  check(await heroListeners(page) === 0 && await stageData(page, 'heroMode') === 'off', 'listeners: light theme disposes the scene and removes every listener');
  await reboot({ mode: 'dark' });
  await page.waitForFunction(() => document.querySelector('.hero-stage')?.dataset.heroMode === 'live', null, { timeout: 10000 });
  check(await heroListeners(page) === n0, 'listeners: back to dark mounts a fresh scene with the same 3 listeners');
  check(await cursor(page) === '', 'listeners: body cursor is clean after dispose');
  await ctx.close();
}

// ---------- touch ----------
{
  const { ctx, page } = await open({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  check(await stageData(page, 'heroMode') === 'live', 'touch: hero is live');
  await sleep(1200);
  const spots = await locate(page, 1024, 768);
  check(Boolean(spots.pad), `touch: controller located (${spots.pad})`);
  const c0 = await stageData(page, 'heroNeon');
  await page.touchscreen.tap(...spots.pad);
  await sleep(300);
  const c1 = await stageData(page, 'heroNeon');
  check(c1 !== c0, `touch: tap on the controller steps the neon colour (${c0} -> ${c1})`);
  check(await cursor(page) === '', 'touch: no hover cursor state is left behind');

  // a vertical swipe that starts on the desk must still scroll
  const cdp = await ctx.newCDPSession(page);
  const [sx, sy] = spots.monitor ?? [700, 500];
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: sx, y }] });
  await touch('touchStart', sy);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', sy - i * 24); await sleep(16); }
  await touch('touchEnd', sy - 288);
  await sleep(600);
  const scrolled = await page.evaluate(() => scrollY);
  check(scrolled > 100, `touch: vertical swipe over the desk still scrolls the page (scrollY ${Math.round(scrolled)})`);
  await ctx.close();
}

// ---------- reduced motion ----------
{
  const { ctx, page } = await open({ viewport: { width: 1366, height: 800 }, reducedMotion: 'reduce' });
  check(await stageData(page, 'heroMode') === 'live', 'reduced motion emulation: hero is still live');
  check(await page.locator('.hero-canvas').count() === 1, 'reduced motion emulation: canvas present');
  check(/^#[0-9a-f]{6}$/.test(await stageData(page, 'heroNeon')), 'reduced motion emulation: desk state published');
  check(await heroListeners(page) > 0, 'reduced motion emulation: desk listens on the hero section');
  check(await page.locator('canvas.threads').count() === 1, 'reduced motion emulation: ambient threads still run');
  await ctx.close();
}

// ---------- weak phone: 390 px, deviceMemory 2 ----------
{
  const { ctx, page } = await open({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  }, () => Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }));
  check(await page.evaluate(() => navigator.deviceMemory) === 2, 'weak phone: deviceMemory is 2');
  check(await stageData(page, 'heroMode') === 'live', 'weak phone: hero goes live');
  check(await page.locator('.hero-canvas').count() === 1, 'weak phone: canvas present');
  await ctx.close();
}

await browser.close();
server?.kill();
for (const l of logs) console.log(`console: ${l}`);
check(logs.length === 0, 'console: no errors or warnings in any run');
console.log(failures ? `\n${failures} check(s) failed` : '\nall hero checks passed');
process.exit(failures ? 1 : 0);
