/**
 * Shared validation for values that are interpolated into GitHub API paths.
 */
const OWNER_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const RUN_ID_RE = /^[1-9]\d{0,19}$/;

const isValidOwner = (owner) => typeof owner === 'string' && OWNER_RE.test(owner);

const isValidRepo = (repo) =>
    typeof repo === 'string' &&
    REPO_RE.test(repo) &&
    repo !== '.' &&
    repo !== '..' &&
    !repo.toLowerCase().endsWith('.git');

const isValidRunId = (runId) =>
    (typeof runId === 'string' || typeof runId === 'number') && RUN_ID_RE.test(String(runId));

module.exports = { OWNER_RE, REPO_RE, RUN_ID_RE, isValidOwner, isValidRepo, isValidRunId };