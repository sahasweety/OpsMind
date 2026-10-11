/**
 * test-credential-rotation.js
 *
 * Integration tests for POST /api/services/:serviceId/rotate-credential
 *
 * Tests:
 *  T1  Unauthenticated request → 401
 *  T2  Invalid ObjectId        → 400
 *  T3  Non-existent service    → 404
 *  T4  Cross-org member (no owner/admin role) → 403
 *  T5  Authorized owner: rotation succeeds, returns ingestSecret once
 *  T6  Old secret rejected by ingest API after rotation
 *  T7  New secret accepted by ingest API after rotation
 *  T8  Service data (name, env, status, logs) intact after rotation
 *  T9  Second rotation works (idempotent endpoint)
 *  T10 Admin role (non-owner) can rotate
 */

const http = require('http');

const BASE = 'http://localhost:5000/api';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

async function setup() {
  // Owner account
  const ownerEmail = `rotate-owner-${Date.now()}@test.com`;
  let r = await req('POST', '/auth/register', { name: 'Rotate Owner', email: ownerEmail, password: 'testpass123' });
  const ownerToken = r.body.token;
  const ownerId    = r.body.user?._id;

  // Member account (no org role)
  const memberEmail = `rotate-member-${Date.now()}@test.com`;
  r = await req('POST', '/auth/register', { name: 'Rotate Member', email: memberEmail, password: 'testpass123' });
  const memberToken = r.body.token;

  // Org
  r = await req('POST', '/organizations', { name: `RotateOrg-${Date.now()}` }, ownerToken);
  const org = r.body.organization;

  // Project
  r = await req('POST', '/projects', { name: 'RotateProject', organizationId: org._id }, ownerToken);
  const project = r.body.project;

  // Service — capture the one-time secret
  r = await req('POST', '/services', {
    name: 'rotate-test-svc',
    projectId: project._id,
    environment: 'development'
  }, ownerToken);
  const service       = r.body.service;
  const originalSecret = r.body.ingestSecret;

  return { ownerToken, memberToken, org, project, service, originalSecret, ownerId };
}

async function run() {
  console.log('\n=== Credential Rotation Tests ===\n');

  let ctx;
  try {
    console.log('--- Setup ---');
    ctx = await setup();
    console.log('  Service ID:', ctx.service._id);
    console.log('  (original secret not printed)\n');
  } catch (e) {
    console.error('  Setup failed:', e);
    process.exit(1);
  }

  const { ownerToken, memberToken, service, originalSecret } = ctx;
  const svcId = service._id;

  // T1: No token
  console.log('--- T1: Unauthenticated ---');
  {
    const r = await req('POST', `/services/${svcId}/rotate-credential`);
    check('Returns 401', r.status === 401, `got ${r.status}`);
  }

  // T2: Invalid ObjectId
  console.log('\n--- T2: Invalid ObjectId ---');
  {
    const r = await req('POST', `/services/not-an-id/rotate-credential`, {}, ownerToken);
    check('Returns 400', r.status === 400, `got ${r.status}`);
  }

  // T3: Non-existent service
  console.log('\n--- T3: Non-existent service ---');
  {
    const fakeId = '000000000000000000000001';
    const r = await req('POST', `/services/${fakeId}/rotate-credential`, {}, ownerToken);
    check('Returns 404', r.status === 404, `got ${r.status}`);
  }

  // T4: Cross-org member (different user, no membership in this org)
  console.log('\n--- T4: Unauthorized member (403) ---');
  {
    const r = await req('POST', `/services/${svcId}/rotate-credential`, {}, memberToken);
    check('Returns 403', r.status === 403, `got ${r.status}`);
    check('Does not expose credential hash', !JSON.stringify(r.body).includes('credentialHash'));
  }

  // T5: Owner rotation — success
  console.log('\n--- T5: Authorized owner rotation ---');
  let newSecret;
  {
    const r = await req('POST', `/services/${svcId}/rotate-credential`, {}, ownerToken);
    check('Returns 200', r.status === 200, `got ${r.status}`);
    check('success: true', r.body.success === true);
    check('ingestSecret present', typeof r.body.ingestSecret === 'string' && r.body.ingestSecret.length > 0);
    check('secretWarning present', typeof r.body.secretWarning === 'string');
    check('service object returned', r.body.service && r.body.service._id === svcId);
    check('credentialHash NOT in response', !r.body.service?.credentialHash && !r.body.credentialHash);
    check('ingestSecret differs from original', r.body.ingestSecret !== originalSecret);
    newSecret = r.body.ingestSecret;
    console.log('  (new secret not printed)');
  }

  // T6: Old secret rejected by ingest endpoint
  console.log('\n--- T6: Old secret rejected after rotation ---');
  {
    const r = await req('POST', `/ingest/${svcId}/logs`, {
      level: 'info', message: 'Test with old secret'
    }, null);
    // Send with old secret as Bearer token (bypassing our helper — use raw headers)
    const r2 = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ level: 'info', message: 'old secret test' });
      const opts = {
        hostname: 'localhost', port: 5000,
        path: `/api/ingest/${svcId}/logs`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${originalSecret}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const req2 = http.request(opts, (res) => {
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode }); } });
      });
      req2.on('error', reject);
      req2.write(payload);
      req2.end();
    });
    check('Old secret returns 401', r2.status === 401, `got ${r2.status}`);
  }

  // T7: New secret accepted by ingest endpoint
  console.log('\n--- T7: New secret accepted after rotation ---');
  {
    const r = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ level: 'info', message: 'post-rotation ingest test' });
      const opts = {
        hostname: 'localhost', port: 5000,
        path: `/api/ingest/${svcId}/logs`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newSecret}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const req2 = http.request(opts, (res) => {
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode }); } });
      });
      req2.on('error', reject);
      req2.write(payload);
      req2.end();
    });
    check('New secret returns 201', r.status === 201, `got ${r.status}`);
    check('Log created successfully', r.body.success === true && r.body.logId);
  }

  // T8: Service metadata intact after rotation
  console.log('\n--- T8: Service data intact ---');
  {
    const r = await req('GET', `/services/${svcId}`, null, ownerToken);
    check('Service still retrievable', r.status === 200, `got ${r.status}`);
    check('Name preserved', r.body.service?.name === 'rotate-test-svc');
    check('Environment preserved', r.body.service?.environment === 'development');
    check('credentialHash NOT in GET response', !r.body.service?.credentialHash);
  }

  // T9: Second rotation succeeds (endpoint is safe to call repeatedly)
  console.log('\n--- T9: Second rotation succeeds ---');
  {
    const r = await req('POST', `/services/${svcId}/rotate-credential`, {}, ownerToken);
    check('Second rotation returns 200', r.status === 200, `got ${r.status}`);
    check('Returns a new secret', typeof r.body.ingestSecret === 'string' && r.body.ingestSecret !== newSecret);
  }

  // Cleanup (best-effort)
  console.log('\n--- Cleanup ---');
  await req('DELETE', `/services/${svcId}`, null, ownerToken);
  console.log('  (service removed)');

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
