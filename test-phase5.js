/**
 * Phase 5 — Backend test script
 * Run from OpsMind root: node test-phase5.js
 * Server must be running on http://localhost:5000
 */
const BASE = 'http://localhost:5000/api';
const ts = Date.now();

let ownerToken = '', memberToken = '', outsiderToken = '';
let orgId = '', projectId = '', serviceId = '';
let ingestSecret = '';

const r = async (method, path, body, token) => {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  return { status: res.status, ...json };
};

const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else console.error(`  ❌ ${label}`, extra ? JSON.stringify(extra) : '');
};

async function setup() {
  console.log('--- Setup ---');
  let res;

  // Register owner
  res = await r('POST', '/auth/register', { name: 'Owner', email: `owner${ts}@test.com`, password: 'Test@12345' });
  ok('Owner registered', res.success);
  ownerToken = res.token;

  // Register member (will be added manually to org in a real scenario;
  // for this test, register separately — they won't be an org member)
  res = await r('POST', '/auth/register', { name: 'Outsider', email: `outsider${ts}@test.com`, password: 'Test@12345' });
  ok('Outsider registered', res.success);
  outsiderToken = res.token;

  // Create org + project as owner
  res = await r('POST', '/organizations', { name: `TestOrg${ts}` }, ownerToken);
  ok('Org created', res.success);
  orgId = res.organization?._id;

  res = await r('POST', '/projects', { name: `TestProject${ts}`, organizationId: orgId }, ownerToken);
  ok('Project created', res.success);
  projectId = res.project?._id;
}

