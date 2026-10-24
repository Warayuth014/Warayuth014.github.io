import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const checker = resolve('tools/check-links.mjs');

function run(dir, files, extra = []) {
  return spawnSync(process.execPath, [checker, ...extra, ...files], { cwd: dir, encoding: 'utf8' });
}

function fixture(html) {
  const dir = mkdtempSync(join(tmpdir(), 'links-'));
  writeFileSync(join(dir, 'a.css'), 'body{}');
  writeFileSync(join(dir, 'page.html'), html);
  return dir;
}

test('reports a missing local file and exits 1', () => {
  const dir = fixture('<link href="./a.css"><img src="./missing.png">');
  const r = run(dir, ['page.html']);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /missing\.png/);
  assert.doesNotMatch(r.stdout + r.stderr, /a\.css/);
});

test('exits 0 when all links exist', () => {
  const dir = fixture('<link href="./a.css"><a href="a.css?v=1#x">x</a>');
  assert.equal(run(dir, ['page.html']).status, 0);
});

test('ignores external links and anchors', () => {
  const dir = fixture('<a href="https://x.com/n">a</a><a href="#top">b</a><a href="mailto:a@b.c">c</a><script src="//cdn/x.js"></script><a href="tel:1">t</a><a href="javascript:void(0)">j</a><img src="data:image/png;base64,AA">');
  assert.equal(run(dir, ['page.html']).status, 0);
});

test('decodes %20 and resolves root-absolute paths against --root', () => {
  const dir = fixture('<img src="/my pic/a%20b.png"><img src="/my%20pic/a b.png">');
  mkdirSync(join(dir, 'my pic'));
  writeFileSync(join(dir, 'my pic', 'a b.png'), 'x');
  assert.equal(run(dir, ['page.html'], ['--root', dir]).status, 0);
});

test('checks url() in css files', () => {
  const dir = fixture('');
  writeFileSync(join(dir, 'b.css'), 'a{background:url("nope.png")} b{background:url(a.css)}');
  const r = run(dir, ['b.css']);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /nope\.png/);
});
