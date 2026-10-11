/**
 * Phase 4 — Backend test script
 * Run from the OpsMind root: node test-phase4.js
 * Requires the server to be running on http://localhost:5000
 */
const BASE = 'http://localhost:5000/api';

let user1Token = '';
let user2Token = '';
let orgId = '';
let projectId = '';
let user1Email = `test-u1-${Date.now()}@example.com`;
let user2Email = `test-u2-${Date.now()}@example.com`;

const req = async (method, path, body, token) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  return { status: res.status, ...json };
};

const assert = (label, condition, extra = '') => {
  if (condition) console.log(`  ✅ ${label}`);
  else console.error(`  ❌ ${label} ${extra}`);
};

async function run() {
  console.log('\n=== Phase 4 Backend Tests ===\n');

  // Setup: register two users
  console.log('--- Setup: Register two test users ---');
  let r = await req('POST', '/auth/register', { name: 'User One', email: user1Email, password: 'Test@12345' });
  assert('User1 registered', r.success, JSON.stringify(r));
  user1Token = r.token;

  r = await req('POST', '/auth/register', { name: 'User Two', email: user2Email, password: 'Test@12345' });
  assert('User2 registered', r.success, JSON.stringify(r));
  user2Token = r.token;

  // T1 — Authenticated user can create organization
  console.log('\n--- T1: Create organization ---');
  r = await req('POST', '/organizations', { name: 'Test Eng Team' }, user1Token);
  assert('Org created successfully', r.success, JSON.stringify(r));
  assert('Returns slug', !!r.organization?.slug, JSON.stringify(r));
  orgId = r.organization?._id;

  // T2 — Creator is owner and member
  console.log('\n--- T2: Creator is owner and member ---');
  r = await req('GET', `/organizations/${orgId}`, null, user1Token);
  assert('Org details accessible by owner', r.success);
  const ownerEntry = r.organization?.members?.find(m => m.role === 'owner');
  assert('Owner membership record exists', !!ownerEntry);

  // T3 — User can list their orgs
  console.log('\n--- T3: List organizations ---');
  r = await req('GET', '/organizations', null, user1Token);
  assert('List returns orgs', r.success && Array.isArray(r.organizations));
  assert('Created org appears in list', r.organizations?.some(o => o._id === orgId));

  // T4 — Unauthenticated access blocked
  console.log('\n--- T4: Unauthenticated blocked ---');
  r = await req('GET', '/organizations');
  assert('No token → 401', r.status === 401);

  // T5 — User2 cannot access User1 org
  console.log('\n--- T5: Cross-user org isolation ---');
  r = await req('GET', `/organizations/${orgId}`, null, user2Token);
  assert('User2 cannot access User1 org', r.status === 403);

  // T6 — Create project in org
  console.log('\n--- T6: Create project ---');
  r = await req('POST', '/projects', { name: 'Payment API', description: 'Test project', organizationId: orgId }, user1Token);
  assert('Project created', r.success, JSON.stringify(r));
  projectId = r.project?._id;

  // T7 — List projects for org
  console.log('\n--- T7: List projects ---');
  r = await req('GET', `/projects?organizationId=${orgId}`, null, user1Token);
  assert('Projects listed', r.success && Array.isArray(r.projects));
  assert('Created project in list', r.projects?.some(p => p._id === projectId));

  // T8 — User2 cannot view org projects
  console.log('\n--- T8: Cross-user project isolation ---');
  r = await req('GET', `/projects?organizationId=${orgId}`, null, user2Token);
  assert('User2 cannot list org projects', r.status === 403);

  // T9 — Regular member (user2) cannot update/delete project (user2 not a member at all, 403 expected)
  console.log('\n--- T9: Non-member cannot update/delete project ---');
  r = await req('PATCH', `/projects/${projectId}`, { name: 'Hacked' }, user2Token);
  assert('Non-member cannot update project', r.status === 403);
  r = await req('DELETE', `/projects/${projectId}`, null, user2Token);
  assert('Non-member cannot delete project', r.status === 403);

  // T10 — Owner (admin-equivalent) can update project
  console.log('\n--- T10: Owner can update project ---');
  r = await req('PATCH', `/projects/${projectId}`, { name: 'Updated Payment API', description: 'Updated' }, user1Token);
  assert('Owner updated project', r.success && r.project?.name === 'Updated Payment API', JSON.stringify(r));

  // T11 — Only org owner can delete org
  console.log('\n--- T11: Only owner can delete org ---');
  r = await req('DELETE', `/organizations/${orgId}`, null, user2Token);
  assert('User2 cannot delete User1 org', r.status === 403);

  // T12 — Invalid ObjectId returns 400
  console.log('\n--- T12: Invalid ObjectId ---');
  r = await req('GET', '/organizations/not-a-valid-id', null, user1Token);
  assert('Invalid org ID → 400', r.status === 400);
  r = await req('GET', '/projects/not-a-valid-id', null, user1Token);
  assert('Invalid project ID → 400', r.status === 400);

  // T13 — Deleting org cleans up projects
  console.log('\n--- T13: Deleting org cleans up projects ---');
  // First re-create a temp org and project to delete
  r = await req('POST', '/organizations', { name: 'Temp Org To Delete' }, user1Token);
  const tempOrgId = r.organization?._id;
  r = await req('POST', '/projects', { name: 'Temp Project', organizationId: tempOrgId }, user1Token);
  const tempProjectId = r.project?._id;
  r = await req('DELETE', `/organizations/${tempOrgId}`, null, user1Token);
  assert('Org deleted successfully', r.success);
  // Verify project is gone
  r = await req('GET', `/projects/${tempProjectId}`, null, user1Token);
  assert('Project removed with org', r.status === 404);

  // T14 — Existing auth endpoints still work
  console.log('\n--- T14: Existing auth endpoints ---');
  r = await req('POST', '/auth/login', { email: user1Email, password: 'Test@12345' });
  assert('Login still works', r.success && !!r.token);
  r = await req('GET', '/auth/me', null, user1Token);
  assert('/me still works', r.success && !!r.user);

  // Cleanup — delete main test org (and its project) created during tests
  console.log('\n--- Cleanup ---');
  r = await req('DELETE', `/organizations/${orgId}`, null, user1Token);
  assert('Test org cleaned up', r.success);

  console.log('\n=== Tests complete ===\n');
}

run().catch(console.error);
