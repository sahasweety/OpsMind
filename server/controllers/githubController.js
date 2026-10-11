const GitHubRepo = require('../models/GitHubRepo');
const Incident = require('../models/Incident');
const Organization = require('../models/Organization');
const { getMembership, isValidObjectId } = require('../utils/authHelpers');
const gh = require('../utils/githubClient');
const { isValidOwner, isValidRepo, isValidRunId } = require('../utils/githubValidation');
const { mapRepoMeta, mapCommit, mapRun, isIncidentEligible } = require('../utils/githubMappers');
const { notifyIncidentCreated } = require('../services/webhookService');

const ADMIN_ROLES = ['owner', 'admin'];

// ─── Error mapping ───────────────────────────────────────────────────────────
// Upstream auth failures are NOT sent as 401 (the SPA would log the user out).
const sendGitHubError = (err, res) => {
  if (!(err instanceof gh.GitHubError)) {
    return res.status(502).json({ success: false, code: 'UPSTREAM', message: 'Unexpected error while contacting GitHub' });
  }
  const tokenSet = gh.isTokenConfigured();

  switch (err.code) {
    case 'NOT_FOUND':
      return res.status(404).json({
        success: false, code: err.code,
        message: tokenSet
          ? "Repository not found, or the server's GitHub token cannot access it."
          : 'Repository not found. If it is private, the server needs a GITHUB_TOKEN with read access to it.'
      });
    case 'RATE_LIMITED':
      return res.status(429).json({
        success: false, code: err.code,
        resetAt: err.resetAt ? err.resetAt.toISOString() : null,
        message: tokenSet
          ? 'GitHub API rate limit reached. Please try again after the limit resets.'
          : 'GitHub API rate limit reached (anonymous requests are limited to 60 per hour). Configure GITHUB_TOKEN on the server for a higher limit.'
      });
    case 'BAD_CREDENTIALS':
      return res.status(502).json({
        success: false, code: err.code,
        message: 'The GitHub token configured on the server was rejected (invalid, expired or revoked).'
      });
    case 'FORBIDDEN':
      return res.status(403).json({
        success: false, code: err.code,
        message: 'GitHub denied access to this resource. The server token may lack read permission for it.'
      });
    case 'TIMEOUT':
      return res.status(504).json({ success: false, code: err.code, message: 'GitHub took too long to respond. Please try again.' });
    case 'NETWORK':
      return res.status(502).json({ success: false, code: err.code, message: 'Could not reach GitHub. Please try again shortly.' });
    default:
      return res.status(502).json({ success: false, code: 'UPSTREAM', message: 'GitHub returned an unexpected error.' });
  }
};

// ─── Authorization helpers ───────────────────────────────────────────────────
const authorizeOrg = async (organizationId, userId, res, requireRoles = null) => {
  if (!isValidObjectId(organizationId, res)) return null;

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    res.status(404).json({ success: false, message: 'Organization not found' });
    return null;
  }
  const membership = getMembership(organization, userId);
  if (!membership) {
    res.status(403).json({ success: false, message: 'Not authorized for this organization' });
    return null;
  }
  if (requireRoles && !requireRoles.includes(membership.role)) {
    res.status(403).json({ success: false, message: `Only ${requireRoles.join(' or ')} can perform this action` });
    return null;
  }
  return organization;
};

const resolveRecord = async (id, userId, res, requireRoles = null) => {
  if (!isValidObjectId(id, res)) return null;

  const record = await GitHubRepo.findById(id);
  if (!record) {
    res.status(404).json({ success: false, message: 'Connected repository not found' });
    return null;
  }
  const organization = await authorizeOrg(record.organization, userId, res, requireRoles);
  return organization ? record : null;
};

const clampPerPage = (value) => Math.min(100, Math.max(1, parseInt(value, 10) || 30));

// ─── Route handlers ──────────────────────────────────────────────────────────

