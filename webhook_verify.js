'use strict';
/**
 * Comprehensive Phase 13.1 Webhook Verification Suite
 * Covers:
 * §1 SSRF & URL Validation (IP ranges, loopback, private, link-local, DNS rebinding, malformed, protocols)
 * §2 HMAC-SHA256 Signature Generation & Verification
 * §3 Real HTTP Delivery via Mock Receiver (200 success, headers, body matching, HMAC verification)
 * §4 HTTP Error Handling (500, 404, error message capture)
 * §5 Timeout Handling (5s threshold, abort signal)
 * §6 Redirect Rejection (redirect: 'error', SSRF bypass prevention)
 * §7 Production vs Dev SSRF Rules (host.docker.internal disallowed in production)
 * §8 Incident Payload Builder (service_health vs github_actions structures)
 * §9 Database Persistence & Secret Isolation (select: false, lean queries, updates)
 * §10 Organization Isolation & Dispatch Counts (Solo org vs multiple destinations)
 * §11 Disabled Webhook Skipped & Delivery History Recording
 * §12 API Secret Redaction via Authenticated Express Endpoint
 * §13 Duplicate Dispatch Behavior & Contract Verification
 */
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { isPrivateIPv4, isPrivateIPv6, validateWebhookUrl } = require('./utils/webhookValidator');
const { buildIncidentPayload, sendWebhookRequest, notifyIncidentCreated } = require('./services/webhookService');
const Webhook = require('./models/Webhook');
const Organization = require('./models/Organization');
const User = require('./models/User');

const MOCK_URL = 'http://host.docker.internal:9999/wh';
const MOCK_CTRL = 'http://host.docker.internal:9999/_control';

let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) {
    console.log('  PASS: ' + name);
    pass++;
  } else {
    console.error('  FAIL: ' + name + (detail ? ': ' + detail : ''));
    fail++;
    fails.push(name);
  }
}

function isJson(s) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

async function mockReset() {
  const res = await fetch(`${MOCK_CTRL}/reset`);
  return await res.json();
}

async function mockSetMode(mode) {
  const res = await fetch(`${MOCK_CTRL}/set-mode/${mode}`);
  return await res.json();
}

