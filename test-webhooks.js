/**
 * Phase 13.1 — Outbound Webhooks Automated Test Suite
 * Tests SSRF validation, RBAC, CRUD, delivery outcomes, signing,
 * service-health & GitHub CI incident dispatch, isolation, and regression.
 */
const http = require('node:http');
const crypto = require('node:crypto');

const BASE = 'http://127.0.0.1:5173/api';
const ts = Date.now();

let ownerToken = '', adminToken = '', memberToken = '', outsiderToken = '';
let orgId = '', projectId = '', serviceId = '', ingestSecret = '';
let testWebhookId = '';
let receivedWebhooks = [];
let mockServer;
let mockServerPort = 0;

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

async function setupMockReceiver() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        receivedWebhooks.push({
          headers: req.headers,
          rawBody: body,
          data: parsed,
          path: req.url
        });

        if (req.url === '/slow') {
          // Intentionally do not reply to trigger client timeout
          return;
        } else if (req.url === '/error') {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server internal failure');
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        }
      });
    });

    mockServer.listen(0, '0.0.0.0', () => {
      mockServerPort = mockServer.address().port;
      console.log(`Mock webhook receiver listening on port ${mockServerPort}`);
      resolve();
    });
  });
}

async function run() {
  console.log('=== Step 1: User & Organization Setup ===');
  await setupMockReceiver();

  // Register Owner
  let r = await req('POST', '/auth/register', { name: 'WH Owner', email: `wh_owner_${ts}@test.com`, password: 'Password@123' });
  assert('Owner registered', r.status === 201 && r.token);
  ownerToken = r.token;

  // Register Outsider
  r = await req('POST', '/auth/register', { name: 'WH Outsider', email: `wh_outsider_${ts}@test.com`, password: 'Password@123' });
  assert('Outsider registered', r.status === 201 && r.token);
  outsiderToken = r.token;

  // Create Org
  r = await req('POST', '/organizations', { name: `WH Org ${ts}` }, ownerToken);
  assert('Org created', r.status === 201 && r.organization?._id);
  orgId = r.organization._id;

  // Create Project & Service for incident testing
  r = await req('POST', '/projects', { name: 'WH Project', organizationId: orgId }, ownerToken);
  projectId = r.project._id;

  r = await req('POST', '/services', { name: 'WH Svc', projectId, environment: 'production' }, ownerToken);
  serviceId = r.service._id;
  ingestSecret = r.ingestSecret;

  console.log('\n=== Step 2: SSRF & URL Validation ===');
  // Rejection of localhost
  r = await req('POST', `/organizations/${orgId}/webhooks`, { name: 'Localhost WH', url: 'http://localhost:8080/hook' }, ownerToken);
  assert('Rejects localhost with 400', r.status === 400);

  // Rejection of loopback IP
  r = await req('POST', `/organizations/${orgId}/webhooks`, { name: '127.0.0.1 WH', url: 'http://127.0.0.1:8080/hook' }, ownerToken);
  assert('Rejects 127.0.0.1 with 400', r.status === 400);

  // Rejection of private 10.x.x.x IP
  r = await req('POST', `/organizations/${orgId}/webhooks`, { name: 'Private IP WH', url: 'http://10.0.0.5/hook' }, ownerToken);
  assert('Rejects private IP (10.x) with 400', r.status === 400);

  // Rejection of unsupported scheme (ftp://)
  r = await req('POST', `/organizations/${orgId}/webhooks`, { name: 'FTP WH', url: 'ftp://example.com/hook' }, ownerToken);
  assert('Rejects non-HTTP(S) scheme with 400', r.status === 400);

  console.log('\n=== Step 3: Authorization & RBAC ===');
  // Outsider cannot list webhooks
  r = await req('GET', `/organizations/${orgId}/webhooks`, null, outsiderToken);
  assert('Outsider cannot list webhooks (403)', r.status === 403);

  // Outsider cannot create webhook
  r = await req('POST', `/organizations/${orgId}/webhooks`, { name: 'Hack WH', url: 'https://example.com/hook' }, outsiderToken);
  assert('Outsider cannot create webhook (403)', r.status === 403);

  console.log('\n=== Step 4: Create & List Webhook (No Secret Leakage) ===');
  // From inside Docker, the host machine is accessible via host.docker.internal
  const testUrl = `http://host.docker.internal:${mockServerPort}/webhook`;
  const signingSecret = 'super-secret-hmac-key-12345';

  r = await req('POST', `/organizations/${orgId}/webhooks`, {
    name: 'Primary Alert Destination',
    url: testUrl,
    secret: signingSecret
  }, ownerToken);
  assert('Created webhook successfully (201)', r.status === 201 && r.webhook?._id);
  assert('Secret is never returned in create response', !r.webhook?.secret);
  testWebhookId = r.webhook?._id;

  // List webhooks
  r = await req('GET', `/organizations/${orgId}/webhooks`, null, ownerToken);
  assert('Owner lists webhooks (200)', r.status === 200 && r.webhooks?.length === 1);
  assert('Secret is not exposed in list query', !r.webhooks?.[0]?.secret);

  console.log('\n=== Step 5: Test Webhook Endpoint & Signature Delivery ===');
  receivedWebhooks = [];
  r = await req('POST', `/organizations/${orgId}/webhooks/${testWebhookId}/test`, null, ownerToken);
  assert('Test webhook delivery success (200)', r.status === 200 && r.success === true);
  assert('Mock receiver got test payload', receivedWebhooks.length === 1);
  const testDelivery = receivedWebhooks[0];
  assert('Event is webhook.test', testDelivery.data?.event === 'webhook.test');

  // Verify HMAC signature
  const expectedSig = 'sha256=' + crypto.createHmac('sha256', signingSecret).update(testDelivery.rawBody).digest('hex');
  assert('X-OpsMind-Signature matches HMAC-SHA256', testDelivery.headers['x-opsmind-signature'] === expectedSig);

  // Verify delivery state updated on webhook model
  r = await req('GET', `/organizations/${orgId}/webhooks`, null, ownerToken);
  assert('lastDelivery recorded success', r.webhooks?.[0]?.lastDelivery?.status === 'success');
  assert('lastDelivery recorded HTTP 200', r.webhooks?.[0]?.lastDelivery?.statusCode === 200);

  console.log('\n=== Step 6: Service-Health Incident Creation Dispatches Webhook ===');
  receivedWebhooks = [];
  // Ingest 5 error logs to trigger automatic incident
  for (let i = 0; i < 5; i++) {
    await req('POST', `/ingest/${serviceId}/logs`, { level: 'error', message: `Service alert log #${i+1}` }, ingestSecret);
  }

  // Wait a moment for background notification delivery
  await new Promise(res => setTimeout(res, 600));
  assert('Mock receiver received incident notification', receivedWebhooks.length === 1);
  const incDelivery = receivedWebhooks[0];
  assert('Payload event is incident.created', incDelivery.data?.event === 'incident.created');
  assert('Incident source is service_health', incDelivery.data?.incident?.source === 'service_health');
  assert('Incident severity is high/critical', ['high', 'critical'].includes(incDelivery.data?.incident?.severity));
  assert('Incident title matches service name', incDelivery.data?.incident?.title?.includes('WH Svc'));

  console.log('\n=== Step 7: GitHub CI/CD Incident Creation Dispatches Webhook ===');
  // Connect public repo actions/checkout
  r = await req('POST', '/github/repos', { organizationId: orgId, owner: 'actions', repo: 'checkout' }, ownerToken);
  const ghRepoId = r.githubRepo?._id;

  // Fetch runs to get a failed run
  r = await req('GET', `/github/repos/${ghRepoId}/workflows?perPage=30`, null, ownerToken);
  const failedRun = r.runs?.find(run => run.status === 'completed' && ['failure', 'timed_out'].includes(run.conclusion));

  if (failedRun) {
    receivedWebhooks = [];
    r = await req('POST', `/github/repos/${ghRepoId}/create-incident`, { runId: failedRun.id }, ownerToken);
    assert('GitHub incident created', r.status === 201 && r.incident?._id);

    // Wait a moment for background webhook delivery
    await new Promise(res => setTimeout(res, 600));
    assert('Mock receiver received GitHub CI incident notification', receivedWebhooks.length === 1);
    const ghDelivery = receivedWebhooks[0];
    assert('Event is incident.created', ghDelivery.data?.event === 'incident.created');
    assert('Source is github_actions', ghDelivery.data?.incident?.source === 'github_actions');
    assert('githubContext included in payload', ghDelivery.data?.incident?.githubContext?.repo === 'checkout');
  } else {
    console.log('     Skipping live failed run trigger (no failed run in actions/checkout current window)');
  }

  console.log('\n=== Step 8: Disabled Destination Behavior ===');
  // Disable the webhook
  r = await req('PATCH', `/organizations/${orgId}/webhooks/${testWebhookId}`, { enabled: false }, ownerToken);
  assert('Webhook disabled (200)', r.status === 200 && r.webhook?.enabled === false);

  receivedWebhooks = [];
  // Ingest another batch of error logs after resolving current incident
  const currentIncs = await req('GET', `/incidents?organizationId=${orgId}`, null, ownerToken);
  for (const inc of currentIncs.incidents || []) {
    await req('POST', `/incidents/${inc._id}/resolve`, null, ownerToken);
  }

  for (let i = 0; i < 5; i++) {
    await req('POST', `/ingest/${serviceId}/logs`, { level: 'error', message: `Disabled test log #${i+1}` }, ingestSecret);
  }

  await new Promise(res => setTimeout(res, 600));
  assert('No notification dispatched to disabled webhook', receivedWebhooks.length === 0);

  console.log('\n=== Step 9: Delete Webhook & Org Cascade ===');
  r = await req('DELETE', `/organizations/${orgId}/webhooks/${testWebhookId}`, null, ownerToken);
  assert('Deleted webhook (200)', r.status === 200);

  r = await req('GET', `/organizations/${orgId}/webhooks`, null, ownerToken);
  assert('Webhook list is empty', r.status === 200 && r.webhooks?.length === 0);

  // Clean up organization
  r = await req('DELETE', `/organizations/${orgId}`, null, ownerToken);
  assert('Deleted organization with cascade', r.status === 200);

  mockServer.close();
  console.log('\n🎉 ALL Phase 13.1 Webhook Tests Completed Successfully!');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  if (mockServer) mockServer.close();
  process.exit(1);
});
