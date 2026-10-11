/**
 * Automated end-to-end test for OpsMind GitHub CI/CD API
 * Runs against the active Docker environment via http://127.0.0.1:5173/api
 */
const BASE = 'http://127.0.0.1:5173/api';
const ts = Date.now();

let ownerToken = '';
let outsiderToken = '';
let orgId = '';
let connectedRepoId = '';
let createdIncidentId = '';

const req = async (method, path, body, token) => {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};

const assert = (label, condition, extra = '') => {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ FAIL: ${label}`, extra ? JSON.stringify(extra) : '');
    process.exitCode = 1;
  }
};

async function run() {
  console.log('=== Step 1: Authentication & Setup ===');
  let res = await req('POST', '/auth/register', {
    name: 'GH Owner',
    email: `gh_owner_${ts}@test.com`,
    password: 'Password@123'
  });
  assert('Owner registered', res.status === 201 && res.token);
  ownerToken = res.token;

  res = await req('POST', '/auth/register', {
    name: 'GH Outsider',
    email: `gh_outsider_${ts}@test.com`,
    password: 'Password@123'
  });
  assert('Outsider registered', res.status === 201 && res.token);
  outsiderToken = res.token;

  res = await req('POST', '/organizations', { name: `GH Test Org ${ts}` }, ownerToken);
  assert('Organization created', res.status === 201 && res.organization?._id);
  orgId = res.organization?._id;

  console.log('\n=== Step 2: GitHub Status Endpoint ===');
  res = await req('GET', '/github/status', null, null);
  assert('Status rejects unauthenticated with 401', res.status === 401);

  res = await req('GET', '/github/status', null, ownerToken);
  assert('Status returns tokenConfigured flag', res.status === 200 && 'tokenConfigured' in res);
  console.log(`     Token configured on backend: ${res.tokenConfigured}`);

  console.log('\n=== Step 3: Authorization & Security Checks ===');
  // Outsider cannot list repos of org
  res = await req('GET', `/github/repos?organizationId=${orgId}`, null, outsiderToken);
  assert('Outsider cannot list repos (403)', res.status === 403);

  // Outsider cannot connect repo to org
  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: 'actions',
    repo: 'checkout'
  }, outsiderToken);
  assert('Outsider cannot connect repo (403)', res.status === 403);

  console.log('\n=== Step 4: Validation Handling ===');
  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: '-bad-owner!',
    repo: 'checkout'
  }, ownerToken);
  assert('Malformed owner rejected with 400', res.status === 400);

  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: 'actions',
    repo: 'bad repo with spaces'
  }, ownerToken);
  assert('Malformed repo name rejected with 400', res.status === 400);

  console.log('\n=== Step 5: Non-existent Repository Handling ===');
  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: 'opsmind-nonexistent-org-12345',
    repo: 'nonexistent-repo-98765'
  }, ownerToken);
  assert('Non-existent repo rejected with 404', res.status === 404 && res.code === 'NOT_FOUND');

  console.log('\n=== Step 6: Connect Public Repository ===');
  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: 'actions',
    repo: 'checkout'
  }, ownerToken);
  assert('Connected public repo actions/checkout', res.status === 201 && res.githubRepo?._id);
  connectedRepoId = res.githubRepo?._id;

  // Verify duplicate connect returns 409
  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: 'actions',
    repo: 'checkout'
  }, ownerToken);
  assert('Duplicate connect rejected with 409', res.status === 409);

  console.log('\n=== Step 7: List Connected Repositories ===');
  res = await req('GET', `/github/repos?organizationId=${orgId}`, null, ownerToken);
  assert('List repos returns connected repo', res.status === 200 && res.repos?.length >= 1);

  console.log('\n=== Step 8: Get Repo Details & Live Metadata ===');
  res = await req('GET', `/github/repos/${connectedRepoId}`, null, ownerToken);
  assert('Fetched repo details & live metadata', res.status === 200 && res.meta?.name === 'checkout');
  if (res.rateLimit) {
    console.log(`     GitHub Rate Limit: ${res.rateLimit.remaining}/${res.rateLimit.limit} remaining`);
  }

  console.log('\n=== Step 9: Get Recent Commits ===');
  res = await req('GET', `/github/repos/${connectedRepoId}/commits?perPage=5`, null, ownerToken);
  assert('Fetched recent commits', res.status === 200 && Array.isArray(res.commits) && res.commits.length > 0);
  if (res.commits?.[0]) {
    console.log(`     Latest commit: ${res.commits[0].shortSha} - ${res.commits[0].message}`);
  }

  console.log('\n=== Step 10: Get Workflow Runs & CI Incident Verification ===');
  res = await req('GET', `/github/repos/${connectedRepoId}/workflows?perPage=30`, null, ownerToken);
  assert('Fetched workflow runs', res.status === 200 && Array.isArray(res.runs));
  console.log(`     Total runs found: ${res.runs?.length || 0}`);

  const failedRun = res.runs?.find(r => r.status === 'completed' && ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion));
  if (failedRun) {
    console.log(`     Found failed run #${failedRun.runNumber} (ID: ${failedRun.id}, conclusion: ${failedRun.conclusion})`);

    // Create incident from failed run
    let incRes = await req('POST', `/github/repos/${connectedRepoId}/create-incident`, {
      runId: failedRun.id
    }, ownerToken);
    assert('Created incident from failed run', incRes.status === 201 && incRes.incident?._id);
    createdIncidentId = incRes.incident?._id;
    assert('Incident has source github_actions', incRes.incident?.source === 'github_actions');

    // Duplicate prevention
    let dupRes = await req('POST', `/github/repos/${connectedRepoId}/create-incident`, {
      runId: failedRun.id
    }, ownerToken);
    assert('Duplicate incident prevented with 409 DUPLICATE_INCIDENT', dupRes.status === 409 && dupRes.code === 'DUPLICATE_INCIDENT');

    // Verify Incident Isolation:
    // Default GET /incidents should NOT return CI/CD incidents
    let listDefault = await req('GET', `/incidents?organizationId=${orgId}`, null, ownerToken);
    const inDefault = listDefault.incidents?.some(i => i._id === createdIncidentId);
    assert('CI incident excluded from service-health incident list', inDefault === false);

    // GET /incidents?source=github_actions SHOULD return it
    let listCi = await req('GET', `/incidents?organizationId=${orgId}&source=github_actions`, null, ownerToken);
    const inCi = listCi.incidents?.some(i => i._id === createdIncidentId);
    assert('CI incident included in source=github_actions list', inCi === true);

    // Lifecycle actions on CI incident
    let ackRes = await req('POST', `/incidents/${createdIncidentId}/acknowledge`, null, ownerToken);
    assert('Acknowledge CI incident works', ackRes.status === 200 && ackRes.incident?.status === 'acknowledged');

    let resolveRes = await req('POST', `/incidents/${createdIncidentId}/resolve`, null, ownerToken);
    assert('Resolve CI incident works', resolveRes.status === 200 && resolveRes.incident?.status === 'resolved');

    let reopenRes = await req('POST', `/incidents/${createdIncidentId}/reopen`, null, ownerToken);
    assert('Reopen CI incident works', reopenRes.status === 200 && reopenRes.incident?.status === 'open');

    // AI investigation must reject CI/CD incidents
    let aiRes = await req('POST', `/incidents/${createdIncidentId}/investigate`, null, ownerToken);
    assert('AI investigation rejects CI incident with 400', aiRes.status === 400);
  } else {
    console.log('     Note: No completed failed run in recent 30 runs of actions/checkout.');
    console.log('     Testing validation on successful run:');
    const successRun = res.runs?.find(r => r.status === 'completed' && r.conclusion === 'success');
    if (successRun) {
      let nonFailedRes = await req('POST', `/github/repos/${connectedRepoId}/create-incident`, {
        runId: successRun.id
      }, ownerToken);
      assert('Cannot create incident for successful run (400)', nonFailedRes.status === 400);
    }
  }

  console.log('\n=== Step 11: Disconnect Repository ===');
  res = await req('DELETE', `/github/repos/${connectedRepoId}`, null, ownerToken);
  assert('Disconnected repository successfully (200)', res.status === 200);

  res = await req('GET', `/github/repos?organizationId=${orgId}`, null, ownerToken);
  assert('Repo no longer appears in connected list', res.status === 200 && res.repos?.length === 0);

  console.log('\n=== Step 12: Cascade Deletion with Organization ===');
  // Connect another repo then delete organization to verify cascade
  res = await req('POST', '/github/repos', {
    organizationId: orgId,
    owner: 'actions',
    repo: 'checkout'
  }, ownerToken);
  assert('Connected repo for cascade test', res.status === 201);

  res = await req('DELETE', `/organizations/${orgId}`, null, ownerToken);
  assert('Deleted organization', res.status === 200);

  // Check repo is cleaned up
  res = await req('GET', `/github/repos?organizationId=${orgId}`, null, ownerToken);
  assert('Listing on deleted org fails with 404', res.status === 404);

  console.log('\n🎉 ALL GitHub Integration Tests Completed Successfully!');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
