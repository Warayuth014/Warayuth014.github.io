import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEnv, call, token, site, article, repoFiles } from './helpers.js';
import { renderAll } from '../../tools/render-articles.mjs';
import { GENERATED_MARKER } from '../../shared/render-article.js';
import { pathAllowed } from '../src/routes.js';

const STALE = 'มีคนบันทึกก่อนหน้า กดโหลดใหม่';
const setup = async (files = repoFiles(), ghOpts) => {
  const e = await makeEnv({ files, ghOpts });
  e.tok = await token(e.env);
  return e;
};
const save = (e, body) => call(e.env, 'POST', '/save', { token: e.tok, body });
const state = (e) => call(e.env, 'GET', '/state', { token: e.tok });

test('/state returns head, site and every article except index.json', async () => {
  const files = { ...repoFiles(), 'content/articles/a.json': JSON.stringify(article('a')), 'content/articles/b.json': JSON.stringify(article('b')) };
  const e = await setup(files);
  const r = await state(e);
  assert.equal(r.status, 200);
  assert.equal(r.json.headSha, e.gh.head);
  assert.equal(r.json.site.version, 1);
  assert.deepEqual(r.json.articles.map((a) => a.slug).sort(), ['a', 'b']);
});

test('save of site + 2 articles is exactly one commit with site, both JSON, both pages, list and index', async () => {
  const e = await setup();
  const head = (await state(e)).json.headSha;
  const s = site({ hero: { name: { th: 'ใหม่', en: 'New' }, intro: { th: '', en: '' }, ctaWork: { th: '', en: '' }, ctaResume: { th: '', en: '' } } });
  const r = await save(e, { baseSha: head, site: s, articles: [article('one'), article('two')] });
  assert.equal(r.status, 200);
  assert.equal(r.json.commitSha, e.gh.head);
  assert.equal(e.gh.commitCount(), 1);
  assert.equal(e.gh.writes().filter((c) => c.path === '/git/refs/heads/main').length, 1);
  const patch = e.gh.calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.body.force, false);
  const tree = e.gh.calls.find((c) => c.path === '/git/trees' && c.method === 'POST');
  assert.deepEqual(tree.body.tree.map((t) => t.path).sort(), [
    'articles/index.html', 'articles/one/index.html', 'articles/two/index.html',
    'content/articles/index.json', 'content/articles/one.json', 'content/articles/two.json', 'content/site.json',
  ]);
  assert.ok(tree.body.tree.every((t) => pathAllowed(t.path)));
  assert.match(e.gh.text('articles/one/index.html'), new RegExp(GENERATED_MARKER));
  assert.equal(JSON.parse(e.gh.text('content/site.json')).hero.name.en, 'New');
  assert.deepEqual(JSON.parse(e.gh.text('content/articles/index.json')).map((a) => a.slug), ['one', 'two']);
  const msg = e.gh.calls.find((c) => c.path === '/git/commits' && c.method === 'POST').body.message;
  assert.equal(msg, 'edit: site, articles one, two');
});

test('Worker output is byte-identical to tools/render-articles.mjs for the same inputs', async () => {
  const e = await setup();
  const head = (await state(e)).json.headSha;
  const s = site();
  const arts = [article('alpha', { date: '2026-01-02' }), article('beta', { published: false }), article('gamma', { body: { th: '<p>a<script>x</script></p>', en: '' } })];
  assert.equal((await save(e, { baseSha: head, site: s, articles: arts })).status, 200);

  const root = mkdtempSync(join(tmpdir(), 'worker-parity-'));
  mkdirSync(join(root, 'content', 'articles'), { recursive: true });
  writeFileSync(join(root, 'content', 'site.json'), `${JSON.stringify(s, null, 2)}\n`);
  for (const a of arts) writeFileSync(join(root, 'content', 'articles', `${a.slug}.json`), `${JSON.stringify(a, null, 2)}\n`);
  renderAll(root);
  const same = (p) => assert.equal(e.gh.text(p), readFileSync(join(root, ...p.split('/')), 'utf8'), p);
  ['articles/index.html', 'articles/alpha/index.html', 'articles/gamma/index.html', 'content/articles/index.json', 'content/articles/beta.json'].forEach(same);
  assert.equal(e.gh.text('articles/beta/index.html'), undefined, 'drafts get no page');
});

