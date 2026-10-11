const mongoose = require('mongoose');

const StatusHistoryEntry = new mongoose.Schema({
  status: {
    type: String,
    enum: ['open', 'acknowledged', 'investigating', 'resolved'],
    required: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  comment: { type: String, maxlength: 1000 },
  changedAt: { type: Date, default: Date.now }
}, { _id: false });

const IncidentSchema = new mongoose.Schema({
  // 'github_actions' = CI/CD incident. Old documents have no `source`; treat them as 'service_health'.
  source: {
    type: String,
    enum: ['service_health', 'github_actions'],
    default: 'service_health',
    index: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    index: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'acknowledged', 'investigating', 'resolved'],
    default: 'open',
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'high'
  },
  title: {
    type: String,
    required: true
  },
  evidence: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Log'
  }],
  aiInvestigation: {
    summary: String,
    hypotheses: [{
      rootCause: String,
      confidence: { type: String, enum: ['low', 'medium', 'high'] },
      supportingEvidence: [String] // references to log _id strings
    }],
    recommendedSteps: [String],
    uncertainties: [String],
    rawRootCause: String,       // kept for backward compat
    rawRecommendations: String, // kept for backward compat
    investigatedAt: Date,
    provider: { type: String, enum: ['mock', 'gemini', 'openai'], default: 'mock' }
  },
  statusHistory: [StatusHistoryEntry],
  firstSeenAt: {
    type: Date,
    default: Date.now
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: Date,
  acknowledgedAt: Date,
  // Optional: set when an incident is created from a GitHub Actions workflow run
  githubContext: {
    owner: String,
    repo: String,
    runId: String,   // stored as string; GitHub run IDs exceed JS safe-int range
    runUrl: String,
    branch: String,
    conclusion: String,
    workflowName: String,
    runNumber: Number,
    headSha: String,
    commitMessage: String,
    actor: String
  }
}, {
  timestamps: true
});

IncidentSchema.index({ service: 1, status: 1 });
IncidentSchema.index({ organization: 1, status: 1 });
IncidentSchema.index({ organization: 1, createdAt: -1 });

IncidentSchema.index({ organization: 1, source: 1, createdAt: -1 });

// One incident per GitHub Actions run per organization (database-enforced).
IncidentSchema.index(
  {
    organization: 1,
    'githubContext.owner': 1,
    'githubContext.repo': 1,
    'githubContext.runId': 1
  },
  {
    unique: true,
    partialFilterExpression: { 'githubContext.runId': { $type: 'string' } }
  }
);

module.exports = mongoose.model('Incident', IncidentSchema);
