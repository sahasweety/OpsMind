const Service = require('../models/Service');
const Organization = require('../models/Organization');

exports.getDashboardSummary = async (req, res, next) => {
  try {
    // 1. Get all organizations the user belongs to
    const orgs = await Organization.find({ 'members.user': req.user._id }).select('_id name slug');
    const orgIds = orgs.map(o => o._id);

    // Create a quick lookup for orgs
    const orgMap = {};
    orgs.forEach(o => {
      orgMap[o._id.toString()] = { _id: o._id, name: o.name, slug: o.slug };
    });

    // 2. Fetch all services across projects in these organizations
    // Populate the project to get its name and organization
    const services = await Service.find({})
      .populate({
        path: 'project',
        select: '_id name organization',
        match: { organization: { $in: orgIds } } // Only projects belonging to user's orgs
      })
      .select('name status environment project lastHeartbeatAt')
      .lean();

    // 3. Filter out services whose project was filtered out by the populate match
    const validServices = services.filter(s => s.project !== null);

    // 4. Aggregate counts
    const totalServices = validServices.length;
    const environmentCounts = {};
    const statusCounts = {};

    const attentionRequired = [];

    validServices.forEach(s => {
      // Aggregate environment
      environmentCounts[s.environment] = (environmentCounts[s.environment] || 0) + 1;
      // Aggregate status
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;

      // Identify attention items
      if (s.status === 'degraded' || s.status === 'down') {
        const orgIdStr = s.project.organization.toString();
        attentionRequired.push({
          _id: s._id,
          name: s.name,
          status: s.status,
          environment: s.environment,
          lastHeartbeatAt: s.lastHeartbeatAt,
          project: {
            _id: s.project._id,
            name: s.project.name
          },
          organization: orgMap[orgIdStr]
        });
      }
    });

    res.json({
      success: true,
      summary: {
        totalServices,
        environmentCounts,
        statusCounts,
        attentionRequired
      }
    });
  } catch (error) {
    next(error);
  }
};
