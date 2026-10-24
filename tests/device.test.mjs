import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseHeroMode } from '../assets/js/hero/device.js';

const desktop = { reducedMotion: false, webgl: true, width: 1366, deviceMemory: 8, firstFrameMs: 16 };

test('forced: reduced motion, weak phone and slow first frame all stay live', () => {
  assert.equal(chooseHeroMode({ ...desktop, reducedMotion: true, forced: true }), 'live');
  assert.equal(chooseHeroMode({ ...desktop, width: 390, deviceMemory: 2, forced: true }), 'live');
  assert.equal(chooseHeroMode({ ...desktop, firstFrameMs: 500, forced: true }), 'live');
});

test('forced still gives the poster without WebGL', () => {
  assert.equal(chooseHeroMode({ ...desktop, webgl: false, forced: true }), 'poster');
});

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