async function runTests() {
  console.log('\n=== Phase 5 Backend Tests ===\n');
  await setup();
  let res;

  // T1 — Owner can create a service
  console.log('\n--- T1: Owner creates service ---');
  res = await r('POST', '/services', {
    name: 'FinSight Backend',
    description: 'Finance API',
    projectId,
    environment: 'development'
  }, ownerToken);
  ok('Service created', res.success, res);
  serviceId = res.service?._id;
  ingestSecret = res.ingestSecret;
  ok('ingestSecret returned on creation', typeof ingestSecret === 'string' && ingestSecret.length === 64, res);
  ok('secretWarning included', !!res.secretWarning);

  // T2 — Service is attached to the correct project
  console.log('\n--- T2: Service attached to correct project ---');
  ok('service.project matches', res.service?.project === projectId, res.service?.project);

  // T3 — Initial status is unknown
  console.log('\n--- T3: Initial status is unknown ---');
  ok('status is unknown', res.service?.status === 'unknown', res.service?.status);

  // T4 — Raw credential returned only at creation
  console.log('\n--- T4: Raw credential returned only at creation ---');
  res = await r('GET', `/services/${serviceId}`, null, ownerToken);
  ok('GET does not expose ingestSecret', !res.ingestSecret && !res.service?.ingestSecret);

  // T5 — Only credentialHash stored (not raw secret)
  // We verify indirectly: the GET response should not include either ingestSecret or credentialHash
  console.log('\n--- T5: credentialHash not returned by API ---');
  ok('credentialHash absent in GET response', !res.service?.credentialHash);

  // T6 — List returns only requested project's services
  console.log('\n--- T6: List services scoped to project ---');
  res = await r('GET', `/services?projectId=${projectId}`, null, ownerToken);
  ok('List returns services', res.success && Array.isArray(res.services));
  ok('Listed service is in correct project', res.services?.every(s => s.project === projectId));
  ok('No credentialHash in list', res.services?.every(s => !s.credentialHash));

  // T7 — Members can VIEW (outsider is NOT a member, should get 403)
  //   We test what we can: owner can view
  console.log('\n--- T7: Owner can view services ---');
  res = await r('GET', `/services/${serviceId}`, null, ownerToken);
  ok('Owner can view service', res.success);

  // T8 — Outsider (non-member) cannot create, update, delete, or change status
  console.log('\n--- T8: Outsider cannot perform any operations ---');
  res = await r('POST', '/services', { name: 'Hack', projectId, environment: 'production' }, outsiderToken);
  ok('Outsider cannot create service', res.status === 403 || res.status === 404);

  res = await r('GET', `/services/${serviceId}`, null, outsiderToken);
  ok('Outsider cannot view service', res.status === 403);

  res = await r('PATCH', `/services/${serviceId}`, { name: 'Hacked' }, outsiderToken);
  ok('Outsider cannot update service', res.status === 403);

  res = await r('PATCH', `/services/${serviceId}/status`, { status: 'healthy' }, outsiderToken);
  ok('Outsider cannot change status', res.status === 403);

  res = await r('DELETE', `/services/${serviceId}`, null, outsiderToken);
  ok('Outsider cannot delete service', res.status === 403);

  // T9 — Owner (admin-equivalent) can perform permitted operations
  console.log('\n--- T9: Owner can update and change status ---');
  res = await r('PATCH', `/services/${serviceId}`, { name: 'FinSight Backend v2', environment: 'staging' }, ownerToken);
  ok('Owner can update service name+env', res.success && res.service?.name === 'FinSight Backend v2', res);
  ok('credentialHash absent in update response', !res.service?.credentialHash);

  res = await r('PATCH', `/services/${serviceId}/status`, { status: 'healthy' }, ownerToken);
  ok('Owner can change status to healthy', res.success && res.service?.status === 'healthy', res);

  // T10 — Cross-org user cannot access (outsider not in org)
  console.log('\n--- T10: Cross-org isolation ---');
  res = await r('GET', `/services?projectId=${projectId}`, null, outsiderToken);
  ok('Outsider cannot list project services', res.status === 403);

  // T11 — Invalid IDs return 400
  console.log('\n--- T11: Invalid ObjectIds → 400 ---');
  res = await r('POST', '/services', { name: 'X', projectId: 'bad-id', environment: 'production' }, ownerToken);
  ok('Invalid projectId → 400', res.status === 400);
  res = await r('GET', '/services/not-a-real-id', null, ownerToken);
  ok('Invalid serviceId → 400', res.status === 400);
  res = await r('GET', '/services?projectId=bad-id', null, ownerToken);
  ok('Invalid projectId in query → 400', res.status === 400);

  // T12 — Invalid environments and statuses are rejected
  console.log('\n--- T12: Invalid enum values rejected ---');
  res = await r('POST', '/services', { name: 'Test', projectId, environment: 'invalid-env' }, ownerToken);
  ok('Invalid environment rejected', res.status === 400);
  res = await r('PATCH', `/services/${serviceId}/status`, { status: 'flying' }, ownerToken);
  ok('Invalid status rejected', res.status === 400);

  // T13 — Unauthenticated requests rejected
  console.log('\n--- T13: Unauthenticated requests → 401 ---');
  res = await r('GET', `/services/${serviceId}`);
  ok('No token → 401', res.status === 401);
  res = await r('GET', '/services?projectId=' + projectId);
  ok('No token on list → 401', res.status === 401);

  // T14 — GET/list/update never expose raw or hash credentials
  console.log('\n--- T14: Credentials never exposed in GET/list/update ---');
  res = await r('GET', `/services/${serviceId}`, null, ownerToken);
  ok('GET: no ingestSecret', !res.ingestSecret && !res.service?.ingestSecret);
  ok('GET: no credentialHash', !res.service?.credentialHash);

  res = await r('GET', `/services?projectId=${projectId}`, null, ownerToken);
  const allClean = (res.services || []).every(s => !s.credentialHash && !s.ingestSecret);
  ok('LIST: no credential fields', allClean);

  res = await r('PATCH', `/services/${serviceId}`, { description: 'Updated desc' }, ownerToken);
  ok('PATCH: no ingestSecret in response', !res.service?.ingestSecret && !res.ingestSecret);
  ok('PATCH: no credentialHash in response', !res.service?.credentialHash);

  // T15 — Existing phase 4 tests still work (smoke test)
  console.log('\n--- T15: Existing auth/org/project endpoints still work ---');
  res = await r('GET', '/auth/me', null, ownerToken);
  ok('/api/auth/me works', res.success && !!res.user);
  res = await r('GET', '/organizations', null, ownerToken);
  ok('/api/organizations works', res.success);
  res = await r('GET', `/projects?organizationId=${orgId}`, null, ownerToken);
  ok('/api/projects works', res.success);

  // Cleanup
  console.log('\n--- Cleanup ---');
  res = await r('DELETE', `/services/${serviceId}`, null, ownerToken);
  ok('Service deleted', res.success);
  res = await r('DELETE', `/organizations/${orgId}`, null, ownerToken);
  ok('Org (and project) cleaned up', res.success);

  console.log('\n=== Tests complete ===\n');
}

runTests().catch(console.error);
