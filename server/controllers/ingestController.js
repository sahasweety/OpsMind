const crypto = require('crypto');
const Service = require('../models/Service');
const Log = require('../models/Log');
const Incident = require('../models/Incident');
const { hashCredential } = require('../utils/credential');
const { broadcastToOrg } = require('../utils/socket');
const { notifyIncidentCreated } = require('../services/webhookService');

// Thresholds for detection
const INCIDENT_THRESHOLD_COUNT = parseInt(process.env.INCIDENT_THRESHOLD_COUNT || '5', 10);
const INCIDENT_THRESHOLD_WINDOW_MS = parseInt(process.env.INCIDENT_THRESHOLD_WINDOW_MS || '60000', 10); // 1 min

// Custom middleware to authenticate the ingestion request
exports.protectIngest = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized to ingest logs, no credential' });
    }

    const { serviceId } = req.params;
    if (!serviceId) {
      return res.status(400).json({ success: false, message: 'Service ID is required in the path' });
    }

    // Retrieve service and its credential hash
    const service = await Service.findById(serviceId).select('+credentialHash').populate('project');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    if (!service.credentialHash) {
      return res.status(401).json({ success: false, message: 'Service has no ingest credentials configured' });
    }

    // Hash the provided token and compare using constant time
    const providedHash = hashCredential(token);

    // Convert to buffers for timingSafeEqual
    const providedBuffer = Buffer.from(providedHash, 'hex');
    const storedBuffer = Buffer.from(service.credentialHash, 'hex');

    if (providedBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(providedBuffer, storedBuffer)) {
      return res.status(401).json({ success: false, message: 'Invalid ingestion credential' });
    }

    // Attach service and its parent hierarchy to req
    req.ingestService = service;
    next();
  } catch (error) {
    next(error);
  }
};

exports.ingestLogs = async (req, res, next) => {
  try {
    const service = req.ingestService;
    const { level, message, metadata, timestamp } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    if (message.length > 10000) {
      return res.status(400).json({ success: false, message: 'Message is too long (max 10000 chars)' });
    }

    const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
    if (level && !validLevels.includes(level)) {
      return res.status(400).json({ success: false, message: `Invalid level. Must be one of: ${validLevels.join(', ')}` });
    }

    // Create the log
    const logEntry = await Log.create({
      service: service._id,
      project: service.project._id,
      organization: service.project.organization,
      level: level || 'info',
      message: message.substring(0, 10000), // Safety clip
      metadata: typeof metadata === 'object' && metadata !== null ? metadata : {},
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    // Broadcast log
    const orgIdStr = service.project.organization.toString();
    broadcastToOrg(orgIdStr, 'new_log', logEntry);

    // Update service lastHeartbeatAt and potentially status
    service.lastHeartbeatAt = new Date();
    if (service.status === 'unknown') {
      service.status = 'healthy';
    }

    // Incident detection logic
    if (level === 'error' || level === 'fatal') {
      // 1. Check if an open incident already exists for this service
      let openIncident = await Incident.findOne({ service: service._id, status: { $ne: 'resolved' } });

      if (openIncident) {
        // Update last seen and add evidence if not too many
        openIncident.lastSeenAt = new Date();
        if (openIncident.evidence.length < 50) {
          openIncident.evidence.push(logEntry._id);
        }
        await openIncident.save();
        service.status = 'degraded';
      } else {
        // 2. No open incident, check thresholds
        const windowStart = new Date(Date.now() - INCIDENT_THRESHOLD_WINDOW_MS);

        // Count errors in window
        const errorLogs = await Log.find({
          service: service._id,
          level: { $in: ['error', 'fatal'] },
          timestamp: { $gte: windowStart }
        }).select('_id').limit(INCIDENT_THRESHOLD_COUNT).lean();

        if (errorLogs.length >= INCIDENT_THRESHOLD_COUNT) {
          // Trigger new incident
          openIncident = await Incident.create({
            service: service._id,
            project: service.project._id,
            organization: service.project.organization,
            title: `High error rate detected on ${service.name}`,
            severity: level === 'fatal' ? 'critical' : 'high',
            evidence: errorLogs.map(l => l._id),
            firstSeenAt: windowStart
          });
          service.status = 'degraded';
          broadcastToOrg(orgIdStr, 'new_incident', openIncident);
          notifyIncidentCreated(openIncident).catch(err => {
            console.error('Webhook notification error for service incident:', err.message);
          });
        }
      }
    }

    await service.save();

    res.status(201).json({
      success: true,
      logId: logEntry._id
    });
  } catch (error) {
    next(error);
  }
};
