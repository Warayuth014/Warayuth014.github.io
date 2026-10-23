import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// GitHub Pages (Jekyll) skips paths with a segment starting with "_".
test('no served file has a path segment starting with "_"', () => {
  const out = execFileSync('git', ['ls-files', '-z', 'assets', 'shared', 'articles', 'content', 'edit', 'resume'], { encoding: 'utf8' });
  const bad = out.split('\0').filter(Boolean).filter((p) => p.split('/').some((s) => s.startsWith('_')));
  assert.deepEqual(bad, []);
});

test('.nojekyll exists at the repo root', () => {
  assert.ok(existsSync(new URL('../.nojekyll', import.meta.url)));
});
