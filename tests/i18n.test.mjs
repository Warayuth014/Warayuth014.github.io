import test from 'node:test';
import assert from 'node:assert/strict';
import { t, detectLang } from '../shared/i18n.js';

test('t returns the requested language', () => {
  assert.equal(t({ th: 'สวัสดี', en: 'Hi' }, 'th'), 'สวัสดี');
  assert.equal(t({ th: 'สวัสดี', en: 'Hi' }, 'en'), 'Hi');
});

test('t falls back to the other language, then empty string', () => {
  assert.equal(t({ th: '', en: 'Hi' }, 'th'), 'Hi');
  assert.equal(t({ th: 'สวัสดี', en: '' }, 'en'), 'สวัสดี');
  assert.equal(t({ th: '', en: '' }, 'en'), '');
  assert.equal(t(undefined, 'en'), '');
  assert.equal(t(null, 'th'), '');
  assert.equal(t({}, 'th'), '');
});

test('detectLang is safe with no localStorage/navigator (Worker)', () => {
  const g = globalThis;
  const nav = Object.getOwnPropertyDescriptor(g, 'navigator');
  try {
    Object.defineProperty(g, 'navigator', { value: undefined, configurable: true });
    assert.equal(detectLang(), 'en');
  } finally {
    if (nav) Object.defineProperty(g, 'navigator', nav); else delete g.navigator;
  }
});

test('detectLang reads localStorage first, then navigator.language', () => {
  const g = globalThis;
  const saved = { ls: Object.getOwnPropertyDescriptor(g, 'localStorage'), nav: Object.getOwnPropertyDescriptor(g, 'navigator') };
  try {
    Object.defineProperty(g, 'localStorage', { value: { getItem: () => 'th' }, configurable: true });
    Object.defineProperty(g, 'navigator', { value: { language: 'en-US' }, configurable: true });
    assert.equal(detectLang(), 'th');
    Object.defineProperty(g, 'localStorage', { value: { getItem: () => null }, configurable: true });
    Object.defineProperty(g, 'navigator', { value: { language: 'th-TH' }, configurable: true });
    assert.equal(detectLang(), 'th');
    Object.defineProperty(g, 'navigator', { value: { language: 'fr' }, configurable: true });
    assert.equal(detectLang(), 'en');
    Object.defineProperty(g, 'localStorage', { value: { getItem: () => { throw new Error('blocked'); } }, configurable: true });
    Object.defineProperty(g, 'navigator', { value: { language: 'th' }, configurable: true });
    assert.equal(detectLang(), 'th');
  } finally {
    for (const [k, d] of [['localStorage', saved.ls], ['navigator', saved.nav]]) {
      if (d) Object.defineProperty(g, k, d); else delete g[k];
    }
  }
});
