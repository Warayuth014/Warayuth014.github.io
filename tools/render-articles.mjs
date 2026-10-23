#!/usr/bin/env node
// Usage: node tools/render-articles.mjs
// Regenerates articles/<slug>/index.html, articles/index.html and content/articles/index.json
// from content/site.json + content/articles/*.json. Any invalid article: print errors, exit 1,
// write nothing. The Cloudflare Worker mirrors this logic using shared/render-article.js.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArticle } from '../shared/schema.js';
import { renderArticlePage, renderArticleList, articleIndex, GENERATED_MARKER } from '../shared/render-article.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = join(root, 'content', 'articles');
const outDir = join(root, 'articles');

const site = JSON.parse(readFileSync(join(root, 'content', 'site.json'), 'utf8'));
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();

const articles = [];
const errors = [];
for (const f of files) {
  let a;
  try {
    a = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  } catch (e) {
    errors.push(`${f}: not valid JSON (${e.message})`);
    continue;
  }
  const v = validateArticle(a);
  if (!v.ok) v.errors.forEach((m) => errors.push(`${f}: ${m}`));
  else if (`${a.slug}.json` !== f) errors.push(`${f}: slug "${a.slug}" must match the file name`);
  else articles.push(a);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const slugs = new Set(articles.map((a) => a.slug));
for (const a of articles) {
  mkdirSync(join(outDir, a.slug), { recursive: true });
  writeFileSync(join(outDir, a.slug, 'index.html'), renderArticlePage(a, site));
}
writeFileSync(join(outDir, 'index.html'), renderArticleList(articles, site));
writeFileSync(join(dataDir, 'index.json'), `${JSON.stringify(articleIndex(articles), null, 2)}\n`);

// remove generated folders whose article JSON is gone (only ones we generated)
for (const d of readdirSync(outDir, { withFileTypes: true })) {
  if (!d.isDirectory() || slugs.has(d.name)) continue;
  const idx = join(outDir, d.name, 'index.html');
  if (existsSync(idx) && readFileSync(idx, 'utf8').includes(GENERATED_MARKER)) {
    rmSync(join(outDir, d.name), { recursive: true, force: true });
    console.log(`removed articles/${d.name}/`);
  }
}
console.log(`rendered ${articles.length} article(s)`);
