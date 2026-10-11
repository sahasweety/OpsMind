const mongoose = require('mongoose');

/**
 * Check whether a string is a valid MongoDB ObjectId.
 * Returns a 400 response if invalid.
 */
const isValidObjectId = (id, res) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid ID format' });
    return false;
  }
  return true;
};

/**
 * Check whether the authenticated user is a member of the given organization.
 * Works with both lean() documents (populated or raw) and Mongoose documents.
 * Returns the membership record or null.
 */
const getMembership = (organization, userId) => {
  const uid = userId.toString();
  return organization.members.find((m) => {
    // m.user can be a populated object { _id, name, email } or a raw ObjectId/string
    const memberId = m.user?._id ? m.user._id.toString() : m.user.toString();
    return memberId === uid;
  });
};


/**
 * Check whether the user has at least one of the required roles.
 */
const hasRole = (organization, userId, roles) => {
  const membership = getMembership(organization, userId);
  return membership && roles.includes(membership.role);
};

module.exports = { isValidObjectId, getMembership, hasRole };
