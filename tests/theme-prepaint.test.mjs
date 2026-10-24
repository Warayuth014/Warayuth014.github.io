import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { THEME_PREPAINT } from '../shared/theme-prepaint.js';
import { renderArticlePage, renderArticleList } from '../shared/render-article.js';
import { applyTheme, THEME_CACHE_KEY } from '../assets/js/theme.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function fakeDom(stored) {
  const props = {};
  const attrs = {};
  const root = {
    style: { setProperty: (k, v) => { props[k] = v; } },
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => attrs[k] ?? null,
    dataset: {},
  };
  const store = new Map(stored === undefined ? [] : [[THEME_CACHE_KEY, stored]]);
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  return { props, attrs, root, store, localStorage };
}

function runPrepaint(stored) {
  const d = fakeDom(stored);
  vm.runInNewContext(THEME_PREPAINT, { document: { documentElement: d.root }, localStorage: d.localStorage });
  return d;
}

test('pre-paint script applies cached #rrggbb tokens and the mode', () => {
  const cached = JSON.stringify({ mode: 'dark', vars: { '--bg1': '#101010', '--accent1': '#aabbcc' } });
  const { props, attrs } = runPrepaint(cached);
  assert.equal(props['--bg1'], '#101010');
  assert.equal(props['--accent1'], '#aabbcc');
  assert.equal(attrs['data-mode'], 'dark');
  assert.equal(props['--card'], undefined);
});

test('pre-paint script sets the light card colour in light mode', () => {
  const { props, attrs } = runPrepaint(JSON.stringify({ mode: 'light', vars: { '--bg1': '#f0f0f0' } }));
  assert.equal(attrs['data-mode'], 'light');
  assert.equal(props['--card'], 'rgba(255,255,255,.72)');
});

test('pre-paint script rejects anything but known tokens with #rrggbb values', () => {
  const bad = JSON.stringify({ mode: 'dark', vars: { '--bg1': 'red', '--bg2': 'url(x)', '--accent1': '#12345', '--font-body': '#112233', color: '#112233', '--fg': '#ABCDEF' } });
  const { props } = runPrepaint(bad);
  assert.deepEqual(props, { '--fg': '#ABCDEF' });
});

test('pre-paint script ignores missing, malformed or non-object caches without throwing', () => {
  for (const s of [undefined, 'not json', 'null', '5', '"x"']) {
    const { props } = runPrepaint(s);
    assert.deepEqual(props, {});
  }
});

test('index.html and resume/index.html carry the pre-paint script verbatim', () => {
  assert.ok(read('index.html').includes(`<script>${THEME_PREPAINT}</script>`));
  assert.ok(read('resume/index.html').includes(`<script>${THEME_PREPAINT}</script>`));
});

test('generated article pages and the article list carry the pre-paint script', () => {
  const site = { hero: { name: { en: 'W', th: 'ว' } } };
  const article = { slug: 'a', date: '2026-01-01', title: { th: 't', en: 't' }, summary: { th: '', en: '' }, body: { th: '', en: '' }, tags: [], published: true };
  assert.ok(renderArticlePage(article, site).includes(`<script>${THEME_PREPAINT}</script>`));
  assert.ok(renderArticleList([article], site).includes(`<script>${THEME_PREPAINT}</script>`));
});

test('applyTheme caches only hex tokens, and not when persist is false', () => {
  const d = fakeDom();
  globalThis.document = { documentElement: d.root, getElementById: () => null, createElement: () => ({ setAttribute() {}, getAttribute: () => null }), head: { appendChild() {} } };
  globalThis.localStorage = d.localStorage;
  try {
    applyTheme({ bg1: '#112233', accent2: '#445566', mode: 'dark' });
    const saved = JSON.parse(d.store.get(THEME_CACHE_KEY));
    assert.equal(saved.mode, 'dark');
    assert.equal(saved.vars['--bg1'], '#112233');
    assert.equal(saved.vars['--accent2'], '#445566');
    assert.ok(Object.values(saved.vars).every((v) => /^#[0-9a-f]{6}$/i.test(v)));
    assert.equal(saved.vars['--card'], undefined);

    d.store.clear();
    applyTheme({ bg1: '#112233' }, { persist: false });
    assert.equal(d.store.has(THEME_CACHE_KEY), false);
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});

test('light --card in the pre-paint script is the value applyTheme sets', () => {
  const d = fakeDom();
  globalThis.document = { documentElement: d.root, getElementById: () => null, createElement: () => ({ setAttribute() {}, getAttribute: () => null }), head: { appendChild() {} } };
  globalThis.localStorage = d.localStorage;
  try {
    applyTheme({ mode: 'light' });
    assert.equal(d.props['--card'], runPrepaint(JSON.stringify({ mode: 'light', vars: {} })).props['--card']);
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});

test('applyTheme survives blocked storage', () => {
  const d = fakeDom();
  globalThis.document = { documentElement: d.root, getElementById: () => null, createElement: () => ({ setAttribute() {}, getAttribute: () => null }), head: { appendChild() {} } };
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  try {
    assert.doesNotThrow(() => applyTheme({ bg1: '#112233' }));
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});

// ---------- the head script in index.html that preloads the scene ----------
function headScript() {
  const m = read('index.html').match(/<script>(\(function\(\)\{try\{if\(\/\[\?&\]\(preview[\s\S]*?)<\/script>/);
  assert.ok(m, 'preload script not found in index.html');
  return m[1];
}

function runPreload({ reduced = false, width = 1366, mode = null, search = '' }) {
  const links = [];
  const ctx = {
    location: { search },
    innerWidth: width,
    matchMedia: () => ({ matches: reduced }),
    fetch: () => Promise.resolve({ ok: true }),
    document: {
      documentElement: { getAttribute: () => mode },
      createElement: () => ({}),
      head: { appendChild: (l) => links.push(l) },
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(headScript(), ctx);
  return { links, fetched: Boolean(ctx.__siteFetch) };
}

test('head script preloads the scene whenever the page is not in light mode (reduced motion and width are ignored)', () => {
  for (const reduced of [false, true]) {
    for (const width of [390, 480, 481, 1366]) {
      for (const mode of [null, 'dark', 'light']) {
        const { links } = runPreload({ reduced, width, mode });
        const want = mode !== 'light';
        assert.equal(links.length > 0, want, `reduced=${reduced} width=${width} mode=${mode}`);
      }
    }
  }
});

test('head script preloads the three modules, starts the early site.json fetch, and skips previews', () => {
  const { links, fetched } = runPreload({});
  assert.deepEqual(links.map((l) => l.href), ['/assets/vendor/three/three.module.js', '/assets/js/hero/interact.js', '/assets/js/hero/desk.js']);
  assert.ok(links.every((l) => l.rel === 'modulepreload'));
  assert.equal(fetched, true);
  for (const search of ['?preview=1', '?content=/x.json']) {
    const r = runPreload({ search });
    assert.equal(r.links.length, 0);
    assert.equal(r.fetched, false);
  }
});

test('light mode still starts the early site.json fetch but downloads no 3D code', () => {
  const { links, fetched } = runPreload({ mode: 'light' });
  assert.equal(links.length, 0);
  assert.equal(fetched, true);
});
