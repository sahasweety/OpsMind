const mongoose = require('mongoose');
const { isValidOwner, isValidRepo } = require('../utils/githubValidation');

/**
 * Minimal metadata for a connected GitHub repository. Live data is fetched on demand.
 * No tokens are stored. owner/repo use GitHub's canonical casing.
 */
const githubRepoSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  owner: { type: String, required: true, trim: true, validate: [isValidOwner, 'Invalid GitHub owner'] },
  repo: { type: String, required: true, trim: true, validate: [isValidRepo, 'Invalid GitHub repository name'] },
  connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

githubRepoSchema.index({ organization: 1, owner: 1, repo: 1 }, { unique: true });

module.exports = mongoose.model('GitHubRepo', githubRepoSchema);