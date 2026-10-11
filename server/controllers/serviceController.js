const Service = require('../models/Service');
const Project = require('../models/Project');
const Organization = require('../models/Organization');
const { isValidObjectId, getMembership, hasRole } = require('../utils/authHelpers');
const { generateServiceCredential } = require('../utils/credential');
const { ENVIRONMENTS, STATUSES } = require('../models/Service');

/**
 * Resolve a project and its parent organization, and verify the user is a member.
 * Returns { project, organization } or sends a response and returns null.
 */
const resolveProjectAndOrg = async (projectId, userId, res) => {
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, message: 'Project not found' });
    return null;
  }
  const organization = await Organization.findById(project.organization);
  if (!organization) {
    res.status(404).json({ success: false, message: 'Organization not found' });
    return null;
  }
  if (!getMembership(organization, userId)) {
    res.status(403).json({ success: false, message: 'Not authorized to access this project' });
    return null;
  }
  return { project, organization };
};

// POST /api/services
exports.createService = async (req, res, next) => {
  try {
    const { name, description, projectId, environment } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Service name is required' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }
    if (!isValidObjectId(projectId, res)) return;
    if (!environment) {
      return res.status(400).json({ success: false, message: 'environment is required' });
    }
    if (!ENVIRONMENTS.includes(environment)) {
      return res.status(400).json({
        success: false,
        message: `environment must be one of: ${ENVIRONMENTS.join(', ')}`
      });
    }

    const ctx = await resolveProjectAndOrg(projectId, req.user._id, res);
    if (!ctx) return;

    // Only owner/admin may create services
    if (!hasRole(ctx.organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Only organization owners and admins can register services' });
    }

    const { rawSecret, credentialHash } = generateServiceCredential();

    const service = await Service.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      project: projectId,
      environment,
      status: 'unknown',
      lastHeartbeatAt: null,
      createdBy: req.user._id,
      credentialHash
    });

    // Return the raw secret ONCE — never again after this response
    res.status(201).json({
      success: true,
      service: sanitizeService(service),
      // Displayed once so the user can copy it; not stored anywhere by us
      ingestSecret: rawSecret,
      secretWarning: 'Copy this secret now. It will not be shown again.'
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    next(error);
  }
};

// GET /api/services?projectId=...&environment=...
exports.listServices = async (req, res, next) => {
  try {
    const { projectId, environment } = req.query;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId query parameter is required' });
    }
    if (!isValidObjectId(projectId, res)) return;

    if (environment && !ENVIRONMENTS.includes(environment)) {
      return res.status(400).json({
        success: false,
        message: `environment must be one of: ${ENVIRONMENTS.join(', ')}`
      });
    }

    const ctx = await resolveProjectAndOrg(projectId, req.user._id, res);
    if (!ctx) return;

    const filter = { project: projectId };
    if (environment) filter.environment = environment;

    const services = await Service.find(filter)
      .populate('createdBy', 'name email')
      .lean();

    res.json({ success: true, services: services.map(sanitizeService) });
  } catch (error) {
    next(error);
  }
};

// GET /api/services/:serviceId
exports.getService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    if (!isValidObjectId(serviceId, res)) return;

    const service = await Service.findById(serviceId)
      .populate('createdBy', 'name email')
      .populate('project', 'name organization');

    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const organization = await Organization.findById(service.project.organization);
    if (!organization || !getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this service' });
    }

    res.json({ success: true, service: sanitizeService(service.toObject()) });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/services/:serviceId
exports.updateService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    if (!isValidObjectId(serviceId, res)) return;

    const service = await Service.findById(serviceId).populate('project', 'organization');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const organization = await Organization.findById(service.project.organization);
    if (!organization || !hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this service' });
    }

    // Explicit field allowlist — prevents mass assignment
    const { name, description, environment } = req.body;

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Service name cannot be empty' });
      service.name = name.trim();
    }
    if (description !== undefined) {
      service.description = description.trim();
    }
    if (environment !== undefined) {
      if (!ENVIRONMENTS.includes(environment)) {
        return res.status(400).json({
          success: false,
          message: `environment must be one of: ${ENVIRONMENTS.join(', ')}`
        });
      }
      service.environment = environment;
    }

    await service.save();
    res.json({ success: true, service: sanitizeService(service.toObject()) });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    next(error);
  }
};

// PATCH /api/services/:serviceId/status
exports.updateServiceStatus = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    if (!isValidObjectId(serviceId, res)) return;

    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }
    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${STATUSES.join(', ')}`
      });
    }

    const service = await Service.findById(serviceId).populate('project', 'organization');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const organization = await Organization.findById(service.project.organization);
    if (!organization || !hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Not authorized to update service status' });
    }

    service.status = status;
    await service.save();
    res.json({ success: true, service: sanitizeService(service.toObject()) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/services/:serviceId
exports.deleteService = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    if (!isValidObjectId(serviceId, res)) return;

    const service = await Service.findById(serviceId).populate('project', 'organization');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const organization = await Organization.findById(service.project.organization);
    if (!organization || !hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this service' });
    }

    await service.deleteOne();
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// POST /api/services/:serviceId/rotate-credential
exports.rotateCredential = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    if (!isValidObjectId(serviceId, res)) return;

    // Load with credentialHash so we can overwrite it
    const service = await Service.findById(serviceId)
      .select('+credentialHash')
      .populate('project', 'organization');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const organization = await Organization.findById(service.project.organization);
    if (!organization || !hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to rotate credentials for this service'
      });
    }

    // Generate a fresh credential pair — old hash is immediately overwritten
    const { rawSecret, credentialHash } = generateServiceCredential();
    service.credentialHash = credentialHash;
    await service.save();

    // Return the plaintext secret exactly once; never log or store it
    res.json({
      success: true,
      service: sanitizeService(service.toObject()),
      ingestSecret: rawSecret,
      secretWarning: 'Copy this secret now. The previous credential is immediately invalid. This secret will not be shown again.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Strip credentialHash and any other internal fields before sending to client.
 * Called on every outbound service object.
 */
const sanitizeService = (service) => {
  const obj = service.toObject ? service.toObject() : { ...service };
  delete obj.credentialHash;
  return obj;
};
