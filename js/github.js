// Thin wrapper over the GitHub Contents API. The token is only ever placed in the
// Authorization header — never in URLs, never logged, never included in errors.

// RQ_API_BASE lets the test harness point at a local mock; normal use never sets it.
const API = globalThis.RQ_API_BASE || 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  get isConflict() { return this.status === 409 || this.status === 422; }
  get isAuth() { return this.status === 401 || this.status === 403; }
  get isNetwork() { return this.status === 0; }
}

function headers(token, extra = {}) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request(url, { token, method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: headers(token, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError(0, 'Network unavailable');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch { /* ignore */ }
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') msg = 'GitHub rate limit reached';
    throw new GitHubError(res.status, msg);
  }
  return res.json();
}

// UTF-8 safe base64 (names like "Edamamé" and emoji in notes).
export function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const contentsUrl = ({ owner, repo }, path) =>
  `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;

/** Read a JSON file. Returns { doc, sha }. */
export async function getJson(repoCfg, path, token) {
  const data = await request(`${contentsUrl(repoCfg, path)}?ref=${encodeURIComponent(repoCfg.branch)}`, { token });
  return { doc: JSON.parse(decodeBase64(data.content)), sha: data.sha };
}

/** Write a JSON file with optimistic concurrency on `sha`. Returns the new sha. */
export async function putJson(repoCfg, path, doc, sha, message, token) {
  const data = await request(contentsUrl(repoCfg, path), {
    token,
    method: 'PUT',
    body: {
      message,
      content: encodeBase64(JSON.stringify(doc, null, 2) + '\n'),
      sha,
      branch: repoCfg.branch,
    },
  });
  return data.content.sha;
}

/** For Settings → Test connection. Reports what this token can see/do. */
export async function testConnection(repoCfg, token) {
  const repo = await request(
    `${API}/repos/${encodeURIComponent(repoCfg.owner)}/${encodeURIComponent(repoCfg.repo)}`,
    { token },
  );
  // Proves the Contents permission specifically, not just repo metadata.
  await getJson(repoCfg, 'data/visits.json', token);
  return { canRead: true, canPush: !!repo.permissions?.push, private: repo.private };
}
