/**
 * Phase 7 — Backend test script
 * Run from OpsMind root: node test-phase7.js
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
  ingestSecret = res.ingestSecret; // The raw credential
}

async function runTests() {
  console.log('\n=== Phase 7 Backend Tests ===\n');
  await setup();
  let res;

  // T1 - Ingest valid log
  console.log('\n--- T1: Ingest valid log ---');
  res = await r('POST', `/ingest/${serviceId}/logs`, {
    level: 'error',
    message: 'Database connection failed',
    metadata: { code: 500 }
  }, ingestSecret);
  ok('Ingest success', res.status === 201 && res.success, res);
  ok('Log ID returned', !!res.logId, res);

  // T2 - Ingest invalid credential
  console.log('\n--- T2: Ingest invalid credential ---');
  res = await r('POST', `/ingest/${serviceId}/logs`, {
    level: 'info',
    message: 'Test'
  }, 'bad-secret');
  ok('Invalid credential rejected (401)', res.status === 401);

  // T3 - No credential
  console.log('\n--- T3: No credential ---');
  res = await r('POST', `/ingest/${serviceId}/logs`, {
    level: 'info',
    message: 'Test'
  });
  ok('No credential rejected (401)', res.status === 401);

  // T4 - Oversized payload (message > 10000 chars)
  console.log('\n--- T4: Oversized payload ---');
  const hugeMessage = 'A'.repeat(10001);
  res = await r('POST', `/ingest/${serviceId}/logs`, {
    level: 'info',
    message: hugeMessage
  }, ingestSecret);
  ok('Oversized payload rejected (400)', res.status === 400);

  // T5 - Malformed level
  console.log('\n--- T5: Malformed level ---');
  res = await r('POST', `/ingest/${serviceId}/logs`, {
    level: 'super-fatal',
    message: 'Oh no'
  }, ingestSecret);
  ok('Malformed level rejected (400)', res.status === 400);

  // T6 - Retrieve logs as owner
  console.log('\n--- T6: Retrieve logs as owner ---');
  res = await r('GET', `/services/${serviceId}/logs`, null, ownerToken);
  ok('Retrieve success', res.success, res);
  ok('Logs array returned', Array.isArray(res.logs), res);
  if (Array.isArray(res.logs)) {
    ok('Found the ingested log', res.logs.length === 1 && res.logs[0].message === 'Database connection failed');
  }

  // T7 - Unauthorized retrieval (outsider)
  console.log('\n--- T7: Unauthorized retrieval ---');
  res = await r('GET', `/services/${serviceId}/logs`, null, outsiderToken);
  ok('Outsider rejected (403)', res.status === 403);

  // Cleanup
  console.log('\n--- Cleanup ---');
  await r('DELETE', `/organizations/${orgId}`, null, ownerToken);
  console.log('\n=== Tests complete ===\n');
}

runTests().catch(console.error);
