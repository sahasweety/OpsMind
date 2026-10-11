const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    index: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
    default: 'info',
    index: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 10000
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for time-range queries on a specific service
LogSchema.index({ service: 1, timestamp: -1 });
// Index for time-range queries on a project (across all its services)
LogSchema.index({ project: 1, timestamp: -1 });

module.exports = mongoose.model('Log', LogSchema);
