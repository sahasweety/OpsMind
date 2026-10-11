import assert from 'node:assert/strict';
import {
  parseRepoInput,
  getRunState,
  isFailedRun,
  RUN_FILTERS,
  countByFilter,
  filterRuns,
  safeGithubUrl,
  formatDateTime,
  formatTime,
  timeAgo,
  runDuration,
  toApiError,
  isCanceled
} from './src/utils/github.js';

console.log('--- Testing client/src/utils/github.js ---');

// 1. parseRepoInput
assert.deepEqual(parseRepoInput('facebook/react'), { owner: 'facebook', repo: 'react' });
assert.deepEqual(parseRepoInput('https://github.com/facebook/react'), { owner: 'facebook', repo: 'react' });
assert.deepEqual(parseRepoInput('https://github.com/facebook/react.git'), { owner: 'facebook', repo: 'react' });
assert.deepEqual(parseRepoInput('git@github.com:facebook/react.git'), { owner: 'facebook', repo: 'react' });
assert.ok(parseRepoInput('').error, 'empty input should return error');
assert.ok(parseRepoInput('invalid-input').error, 'single segment should return error');
assert.ok(parseRepoInput('-invalid/repo').error, 'invalid owner should return error');

// 2. getRunState & isFailedRun
const successRun = { status: 'completed', conclusion: 'success' };
const failedRun = { status: 'completed', conclusion: 'failure' };
const timedOutRun = { status: 'completed', conclusion: 'timed_out' };
const startupFailureRun = { status: 'completed', conclusion: 'startup_failure' };
const inProgressRun = { status: 'in_progress' };
const queuedRun = { status: 'queued' };
const cancelledRun = { status: 'completed', conclusion: 'cancelled' };

assert.equal(getRunState(successRun).group, 'success');
assert.equal(getRunState(failedRun).group, 'failed');
assert.equal(getRunState(timedOutRun).group, 'failed');
assert.equal(getRunState(startupFailureRun).group, 'failed');
assert.equal(getRunState(inProgressRun).group, 'in_progress');
assert.equal(getRunState(queuedRun).group, 'queued');
assert.equal(getRunState(cancelledRun).group, 'cancelled');

assert.equal(isFailedRun(successRun), false);
assert.equal(isFailedRun(failedRun), true);
assert.equal(isFailedRun(timedOutRun), true);
assert.equal(isFailedRun(startupFailureRun), true);
assert.equal(isFailedRun(inProgressRun), false);

// 3. RUN_FILTERS, countByFilter, filterRuns
assert.ok(Array.isArray(RUN_FILTERS));
const sampleRuns = [successRun, failedRun, inProgressRun, queuedRun, cancelledRun];
const counts = countByFilter(sampleRuns);
assert.equal(counts.all, 5);
assert.equal(counts.success, 1);
assert.equal(counts.failed, 1);
assert.equal(counts.in_progress, 1);
assert.equal(counts.queued, 1);
assert.equal(counts.cancelled, 1);

assert.equal(filterRuns(sampleRuns, 'all').length, 5);
assert.equal(filterRuns(sampleRuns, 'failed').length, 1);
assert.equal(filterRuns(sampleRuns, 'success').length, 1);

// 4. safeGithubUrl
assert.equal(safeGithubUrl('https://github.com/expressjs/express'), 'https://github.com/expressjs/express');
assert.equal(safeGithubUrl('https://www.github.com/expressjs/express'), 'https://www.github.com/expressjs/express');
assert.equal(safeGithubUrl('http://github.com/foo/bar'), null, 'http should be rejected');
assert.equal(safeGithubUrl('javascript:alert(1)'), null, 'javascript scheme should be rejected');
assert.equal(safeGithubUrl('https://evil.com/foo/bar'), null, 'non-github domain should be rejected');

// 5. formatDateTime, formatTime, timeAgo, runDuration
assert.equal(formatDateTime(null), '—');
assert.ok(typeof formatDateTime('2026-01-01T00:00:00Z') === 'string');
assert.ok(typeof formatTime(new Date()) === 'string');
assert.equal(timeAgo(null), '—');
assert.equal(timeAgo(new Date(Date.now() - 10_000).toISOString()), 'just now');

const durationTest = {
  status: 'completed',
  startedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:02:15Z'
};
assert.equal(runDuration(durationTest), '2m 15s');

// 6. toApiError, isCanceled
const err = { response: { status: 404, data: { message: 'Not found', code: 'NOT_FOUND' } } };
const apiErr = toApiError(err);
assert.equal(apiErr.status, 404);
assert.equal(apiErr.message, 'Not found');
assert.equal(apiErr.code, 'NOT_FOUND');

assert.equal(isCanceled({ code: 'ERR_CANCELED' }), true);
assert.equal(isCanceled({ name: 'CanceledError' }), true);
assert.equal(isCanceled(new Error('other')), false);

console.log('✅ All client/src/utils/github.js tests passed!');
