const Organization = require('../models/Organization');
const Project = require('../models/Project');
const GitHubRepo = require('../models/GitHubRepo');
const Webhook = require('../models/Webhook');
const { generateUniqueSlug } = require('../utils/slugify');
const { isValidObjectId, getMembership, hasRole } = require('../utils/authHelpers');

// POST /api/organizations
exports.createOrganization = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Organization name is required' });
    }

    const slug = await generateUniqueSlug(name);

    const organization = await Organization.create({
      name: name.trim(),
      slug,
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'owner' }]
    });

    res.status(201).json({ success: true, organization });
  } catch (error) {
    next(error);
  }
};

// GET /api/organizations
exports.getMyOrganizations = async (req, res, next) => {
  try {
    const organizations = await Organization.find({
      'members.user': req.user._id
    })
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .lean();

    res.json({ success: true, organizations });
  } catch (error) {
    next(error);
  }
};

// GET /api/organizations/:organizationId
exports.getOrganization = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;

    const organization = await Organization.findById(organizationId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .lean();

    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this organization' });
    }

    res.json({ success: true, organization });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/organizations/:organizationId
exports.updateOrganization = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;

    const organization = await Organization.findById(organizationId);

    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this organization' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Organization name is required' });
    }

    organization.name = name.trim();
    organization.slug = await generateUniqueSlug(name, organizationId);
    await organization.save();

    res.json({ success: true, organization });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/organizations/:organizationId
exports.deleteOrganization = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    if (!isValidObjectId(organizationId, res)) return;

    const organization = await Organization.findById(organizationId);

    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (organization.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the organization owner can delete it' });
    }

    // Delete all projects in this organization before deleting the org
    await Project.deleteMany({ organization: organizationId });
    await organization.deleteOne();
    await GitHubRepo.deleteMany({ organization: organizationId });
    await Webhook.deleteMany({ organization: organizationId });

    res.json({ success: true, message: 'Organization and its projects deleted successfully' });
  } catch (error) {
    next(error);
  }
};
