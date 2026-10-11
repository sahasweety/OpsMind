const crypto = require('node:crypto');
const Webhook = require('../models/Webhook');
const { validateWebhookUrl } = require('../utils/webhookValidator');

const TIMEOUT_MS = 5000; // 5-second hard timeout
const MAX_RESPONSE_BYTES = 64 * 1024; // 64KB response limit

/**
 * Builds standard generic JSON incident webhook payload.
 */
function buildIncidentPayload(incident, eventType = 'incident.created') {
  return {
    event: eventType,
    timestamp: new Date().toISOString(),
    incident: {
      id: String(incident._id),
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      source: incident.source || 'service_health',
      createdAt: incident.createdAt ? new Date(incident.createdAt).toISOString() : new Date().toISOString(),
      serviceId: incident.service ? String(incident.service._id || incident.service) : null,
      projectId: incident.project ? String(incident.project._id || incident.project) : null,
      organizationId: String(incident.organization._id || incident.organization),
      githubContext: incident.githubContext ? {
        owner: incident.githubContext.owner,
        repo: incident.githubContext.repo,
        runId: incident.githubContext.runId,
        runUrl: incident.githubContext.runUrl,
        branch: incident.githubContext.branch,
        conclusion: incident.githubContext.conclusion,
        workflowName: incident.githubContext.workflowName
      } : null
    }
  };
}

/**
 * Sends HTTP POST request to destination URL with SSRF re-check and bounded timeout.
 */
async function sendWebhookRequest(url, payload, secret = null) {
  // Re-verify URL before actual request
  const validation = await validateWebhookUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      status: null,
      error: `Blocked by SSRF validation: ${validation.error}`
    };
  }

  const payloadString = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'OpsMind-Webhook/1.0',
    'X-OpsMind-Event': payload.event || 'incident.created',
    'X-OpsMind-Delivery': crypto.randomUUID()
  };

  if (secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    headers['X-OpsMind-Signature'] = `sha256=${signature}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
      redirect: 'error' // Disallow automated redirects to prevent SSRF bypass
    });

    clearTimeout(timeoutId);

    // Limit response body read size
    const buffer = await response.arrayBuffer();
    const truncatedBody = buffer.byteLength > MAX_RESPONSE_BYTES;
    const bodyText = new TextDecoder().decode(buffer.slice(0, MAX_RESPONSE_BYTES));

    if (response.ok) {
      return {
        success: true,
        status: response.status,
        body: bodyText,
        truncated: truncatedBody
      };
    } else {
      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${bodyText.substring(0, 200)}`
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        status: null,
        error: `Delivery timed out after ${TIMEOUT_MS}ms`
      };
    }
    return {
      success: false,
      status: null,
      error: err.message || 'Network request failed'
    };
  }
}

/**
 * Dispatches incident notification to all active webhooks for an organization.
 * Non-blocking, executed in background.
 */
async function notifyIncidentCreated(incident) {
  if (!incident || !incident.organization) return;
  const orgId = incident.organization._id || incident.organization;

  try {
    // Select secret as well for signing
    const webhooks = await Webhook.find({
      organization: orgId,
      enabled: true
    }).select('+secret');

    if (!webhooks || webhooks.length === 0) return;

    const payload = buildIncidentPayload(incident, 'incident.created');

    // Deliver to each destination concurrently without blocking the main event loop
    const deliveries = webhooks.map(async (webhook) => {
      const result = await sendWebhookRequest(webhook.url, payload, webhook.secret);

      // Record outcome in background
      try {
        await Webhook.findByIdAndUpdate(webhook._id, {
          lastDelivery: {
            status: result.success ? 'success' : result.error?.includes('timed out') ? 'timeout' : 'failed',
            statusCode: result.status,
            error: result.error ? result.error.substring(0, 500) : null,
            timestamp: new Date()
          }
        });
      } catch (updateErr) {
        console.error(`Failed to record webhook delivery status for ${webhook._id}:`, updateErr.message);
      }
    });

    await Promise.allSettled(deliveries);
  } catch (err) {
    console.error('Error dispatching webhook notifications:', err.message);
  }
}

module.exports = {
  buildIncidentPayload,
  sendWebhookRequest,
  notifyIncidentCreated
};
