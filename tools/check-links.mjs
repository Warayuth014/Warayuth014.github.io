#!/usr/bin/env node
// Usage: node tools/check-links.mjs [--root <dir>] <html-or-css files...>
// Exits 0 when every local href/src/poster/url() resolves to a file, else prints
// each missing path and exits 1.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
let root = process.cwd();
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root') root = resolve(args[++i]);
  else files.push(args[i]);
}

const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function refsIn(text, isCss) {
  const refs = [];
  if (!isCss) {
    const attr = /\b(?:href|src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    for (const m of text.matchAll(attr)) refs.push(m[1] ?? m[2]);
  }
  const url = /(?<![\w-])url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/gi;
  for (const m of text.matchAll(url)) refs.push(m[1] ?? m[2] ?? m[3]);
  return refs;
}

function target(ref, pageDir) {
  const r = ref.trim();
  if (!r || SKIP.test(r) || r.includes("${")) return null; // template placeholders are not files
  let p = r.split('#')[0].split('?')[0];
  if (!p) return null;
  try { p = decodeURIComponent(p); } catch { /* keep raw */ }
  return p.startsWith('/') ? join(root, p) : resolve(pageDir, p);
}

function exists(p) {
  if (!existsSync(p)) return false;
  // a directory link is fine only if it has an index.html (as on GitHub Pages)
  return !statSync(p).isDirectory() || existsSync(join(p, 'index.html'));
}

let bad = 0;
for (const file of files) {
  const abs = resolve(file);
  const text = readFileSync(abs, 'utf8');
  const isCss = extname(abs).toLowerCase() === '.css';
  const seen = new Set();
  for (const ref of refsIn(text, isCss)) {
    const t = target(ref, dirname(abs));
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (!exists(t)) {
      bad++;
      console.log(`${file}: missing ${ref}`);
    }
  }
}
if (bad) {
  console.log(`${bad} missing link(s)`);
  process.exit(1);
}
console.log(`ok: ${files.length} file(s) checked`);
