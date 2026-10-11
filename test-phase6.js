/**
 * Phase 6 — Backend test script
 * Run from OpsMind root: node test-phase6.js
 * Server must be running on http://localhost:5000
 */
const BASE = 'http://localhost:5000/api';
const ts = Date.now();

let ownerToken = '', outsiderToken = '';
let orgId = '', projectId = '', serviceId = '', serviceId2 = '';

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

  // Register owner and outsider
  res = await r('POST', '/auth/register', { name: 'Owner', email: `owner${ts}@test.com`, password: 'Test@12345' });
  ownerToken = res.token;
  res = await r('POST', '/auth/register', { name: 'Outsider', email: `outsider${ts}@test.com`, password: 'Test@12345' });
  outsiderToken = res.token;

  // Create org + project as owner
  res = await r('POST', '/organizations', { name: `TestOrg${ts}` }, ownerToken);
  orgId = res.organization?._id;
  res = await r('POST', '/projects', { name: `TestProject${ts}`, organizationId: orgId }, ownerToken);
  projectId = res.project?._id;

  // Create two services
  res = await r('POST', '/services', { name: 'Svc 1', projectId, environment: 'production' }, ownerToken);
  serviceId = res.service?._id;
  res = await r('POST', '/services', { name: 'Svc 2', projectId, environment: 'development' }, ownerToken);
  serviceId2 = res.service?._id;

  // Set Svc 1 to 'down'
  await r('PATCH', `/services/${serviceId}/status`, { status: 'down' }, ownerToken);
}

async function runTests() {
  console.log('\n=== Phase 6 Backend Tests ===\n');
  await setup();
  let res;

  // T1 - Retrieve dashboard summary
  console.log('\n--- T1: Retrieve dashboard summary ---');
  res = await r('GET', '/dashboard/summary', null, ownerToken);
  ok('Success response', res.success);
  ok('Has summary object', !!res.summary);

  // T2 - Check totals
  console.log('\n--- T2: Correct totals ---');
  ok('Total services is 2', res.summary?.totalServices === 2, res.summary?.totalServices);
  ok('Prod env count is 1', res.summary?.environmentCounts?.production === 1);
  ok('Dev env count is 1', res.summary?.environmentCounts?.development === 1);
  ok('Down status count is 1', res.summary?.statusCounts?.down === 1);
  ok('Unknown status count is 1', res.summary?.statusCounts?.unknown === 1);

  // T3 - Check attention items
  console.log('\n--- T3: Attention items ---');
  ok('Has 1 attention item', res.summary?.attentionRequired?.length === 1);
  ok('Item has org name', !!res.summary?.attentionRequired[0]?.organization?.name);
  ok('Item has project name', !!res.summary?.attentionRequired[0]?.project?.name);
  ok('Item is Svc 1', res.summary?.attentionRequired[0]?._id === serviceId);

  // T4 - Cross-org isolation
  console.log('\n--- T4: Cross-org isolation ---');
  res = await r('GET', '/dashboard/summary', null, outsiderToken);
  ok('Outsider summary success', res.success);
  ok('Outsider has 0 services', res.summary?.totalServices === 0);

  // T5 - No secrets exposed
  console.log('\n--- T5: No secrets exposed ---');
  res = await r('GET', '/dashboard/summary', null, ownerToken);
  const jsonStr = JSON.stringify(res);
  ok('No credentialHash exposed', !jsonStr.includes('credentialHash'));

  // Cleanup
  console.log('\n--- Cleanup ---');
  await r('DELETE', `/organizations/${orgId}`, null, ownerToken);
  console.log('\n=== Tests complete ===\n');
}

runTests().catch(console.error);
