#!/usr/bin/env node
// Renders the live night-desk hero at 1600x900 in an installed Edge/Chrome and saves the canvas as
// assets/img/hero-poster.webp (canvas.toDataURL). Usage: node tools/capture-poster.mjs [baseUrl]
// Needs the dev server (node tools/serve.mjs 4173).
// ?capture=1 makes the scene deterministic (fixed camera, code pre-typed, preserveDrawingBuffer).
import { chromium } from 'playwright-core';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'assets/img/hero-poster.webp');
const base = process.argv[2] ?? 'http://localhost:4173/';
const MAX_KB = 200;

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel }); } catch { /* try next */ }
  }
  throw new Error('no Edge or Chrome found for playwright-core');
}

const browser = await launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
  const u = new URL(base);
  u.searchParams.set('capture', '1');
  await page.goto(u.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.hero-stage')?.dataset.heroMode === 'live', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  let quality = 0.8;
  let buf;
  for (; quality >= 0.4; quality -= 0.1) {
    const dataUrl = await page.evaluate((q) => document.querySelector('.hero-stage canvas').toDataURL('image/webp', q), quality);
    buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    if (buf.length <= MAX_KB * 1024) break;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`poster: ${out} (${kb} KB, quality ${quality.toFixed(1)})`);
  if (kb > MAX_KB) { console.error(`poster is over ${MAX_KB} KB`); process.exitCode = 1; }
} finally {
  await browser.close();
}
