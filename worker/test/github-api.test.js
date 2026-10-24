import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubClient } from '../src/github.js';

const recorder = () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ object: { sha: 'a' }, tree: { sha: 'b' }, data: { repository: { articles: null, site: null } } }), { status: 200 });
  };
  return { urls, fetch };
};

test('GitHub calls go to api.github.com unless GITHUB_API is set', async () => {
  const r = recorder();
  const gh = githubClient({ REPO: 'o/r', GITHUB_TOKEN: 't', GITHUB_FETCH: r.fetch });
  await gh.getHead();
  await gh.getContent('abc');
  assert.ok(r.urls[0].startsWith('https://api.github.com/repos/o/r/git/ref/heads/main'));
  assert.equal(r.urls.at(-1), 'https://api.github.com/graphql');
});

test('GITHUB_API redirects REST and GraphQL calls (local fake only)', async () => {
  const r = recorder();
  const gh = githubClient({ REPO: 'o/r', GITHUB_TOKEN: 't', GITHUB_API: 'http://127.0.0.1:8788/', GITHUB_FETCH: r.fetch });
  await gh.getHead();
  await gh.getContent('abc');
  assert.ok(r.urls[0].startsWith('http://127.0.0.1:8788/repos/o/r/git/ref/heads/main'));
  assert.equal(r.urls.at(-1), 'http://127.0.0.1:8788/graphql');
});