test('stale baseSha: 409 with the exact message and no writes', async () => {
  const e = await setup();
  const head = (await state(e)).json.headSha;
  e.gh.bump();
  const r = await save(e, { baseSha: head, site: site() });
  assert.equal(r.status, 409);
  assert.deepEqual(r.json, { error: STALE, code: 'conflict' });
  assert.equal(e.gh.writes().length, 0);
});

test('head moving between the check and the ref update: 409 as well', async () => {
  const e = await setup(repoFiles(), { failRefPatch: 1 });
  const head = (await state(e)).json.headSha;
  const r = await save(e, { baseSha: head, site: site() });
  assert.equal(r.status, 409);
  assert.deepEqual(r.json, { error: STALE, code: 'conflict' });
});

test('invalid site: 400 with errors and zero GitHub calls', async () => {
  const e = await setup();
  const before = e.gh.calls.length;
  const r = await save(e, { baseSha: 'x', site: { ...site(), version: 2, contact: { email: 'nope', phone: null, links: [] } } });
  assert.equal(r.status, 400);
  assert.ok(r.json.errors.some((m) => m.includes('version')));
  assert.ok(r.json.errors.some((m) => m.includes('contact.email')));
  assert.equal(e.gh.calls.length, before);
});

test('invalid article, bad deleteArticles slug, duplicates, overlap: 400, no writes', async () => {
  const e = await setup();
  const head = (await state(e)).json.headSha;
  const cases = [
    { articles: [article('ok'), { ...article('bad'), date: 'nope' }] },
    { articles: [article('same'), article('same')] },
    { deleteArticles: ['../etc'] },
    { deleteArticles: ['a/b'] },
    { deleteArticles: 'x' },
    { articles: [article('x')], deleteArticles: ['x'] },
    { articles: 'nope' },
  ];
  for (const c of cases) {
    const r = await save(e, { baseSha: head, ...c });
    assert.equal(r.status, 400, JSON.stringify(c));
    assert.ok(r.json.errors.length > 0);
  }
  assert.equal(e.gh.writes().length, 0);
});

test('deleting an article removes its JSON and generated page; unpublishing removes only the page', async () => {
  const e = await setup();
  let head = (await state(e)).json.headSha;
  await save(e, { baseSha: head, articles: [article('keep'), article('gone'), article('draft')] });
  head = e.gh.head;
  const r = await save(e, { baseSha: head, articles: [article('draft', { published: false })], deleteArticles: ['gone'] });
  assert.equal(r.status, 200);
  assert.equal(e.gh.text('content/articles/gone.json'), undefined);
  assert.equal(e.gh.text('articles/gone/index.html'), undefined);
  assert.equal(e.gh.text('articles/draft/index.html'), undefined);
  assert.ok(e.gh.text('content/articles/draft.json'));
  assert.ok(e.gh.text('articles/keep/index.html'));
  assert.deepEqual(JSON.parse(e.gh.text('content/articles/index.json')).map((a) => a.slug), ['keep']);
  const msg = e.gh.calls.filter((c) => c.path === '/git/commits' && c.method === 'POST').pop().body.message;
  assert.equal(msg, 'edit: articles draft, delete gone');
});

test('a hand-made page in the way is never overwritten (400, no writes)', async () => {
  const e = await setup({ ...repoFiles(), 'articles/mine/index.html': '<h1>by hand</h1>' });
  const head = (await state(e)).json.headSha;
  const r = await save(e, { baseSha: head, articles: [article('mine')] });
  assert.equal(r.status, 400);
  assert.match(r.json.errors.join('\n'), /not generated/);
  assert.equal(e.gh.writes().length, 0);
});

test('a hand-made page without a matching published article is left alone', async () => {
  const e = await setup({ ...repoFiles(), 'articles/mine/index.html': '<h1>by hand</h1>' });
  const head = (await state(e)).json.headSha;
  assert.equal((await save(e, { baseSha: head, articles: [article('other')] })).status, 200);
  assert.equal(e.gh.text('articles/mine/index.html'), '<h1>by hand</h1>');
});

