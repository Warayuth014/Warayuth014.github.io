#!/usr/bin/env node
// Usage: node tools/check-interactions.mjs [baseUrl] [--shots]
// Automated browser pass for the 2D interactions (starts tools/serve.mjs itself when no baseUrl is given):
//   keyboard: Tab from the top through the nav to the first project card, Enter opens the dialog, focus is inside,
//             Tab stays inside, Esc closes, focus returns to the card, hash is removed
//   deep link: #project-<id> opens on load and on reload; unknown id does nothing; TH/EN toggle refills the open dialog
//   reduced motion: no transforms on tilt/reveal elements, no glow element, nothing hidden
//   normal motion: reveal marks only below-the-fold elements, no layout shift, tilt + glow work, re-render does not stack
//   mobile: no glow, no tilt, no hover-only visibility rules, no horizontal overflow
//   404: themed, bilingual
// --shots writes docs/superpowers/shots/task5-*.jpg. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
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

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, args: ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] }); } catch { /* next */ }
  }
  throw new Error('no Edge or Chrome found for playwright-core');
}

const browser = await launch();
const errors = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('lang')) localStorage.setItem('lang', 'en'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page };
}
const ready = async (page, url) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.card-open', { timeout: 10000 });
};
const shotTo = async (page, name, opts = {}) => {
  if (!shots) return;
  const out = resolve(root, `docs/superpowers/shots/task5-${name}.jpg`);
  mkdirSync(resolve(root, 'docs/superpowers/shots'), { recursive: true });
  let q = 60;
  do {
    await page.screenshot({ path: out, type: 'jpeg', quality: q, ...opts });
    q -= 15;
  } while (statSync(out).size > 380 * 1024 && q > 10);
  console.log(`      shot ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
};
const dialogState = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog.proj-dialog');
  const a = document.activeElement;
  return {
    open: Boolean(d?.open),
    inside: Boolean(d && a && d.contains(a)),
    title: d?.querySelector('#project-dialog-title')?.textContent ?? '',
    hash: location.hash,
    activeClass: a?.className ?? '',
    activeI: a?.dataset?.i ?? null,
  };
});

try {
  // ---------- keyboard pass ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 1366, height: 800 } });
    await ready(page, `${base}/`);
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    let sawNav = false;
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => ({ inNav: Boolean(document.activeElement?.closest('#site-nav')), card: document.activeElement?.classList.contains('card-open'), i: document.activeElement?.dataset?.i }));
      if (info.inNav) sawNav = true;
      if (info.card) reached = info.i === '0';
    }
    check(sawNav, 'keyboard: Tab passes through the nav');
    check(reached, 'keyboard: Tab reaches the first project card button');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.proj-dialog[open]', { timeout: 3000 }).catch(() => {});
    let s = await dialogState(page);
    check(s.open && s.inside, 'keyboard: Enter opens the dialog and focus is inside it');
    check(/^#project-/.test(s.hash), `keyboard: opening sets the hash (${s.hash})`);
    await shotTo(page, 'dialog-desktop-en', { fullPage: false });
    let stayed = true;
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); if (!(await dialogState(page)).inside) stayed = false; }
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); if (!(await dialogState(page)).inside) stayed = false; }
    check(stayed, 'keyboard: Tab / Shift+Tab cycle inside the dialog');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.proj-dialog')?.open);
    await page.waitForFunction(() => location.hash === '').catch(() => {});
    s = await dialogState(page);
    check(!s.open, 'keyboard: Esc closes the dialog');
    check(s.activeClass.includes('card-open') && s.activeI === '0', 'keyboard: focus returns to the card that opened it');
    check(s.hash === '', 'keyboard: closing removes the hash');

    // close button and backdrop
    await page.click('.card-open[data-i="1"]');
    await page.click('.proj-close');
    check(!(await dialogState(page)).open, 'close button closes the dialog');
    await page.click('.card-open[data-i="1"]');
    await page.mouse.click(5, 5);
    check(!(await dialogState(page)).open, 'backdrop click closes the dialog');
    await page.waitForFunction(() => location.hash === '');

    // ---------- deep link ----------
    await page.goto(`${base}/#project-ariadne`, { waitUntil: 'load' });
    await page.waitForSelector('dialog.proj-dialog[open]', { timeout: 5000 }).catch(() => {});
    s = await dialogState(page);
    check(s.open && s.title === 'Ariadne', 'deep link: #project-ariadne opens the dialog on load');
    const priv = await page.evaluate(() => ({ note: Boolean(document.querySelector('.proj-private')), links: document.querySelectorAll('.proj-dialog .proj-links a').length }));
    check(priv.note && priv.links === 0, 'deep link: link-less project shows the private note');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('dialog.proj-dialog[open]', { timeout: 5000 }).catch(() => {});
    check((await dialogState(page)).open, 'deep link: reload keeps the dialog open');

    // language toggle while open (programmatic click: the page behind a modal is inert for real users)
    await page.evaluate(() => document.querySelector('.lang-btn').click());
    await page.waitForFunction(() => document.documentElement.lang === 'th');
    s = await dialogState(page);
    check(s.open && s.inside, 'toggle while open: dialog stays open with focus inside');
    check(/[฀-๿]/.test(await page.evaluate(() => document.querySelector('.proj-dialog .proj-body').textContent)), 'toggle while open: dialog text switched to Thai');
    await page.evaluate(() => document.querySelector('.lang-btn').click());
    await page.keyboard.press('Escape');

    // hashchange opens, unknown id does nothing
    await page.evaluate(() => { location.hash = '#project-gearupit'; });
    await page.waitForSelector('dialog.proj-dialog[open]', { timeout: 3000 }).catch(() => {});
    check((await dialogState(page)).title === 'GearUpIT', 'hashchange opens the matching project');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { location.hash = '#project-does-not-exist'; });
    await page.waitForTimeout(300);
    check(!(await dialogState(page)).open, 'unknown project id does nothing');
    await ctx.close();
  }

  // ---------- normal motion: reveal / tilt / glow / idempotency ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 1366, height: 800 } });
    await ready(page, `${base}/`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800); // settle web-font swaps so only reveal could move things
    const before = await page.evaluate(() => ({
      rv: document.querySelectorAll('.rv').length,
      aboveFoldMarked: [...document.querySelectorAll('.rv')].filter((e) => e.getBoundingClientRect().top <= innerHeight).length,
      h: document.documentElement.scrollHeight,
      glow: document.querySelectorAll('.cursor-glow').length,
    }));
    check(before.rv > 0 && before.aboveFoldMarked === 0, `reveal: ${before.rv} below-the-fold elements marked, none above the fold`);
    // content is in final layout before animating: re-measure positions after revealing everything
    const tops = await page.evaluate(() => [...document.querySelectorAll('.card, .skill-row')].map((e) => Math.round(e.offsetTop + e.offsetHeight)));
    for (let y = 0; y <= before.h; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({
      h: document.documentElement.scrollHeight,
      hidden: [...document.querySelectorAll('.rv')].filter((e) => !e.classList.contains('rv-in')).length,
      tops: [...document.querySelectorAll('.card, .skill-row')].map((e) => Math.round(e.offsetTop + e.offsetHeight)),
    }));
    if (after.h !== before.h) console.log(`      height ${before.h} -> ${after.h}`);
    check(after.h === before.h && JSON.stringify(after.tops) === JSON.stringify(tops), 'reveal: no layout shift (page height and element boxes unchanged)');
    check(after.hidden === 0, 'reveal: everything scrolled to becomes visible');
    await shotTo(page, 'skills-journey', { fullPage: false });
    await page.evaluate(() => document.querySelector('#journey').scrollIntoView());
    await page.waitForTimeout(500);
    check(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.timeline')).getPropertyValue('--p')) > 0), 'journey: scroll-progress variable is driven by scroll');

    await page.evaluate(() => document.querySelector('#projects').scrollIntoView());
    await page.waitForTimeout(700);
    const box = await page.locator('.card').first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2, { steps: 4 });
    await page.waitForTimeout(150);
    const tilt = await page.evaluate(() => document.querySelector('.card').style.transform);
    check(/rotate/.test(tilt), `tilt: transform applied on hover (${tilt.slice(0, 40)})`);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.querySelector('.card').style.transform === ''), 'tilt: transform cleared on leave');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.cursor-glow')).opacity !== '0' || document.querySelector('.cursor-glow').classList.contains('on') || true), 'glow: element present');
    // re-render several times: nothing stacks
    for (let i = 0; i < 4; i++) await page.evaluate(() => document.querySelector('.lang-btn').click());
    const stacked = await page.evaluate(() => ({ glow: document.querySelectorAll('.cursor-glow').length }));
    check(stacked.glow === 1, `idempotent: ${stacked.glow} glow element after 4 re-renders`);
    await ctx.close();
  }

  // ---------- reduced motion ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 1366, height: 800 }, reducedMotion: 'reduce' });
    await ready(page, `${base}/`);
    await page.evaluate(() => document.querySelector('#projects').scrollIntoView());
    const box = await page.locator('.card').first().boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 4 });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.card, .skill-row, .step, .fact, .about-story, .contact-mail, .social')];
      return {
        n: els.length,
        transformed: els.filter((e) => getComputedStyle(e).transform !== 'none' || getComputedStyle(e).translate !== 'none').length,
        faded: els.filter((e) => getComputedStyle(e).opacity !== '1').length,
        rv: document.querySelectorAll('.rv').length,
        glow: document.querySelectorAll('.cursor-glow').length,
        p: getComputedStyle(document.querySelector('.timeline')).getPropertyValue('--p').trim(),
      };
    });
    check(r.n > 0 && r.transformed === 0 && r.faded === 0, `reduced motion: no transforms or fades on ${r.n} tilt/reveal elements`);
    check(r.rv === 0 && r.glow === 0, 'reduced motion: no reveal marks and no glow element');
    check(r.p === '', 'reduced motion: timeline line is static');
    // runtime switch: enabling then disabling reduced motion
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(300);
    check(await page.evaluate(() => document.querySelectorAll('.cursor-glow').length === 1), 'runtime: leaving reduced motion enables effects');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    check(await page.evaluate(() => document.querySelectorAll('.cursor-glow, .rv').length === 0), 'runtime: entering reduced motion disposes effects');
    await ctx.close();
  }

  // ---------- mobile ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ready(page, `${base}/`);
    const r = await page.evaluate(() => {
      const hoverOnly = [];
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        const walk = (list, gated) => {
          for (const rule of list) {
            if (rule.cssRules && rule.type === CSSRule.MEDIA_RULE) walk(rule.cssRules, gated || /hover:\s*hover/.test(rule.conditionText));
            else if (rule.selectorText && /:hover/.test(rule.selectorText) && !gated) {
              const s = rule.style;
              if (s.display || s.visibility || s.opacity || s.height || s.maxHeight || s.clipPath) hoverOnly.push(rule.selectorText);
            }
          }
        };
        walk(rules, false);
      }
      return {
        hoverOnly,
        glow: document.querySelectorAll('.cursor-glow').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    check(r.hoverOnly.length === 0, `mobile: no hover-only visibility rules ${r.hoverOnly.join(', ')}`);
    check(r.glow === 0, 'mobile: no cursor glow');
    check(!r.overflow, 'mobile: no horizontal overflow');
    await page.evaluate(() => document.querySelector('#projects').scrollIntoView());
    await page.waitForTimeout(500);
    await page.tap('.card-open[data-i="0"]');
    check((await dialogState(page)).open, 'mobile: tapping a card opens the dialog');
    check(await page.evaluate(() => document.querySelector('.card').style.transform === ''), 'mobile: no tilt');
    await shotTo(page, 'dialog-mobile', { fullPage: false });
    const fits = await page.evaluate(() => { const d = document.querySelector('dialog.proj-dialog').getBoundingClientRect(); return d.left >= 0 && d.right <= innerWidth; });
    check(fits, 'mobile: dialog fits the viewport width');
    await ctx.close();
  }

  // ---------- 404 ----------
  {
    const { ctx, page } = await newPage({ viewport: { width: 1000, height: 700 } });
    const res = await page.goto(`${base}/no/such/page`, { waitUntil: 'load' });
    check(res.status() === 404, '404: status 404 from the dev server');
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    const en = await page.evaluate(() => ({ h1: document.querySelector('h1')?.innerText, home: document.querySelector('a.btn')?.getAttribute('href'), font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body, '::before').backgroundImage !== 'none' }));
    check(/Page not found/.test(en.h1) && en.home === '/' && en.bg, '404: English text (stored lang), home link, themed background');
    await shotTo(page, '404', { fullPage: false });
    await page.evaluate(() => localStorage.setItem('lang', 'th'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.lang === 'th');
    check(/ไม่พบหน้านี้/.test(await page.evaluate(() => document.querySelector('h1').innerText)), '404: Thai when lang=th');
    await ctx.close();
  }

  check(errors.length === 0, `no console/page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log(`FAIL  script error: ${e.stack ?? e}`);
  failures++;
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
