const Webhook = require('../models/Webhook');
const Organization = require('../models/Organization');
const { getMembership, isValidObjectId, hasRole } = require('../utils/authHelpers');
const { validateWebhookUrl } = require('../utils/webhookValidator');
const { sendWebhookRequest } = require('../services/webhookService');

const ADMIN_ROLES = ['owner', 'admin'];

/**
 * GET /api/organizations/:organizationId/webhooks
 */
exports.listWebhooks = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!hasRole(org, req.user._id, ADMIN_ROLES)) {
      return res.status(403).json({ success: false, message: 'Only organization owners and admins can view webhooks' });
    }

    const webhooks = await Webhook.find({ organization: organizationId })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, webhooks });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/organizations/:organizationId/webhooks
 */
exports.createWebhook = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!hasRole(org, req.user._id, ADMIN_ROLES)) {
      return res.status(403).json({ success: false, message: 'Only organization owners and admins can create webhooks' });
    }

    const { name, url, secret } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Webhook name is required' });
    }

    const validation = await validateWebhookUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const webhook = await Webhook.create({
      organization: organizationId,
      name: name.trim(),
      url: validation.parsedUrl.href,
      secret: secret ? secret.trim() : undefined,
      createdBy: req.user._id
    });

    const responseWebhook = webhook.toObject();
    delete responseWebhook.secret;

    res.status(201).json({ success: true, webhook: responseWebhook });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/organizations/:organizationId/webhooks/:webhookId
 */
exports.updateWebhook = async (req, res, next) => {
  try {
    const { organizationId, webhookId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;
    if (!isValidObjectId(webhookId, res)) return;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!hasRole(org, req.user._id, ADMIN_ROLES)) {
      return res.status(403).json({ success: false, message: 'Only organization owners and admins can update webhooks' });
    }

    const webhook = await Webhook.findOne({ _id: webhookId, organization: organizationId });
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook destination not found' });
    }

    const { name, url, enabled, secret } = req.body || {};

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Webhook name cannot be empty' });
      webhook.name = name.trim();
    }

    if (url !== undefined) {
      const validation = await validateWebhookUrl(url);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }
      webhook.url = validation.parsedUrl.href;
    }

    if (enabled !== undefined) {
      webhook.enabled = Boolean(enabled);
    }

    if (secret !== undefined) {
      webhook.secret = secret ? secret.trim() : undefined;
    }

    await webhook.save();

    const responseWebhook = webhook.toObject();
    delete responseWebhook.secret;

    res.json({ success: true, webhook: responseWebhook });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/organizations/:organizationId/webhooks/:webhookId
 */
exports.deleteWebhook = async (req, res, next) => {
  try {
    const { organizationId, webhookId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;
    if (!isValidObjectId(webhookId, res)) return;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!hasRole(org, req.user._id, ADMIN_ROLES)) {
      return res.status(403).json({ success: false, message: 'Only organization owners and admins can delete webhooks' });
    }

    const result = await Webhook.deleteOne({ _id: webhookId, organization: organizationId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Webhook destination not found' });
    }

    res.json({ success: true, message: 'Webhook deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/organizations/:organizationId/webhooks/:webhookId/test
 */
exports.testWebhook = async (req, res, next) => {
  try {
    const { organizationId, webhookId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;
    if (!isValidObjectId(webhookId, res)) return;

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!hasRole(org, req.user._id, ADMIN_ROLES)) {
      return res.status(403).json({ success: false, message: 'Only organization owners and admins can test webhooks' });
    }

    const webhook = await Webhook.findOne({ _id: webhookId, organization: organizationId }).select('+secret');
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'Webhook destination not found' });
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      organization: {
        id: String(org._id),
        name: org.name
      },
      message: 'This is a test notification from OpsMind.'
    };

    const deliveryResult = await sendWebhookRequest(webhook.url, testPayload, webhook.secret);

    // Update last delivery in database
    webhook.lastDelivery = {
      status: deliveryResult.success ? 'success' : deliveryResult.error?.includes('timed out') ? 'timeout' : 'failed',
      statusCode: deliveryResult.status,
      error: deliveryResult.error ? deliveryResult.error.substring(0, 500) : null,
      timestamp: new Date()
    };
    await webhook.save();

    res.json({
      success: deliveryResult.success,
      status: deliveryResult.status,
      error: deliveryResult.error || null,
      message: deliveryResult.success ? 'Test webhook delivered successfully' : `Test webhook delivery failed: ${deliveryResult.error}`
    });
  } catch (err) {
    next(err);
  }
};
