const Log = require('../models/Log');
const Service = require('../models/Service');
const { getMembership } = require('../utils/authHelpers');

exports.getLogs = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { limit = 50, page = 1, level, startDate, endDate } = req.query;

    if (!serviceId) {
      return res.status(400).json({ success: false, message: 'Service ID is required' });
    }

    const service = await Service.findById(serviceId).populate('project');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    // Authorization: User must be a member of the organization
    const orgId = service.project.organization;
    const Organization = require('../models/Organization');
    const organization = await Organization.findById(orgId).lean();
    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    const membership = getMembership(organization, req.user._id);

    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not authorized to view logs for this service' });
    }

    // Build query
    const query = { service: service._id };

    if (level) {
      query.level = level;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const parsedLimit = Math.min(parseInt(limit, 10), 100); // Max 100
    const parsedPage = Math.max(parseInt(page, 10), 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const total = await Log.countDocuments(query);

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    next(error);
  }
};