test('path allowlist', () => {
  for (const ok of ['content/site.json', 'uploads/2026/a-b.png', 'articles/x/index.html']) assert.equal(pathAllowed(ok), true, ok);
  for (const no of ['', '/content/x', 'content/../.github/workflows/x.yml', '../content/x', 'content\\x', '.github/workflows/x.yml', 'index.html', 'worker/src/index.js', 'content//x', 'contentx/y', 'uploads/./x', 'articles/..']) assert.equal(pathAllowed(no), false, no);
});

test('a save body over 2 MB is refused with 413', async () => {
  const e = await setup();
  const r = await save(e, { baseSha: 'x', pad: 'a'.repeat(2 * 1024 * 1024 + 10) });
  assert.equal(r.status, 413);
  assert.equal(e.gh.calls.length, 0);
});

test('GitHub requests carry the required headers and token only in Authorization', async () => {
  const e = await setup();
  await state(e);
  const c = e.gh.calls[0];
  assert.equal(c.headers.Accept, 'application/vnd.github+json');
  assert.equal(c.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.ok(c.headers['User-Agent']);
  assert.match(c.headers.Authorization, /^Bearer /);
});

test('a save with 30 existing articles uses at most 10 GitHub subrequests (does not grow with article count)', async () => {
  const slugs = Array.from({ length: 30 }, (_, i) => `post-${String(i).padStart(2, '0')}`);
  const e = await setup();
  let head = (await state(e)).json.headSha;
  assert.equal((await save(e, { baseSha: head, site: site(), articles: slugs.map((s) => article(s)) })).status, 200);
  head = e.gh.head;
  const before = e.gh.calls.length;
  const r = await save(e, { baseSha: head, articles: [article('post-07', { body: { th: '<p>edited</p>', en: '<p>edited</p>' } })] });
  assert.equal(r.status, 200);
  const used = e.gh.calls.length - before;
  assert.ok(used <= 10, `used ${used} subrequests`);
  assert.equal(e.gh.calls.slice(before).filter((c) => c.path === '/graphql').length, 1);
  assert.equal(e.gh.calls.slice(before).filter((c) => c.method === 'GET' && c.path.startsWith('/git/blobs')).length, 0, 'no per-file reads');
  assert.match(e.gh.text('articles/post-07/index.html'), /edited/);
});

test('saving identical content makes no commit', async () => {
  const e = await setup();
  let head = (await state(e)).json.headSha;
  await save(e, { baseSha: head, site: site(), articles: [article('a')] });
  head = e.gh.head;
  const r = await save(e, { baseSha: head, site: site(), articles: [article('a')] });
  assert.equal(r.status, 200);
  assert.equal(r.json.commitSha, head);
  assert.equal(e.gh.commitCount(), 1);
});

test('reserved slug "index" is refused for saving and deleting (400, no writes)', async () => {
  const e = await setup();
  const head = (await state(e)).json.headSha;
  const a = await save(e, { baseSha: head, articles: [article('index')] });
  assert.equal(a.status, 400);
  assert.match(a.json.errors.join('\n'), /reserved/);
  assert.equal((await save(e, { baseSha: head, deleteArticles: ['index'] })).status, 400);
  assert.equal(e.gh.writes().length, 0);
});

test('a page is "generated" if its article JSON exists or the old index.json listed it; otherwise it is protected', async () => {
  const files = {
    ...repoFiles(),
    'content/articles/index.json': JSON.stringify([{ slug: 'was-listed' }]),
    'articles/was-listed/index.html': '<p>old generated</p>',
    'articles/with-json/index.html': '<p>old generated</p>',
    'content/articles/with-json.json': JSON.stringify(article('with-json', { published: false })),
    'articles/index.html': '<p>old list</p>',
  };
  const e = await setup(files);
  const head = (await state(e)).json.headSha;
  assert.equal((await save(e, { baseSha: head, articles: [article('fresh')] })).status, 200);
  assert.equal(e.gh.text('articles/was-listed/index.html'), undefined, 'listed page removed (no article any more)');
  assert.equal(e.gh.text('articles/with-json/index.html'), undefined, 'draft page removed');
});