async function mockGetStatus() {
  const res = await fetch(`${MOCK_CTRL}/status`);
  return await res.json();
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   OPSMIND PHASE 13.1 WEBHOOK VERIFICATION TEST SUITE     ');
  console.log('═══════════════════════════════════════════════════════════');

  // Track created test IDs for safe cleanup in finally block
  const createdOrgIds = [];
  const createdWebhookIds = [];
  let testUser = null;

  try {
    // -------------------------------------------------------------
    // §1 SSRF & URL Validation
    // -------------------------------------------------------------
    console.log('\n§1 SSRF & URL Validation (Unit & DNS)');
    ok('10.x.x.x private IPv4 blocked', isPrivateIPv4('10.0.0.1'));
    ok('192.168.x.x private IPv4 blocked', isPrivateIPv4('192.168.1.1'));
    ok('172.16.x.x private IPv4 blocked', isPrivateIPv4('172.16.0.1'));
    ok('172.31.x.x private IPv4 blocked', isPrivateIPv4('172.31.255.255'));
    ok('172.15.x.x public IPv4 NOT blocked', !isPrivateIPv4('172.15.0.1'));
    ok('172.32.x.x public IPv4 NOT blocked', !isPrivateIPv4('172.32.0.1'));
    ok('127.x.x.x loopback IPv4 blocked', isPrivateIPv4('127.0.0.1'));
    ok('169.254.x.x link-local IPv4 blocked', isPrivateIPv4('169.254.169.254'));
    ok('0.0.0.0 reserved IPv4 blocked', isPrivateIPv4('0.0.0.0'));
    ok('224.x.x.x multicast IPv4 blocked', isPrivateIPv4('224.0.0.1'));
    ok('1.1.1.1 public IPv4 NOT blocked', !isPrivateIPv4('1.1.1.1'));
    ok('8.8.8.8 public IPv4 NOT blocked', !isPrivateIPv4('8.8.8.8'));

    ok('IPv6 ::1 loopback blocked', isPrivateIPv6('::1'));
    ok('IPv6 fe80:: link-local blocked', isPrivateIPv6('fe80::1'));
    ok('IPv6 fc00:: unique local blocked', isPrivateIPv6('fc00::1'));
    ok('IPv6 fd00:: unique local blocked', isPrivateIPv6('fd00::1'));
    ok('IPv4-mapped IPv6 ::ffff:127.0.0.1 blocked', isPrivateIPv6('::ffff:127.0.0.1'));

    ok('localhost URL rejected', !(await validateWebhookUrl('http://localhost/wh')).valid);
    ok('127.0.0.1 URL rejected', !(await validateWebhookUrl('http://127.0.0.1/wh')).valid);
    ok('10.0.0.1 URL rejected', !(await validateWebhookUrl('http://10.0.0.1/wh')).valid);
    ok('169.254.169.254 cloud metadata rejected', !(await validateWebhookUrl('http://169.254.169.254/latest/meta-data/')).valid);
    ok('file:// protocol rejected', !(await validateWebhookUrl('file:///etc/passwd')).valid);
    ok('ftp:// protocol rejected', !(await validateWebhookUrl('ftp://example.com/wh')).valid);
    ok('gopher:// protocol rejected', !(await validateWebhookUrl('gopher://example.com/')).valid);
    ok('Malformed URL rejected', !(await validateWebhookUrl('not-a-valid-url')).valid);
    ok('Empty string URL rejected', !(await validateWebhookUrl('')).valid);
    ok('Null URL rejected', !(await validateWebhookUrl(null)).valid);

    // DNS rebinding test: localtest.me resolves to 127.0.0.1
    const localtestRes = await validateWebhookUrl('http://localtest.me/wh');
    ok('DNS resolving to private IP rejected (localtest.me)', !localtestRes.valid && localtestRes.error.includes('private or internal'));

    // Dev exception for host.docker.internal
    ok('host.docker.internal allowed in non-production mode', (await validateWebhookUrl('http://host.docker.internal:9999/wh')).valid);

    // -------------------------------------------------------------
    // §2 Production SSRF Hardening
    // -------------------------------------------------------------
    console.log('\n§2 Production SSRF Hardening Check');
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const prodRes = await validateWebhookUrl('http://host.docker.internal:9999/wh');
    ok('host.docker.internal BLOCKED in production', !prodRes.valid && prodRes.error.includes('private or internal'));
    process.env.NODE_ENV = origEnv;

    // -------------------------------------------------------------
    // §3 HMAC Signature Generation & Independent Verification
    // -------------------------------------------------------------
    console.log('\n§3 HMAC-SHA256 Signing');
    const testSecret = 'whsec_9876543210abcdeffedcba0123456789';
    const samplePayload = {
      event: 'incident.created',
      timestamp: new Date().toISOString(),
      incident: { id: 'inc_test_123', title: 'Test incident' }
    };
    const sampleBody = JSON.stringify(samplePayload);
    const computedHmac = crypto.createHmac('sha256', testSecret).update(sampleBody).digest('hex');
    const expectedSigHeader = `sha256=${computedHmac}`;

    ok('Signature format matches sha256=<64-hex>', /^sha256=[0-9a-f]{64}$/.test(expectedSigHeader));
    ok('HMAC is deterministic', expectedSigHeader === `sha256=${crypto.createHmac('sha256', testSecret).update(sampleBody).digest('hex')}`);
    ok('Altered secret produces different signature', expectedSigHeader !== `sha256=${crypto.createHmac('sha256', 'different-sec').update(sampleBody).digest('hex')}`);
    ok('Altered body produces different signature', expectedSigHeader !== `sha256=${crypto.createHmac('sha256', testSecret).update(sampleBody + ' ').digest('hex')}`);

    // -------------------------------------------------------------
    // §4 Live Delivery to Mock Server (200 OK & Header Validation)
    // -------------------------------------------------------------
    console.log('\n§4 Real HTTP Delivery via Mock Server (200 OK)');
    await mockReset();
    await mockSetMode('200');

    const res200 = await sendWebhookRequest(MOCK_URL, samplePayload, testSecret);
    ok('Delivery returns success: true', res200.success === true);
    ok('Delivery status is 200', res200.status === 200);

    const statusAfter200 = await mockGetStatus();
    ok('Mock server received exactly 1 request', statusAfter200.requestCount === 1);

    const receivedHeaders = statusAfter200.lastRequestHeaders;
    const receivedBody = statusAfter200.lastRequestBody;

    ok('Received Content-Type is application/json', receivedHeaders['content-type'] === 'application/json');
    ok('Received User-Agent is OpsMind-Webhook/1.0', receivedHeaders['user-agent'] === 'OpsMind-Webhook/1.0');
    ok('Received X-OpsMind-Event is incident.created', receivedHeaders['x-opsmind-event'] === 'incident.created');
    ok('Received X-OpsMind-Delivery is valid UUID', /^[0-9a-f-]{36}$/.test(receivedHeaders['x-opsmind-delivery']));
    ok('Received X-OpsMind-Signature header present', !!receivedHeaders['x-opsmind-signature']);

    // Independent HMAC check against actual received body bytes
    const receivedBodyHmac = crypto.createHmac('sha256', testSecret).update(receivedBody).digest('hex');
    ok('Independently verified HMAC against actual received body', receivedHeaders['x-opsmind-signature'] === `sha256=${receivedBodyHmac}`);
    ok('Received body parses as JSON matching payload', isJson(receivedBody) && JSON.parse(receivedBody).incident.id === 'inc_test_123');

    // Test delivery without secret
    await mockReset();
    const resNoSec = await sendWebhookRequest(MOCK_URL, samplePayload, null);
    ok('No-secret delivery returns success: true', resNoSec.success === true);
    const statusNoSec = await mockGetStatus();
    ok('No X-OpsMind-Signature header sent when secret is null', !statusNoSec.lastRequestHeaders['x-opsmind-signature']);

    // -------------------------------------------------------------
    // §5 HTTP Error Responses (500 & 404)
    // -------------------------------------------------------------
    console.log('\n§5 HTTP Error Handling (500 & 404)');
    await mockReset();
    await mockSetMode('500');
    const res500 = await sendWebhookRequest(MOCK_URL, samplePayload, null);
    ok('500 delivery returns success: false', res500.success === false);
    ok('500 delivery returns status: 500', res500.status === 500);
    ok('500 error string includes "HTTP 500"', res500.error && res500.error.includes('HTTP 500'));

    await mockReset();
    await mockSetMode('404');
    const res404 = await sendWebhookRequest(MOCK_URL, samplePayload, null);
    ok('404 delivery returns success: false', res404.success === false);
    ok('404 delivery returns status: 404', res404.status === 404);
    ok('404 error string includes "HTTP 404"', res404.error && res404.error.includes('HTTP 404'));

    // -------------------------------------------------------------
    // §6 Timeout Handling
    // -------------------------------------------------------------
    console.log('\n§6 Timeout Handling (Bounded 5s Timeout)');
    await mockReset();
    await mockSetMode('timeout'); // 6-second delay on mock receiver

    const startTimeout = Date.now();
    const resTimeout = await sendWebhookRequest(MOCK_URL, samplePayload, null);
    const timeoutDuration = Date.now() - startTimeout;

    ok('Timeout delivery returns success: false', resTimeout.success === false);
    ok('Timeout delivery status is null', resTimeout.status === null);
    ok('Timeout error mentions "timed out"', resTimeout.error && resTimeout.error.includes('timed out'));
    ok('Timeout aborted near 5000ms (between 4800ms and 6500ms)', timeoutDuration >= 4800 && timeoutDuration <= 6500);

    // -------------------------------------------------------------
    // §7 Redirect Rejection (SSRF Bypass Defense)
    // -------------------------------------------------------------
    console.log('\n§7 Redirect Rejection (fetch redirect: "error")');
    await mockReset();
    await mockSetMode('redirect'); // returns 302 to http://127.0.0.1:9999/wh-redirect-target

    const resRedirect = await sendWebhookRequest(MOCK_URL, samplePayload, null);
    ok('Redirect request is rejected (success: false)', resRedirect.success === false);
    ok('Redirect error captures network failure', !!resRedirect.error);

    const redirectStatus = await mockGetStatus();
    // In mock receiver, redirect target was never hit because fetch threw on 302
    ok('Redirect target was NOT followed (requestCount === 1, not 2)', redirectStatus.requestCount === 1);

    // Reset mock back to 200 mode
    await mockReset();
    await mockSetMode('200');

    // -------------------------------------------------------------
    // §8 Payload Builder Contract
    // -------------------------------------------------------------
    console.log('\n§8 Payload Builder Contract');
    const mockOrgId = new mongoose.Types.ObjectId();
    const mockSvcId = new mongoose.Types.ObjectId();
    const mockProjId = new mongoose.Types.ObjectId();

    const serviceIncident = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Database connection pool exhausted',
      severity: 'critical',
      status: 'open',
      source: 'service_health',
      createdAt: new Date('2026-10-11T12:00:00Z'),
      service: { _id: mockSvcId },
      project: { _id: mockProjId },
      organization: mockOrgId,
      githubContext: null
    };

    const pService = buildIncidentPayload(serviceIncident, 'incident.created');
    ok('Payload event is incident.created', pService.event === 'incident.created');
    ok('Payload timestamp is ISO 8601', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(pService.timestamp));
    ok('Payload incident.id is string', pService.incident.id === String(serviceIncident._id));
    ok('Payload incident.title preserved', pService.incident.title === 'Database connection pool exhausted');
    ok('Payload incident.severity preserved', pService.incident.severity === 'critical');
    ok('Payload incident.status preserved', pService.incident.status === 'open');
    ok('Payload incident.source is service_health', pService.incident.source === 'service_health');
    ok('Payload serviceId matches', pService.incident.serviceId === String(mockSvcId));
    ok('Payload organizationId matches', pService.incident.organizationId === String(mockOrgId));
    ok('Payload githubContext is null for service_health', pService.incident.githubContext === null);

    const githubIncident = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Workflow failure: deploy-prod on main',
      severity: 'high',
      status: 'open',
      source: 'github_actions',
      createdAt: new Date('2026-10-11T12:05:00Z'),
      service: null,
      project: null,
      organization: mockOrgId,
      githubContext: {
        owner: 'acme-corp',
        repo: 'backend-api',
        runId: '1029384756',
        runUrl: 'https://github.com/acme-corp/backend-api/actions/runs/1029384756',
        branch: 'main',
        conclusion: 'failure',
        workflowName: 'CI/CD Pipeline'
      }
    };

    const pGithub = buildIncidentPayload(githubIncident, 'incident.created');
    ok('Payload source is github_actions', pGithub.incident.source === 'github_actions');
    ok('Payload githubContext present and populated', !!pGithub.incident.githubContext);
    ok('Payload githubContext.owner matches', pGithub.incident.githubContext.owner === 'acme-corp');
    ok('Payload githubContext.repo matches', pGithub.incident.githubContext.repo === 'backend-api');
    ok('Payload githubContext.conclusion is failure', pGithub.incident.githubContext.conclusion === 'failure');

    // -------------------------------------------------------------
    // §9 Database Persistence & Secret Isolation
    // -------------------------------------------------------------
    console.log('\n§9 Database Persistence & Secret Isolation');
    await mongoose.connect(process.env.MONGODB_URI);

    // Find or create test user
    testUser = await User.findOne();
    if (!testUser) {
      testUser = await User.create({
        name: 'Test QA Admin',
        email: `test-qa-${Date.now()}@opsmind.local`,
        password: 'password123',
        role: 'admin'
      });
    }

    const testOrgA = await Organization.create({
      name: `QA-OrgA-${Date.now()}`,
      slug: `qa-orga-${Date.now()}`,
      owner: testUser._id,
      members: [{ user: testUser._id, role: 'owner' }]
    });
    createdOrgIds.push(testOrgA._id);

    const testOrgB = await Organization.create({
      name: `QA-OrgB-${Date.now()}`,
      slug: `qa-orga-b-${Date.now()}`,
      owner: testUser._id,
      members: [{ user: testUser._id, role: 'owner' }]
    });
    createdOrgIds.push(testOrgB._id);

    const whA1 = await Webhook.create({
      organization: testOrgA._id,
      name: 'Destination A1',
      url: MOCK_URL,
      secret: 'secret-a1-value',
      enabled: true,
      createdBy: testUser._id
    });
    createdWebhookIds.push(whA1._id);

    const whA2 = await Webhook.create({
      organization: testOrgA._id,
      name: 'Destination A2 (Disabled)',
      url: MOCK_URL,
      secret: 'secret-a2-value',
      enabled: false,
      createdBy: testUser._id
    });
    createdWebhookIds.push(whA2._id);

    const whB1 = await Webhook.create({
      organization: testOrgB._id,
      name: 'Destination B1',
      url: MOCK_URL,
      secret: 'secret-b1-value',
      enabled: true,
      createdBy: testUser._id
    });
    createdWebhookIds.push(whB1._id);

    // Verify secret exclusion in standard queries (select: false)
    const queriedWebhooks = await Webhook.find({ organization: testOrgA._id }).lean();
    const queriedA1 = queriedWebhooks.find(w => w._id.equals(whA1._id));
    ok('Secret excluded from standard find() query', queriedA1 && queriedA1.secret === undefined);

    const selectedSecret = await Webhook.findById(whA1._id).select('+secret');
    ok('Secret retrievable with explicit .select("+secret")', selectedSecret && selectedSecret.secret === 'secret-a1-value');

    // -------------------------------------------------------------
    // §10 Organization Isolation & Dispatch Counts
    // -------------------------------------------------------------
    console.log('\n§10 Organization Isolation & Dispatch Counts');
    await mockReset();
    await mockSetMode('200');

    // Create incident for Org A
    const orgAIncident = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Org A High CPU incident',
      severity: 'high',
      status: 'open',
      source: 'service_health',
      createdAt: new Date(),
      organization: testOrgA._id
    };

    // notifyIncidentCreated dispatches to all enabled webhooks in the organization
    await notifyIncidentCreated(orgAIncident);

    // Allow background updates to finish
    await new Promise(r => setTimeout(r, 400));

    const statusAfterOrgA = await mockGetStatus();
    // Org A has 2 webhooks: whA1 (enabled), whA2 (disabled).
    // Org B has whB1 (enabled).
    // Only whA1 should have received a notification!
    ok('Org A incident triggered exactly 1 delivery (whA1 only, whB1 untouched)', statusAfterOrgA.requestCount === 1);

    // Now trigger incident for Org B
    await mockReset();
    const orgBIncident = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Org B Incident',
      severity: 'low',
      status: 'open',
      source: 'service_health',
      createdAt: new Date(),
      organization: testOrgB._id
    };

    await notifyIncidentCreated(orgBIncident);
    await new Promise(r => setTimeout(r, 400));

    const statusAfterOrgB = await mockGetStatus();
    ok('Org B incident triggered exactly 1 delivery (whB1 only)', statusAfterOrgB.requestCount === 1);

    // -------------------------------------------------------------
    // §11 Disabled Webhook & Delivery Status Recording
    // -------------------------------------------------------------
    console.log('\n§11 Disabled Webhook & Delivery Status Recording');
    const updatedWhA1 = await Webhook.findById(whA1._id);
    const updatedWhA2 = await Webhook.findById(whA2._id);

    ok('Enabled webhook recorded lastDelivery.status === "success"', updatedWhA1.lastDelivery && updatedWhA1.lastDelivery.status === 'success');
    ok('Enabled webhook recorded lastDelivery.statusCode === 200', updatedWhA1.lastDelivery && updatedWhA1.lastDelivery.statusCode === 200);
    ok('Enabled webhook recorded lastDelivery.timestamp', updatedWhA1.lastDelivery && !!updatedWhA1.lastDelivery.timestamp);

    ok('Disabled webhook was NOT dispatched to (lastDelivery.status is null)', !updatedWhA2.lastDelivery || updatedWhA2.lastDelivery.status === null);
    ok('Disabled webhook lastDelivery.timestamp is null', !updatedWhA2.lastDelivery || !updatedWhA2.lastDelivery.timestamp);

    // -------------------------------------------------------------
    // §12 API Secret Redaction via Express Endpoint
    // -------------------------------------------------------------
    console.log('\n§12 API Secret Redaction via HTTP Express Endpoint');
    const authToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // 1. GET /api/organizations/:organizationId/webhooks
    const listResponse = await fetch(`http://127.0.0.1:5000/api/organizations/${testOrgA._id}/webhooks`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    ok('List webhooks HTTP endpoint returns 200', listResponse.status === 200);
    const listData = await listResponse.json();
    ok('List webhooks response success is true', listData.success === true);
    ok('List webhooks returns 2 destinations for Org A', listData.webhooks && listData.webhooks.length === 2);
    const apiWhA1 = listData.webhooks.find(w => w._id === String(whA1._id));
    ok('API GET response excludes secret field completely', apiWhA1 && apiWhA1.secret === undefined);

    // 2. POST /api/organizations/:organizationId/webhooks (Create)
    const createResponse = await fetch(`http://127.0.0.1:5000/api/organizations/${testOrgA._id}/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: 'API Created Webhook',
        url: MOCK_URL,
        secret: 'api-secret-key-123'
      })
    });
    ok('Create webhook HTTP endpoint returns 201', createResponse.status === 201);
    const createData = await createResponse.json();
    if (createData.webhook) createdWebhookIds.push(createData.webhook._id);
    ok('Create webhook API response deletes secret before sending', createData.webhook && createData.webhook.secret === undefined);

    // 3. PATCH /api/organizations/:organizationId/webhooks/:webhookId
    const patchResponse = await fetch(`http://127.0.0.1:5000/api/organizations/${testOrgA._id}/webhooks/${whA1._id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        secret: 'new-updated-secret'
      })
    });
    ok('Update webhook HTTP endpoint returns 200', patchResponse.status === 200);
    const patchData = await patchResponse.json();
    ok('Update webhook API response deletes secret before sending', patchData.webhook && patchData.webhook.secret === undefined);

    // 4. POST /api/organizations/:organizationId/webhooks/:webhookId/test
    await mockReset();
    await mockSetMode('200');
    const testEndpointResponse = await fetch(`http://127.0.0.1:5000/api/organizations/${testOrgA._id}/webhooks/${whA1._id}/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    ok('Test webhook HTTP endpoint returns 200', testEndpointResponse.status === 200);
    const testEndpointData = await testEndpointResponse.json();
    ok('Test webhook response success is true', testEndpointData.success === true);
    const statusAfterApiTest = await mockGetStatus();
    ok('Mock server received test notification with event "webhook.test"', statusAfterApiTest.lastRequestHeaders['x-opsmind-event'] === 'webhook.test');

    // -------------------------------------------------------------
    // §13 Duplicate Dispatch & Contract Verification
    // -------------------------------------------------------------
    console.log('\n§13 Duplicate Dispatch & Ingestion Contract Verification');
    // Contract definition:
    // notifyIncidentCreated(incident) executes one batch dispatch to all enabled destinations.
    // It does NOT deduplicate if called multiple times with the same incident (no idempotency cache).
    // The ingestion pipeline (ingestController and githubController) protects against duplicate
    // incident creation at the controller level:
    // - IngestController triggers an incident only when errorLogs.length >= INCIDENT_THRESHOLD_COUNT
    //   and openIncident was null. Once created, service.status='degraded' and openIncident is retained.
    // - GithubController uses a database unique index { organization: 1, 'githubContext.owner': 1, 'githubContext.repo': 1, 'githubContext.runId': 1 }
    //   which throws code 11000 on re-ingestion, catching concurrent races and avoiding duplicate calls to notifyIncidentCreated.

    // Test 1: Single incident creation call results in exactly one dispatch per destination
    await mockReset();
    await mockSetMode('200');
    const singleIncident = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Single Dispatch Incident',
      severity: 'medium',
      status: 'open',
      createdAt: new Date(),
      organization: testOrgB._id // Org B has exactly 1 enabled destination
    };
    await notifyIncidentCreated(singleIncident);
    await new Promise(r => setTimeout(r, 200));
    const singleStatus = await mockGetStatus();
    ok('Creation path dispatches exactly once per eligible destination', singleStatus.requestCount === 1);

    // Test 2: If notifyIncidentCreated is invoked a second time (e.g. caller retry), it dispatches again (contract: no caller-side deduplication)
    await notifyIncidentCreated(singleIncident);
    await new Promise(r => setTimeout(r, 200));
    const retryStatus = await mockGetStatus();
    ok('notifyIncidentCreated has no internal idempotency cache (contract verified: 2 calls = 2 dispatches)', retryStatus.requestCount === 2);

  } finally {
    // -------------------------------------------------------------
    // Cleanup in finally block
    // -------------------------------------------------------------
    console.log('\n§14 Cleaning up test data...');
    try {
      if (createdWebhookIds.length > 0) {
        await Webhook.deleteMany({ _id: { $in: createdWebhookIds } });
      }
      if (createdOrgIds.length > 0) {
        await Webhook.deleteMany({ organization: { $in: createdOrgIds } });
        await Organization.deleteMany({ _id: { $in: createdOrgIds } });
      }
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }
      console.log('  Cleaned up all temporary organizations and webhooks.');
    } catch (cleanErr) {
      console.error('  Cleanup error:', cleanErr.message);
    }
  }

  // -------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Results: ${pass} passed, ${fail} failed (Total: ${pass + fail})`);
  if (fails.length > 0) {
    console.log('Failed tests:');
    fails.forEach(f => console.log('  x ' + f));
  }
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
