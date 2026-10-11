const Incident = require('../models/Incident');
const Organization = require('../models/Organization');
const { getMembership, isValidObjectId } = require('../utils/authHelpers');
const { broadcastToOrg } = require('../utils/socket');

exports.getIncidents = async (req, res, next) => {
  try {
    const { organizationId, projectId, serviceId, status, severity, source } = req.query;

    // Pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID is required' });
    }

    if (!isValidObjectId(organizationId, res)) return;

    const organization = await Organization.findById(organizationId).lean();
    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    const membership = getMembership(organization, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not authorized for this organization' });
    }

    const SOURCES = ['service_health', 'github_actions'];
    if (source && !SOURCES.includes(source)) {
      return res.status(400).json({ success: false, message: `source must be one of: ${SOURCES.join(', ')}` });
    }

    const query = { organization: organization._id };
    // CI/CD incidents are kept separate. $ne also matches older docs without `source`.
    query.source = source === 'github_actions' ? 'github_actions' : { $ne: 'github_actions' };
    if (projectId) query.project = projectId;
    if (serviceId) query.service = serviceId;
    if (status) query.status = status;
    if (severity) query.severity = severity;

    const [incidents, total] = await Promise.all([
      Incident.find(query)
        .populate('service', 'name environment')
        .populate('project', 'name')
        .sort({ createdAt: -1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Incident.countDocuments(query)
    ]);

    const pages = Math.ceil(total / limit);

    res.json({
      success: true,
      incidents,
      pagination: {
        total,
        page,
        limit,
        pages
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getIncident = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id, res)) return;

    const incident = await Incident.findById(id)
      .populate('service', 'name environment project')
      .populate('evidence')
      .lean();

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    // Check auth via organization
    const orgId = incident.organization;
    const organization = await Organization.findById(orgId).lean();

    if (!organization || !getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this incident' });
    }

    res.json({ success: true, incident });
  } catch (error) {
    next(error);
  }
};

const updateIncidentStatus = async (req, res, targetStatus, commentPrefix) => {
  const { id } = req.params;
  if (!isValidObjectId(id, res)) return;

  const incident = await Incident.findById(id).populate('service', 'name environment');
  if (!incident) {
    return res.status(404).json({ success: false, message: 'Incident not found' });
  }

  const organization = await Organization.findById(incident.organization).lean();
  if (!organization || !getMembership(organization, req.user._id)) {
    return res.status(403).json({ success: false, message: 'Not authorized for this incident' });
  }

  if (incident.status === targetStatus) {
    return res.status(400).json({ success: false, message: `Incident is already ${targetStatus}` });
  }

  if (targetStatus === 'resolved') {
    incident.resolvedAt = new Date();
  } else if (targetStatus === 'acknowledged') {
    incident.acknowledgedAt = new Date();
  } else if (targetStatus === 'open') { // Reopen
    incident.resolvedAt = null;
  }

  const prevStatus = incident.status;
  incident.status = targetStatus;

  incident.statusHistory.push({
    status: targetStatus,
    actor: req.user._id,
    comment: `${commentPrefix} (transitioned from ${prevStatus})`,
    changedAt: new Date()
  });

  await incident.save();

  broadcastToOrg(organization._id.toString(), 'incident_updated', {
    _id: incident._id,
    status: incident.status,
    acknowledgedAt: incident.acknowledgedAt,
    resolvedAt: incident.resolvedAt
  });

  return res.json({ success: true, incident });
};

exports.acknowledgeIncident = async (req, res, next) => {
  try {
    await updateIncidentStatus(req, res, 'acknowledged', 'Incident acknowledged');
  } catch (err) { next(err); }
};

exports.resolveIncident = async (req, res, next) => {
  try {
    await updateIncidentStatus(req, res, 'resolved', 'Incident resolved');
  } catch (err) { next(err); }
};

exports.reopenIncident = async (req, res, next) => {
  try {
    await updateIncidentStatus(req, res, 'open', 'Incident reopened');
  } catch (err) { next(err); }
};
