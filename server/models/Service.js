const mongoose = require('mongoose');

const ENVIRONMENTS = ['development', 'staging', 'production'];
const STATUSES = ['unknown', 'healthy', 'degraded', 'down'];

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    default: '',
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  environment: {
    type: String,
    enum: {
      values: ENVIRONMENTS,
      message: 'Environment must be one of: development, staging, production'
    },
    required: [true, 'Environment is required']
  },
  status: {
    type: String,
    enum: {
      values: STATUSES,
      message: 'Status must be one of: unknown, healthy, degraded, down'
    },
    default: 'unknown'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastHeartbeatAt: {
    type: Date,
    default: null
  },
  /**
   * Ingestion credential — only the SHA-256 hash is stored.
   * The raw secret is generated once at creation and returned
   * in the API response exactly once. It is never logged or stored.
   * select: false ensures this field is never returned by default queries.
   */
  credentialHash: {
    type: String,
    select: false
  }
}, {
  timestamps: true
});

// Indexes for common query patterns
serviceSchema.index({ project: 1 });
serviceSchema.index({ project: 1, environment: 1 });

module.exports = mongoose.model('Service', serviceSchema);
module.exports.ENVIRONMENTS = ENVIRONMENTS;
module.exports.STATUSES = STATUSES;
