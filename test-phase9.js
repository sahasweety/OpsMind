/**
 * Phase 9 — Background Jobs & Socket.io Test Script
 */
const { io } = require('socket.io-client');
const BASE = 'http://localhost:5000/api';
const ts = Date.now();

let ownerToken = '', orgId = '', projectId = '', serviceId = '', ingestSecret = '';
let socket;

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
  let res = await r('POST', '/auth/register', { name: 'Owner', email: `owner${ts}@test.com`, password: 'Test@12345' });
  ownerToken = res.token;

  res = await r('POST', '/organizations', { name: `TestOrg${ts}` }, ownerToken);
  orgId = res.organization?._id;
  res = await r('POST', '/projects', { name: `TestProject${ts}`, organizationId: orgId }, ownerToken);
  projectId = res.project?._id;

  res = await r('POST', '/services', { name: 'Svc 1', projectId, environment: 'production' }, ownerToken);
  serviceId = res.service?._id;
  ingestSecret = res.ingestSecret;
}

async function runTests() {
  console.log('\n=== Phase 9 Backend Tests ===\n');
  await setup();

  console.log('\n--- T1: Connect Socket with JWT ---');
  socket = io('http://localhost:5000', {
    auth: { token: ownerToken }
  });

  await new Promise((resolve) => {
    socket.on('connect', () => {
      ok('Socket connected', true);
      resolve();
    });
    socket.on('connect_error', (err) => {
      ok('Socket connection failed', false, err.message);
      resolve();
    });
  });

  console.log('\n--- T2: Join Org Room & Receive Realtime Log ---');
  socket.emit('join_org', orgId);

  const logPromise = new Promise((resolve) => {
    socket.on('new_log', (log) => {
      ok('Received new_log event via socket', log.message === 'Test Realtime Log');
      resolve();
    });
  });

  // Give socket time to join room
  await new Promise(r => setTimeout(r, 500));

  await r('POST', `/ingest/${serviceId}/logs`, { level: 'info', message: 'Test Realtime Log' }, ingestSecret);

  // Wait max 3 seconds
  await Promise.race([
    logPromise,
    new Promise((_, r) => setTimeout(() => r(new Error('Timeout waiting for socket')), 3000))
  ]).catch(err => ok('Realtime log received', false, err.message));

  console.log('\n--- Cleanup ---');
  socket.disconnect();
  await r('DELETE', `/organizations/${orgId}`, null, ownerToken);
  console.log('\n=== Tests complete ===\n');
}

runTests().catch(console.error);