// GET /api/github/status
exports.getStatus = (req, res) => {
  res.json({ success: true, tokenConfigured: gh.isTokenConfigured() });
};

// GET /api/github/repos?organizationId=...
exports.listRepos = async (req, res, next) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId query parameter is required' });
    }
    if (!await authorizeOrg(organizationId, req.user._id, res)) return;

    const repos = await GitHubRepo.find({ organization: organizationId })
      .populate('connectedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, repos });
  } catch (err) { next(err); }
};

// POST /api/github/repos   { organizationId, owner, repo }
exports.connectRepo = async (req, res, next) => {
  try {
    const { organizationId, owner, repo } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    if (!owner || !repo) {
      return res.status(400).json({ success: false, message: '`owner` and `repo` are required' });
    }
    if (!isValidOwner(owner)) {
      return res.status(400).json({ success: false, message: 'Invalid GitHub owner name' });
    }
    if (!isValidRepo(repo)) {
      return res.status(400).json({ success: false, message: 'Invalid GitHub repository name' });
    }

    if (!await authorizeOrg(organizationId, req.user._id, res, ADMIN_ROLES)) return;

    let result;
    try {
      result = await gh.getRepo(owner, repo);
    } catch (err) {
      return sendGitHubError(err, res);
    }
    const meta = mapRepoMeta(result.data);

    const canonicalOwner = result.data.owner?.login || owner;
    const canonicalRepo = result.data.name || repo;

    const existing = await GitHubRepo.findOne({
      organization: organizationId, owner: canonicalOwner, repo: canonicalRepo
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `${canonicalOwner}/${canonicalRepo} is already connected to this organization`
      });
    }

    const saved = await GitHubRepo.create({
      organization: organizationId,
      owner: canonicalOwner,
      repo: canonicalRepo,
      connectedBy: req.user._id
    });

    res.status(201).json({ success: true, githubRepo: saved, meta, rateLimit: result.rateLimit });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Repository already connected' });
    }
    next(err);
  }
};

// GET /api/github/repos/:id
exports.getRepo = async (req, res, next) => {
  try {
    const record = await resolveRecord(req.params.id, req.user._id, res);
    if (!record) return;

    let result;
    try {
      result = await gh.getRepo(record.owner, record.repo);
    } catch (err) {
      return sendGitHubError(err, res);
    }
    res.json({ success: true, githubRepo: record, meta: mapRepoMeta(result.data), rateLimit: result.rateLimit });
  } catch (err) { next(err); }
};

// GET /api/github/repos/:id/commits?perPage=30
exports.getCommits = async (req, res, next) => {
  try {
    const record = await resolveRecord(req.params.id, req.user._id, res);
    if (!record) return;

    let result;
    try {
      result = await gh.getCommits(record.owner, record.repo, clampPerPage(req.query.perPage));
    } catch (err) {
      // GitHub answers 409 "Git Repository is empty" for a repo with no commits.
      if (err instanceof gh.GitHubError && err.code === 'CONFLICT') {
        return res.json({ success: true, commits: [], rateLimit: null });
      }
      return sendGitHubError(err, res);
    }
    res.json({ success: true, commits: result.data.map(mapCommit), rateLimit: result.rateLimit });
  } catch (err) { next(err); }
};

// GET /api/github/repos/:id/workflows?perPage=30
exports.getWorkflowRuns = async (req, res, next) => {
  try {
    const record = await resolveRecord(req.params.id, req.user._id, res);
    if (!record) return;

    let result;
    try {
      result = await gh.getWorkflowRuns(record.owner, record.repo, clampPerPage(req.query.perPage));
    } catch (err) {
      return sendGitHubError(err, res);
    }

    const runs = (result.data.workflow_runs || []).map(mapRun);

    // Attach any CI/CD incident already raised for each run.
    const linked = runs.length
      ? await Incident.find({
        organization: record.organization,
        'githubContext.owner': record.owner,
        'githubContext.repo': record.repo,
        'githubContext.runId': { $in: runs.map((r) => r.id) }
      }).select('_id status githubContext.runId').lean()
      : [];
    const incidentByRun = new Map(linked.map((i) => [i.githubContext.runId, i]));

    res.json({
      success: true,
      totalCount: result.data.total_count,
      runs: runs.map((r) => {
        const inc = incidentByRun.get(r.id);
        return {
          ...r,
          canCreateIncident: isIncidentEligible(r),
          incident: inc ? { id: inc._id, status: inc.status } : null
        };
      }),
      rateLimit: result.rateLimit
    });
  } catch (err) { next(err); }
};

