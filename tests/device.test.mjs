import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseHeroMode } from '../assets/js/hero/device.js';

const desktop = { reducedMotion: false, webgl: true, width: 1366, deviceMemory: 8, firstFrameMs: 16 };

test('desktop default is live', () => {
  assert.equal(chooseHeroMode(desktop), 'live');
});

test('reduced motion gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, reducedMotion: true }), 'poster');
});

test('no WebGL gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, webgl: false }), 'poster');
});

test('narrow screen with low memory gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, width: 390, deviceMemory: 2 }), 'poster');
});

test('narrow screen with unknown memory gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, width: 390, deviceMemory: undefined }), 'poster');
});

test('narrow screen with plenty of memory stays live', () => {
  assert.equal(chooseHeroMode({ ...desktop, width: 480, deviceMemory: 8 }), 'live');
});

test('wide screen with low memory stays live', () => {
  assert.equal(chooseHeroMode({ ...desktop, width: 1024, deviceMemory: 2 }), 'live');
});

test('slow first frame (> 120 ms) gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: 121 }), 'poster');
});

test('first frame of exactly 120 ms or not yet measured stays live', () => {
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: 120 }), 'live');
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: undefined }), 'live');
});

import { shouldPreloadHero } from '../assets/js/hero/device.js';

test('preload only when the device will likely go live', () => {
  assert.equal(shouldPreloadHero({ reducedMotion: false, width: 1366, light: false }), true);
  assert.equal(shouldPreloadHero({ reducedMotion: true, width: 1366, light: false }), false);
  assert.equal(shouldPreloadHero({ reducedMotion: false, width: 480, light: false }), false);
  assert.equal(shouldPreloadHero({ reducedMotion: false, width: 481, light: false }), true);
  assert.equal(shouldPreloadHero({ reducedMotion: false, width: 1366, light: true }), false);
});
