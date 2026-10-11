/**
 * AI Controller — Phase 10
 * Handles the POST /api/incidents/:id/investigate endpoint.
 *
 * Authorization: only org members may request investigation.
 * The investigation result is structured and evidence refs are validated
 * against this incident's own logs — no cross-org data leakage.
 */
const Incident = require('../models/Incident');
const Log = require('../models/Log');
const Organization = require('../models/Organization');
const { getMembership, isValidObjectId } = require('../utils/authHelpers');
const { broadcastToOrg } = require('../utils/socket');
const { investigate } = require('../services/aiInvestigation');

exports.investigateIncident = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id, res)) {
      return;
    }

    // 1. Load incident
    const incident = await Incident.findById(id).populate('service', 'name environment');
    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // 2. Authorization — org membership required
    const orgId = incident.organization;
    const organization = await Organization.findById(orgId).lean();
    if (!organization || !getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this incident' });
    }

    // CI/CD incidents have no service logs to analyse.
    if (incident.source === 'github_actions') {
      return res.status(400).json({
        success: false,
        message: 'AI investigation is only available for service-health incidents'
      });
    }

    // 3. Prevent re-investigation within 60s to avoid hammering the LLM
    if (incident.aiInvestigation?.investigatedAt) {
      const elapsed = Date.now() - new Date(incident.aiInvestigation.investigatedAt).getTime();
      if (elapsed < 60_000) {
        return res.status(429).json({
          success: false,
          message: 'Investigation already requested recently. Please wait before requesting again.'
        });
      }
    }

    // 4. Load the incident's evidence logs — ONLY logs from this incident
    //    This ensures no cross-org or cross-incident log leakage.
    const evidenceIds = incident.evidence.slice(0, 20); // cap at 20
    const evidenceLogs = await Log.find({
      _id: { $in: evidenceIds },
      organization: incident.organization // extra safety: enforce org scope
    }).select('level message timestamp metadata _id').lean();

    // 5. Run investigation (mock or real provider)
    const { result, provider } = await investigate(incident, evidenceLogs);

    // 6. Persist structured result
    incident.aiInvestigation = {
      summary: result.summary,
      hypotheses: result.hypotheses,
      recommendedSteps: result.recommendedSteps,
      uncertainties: result.uncertainties,
      investigatedAt: new Date(),
      provider
    };

    // Only transition to 'investigating' if currently 'open' or 'acknowledged'
    if (incident.status === 'open' || incident.status === 'acknowledged') {
      incident.statusHistory.push({
        status: 'investigating',
        actor: req.user._id,
        comment: `AI investigation triggered (provider: ${provider})`
      });
      incident.status = 'investigating';
    }

    await incident.save();

    // 7. Broadcast to org room
    broadcastToOrg(orgId.toString(), 'incident_updated', {
      _id: incident._id,
      status: incident.status,
      aiInvestigation: incident.aiInvestigation
    });

    // 8. Return — never expose raw prompt or provider API key
    res.json({
      success: true,
      incident: {
        _id: incident._id,
        title: incident.title,
        status: incident.status,
        severity: incident.severity,
        aiInvestigation: incident.aiInvestigation
      },
      provider // 'mock' or 'gemini' or 'openai'
    });
  } catch (err) {
    next(err);
  }
};
