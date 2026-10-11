const Project = require('../models/Project');
const Organization = require('../models/Organization');
const { isValidObjectId, getMembership, hasRole } = require('../utils/authHelpers');

// POST /api/projects
exports.createProject = async (req, res, next) => {
  try {
    const { name, description, organizationId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required' });
    }
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Organization ID is required' });
    }
    if (!isValidObjectId(organizationId, res)) return;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to create projects in this organization' });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      organization: organizationId,
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, project });
  } catch (error) {
    next(error);
  }
};

// GET /api/projects?organizationId=...
exports.getProjects = async (req, res, next) => {
  try {
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId query parameter is required' });
    }
    if (!isValidObjectId(organizationId, res)) return;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }

    if (!getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view projects in this organization' });
    }

    const projects = await Project.find({ organization: organizationId })
      .populate('createdBy', 'name email')
      .lean();

    res.json({ success: true, projects });
  } catch (error) {
    next(error);
  }
};

// GET /api/projects/:projectId
exports.getProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId, res)) return;

    const project = await Project.findById(projectId)
      .populate('createdBy', 'name email')
      .populate('organization', 'name slug');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const organization = await Organization.findById(project.organization._id);
    if (!organization || !getMembership(organization, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this project' });
    }

    res.json({ success: true, project });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/projects/:projectId
exports.updateProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId, res)) return;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const organization = await Organization.findById(project.organization);
    if (!organization || !hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this project' });
    }

    const { name, description } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Project name cannot be empty' });
      project.name = name.trim();
    }
    if (description !== undefined) {
      project.description = description.trim();
    }

    await project.save();
    res.json({ success: true, project });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/projects/:projectId
exports.deleteProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId, res)) return;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const organization = await Organization.findById(project.organization);
    if (!organization || !hasRole(organization, req.user._id, ['owner', 'admin'])) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this project' });
    }

    await project.deleteOne();
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
};
