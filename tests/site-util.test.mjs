import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameOriginPath, safeHref, safeAsset } from '../assets/js/sections/_util.js';

const O = 'https://warayuth014.github.io';

test('sameOriginPath accepts a normal same-origin path', () => {
  assert.equal(sameOriginPath('/tests/fixtures/site-long.json', O), '/tests/fixtures/site-long.json');
  assert.equal(sameOriginPath('/a.json?x=1', O), '/a.json?x=1');
});

test('sameOriginPath rejects cross-origin and bypass attempts', () => {
  for (const bad of [
    '//x', '//evil.example/x.json', 'https://other/x.json', 'x.json', '',
    '/\t/evil.example/x.json', '/\n/evil.example/x.json', '/\r/evil.example/x.json',
    '/\\evil.example/x.json', '/\\/evil.example/x.json', '/ /x', null, undefined,
  ]) assert.equal(sameOriginPath(bad, O), null, JSON.stringify(bad));
  // percent-encoded tab stays encoded in the path, so it never becomes "//"
  assert.equal(new URL('/%09/evil.example/x.json', O).origin, O);
});

test('safeHref allows only https and single-slash paths', () => {
  assert.equal(safeHref('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHref('/projects/x/'), '/projects/x/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com', '//evil.example', '/\\evil', 'https://', ' https://a.b', null]) {
    assert.equal(safeHref(bad), '', String(bad));
  }
});

test('safeAsset allows /uploads and /projects only, no traversal', () => {
  assert.equal(safeAsset('/uploads/a.webp'), '/uploads/a.webp');
  assert.equal(safeAsset('/projects/x/a.png'), '/projects/x/a.png');
  for (const bad of ['/uploads/../secret', '/other/a.png', 'https://x/a.png', '/uploads/', null]) {
    assert.equal(safeAsset(bad), '', String(bad));
  }
});
