import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateAccents, nextTint, keysNear, fade, ease, isUiTarget } from '../assets/js/hero/interact.js';

test('rotateAccents shifts the accent order and wraps', () => {
  const a = ['a1', 'a2', 'a3'];
  assert.deepEqual(rotateAccents(a, 0), ['a1', 'a2', 'a3']);
  assert.deepEqual(rotateAccents(a, 1), ['a2', 'a3', 'a1']);
  assert.deepEqual(rotateAccents(a, 2), ['a3', 'a1', 'a2']);
  assert.deepEqual(rotateAccents(a, 3), a);
  assert.deepEqual(rotateAccents(a, -1), ['a3', 'a1', 'a2']);
});

test('nextTint cycles accent1 -> accent2 -> accent3 -> back', () => {
  assert.equal(nextTint(0), 1);
  assert.equal(nextTint(1), 2);
  assert.equal(nextTint(2), 0);
});

test('keysNear returns the key under the point at full weight and fades with distance', () => {
  const keys = [{ x: 0, z: 0, sx: 1 }, { x: 0.061, z: 0, sx: 1 }, { x: 0.5, z: 0.5, sx: 1 }];
  const hit = keysNear(keys, 0, 0);
  assert.equal(hit.find((k) => k.i === 0).w, 1);
  const neighbour = hit.find((k) => k.i === 1);
  assert.ok(neighbour && neighbour.w > 0 && neighbour.w < 1);
  assert.equal(hit.some((k) => k.i === 2), false);
});

test('keysNear treats a wide key (space bar) as wider', () => {
  const keys = [{ x: 0, z: 0, sx: 5.4 }];
  assert.equal(keysNear(keys, 0.12, 0)[0].w, 1); // still on the wide cap
  assert.equal(keysNear([{ x: 0, z: 0, sx: 1 }], 0.12, 0).length, 0);
});

test('fade reaches 0 after the given time and never goes negative', () => {
  assert.equal(fade(1, 0.2, 0.4), 0.5);
  assert.equal(fade(0.1, 1, 0.4), 0);
});

test('ease moves towards the target without overshooting', () => {
  const v = ease(0, 1, 0.016, 9);
  assert.ok(v > 0 && v < 1);
  assert.ok(ease(0, 1, 10, 9) > 0.999);
});

test('isUiTarget is true for links, buttons and text, false for plain containers', () => {
  const mk = (match) => ({ closest: (sel) => (match && sel.split(',').map((s) => s.trim()).includes(match) ? {} : null) });
  assert.equal(isUiTarget(mk('a')), true);
  assert.equal(isUiTarget(mk('button')), true);
  assert.equal(isUiTarget(mk('h1')), true);
  assert.equal(isUiTarget(mk(null)), false);
  assert.equal(isUiTarget(null), false);
  assert.equal(isUiTarget({}), false);
});
