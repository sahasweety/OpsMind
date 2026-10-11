/**
 * Phase 8 — Backend test script
 * Run from OpsMind root: node test-phase8.js
 */
const BASE = 'http://localhost:5000/api';
const ts = Date.now();

let ownerToken = '', outsiderToken = '';
let orgId = '', projectId = '', serviceId = '', ingestSecret = '';

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

const ok = (label, cond, res = null) => {
  if (cond) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}`);
    if (res) console.error(`     Response: ${JSON.stringify(res)}`);
  }
};

async function setup() {
  console.log('--- Setup ---');
  let res;

  res = await r('POST', '/auth/register', { name: 'Owner', email: `owner${ts}@test.com`, password: 'Test@12345' });
  ownerToken = res.token;
  res = await r('POST', '/auth/register', { name: 'Outsider', email: `outsider${ts}@test.com`, password: 'Test@12345' });
  outsiderToken = res.token;

  res = await r('POST', '/organizations', { name: `TestOrg${ts}` }, ownerToken);
  orgId = res.organization?._id;
  res = await r('POST', '/projects', { name: `TestProject${ts}`, organizationId: orgId }, ownerToken);
  projectId = res.project?._id;

  res = await r('POST', '/services', { name: 'Svc 1', projectId, environment: 'production' }, ownerToken);
  serviceId = res.service?._id;
  ingestSecret = res.ingestSecret;
}

async function runTests() {
  console.log('\n=== Phase 8 Backend Tests ===\n');
  await setup();
  let res;

  // T1 - Trigger Incident
  console.log('\n--- T1: Trigger Incident ---');
  // Send 5 errors to trigger incident
  for (let i = 0; i < 5; i++) {
    await r('POST', `/ingest/${serviceId}/logs`, { level: 'error', message: `Error ${i}` }, ingestSecret);
  }

  res = await r('GET', `/incidents?organizationId=${orgId}`, null, ownerToken);
  ok('Get incidents success', res.success, res);
  ok('Incident was created', res.incidents && res.incidents.length === 1, res);

  const incidentId = res.incidents[0]._id;

  // T2 - View Incident Details
  console.log('\n--- T2: View Incident Details ---');
  res = await r('GET', `/incidents/${incidentId}`, null, ownerToken);
  ok('Get incident success', res.success, res);
  ok('Incident has evidence attached', res.incident?.evidence?.length > 0, res);

  // T3 - Deduplication
  console.log('\n--- T3: Deduplication ---');
  // Send 5 more errors
  for (let i = 5; i < 10; i++) {
    await r('POST', `/ingest/${serviceId}/logs`, { level: 'error', message: `Error ${i}` }, ingestSecret);
  }
  res = await r('GET', `/incidents?organizationId=${orgId}`, null, ownerToken);
  ok('Still only 1 open incident', res.incidents && res.incidents.length === 1, res);

  res = await r('GET', `/incidents/${incidentId}`, null, ownerToken);
  ok('Evidence count increased (max 50)', res.incident?.evidence?.length > 5, res);

  // T4 - Unauthorized access
  console.log('\n--- T4: Unauthorized access ---');
  res = await r('GET', `/incidents?organizationId=${orgId}`, null, outsiderToken);
  ok('Outsider rejected on list', res.status === 403, res);

  res = await r('GET', `/incidents/${incidentId}`, null, outsiderToken);
  ok('Outsider rejected on detail', res.status === 403, res);

  // Cleanup
  console.log('\n--- Cleanup ---');
  await r('DELETE', `/organizations/${orgId}`, null, ownerToken);
  console.log('\n=== Tests complete ===\n');
}

runTests().catch(console.error);
