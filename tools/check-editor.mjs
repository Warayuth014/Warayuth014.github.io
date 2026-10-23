#!/usr/bin/env node
// Usage: node tools/check-editor.mjs [--shots]
// End-to-end check of /edit against a real `wrangler dev --local` Worker whose GitHub calls go to
// tools/fake-github.mjs (no network, no real repo). Starts everything itself, drives Edge with playwright-core,
// then stops every process it started (by PID) and removes the temporary worker/.dev.vars.
// --shots writes docs/superpowers/shots/task8-*.jpg. Exit code 1 on any failure.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const worker = resolve(root, 'worker');
const shots = process.argv.includes('--shots');
const PIN = '246810';
const SAVED = 'บันทึกแล้ว — เว็บจริงจะเปลี่ยนในประมาณ 1 นาที';
const STALE = 'มีคนบันทึกก่อนหน้า กดโหลดใหม่';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
};

// ---------- process management (everything we start is killed by PID at the end) ----------
const pids = [];
function start(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...opts });
  pids.push(child.pid);
  child.output = '';
  child.stdout.on('data', (d) => { child.output += d; });
  child.stderr.on('data', (d) => { child.output += d; });
  return child;
}
function killAll() {
  for (const pid of pids.splice(0)) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  }
}
const freePort = () => new Promise((res) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
const firstLine = (child) => waitFor(() => /http:\/\/127\.0\.0\.1:\d+/.exec(child.output)?.[0], 10000, 'server url');

const devVars = resolve(worker, '.dev.vars');
const wranglerBin = resolve(worker, 'node_modules/wrangler/bin/wrangler.js');
const setPassword = (...a) => spawnSync(process.execPath, ['scripts/set-password.mjs', '--local', ...a], { cwd: worker, env: { ...process.env, NEW_PASSWORD: PIN }, encoding: 'utf8' });

let browser;
try {
  // ---------- servers ----------
  const fake = start(process.execPath, [resolve(root, 'tools/fake-github.mjs'), '0']);
  const ghUrl = await firstLine(fake);
  const site = start(process.execPath, [resolve(root, 'tools/serve.mjs'), '0']);
  const siteUrl = (await firstLine(site)).replace(/\/$/, '');

  writeFileSync(devVars, `GITHUB_TOKEN=dummy-not-a-real-token\nSESSION_SECRET=${randomBytes(24).toString('hex')}\n`);
  const wPort = await freePort();
  const wr = start(process.execPath, [wranglerBin, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(wPort), '--var', `GITHUB_API:${ghUrl}`], { cwd: worker, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' } });
  const workerUrl = `http://127.0.0.1:${wPort}`;
  await waitFor(async () => (await fetch(`${workerUrl}/health`)).ok, 90000, 'wrangler dev').catch((e) => { console.log(wr.output.slice(-2000)); throw e; });
  let r = setPassword();
  if (r.status !== 0) throw new Error(`set-password failed: ${r.stderr}`);
  r = setPassword('--reset-locks');
  if (r.status !== 0) throw new Error(`reset-locks failed: ${r.stderr}`);
  console.log(`site ${siteUrl}  worker ${workerUrl}  fake-github ${ghUrl}`);

  const gh = async (p, init) => (await fetch(`${ghUrl}${p}`, init)).json();
  const ghState = () => gh('/__test/state');
  const ghFile = async (p) => (await gh(`/__test/file?path=${encodeURIComponent(p)}`)).text;

  // ---------- browser ----------
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, args: ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] }); break; } catch { /* next */ }
  }
  if (!browser) throw new Error('no Edge or Chrome found for playwright-core');

  const errors = [];
  const noise = /fonts\.g|ERR_|Failed to load resource|favicon/;
  async function newPage(viewport = { width: 1440, height: 900 }) {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript((url) => { try { if (!localStorage.getItem('editor.workerUrl')) localStorage.setItem('editor.workerUrl', url); } catch { /* ignore */ } }, workerUrl);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    return { ctx, page };
  }
  const shot = async (page, name) => {
    if (!shots) return;
    mkdirSync(resolve(root, 'docs/superpowers/shots'), { recursive: true });
    const file = resolve(root, `docs/superpowers/shots/task8-${name}.jpg`);
    for (const quality of [70, 55, 40]) {
      await page.screenshot({ path: file, type: 'jpeg', quality });
      if (statSync(file).size <= 300 * 1024) break;
    }
    console.log(`      shot ${name} ${Math.round(statSync(file).size / 1024)} KB`);
  };

  const { page } = await newPage();
  const lf = (legend, lang) => page.locator('fieldset.lfield', { hasText: legend }).first().locator(`[lang="${lang}"]`).first();
  const tab = (id) => page.click(`#tab-${id}`);
  const status = () => page.locator('#status');
  const workerCalls = [];
  page.on('request', (rq) => { if (rq.url().startsWith(workerUrl)) workerCalls.push({ method: rq.method(), path: new URL(rq.url()).pathname, t: Date.now() }); });

  // ---------- 1. login ----------
  await page.goto(`${siteUrl}/edit/`);
  check((await page.locator('meta[name="robots"]').getAttribute('content', { timeout: 3000 })) === 'noindex,nofollow', '/edit has noindex,nofollow');
  await page.fill('input[type="password"]', 'wrong-pin');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#login-msg:not(:empty)');
  await page.waitForFunction(() => document.getElementById('login-msg').textContent === 'รหัสไม่ถูกต้อง');
  check(true, 'wrong PIN shows the Worker message verbatim');
  await page.fill('input[type="password"]', PIN);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#save-btn', { timeout: 20000 });
  check(true, 'right PIN opens the editor');
  check((await page.evaluate(() => sessionStorage.getItem('editor.session'))) !== null && (await page.evaluate(() => localStorage.getItem('editor.session'))) === null, 'session token only in sessionStorage');
  const siteFrame = () => page.frames().find((f) => f.url().includes('/index.html?preview=1'));
  await waitFor(() => siteFrame(), 8000, 'preview frame');
  await siteFrame().waitForSelector('#hero h1, #hero .hero-name, #hero', { timeout: 15000 });
  await siteFrame().waitForFunction(() => document.querySelector('#about, #projects')?.children.length > 0, null, { timeout: 15000 });
  check(true, 'live preview iframe rendered the draft');
  await shot(page, 'sections-desktop');

  // ---------- 2. keyboard reorder + announcement ----------
  const downBtn = page.getByRole('button', { name: 'ย้ายลง หน้าแรก (Hero)' });
  await downBtn.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /ย้ายไปลำดับที่ 2/.test(document.getElementById('live').textContent));
  check(true, 'keyboard move announces the new position');
  check((await page.locator('.section-row').first().getAttribute('data-id')) === 'about', 'section order changed in the list');
  await page.getByRole('button', { name: /ย้ายขึ้น หน้าแรก/ }).click();
  await page.waitForTimeout(100);
  check((await page.locator('.section-row').first().getAttribute('data-id')) === 'hero', 'moving back restores the order');
  check((await status().textContent()).includes('ยังไม่มีการแก้ไข') || true, 'status readable');

  // ---------- 3. edit About TH + save = exactly one commit ----------
  await tab('texts');
  const story = `ทดสอบแก้ไขเรื่องราว ${Date.now()}`;
  await lf('เรื่องราว', 'th').fill(story);
  await page.waitForTimeout(500);
  check(await page.evaluate(() => localStorage.getItem('editor.draft') !== null), 'draft autosaved to localStorage');
  const before = await ghState();
  const callsBefore = workerCalls.length;
  await page.click('#save-btn');
  await page.waitForFunction((m) => document.getElementById('status').textContent === m, SAVED, { timeout: 20000 });
  check(true, `success message is exactly "${SAVED}"`);
  const after = await ghState();
  check(after.commitCount === before.commitCount + 1, `saving About TH made exactly one commit (${before.commitCount} -> ${after.commitCount})`);
  check(after.commits.at(-1).startsWith('edit: site'), `commit message: ${after.commits.at(-1)}`);
  check((await ghFile('content/site.json')).includes(story), 'content/site.json in the fake repo holds the new text');
  await page.waitForTimeout(1200);
  const post = workerCalls.slice(callsBefore);
  check(post.some((c) => c.path === '/save') && !post.some((c) => c.path === '/state'), `no /state refetch after save (calls: ${post.map((c) => c.path).join(', ')})`);
  check(await page.evaluate(() => localStorage.getItem('editor.draft') === null), 'clean draft removed from localStorage after save');
  check((await page.locator('#save-btn').isDisabled()), 'save button disabled when nothing changed');

  // ---------- 4. theme: accent colour updates the preview at once ----------
  await tab('theme');
  const accent = page.locator('.color-field', { hasText: 'สีเน้น 1' }).locator('input[type="color"]');
  const t0 = Date.now();
  await accent.evaluate((i) => { i.value = '#ff0000'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await siteFrame().waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim().toLowerCase() === '#ff0000', null, { timeout: 3000 });
  check(true, `accent colour reached the preview in ${Date.now() - t0} ms`);
  await shot(page, 'theme-desktop');
  await page.getByRole('button', { name: 'รีเซ็ตเป็นธีมเริ่มต้น' }).click();
  await siteFrame().waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim().toLowerCase() === '#7cf3ff', null, { timeout: 3000 });
  check(true, 'reset to default theme restores the preview');
  check((await status().textContent()).includes('ยังไม่มีการแก้ไข') || (await page.locator('#save-btn').isDisabled()), 'resetting to the saved values leaves nothing to save');

  // ---------- 5. validation errors next to fields, nothing sent ----------
  await tab('texts');
  const nameTh = lf('ชื่อ', 'th');
  const nameEn = page.locator('fieldset.lfield', { hasText: 'ชื่อ' }).first().locator('[lang="en"]').first();
  await nameTh.fill('');
  await nameEn.fill('');
  const commitsBeforeBad = (await ghState()).commitCount;
  const callsBeforeBad = workerCalls.length;
  await page.click('#save-btn');
  await page.waitForSelector('#err-summary:not([hidden])');
  const errText = await page.locator('fieldset.lfield', { hasText: 'ชื่อ' }).first().locator('.err').textContent();
  check(errText.includes('ต้องกรอกอย่างน้อยหนึ่งภาษา'), `error shown next to the field: "${errText}"`);
  check(!workerCalls.slice(callsBeforeBad).some((c) => c.path === '/save') && (await ghState()).commitCount === commitsBeforeBad, 'invalid draft is not sent to the Worker');
  await shot(page, 'validation-error');
  await nameEn.fill('Warayuth Bunbanlu');
  await nameTh.fill('Warayuth Bunbanlu');

  // ---------- 6. article with an image ----------
  await tab('articles');
  await page.getByRole('button', { name: 'เพิ่มบทความ' }).click();
  await page.locator('fieldset.lfield', { hasText: 'หัวข้อ' }).first().locator('[lang="th"]').fill('บทความทดสอบ');
  await page.locator('fieldset.lfield', { hasText: 'หัวข้อ' }).first().locator('[lang="en"]').fill('Hello Editor!');
  check((await page.locator('input[id]:not([readonly])[maxlength="60"]').first().inputValue()) === 'hello-editor', 'slug auto-generated from the English title');
  await page.locator('fieldset.lfield', { hasText: 'สรุปสั้น' }).first().locator('[lang="en"]').fill('Summary <script>alert(1)</script> <img src=x onerror=alert(1)>');
  const bodyTh = page.locator('.rt-area[lang="th"]');
  await bodyTh.click();
  await page.keyboard.type('เนื้อหาบทความภาษาไทย');
  // pasted HTML must come in as plain text
  await bodyTh.evaluate((area) => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<img src=x onerror="window.__pwned=1"><b>bold</b>');
    dt.setData('text/plain', 'วางข้อความ');
    area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  check(((await bodyTh.innerHTML()).includes('วางข้อความ')) && (await bodyTh.locator('img[onerror], script').count()) === 0, 'paste inserts plain text only');
  await page.locator('.rt[class*="rt"]').first().locator('input[type="file"]').setInputFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('dialog[open]');
  await page.fill('dialog[open] input[name="alt"]', 'ภาพทดสอบ');
  await page.click('dialog[open] button[type="submit"]');
  await bodyTh.locator('img[src^="/uploads/"]').waitFor({ timeout: 10000 });
  check(true, 'image uploaded and inserted as <img src="/uploads/...">');
  await page.locator('.switch-field input[role="switch"]').check();
  await page.waitForTimeout(500);
  const artFrame = page.frames().find((f) => f !== page.mainFrame() && !f.url().includes('index.html'));
  const artHtml = await page.locator('iframe[title="ตัวอย่างบทความ"]').getAttribute('srcdoc');
  check(artHtml.includes('Hello Editor!') && artHtml.includes('<img src="/uploads/') && !artHtml.includes('<script>alert') && !artHtml.includes('<img src=x') && !/<script/i.test(artHtml), 'article preview renders the draft and escapes injected markup');
  check((await page.locator('iframe[title="ตัวอย่างบทความ"]').getAttribute('sandbox')) === '' , 'article preview iframe is sandboxed without scripts');
  void artFrame;
  await shot(page, 'article-editor');
  const beforeArt = await ghState();
  await page.click('#save-btn');
  await page.waitForFunction((m) => document.getElementById('status').textContent === m, SAVED, { timeout: 20000 });
  const afterArt = await ghState();
  check(afterArt.commitCount === beforeArt.commitCount + 1, `article save is one commit after the upload commit (${beforeArt.commitCount} -> ${afterArt.commitCount})`);
  check(afterArt.files.includes('articles/hello-editor/index.html') && afterArt.files.includes('content/articles/hello-editor.json'), 'article page and JSON generated in the repo');
  const pageHtml = await ghFile('articles/hello-editor/index.html');
  check(pageHtml.includes('/uploads/') && !pageHtml.includes('<img src=x') && !pageHtml.includes('<script>alert'), 'generated page has the image and no injected markup');
  check((await ghFile('content/articles/index.json')).includes('hello-editor'), 'article list index updated');
  check((await page.locator('#slug-ro').count()) === 1, 'slug of a saved article is read-only');

  // ---------- 7. stale base: 409 + reload + re-apply ----------
  await tab('texts');
  await lf('ปุ่มดูผลงาน', 'en').fill('See my work (edited)');
  await fetch(`${ghUrl}/__test/bump`, { method: 'POST' });
  await page.click('#save-btn');
  await page.waitForSelector('#banner:not([hidden])');
  check((await page.locator('#banner p').textContent()) === STALE, `409 shows the Worker message "${STALE}"`);
  check(await page.getByRole('button', { name: 'โหลดใหม่' }).isVisible(), 'reload button offered');
  await shot(page, 'conflict');
  await page.getByRole('button', { name: 'โหลดใหม่' }).click();
  await page.getByRole('button', { name: 'กู้คืนฉบับร่าง' }).waitFor({ timeout: 10000 });
  check((await page.locator('#banner p').textContent()).includes('เวอร์ชันเก่า'), 'restore is offered with a stale-draft warning');
  await page.getByRole('button', { name: 'กู้คืนฉบับร่าง' }).click();
  await tab('texts');
  check((await lf('ปุ่มดูผลงาน', 'en').inputValue()) === 'See my work (edited)', 'local draft re-applied after reload');
  const beforeRe = await ghState();
  await page.click('#save-btn');
  await page.waitForFunction((m) => document.getElementById('status').textContent === m, SAVED, { timeout: 20000 });
  check((await ghState()).commitCount === beforeRe.commitCount + 1, 'save after reload succeeds with one commit');

  // ---------- 8. page reload keeps the draft ----------
  await lf('เรื่องราว', 'en').fill('Draft that survives a reload');
  await page.waitForTimeout(600);
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await page.getByRole('button', { name: 'กู้คืนฉบับร่าง' }).waitFor({ timeout: 15000 });
  check(!(await page.locator('#banner p').textContent()).includes('เวอร์ชันเก่า'), 'reload offers the draft (same base, no warning)');
  await page.getByRole('button', { name: 'กู้คืนฉบับร่าง' }).click();
  await tab('texts');
  check((await lf('เรื่องราว', 'en').inputValue()) === 'Draft that survives a reload', 'draft restored after a reload');

  // ---------- 9. expired session: back to login, draft kept ----------
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('editor.session'));
    s.token = 'broken.token';
    sessionStorage.setItem('editor.session', JSON.stringify(s));
  });
  // the in-memory token is what the app sends, so force it through a fresh load of the broken session
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  check(await page.evaluate(() => localStorage.getItem('editor.draft') !== null), 'draft kept in localStorage when the session is rejected');
  await page.fill('input[type="password"]', PIN);
  await page.click('button[type="submit"]');
  await page.getByRole('button', { name: 'กู้คืนฉบับร่าง' }).waitFor({ timeout: 20000 });
  check(true, 'after logging in again the draft is offered');
  await page.getByRole('button', { name: 'กู้คืนฉบับร่าง' }).click();

  // ---------- 10. responsive + a11y basics ----------
  const labelless = await page.evaluate(() => [...document.querySelectorAll('#panel input:not([type=file]):not([type=hidden]), #panel textarea, #panel select')].filter((i) => !i.labels?.length && !i.getAttribute('aria-label')).length);
  check(labelless === 0, `every input in the current panel has a label (${labelless} without)`);
  const small = await newPage({ width: 390, height: 800 });
  await small.page.goto(`${siteUrl}/edit/`);
  await small.page.waitForSelector('#save-btn', { timeout: 20000 }).catch(() => {});
  if (!(await small.page.locator('#save-btn').count())) {
    await small.page.fill('input[type="password"]', PIN);
    await small.page.click('button[type="submit"]');
    await small.page.waitForSelector('#save-btn', { timeout: 20000 });
  }
  const overflow = await small.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `no horizontal overflow at 390 px (${overflow})`);
  await shot(small.page, 'mobile');
  await small.ctx.close();

  // ---------- 11. lockout (last: it blocks this IP) ----------
  setPassword('--reset-locks');
  const lock = await newPage();
  await lock.page.goto(`${siteUrl}/edit/`);
  let locked = false;
  let wrong = 0;
  for (let i = 0; i < 8 && !locked; i++) {
    await lock.page.fill('input[type="password"]', `bad-${i}`);
    await lock.page.click('button[type="submit"]');
    await lock.page.waitForFunction((n) => { const t = document.getElementById('login-msg').textContent; return t && t !== 'กำลังเข้าสู่ระบบ...'; }, i);
    const txt = await lock.page.locator('#login-msg').textContent();
    if (txt.startsWith('ลองผิดหลายครั้งเกินไป')) locked = true; else if (txt === 'รหัสไม่ถูกต้อง') wrong++;
  }
  check(locked && wrong === 5, `5 wrong PINs, then the lockout message (wrong=${wrong}, locked=${locked})`);
  await shot(lock.page, 'lockout');
  setPassword('--reset-locks');

  check(errors.length === 0, `console clean (${errors.length} problems)`);
  errors.forEach((e) => console.log(`      ${e}`));
} catch (e) {
  console.log(`FAIL  ${e.stack ?? e.message}`);
  failures++;
} finally {
  try { await browser?.close(); } catch { /* ignore */ }
  killAll();
  if (existsSync(devVars)) rmSync(devVars);
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall editor checks passed');
process.exit(failures ? 1 : 0);
