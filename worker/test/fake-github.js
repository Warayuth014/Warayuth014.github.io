// Fake GitHub Git Data API (REST + the one GraphQL read the Worker uses), in memory.
// Used by the Worker tests (helpers.js) and by tools/fake-github.mjs, which serves it over HTTP.
import { createHash } from 'node:crypto';

const gitSha = (s) => createHash('sha1').update(s).digest('hex');

/** Fake GitHub. files: path -> string (utf8 text) or Buffer. */
export function fakeGitHub(initial = {}, { failRefPatch = 0, failAll = false } = {}) {
  const blobs = new Map(); // sha -> Buffer
  const trees = new Map(); // sha -> Map(path -> blobSha)
  const commits = new Map(); // sha -> {tree, parents}
  const calls = [];
  let n = 0;
  const addBlob = (buf) => { const sha = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex'); blobs.set(sha, buf); return sha; };
  const addTree = (map) => { const sha = gitSha(`tree${n += 1}`); trees.set(sha, map); return sha; };
  const addCommit = (tree, parents) => { const sha = gitSha(`commit${n += 1}`); commits.set(sha, { tree, parents }); return sha; };

  const t0 = new Map(Object.entries(initial).map(([p, c]) => [p, addBlob(Buffer.isBuffer(c) ? c : Buffer.from(c, 'utf8'))]));
  const state = { head: addCommit(addTree(t0), []) };
  const out = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, headers: init.headers });
    if (failAll) return out(500, { message: 'boom', leaked: init.headers.Authorization });
    let m;
    if (method === 'GET' && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path))) return out(200, { object: { sha: state.head } });
    if (method === 'GET' && (m = /^\/git\/commits\/(.+)$/.exec(path))) return out(200, { tree: { sha: commits.get(m[1]).tree } });
    if (method === 'GET' && (m = /^\/git\/trees\/(.+)$/.exec(path))) {
      return out(200, { truncated: false, tree: [...trees.get(m[1])].map(([p, sha]) => ({ path: p, type: 'blob', sha })) });
    }
    if (method === 'POST' && path === '/graphql') {
      const [commitSha, dir] = body.variables.arts.split(':');
      const tree = trees.get(commits.get(commitSha).tree);
      const text = (sha) => ({ text: blobs.get(sha).toString('utf8'), isTruncated: false });
      const entries = [...tree].filter(([p]) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
        .map(([p, sha]) => ({ name: p.slice(dir.length + 1), type: 'blob', object: text(sha) }));
      const siteSha = tree.get(body.variables.site.split(':')[1]);
      return out(200, { data: { repository: { articles: { entries }, site: siteSha ? text(siteSha) : null } } });
    }
    if (method === 'POST' && path === '/git/blobs') return out(201, { sha: addBlob(Buffer.from(body.content, 'base64')) });
    if (method === 'POST' && path === '/git/trees') {
      const next = new Map(trees.get(body.base_tree));
      for (const e of body.tree) { if (e.sha === null) next.delete(e.path); else next.set(e.path, e.sha); }
      return out(201, { sha: addTree(next) });
    }
    if (method === 'POST' && path === '/git/commits') return out(201, { sha: addCommit(body.tree, body.parents) });
    if (method === 'PATCH' && path.startsWith('/git/refs/heads/')) {
      if (failRefPatch > 0) { failRefPatch -= 1; return out(422, { message: 'Update is not a fast forward' }); }
      if (commits.get(body.sha).parents[0] !== state.head) return out(422, { message: 'Update is not a fast forward' });
      state.head = body.sha;
      return out(200, {});
    }
    return out(404, { message: 'unknown' });
  };

  return {
    fetch,
    calls,
    get head() { return state.head; },
    /** advance head with an unrelated commit (simulates a concurrent save) */
    bump() { const t = new Map(trees.get(commits.get(state.head).tree)); t.set('content/other.txt', addBlob(Buffer.from('x'))); state.head = addCommit(addTree(t), [state.head]); },
    files() { return new Map([...trees.get(commits.get(state.head).tree)].map(([p, s]) => [p, blobs.get(s)])); },
    text(p) { return this.files().get(p)?.toString('utf8'); },
    commitCount() { return calls.filter((c) => c.method === 'POST' && c.path === '/git/commits').length; },
    writes() { return calls.filter((c) => c.method !== 'GET' && c.path !== '/graphql'); },
  };
}
