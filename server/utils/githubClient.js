/**
 * GitHub REST API client. GITHUB_TOKEN is read at call time and only sent to
 * api.github.com in the Authorization header. Never logged or returned.
 */
const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 10_000;
const PER_PAGE = 30;

class GitHubError extends Error {
  constructor(message, { code, status, resetAt = null }) {
    super(message);
    this.name = 'GitHubError';
    this.code = code; // NOT_FOUND | RATE_LIMITED | BAD_CREDENTIALS | FORBIDDEN | CONFLICT | TIMEOUT | NETWORK | UPSTREAM
    this.status = status;
    this.resetAt = resetAt;
  }
}

const getToken = () => (process.env.GITHUB_TOKEN || '').trim();
const isTokenConfigured = () => getToken().length > 0;
const authHeader = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readRateLimit = (headers) => {
  const num = (name) => {
    const v = headers.get(name);
    return v === null || v === '' ? null : Number(v);
  };
  const limit = num('x-ratelimit-limit');
  const remaining = num('x-ratelimit-remaining');
  const reset = num('x-ratelimit-reset');
  if (limit === null && remaining === null && reset === null) return null;
  return { limit, remaining, resetAt: reset ? new Date(reset * 1000).toISOString() : null };
};

// GitHub reports rate limiting as HTTP 403 (not 429) with x-ratelimit-remaining: 0.
const isRateLimited = (res, body) => {
  if (res.status !== 403 && res.status !== 429) return false;
  if (res.status === 429) return true;
  if (res.headers.get('x-ratelimit-remaining') === '0') return true;
  if (res.headers.get('retry-after')) return true;
  return /rate limit/i.test(body?.message || '');
};

const resetDate = (res) => {
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  if (reset) return new Date(reset * 1000);
  const retryAfter = Number(res.headers.get('retry-after'));
  if (retryAfter) return new Date(Date.now() + retryAfter * 1000);
  return null;
};

const toGitHubError = async (res) => {
  const body = await res.json().catch(() => ({}));

  if (isRateLimited(res, body)) {
    return new GitHubError('GitHub API rate limit exceeded', {
      code: 'RATE_LIMITED', status: res.status, resetAt: resetDate(res)
    });
  }
  switch (res.status) {
    case 401:
      return new GitHubError('GitHub rejected the configured credentials', { code: 'BAD_CREDENTIALS', status: 401 });
    case 403:
      return new GitHubError('GitHub denied access to this resource', { code: 'FORBIDDEN', status: 403 });
    case 404:
      return new GitHubError('Not found', { code: 'NOT_FOUND', status: 404 });
    case 409:
      return new GitHubError(body.message || 'Conflict', { code: 'CONFLICT', status: 409 });
    default:
      return new GitHubError(`GitHub API error (HTTP ${res.status})`, { code: 'UPSTREAM', status: res.status });
  }
};

const ghFetch = async (path) => {
  let res;
  try {
    res = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'OpsMind',
        ...authHeader()
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new GitHubError('Timed out contacting GitHub', { code: 'TIMEOUT' });
    }
    throw new GitHubError('Could not reach GitHub', { code: 'NETWORK' });
  }

  if (!res.ok) throw await toGitHubError(res);

  const data = await res.json();
  return { data, rateLimit: readRateLimit(res.headers) };
};

const repoPath = (owner, repo) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

const getRepo = (owner, repo) => ghFetch(repoPath(owner, repo));
const getCommits = (owner, repo, perPage = PER_PAGE) =>
  ghFetch(`${repoPath(owner, repo)}/commits?per_page=${Number(perPage)}`);
const getWorkflowRuns = (owner, repo, perPage = PER_PAGE) =>
  ghFetch(`${repoPath(owner, repo)}/actions/runs?per_page=${Number(perPage)}`);
const getWorkflowRun = (owner, repo, runId) =>
  ghFetch(`${repoPath(owner, repo)}/actions/runs/${encodeURIComponent(String(runId))}`);

module.exports = { GitHubError, getRepo, getCommits, getWorkflowRuns, getWorkflowRun, isTokenConfigured };