// DELETE /api/github/repos/:id
exports.disconnectRepo = async (req, res, next) => {
  try {
    const record = await resolveRecord(req.params.id, req.user._id, res, ADMIN_ROLES);
    if (!record) return;

    await record.deleteOne(); // existing incidents are kept as history
    res.json({ success: true, message: 'Repository disconnected' });
  } catch (err) { next(err); }
};

// POST /api/github/repos/:id/create-incident   { runId }
// Only runId comes from the client; everything else is read from GitHub itself.
exports.createIncidentFromRun = async (req, res, next) => {
  try {
    const record = await resolveRecord(req.params.id, req.user._id, res);
    if (!record) return;

    const runId = req.body?.runId;
    if (!isValidRunId(runId)) {
      return res.status(400).json({ success: false, message: 'A valid numeric runId is required' });
    }
    const runIdStr = String(runId);

    const scope = {
      organization: record.organization,
      'githubContext.owner': record.owner,
      'githubContext.repo': record.repo,
      'githubContext.runId': runIdStr
    };

    // Duplicate prevention: any status (a resolved incident still counts).
    const existing = await Incident.findOne(scope).select('_id status');
    if (existing) {
      return res.status(409).json({
        success: false, code: 'DUPLICATE_INCIDENT',
        message: 'An incident already exists for this workflow run',
        incidentId: existing._id
      });
    }

    let result;
    try {
      result = await gh.getWorkflowRun(record.owner, record.repo, runIdStr);
    } catch (err) {
      if (err instanceof gh.GitHubError && err.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'Workflow run not found in this repository' });
      }
      return sendGitHubError(err, res);
    }

    const run = mapRun(result.data);
    if (!isIncidentEligible(run)) {
      return res.status(400).json({
        success: false,
        message: 'Incidents can only be created for completed runs that failed or timed out'
      });
    }

    const workflow = run.workflowName || 'Workflow';
    const title = `CI/CD failure: ${workflow} on ${record.owner}/${record.repo} (${run.branch || 'unknown branch'})`;

    let incident;
    try {
      incident = await Incident.create({
        organization: record.organization,
        source: 'github_actions',
        title,
        severity: 'medium',
        status: 'open',
        statusHistory: [{
          status: 'open',
          actor: req.user._id,
          comment: `Created from GitHub Actions run #${run.runNumber} (${run.htmlUrl})`,
          changedAt: new Date()
        }],
        githubContext: {
          owner: record.owner,
          repo: record.repo,
          runId: runIdStr,
          runUrl: run.htmlUrl,
          branch: run.branch,
          conclusion: run.conclusion,
          workflowName: run.workflowName,
          runNumber: run.runNumber,
          headSha: run.headSha,
          commitMessage: run.commitMessage,
          actor: run.actor
        }
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        // Lost a race with a concurrent request; the unique index caught it.
        const dup = await Incident.findOne(scope).select('_id');
        return res.status(409).json({
          success: false, code: 'DUPLICATE_INCIDENT',
          message: 'An incident already exists for this workflow run',
          incidentId: dup?._id || null
        });
      }
      throw createErr;
    }

    notifyIncidentCreated(incident).catch(err => {
      console.error('Webhook notification error for GitHub incident:', err.message);
    });

    res.status(201).json({ success: true, incident });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(', ') });
    }
    next(err);
  }
};