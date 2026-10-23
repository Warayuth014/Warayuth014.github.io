// Minimal GitHub Git Data API client. The token only ever leaves in the Authorization header;
// errors carry the HTTP status, never the response body.
import { toB64 } from './auth.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status) {
    super(`GitHub request failed (${status})`);
    this.name = 'GitHubError';
    this.status = status;
  }
}

const utf8ToB64 = (text) => toB64(new TextEncoder().encode(text));

// One request reads every article file and site.json at a commit (subrequests must not grow with article count).
const CONTENT_QUERY = `query($owner:String!,$name:String!,$arts:String!,$site:String!){
  repository(owner:$owner,name:$name){
    articles: object(expression:$arts){ ... on Tree { entries { name type object { ... on Blob { text isTruncated } } } } }
    site: object(expression:$site){ ... on Blob { text isTruncated } }
  }
}`;

export function githubClient(env) {
  const doFetch = env.GITHUB_FETCH ?? ((...a) => globalThis.fetch(...a));
  const base = `${API}/repos/${env.REPO}`;
  const branch = env.BRANCH || 'main';

  async function call(method, path, body) {
    let res;
    try {
      res = await doFetch(path.startsWith('https://') ? path : `${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': 'warayuth-site-editor',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new GitHubError(0);
    }
    if (!res.ok) throw new GitHubError(res.status);
    return res.json();
  }

  return {
    /** { commitSha, treeSha } of the branch head */
    async getHead() {
      const ref = await call('GET', `/git/ref/heads/${branch}`);
      const commitSha = ref?.object?.sha;
      const commit = await call('GET', `/git/commits/${commitSha}`);
      return { commitSha, treeSha: commit?.tree?.sha };
    },
    /** Map of path -> blob sha for every file at the tree */
    async getFiles(treeSha) {
      const tree = await call('GET', `/git/trees/${treeSha}?recursive=1`);
      if (tree.truncated) throw new GitHubError(502);
      return new Map((tree.tree ?? []).filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
    },
    /**
     * { site: string|null, articles: [{name, text}] } at commit `commitSha` via ONE GraphQL request.
     * `articles` holds every file directly in content/articles (index.json included).
     * Fails closed (GitHubError) if any text came back truncated or GraphQL reported errors.
     */
    async getContent(commitSha) {
      const [owner, name] = String(env.REPO).split('/');
      const data = await call('POST', `${API}/graphql`, {
        query: CONTENT_QUERY,
        variables: { owner, name, arts: `${commitSha}:content/articles`, site: `${commitSha}:content/site.json` },
      });
      const repo = data?.data?.repository;
      if (!repo || data.errors) throw new GitHubError(502);
      const entries = (repo.articles?.entries ?? []).filter((e) => e.type === 'blob');
      if (entries.some((e) => !e.object || e.object.isTruncated || typeof e.object.text !== 'string')) throw new GitHubError(502);
      if (repo.site && (repo.site.isTruncated || typeof repo.site.text !== 'string')) throw new GitHubError(502);
      return { site: repo.site?.text ?? null, articles: entries.map((e) => ({ name: e.name, text: e.object.text })) };
    },
    /**
     * One commit on top of `head`: changes = [{path, text} | {path, base64} | {path, delete: true}].
     * blobs -> tree (base_tree = head tree, deletions as sha:null) -> commit -> PATCH ref (no force).
     * Resolves to the new commit sha; a lost race rejects with a GitHubError whose `conflict` is true.
     */
    async commit(head, changes, message) {
      const entries = [];
      for (const c of changes) {
        if (c.delete) {
          entries.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
        } else {
          const blob = await call('POST', '/git/blobs', { content: c.base64 ?? utf8ToB64(c.text), encoding: 'base64' });
          entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
        }
      }
      const tree = await call('POST', '/git/trees', { base_tree: head.treeSha, tree: entries });
      const commit = await call('POST', '/git/commits', { message, tree: tree.sha, parents: [head.commitSha] });
      try {
        await call('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
      } catch (e) {
        if (e instanceof GitHubError && e.status === 422) e.conflict = true; // head moved: not a fast-forward
        throw e;
      }
      return commit.sha;
    },
  };
}
