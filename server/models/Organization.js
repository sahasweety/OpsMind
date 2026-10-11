const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'member'],
    required: true
  }
}, { _id: false });

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [membershipSchema]
}, {
  timestamps: true
});

organizationSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Organization', organizationSchema);
