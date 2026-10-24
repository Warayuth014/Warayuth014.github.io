import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseHeroMode } from '../assets/js/hero/device.js';

const desktop = { webgl: true, firstFrameMs: 16 };

test('default is live', () => {
  assert.equal(chooseHeroMode(desktop), 'live');
});

test('no WebGL gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, webgl: false }), 'poster');
});

test('reduced motion, narrow screen and low memory are ignored: still live', () => {
  assert.equal(chooseHeroMode({ ...desktop, reducedMotion: true, width: 390, deviceMemory: 2 }), 'live');
  assert.equal(chooseHeroMode({ ...desktop, width: 390, deviceMemory: undefined }), 'live');
});

test('slow first frame (> 120 ms) gives the poster', () => {
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: 121 }), 'poster');
});

test('first frame of exactly 120 ms or not yet measured stays live', () => {
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: 120 }), 'live');
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: undefined }), 'live');
});
