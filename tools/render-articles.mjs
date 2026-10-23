#!/usr/bin/env node
// Usage: node tools/render-articles.mjs
// Regenerates articles/<slug>/index.html, articles/index.html and content/articles/index.json
// from content/site.json + content/articles/*.json. Drafts (published:false) get no page.
// Any invalid article, or a hand-made page in the way: print errors, exit 1, write nothing.
// The Cloudflare Worker mirrors this logic using shared/build-articles.js (the same planner).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planArticles } from '../shared/build-articles.js';
import { GENERATED_MARKER } from '../shared/render-article.js';

const defaultRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const isGenerated = (file) => existsSync(file) && readFileSync(file, 'utf8').includes(GENERATED_MARKER);

/** Renders everything under `root`. Throws Error(message with all problems) before writing anything. */
export function renderAll(root = defaultRoot) {
  const dataDir = join(root, 'content', 'articles');
  const outDir = join(root, 'articles');
  const site = JSON.parse(readFileSync(join(root, 'content', 'site.json'), 'utf8'));
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();

  const entries = [];
  const errors = [];
  for (const f of files) {
    try {
      entries.push({ file: f, article: JSON.parse(readFileSync(join(dataDir, f), 'utf8')) });
    } catch (e) {
      errors.push(`${f}: not valid JSON (${e.message})`);
    }
  }

  // what already exists on disk under articles/
  const pages = {};
  if (existsSync(outDir)) {
    for (const d of readdirSync(outDir, { withFileTypes: true })) {
      const file = join(outDir, d.name, 'index.html');
      if (d.isDirectory() && existsSync(file)) pages[d.name] = isGenerated(file);
    }
  }
  const listFile = join(outDir, 'index.html');
  const plan = planArticles(site, entries, { pages, list: existsSync(listFile) ? isGenerated(listFile) : null });
  errors.push(...plan.errors);
  if (errors.length) throw new Error(errors.join('\n'));

  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [path, content] of Object.entries(plan.files)) {
    const file = join(root, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    const m = /^articles\/([^/]+)\/index\.html$/.exec(path);
    if (m) written.push(m[1]);
  }
  const removed = plan.removeSlugs;
  for (const slug of removed) rmSync(join(outDir, slug), { recursive: true, force: true });
  return { written, removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { written, removed } = renderAll();
    removed.forEach((s) => console.log(`removed articles/${s}/`));
    console.log(`rendered ${written.length} article(s)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
