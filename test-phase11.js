/**
 * Phase 11 — Incident Lifecycle & Security Hardening Test Script
 * Run from OpsMind root: node test-phase11.js
 */
const BASE = 'http://localhost:5000/api';
const ts = Date.now();

let ownerToken = '', outsiderToken = '';
let orgId = '', projectId = '', serviceId = '', ingestSecret = '';
let incidentId = '';

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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};

const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${label}`);
  else console.error(`  ❌ ${label}`, extra ? JSON.stringify(extra) : '');
};

async function setup() {
  console.log('--- Setup ---');
  let res;

  // Register owner & outsider
  res = await r('POST', '/auth/register', { name: 'Owner11', email: `owner11_${ts}@test.com`, password: 'Test@12345' });
  ownerToken = res.token;
  res = await r('POST', '/auth/register', { name: 'Outsider11', email: `outsider11_${ts}@test.com`, password: 'Test@12345' });
  outsiderToken = res.token;

  // Create Org, Project, Service
  res = await r('POST', '/organizations', { name: `TestOrg11_${ts}` }, ownerToken);
  orgId = res.organization?._id;
  res = await r('POST', '/projects', { name: `TestProj11_${ts}`, organizationId: orgId }, ownerToken);
  projectId = res.project?._id;
  res = await r('POST', '/services', { name: 'Svc 11', projectId, environment: 'production' }, ownerToken);
  serviceId = res.service?._id;
  ingestSecret = res.ingestSecret;

  // Ingest logs to trigger 3 incidents for pagination
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 5; i++) {
      await r('POST', `/ingest/${serviceId}/logs`, { level: 'error', message: `Test error log ${j}-${i+1}` }, ingestSecret);
    }
    // resolve to reset the detection trigger so a new one is created next iteration
    const curInc = (await r('GET', `/incidents?organizationId=${orgId}`, null, ownerToken)).incidents[0];
    if (curInc && curInc.status !== 'resolved') {
        await r('POST', `/incidents/${curInc._id}/resolve`, null, ownerToken);
    }
  }

  // Trigger one last OPEN incident
  for (let i = 0; i < 5; i++) {
    await r('POST', `/ingest/${serviceId}/logs`, { level: 'error', message: `Test error log OPEN-${i+1}` }, ingestSecret);
  }

  // Fetch the incidents
  res = await r('GET', `/incidents?organizationId=${orgId}`, null, ownerToken);
  const openIncident = res.incidents.find(inc => inc.status === 'open');
  incidentId = openIncident._id;
}

async function runTests() {
  console.log('\n=== Phase 11 Backend Tests ===\n');
  await setup();
  let res;

  // T1: Unauthenticated request rejected
  console.log('\n--- T1: Unauthenticated request rejected ---');
  res = await r('POST', `/incidents/${incidentId}/acknowledge`);
  ok('Rejected with 401', res.status === 401);

  // T2: Cross-organization access rejected
  console.log('\n--- T2: Cross-organization access rejected ---');
  res = await r('POST', `/incidents/${incidentId}/acknowledge`, null, outsiderToken);
  ok('Rejected with 403', res.status === 403);

  // T3: Invalid and nonexistent incident IDs handled
  console.log('\n--- T3: Invalid incident IDs handled ---');
  res = await r('POST', `/incidents/invalid_id/acknowledge`, null, ownerToken);
  ok('Rejected with 400', res.status === 400);

  // T4: Authorized user can acknowledge
  console.log('\n--- T4: Authorized user can acknowledge ---');
  res = await r('POST', `/incidents/${incidentId}/acknowledge`, null, ownerToken);
  ok('Acknowledge success (200)', res.success && res.status === 200);
  ok('Status is acknowledged', res.incident?.status === 'acknowledged');
  ok('Audit history appended', res.incident?.statusHistory?.length > 0);
  ok('acknowledgedAt set', !!res.incident?.acknowledgedAt);

  // T5: Repeating transition rejected (400)
  console.log('\n--- T5: Repeating transition rejected ---');
  res = await r('POST', `/incidents/${incidentId}/acknowledge`, null, ownerToken);
  ok('Rejected duplicate transition (400)', res.status === 400);

  // T6: Resolve incident
  console.log('\n--- T6: Resolve incident ---');
  res = await r('POST', `/incidents/${incidentId}/resolve`, null, ownerToken);
  ok('Resolve success (200)', res.success && res.status === 200);
  ok('Status is resolved', res.incident?.status === 'resolved');
  ok('resolvedAt set', !!res.incident?.resolvedAt);

  // T7: Reopen incident
  console.log('\n--- T7: Reopen incident ---');
  res = await r('POST', `/incidents/${incidentId}/reopen`, null, ownerToken);
  ok('Reopen success (200)', res.success && res.status === 200);
  ok('Status is open', res.incident?.status === 'open');
  ok('resolvedAt cleared', res.incident?.resolvedAt === null);

  // T8: Pagination and filtering
  console.log('\n--- T8: Pagination and metadata ---');
  res = await r('GET', `/incidents?organizationId=${orgId}&limit=2&page=1`, null, ownerToken);
  ok('List success', res.success && res.status === 200);
  ok('Pagination metadata returned', !!res.pagination);
  ok('Returns max limit incidents', res.incidents?.length <= 2);
  ok('Total count correct', res.pagination?.total === 4);

  // T9: Pagination handles invalid params safely
  console.log('\n--- T9: Pagination invalid params ---');
  res = await r('GET', `/incidents?organizationId=${orgId}&limit=9999&page=-5`, null, ownerToken);
  ok('Handles extreme pagination safely', res.success && res.status === 200);
  ok('Limit capped', res.pagination?.limit <= 100);
  ok('Page defaults to 1', res.pagination?.page === 1);

  // Cleanup
  console.log('\n--- Cleanup ---');
  await r('DELETE', `/organizations/${orgId}`, null, ownerToken);
  console.log('\n=== Tests complete ===\n');
}

runTests().catch(console.error);
