import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, sanitizeRichText as s } from '../shared/sanitize.js';

test('escapeHtml escapes the five special characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});

test('safe markup is unchanged', () => {
  const ok = '<p>สวัสดี <strong>โลก</strong></p>';
  assert.equal(s(ok), ok);
  assert.equal(s('<h2>a</h2><ul><li>x</li></ul><pre><code>1 &lt; 2</code></pre><blockquote>q<br>r</blockquote>'),
    '<h2>a</h2><ul><li>x</li></ul><pre><code>1 &lt; 2</code></pre><blockquote>q<br>r</blockquote>');
});

test('img with a disallowed src is dropped; handlers never survive', () => {
  assert.equal(s('<img src=x onerror=alert(1)>'), '');
  assert.equal(s('<img src="javascript:alert(1)">'), '');
  assert.equal(s('<img src="//evil.com/a.png">'), '');
  assert.equal(s('<img src="/uploads/../secret.png">'), '');
  assert.equal(s('<img src="/uploads/a.png" onerror="alert(1)" alt="pic" style="x">'), '<img src="/uploads/a.png" alt="pic">');
  assert.equal(s("<img src='https://example.com/a.png'>"), '<img src="https://example.com/a.png">');
});

test('a: javascript/data/http hrefs removed; https gets rel+target', () => {
  assert.equal(s('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(s('<a href=" JaVa\tScRiPt:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(s('<a href="java&#115;cript&colon;alert(1)">x</a>'), '<a>x</a>');
  assert.equal(s('<a href="data:text/html,x">x</a>'), '<a>x</a>');
  assert.equal(s('<a href="http://example.com">x</a>'), '<a>x</a>');
  assert.equal(s('<a href="https://example.com/?a=1&b=2" onclick="x()" class="c">x</a>'),
    '<a href="https://example.com/?a=1&amp;b=2" rel="noopener noreferrer" target="_blank">x</a>');
  assert.equal(s('<a href="mailto:a@b.co">m</a>'), '<a href="mailto:a@b.co" rel="noopener noreferrer">m</a>');
});

test('script/style/iframe/object/embed/template content is dropped entirely', () => {
  assert.equal(s('<script>alert(1)</script>'), '');
  assert.equal(s('a<SCRIPT type="x">alert("</p>")</SCRIPT>b'), 'ab');
  assert.equal(s('<style>p{}</style><iframe src="x">hi</iframe><object>o</object><embed>e<template><p>t</p></template>z'), 'ez');
  assert.equal(s('x<script>never closed'), 'x');
});

test('unknown tags dropped but text kept and escaped', () => {
  assert.equal(s('<div><span>hi</span> <b>b</b></div>'), 'hi b');
  assert.equal(s('<marquee>a &lt; b</marquee>'), 'a &lt; b');
  assert.equal(s('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
  assert.equal(s('<p onclick="x" style="y">t</p>'), '<p>t</p>');
});

test('comments dropped', () => {
  assert.equal(s('a<!-- <script>x</script> -->b'), 'ab');
  assert.equal(s('a<!-- unterminated'), 'a');
});

test('malformed input becomes well-formed', () => {
  assert.equal(s('<p><strong>x</p>'), '<p><strong>x</strong></p>');
  assert.equal(s('<ul><li>a<li>b'), '<ul><li>a<li>b</li></li></ul>');
  assert.equal(s('</p>stray</strong>'), 'stray');
  assert.equal(s('<p>a<br/>b</p>'), '<p>a<br>b</p>');
  assert.equal(s('<p title="x'), '&lt;p title="x');
});

test('non-string input yields empty string', () => {
  assert.equal(s(undefined), '');
  assert.equal(s(42), '');
});

test('script close tag may have whitespace before ">"; "</scripts>" does not close', () => {
  assert.equal(s('a<script>x</script >b<p>after</p>'), 'ab<p>after</p>');
  assert.equal(s('a<script>x</script\n>b<p>after</p>'), 'ab<p>after</p>');
  assert.equal(s('a<script>x</scripts>y</script>b'), 'ab');
  assert.equal(s('a<script>x</scripts>y'), 'a');
});

test('pathological input sanitizes in linear time', () => {
  for (const unit of ['<a ', '<a "', '<script>', '<!-', "<a '", '<p title="']) {
    const input = unit.repeat(Math.ceil(100000 / unit.length)) + '>';
    const t0 = performance.now();
    s(input);
    const ms = performance.now() - t0;
    assert.ok(ms < 2000, `${JSON.stringify(unit)} took ${Math.round(ms)} ms`);
  }
  const closed = '<script>x</script>'.repeat(6000);
  const t0 = performance.now();
  assert.equal(s(closed), '');
  assert.ok(performance.now() - t0 < 2000);
});
