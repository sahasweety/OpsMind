const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Webhook name is required'],
    trim: true,
    maxlength: 100
  },
  url: {
    type: String,
    required: [true, 'Webhook URL is required'],
    trim: true
  },
  secret: {
    type: String, // Optional HMAC secret for signing payloads
    select: false // Excluded by default in queries to prevent accidental leakage
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  events: {
    type: [String],
    default: ['incident.created']
  },
  lastDelivery: {
    status: {
      type: String,
      enum: ['success', 'failed', 'timeout', 'pending', null],
      default: null
    },
    statusCode: {
      type: Number,
      default: null
    },
    error: {
      type: String,
      default: null
    },
    timestamp: {
      type: Date,
      default: null
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

webhookSchema.index({ organization: 1, enabled: 1 });

module.exports = mongoose.model('Webhook', webhookSchema);
