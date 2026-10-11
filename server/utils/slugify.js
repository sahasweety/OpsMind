const Organization = require('../models/Organization');

/**
 * Convert a string to a URL-safe slug.
 */
const toSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')       // spaces & underscores → dash
    .replace(/[^a-z0-9-]/g, '')   // remove non-alphanumeric (except dash)
    .replace(/--+/g, '-')          // collapse multiple dashes
    .replace(/^-+|-+$/g, '');      // strip leading/trailing dashes
};

/**
 * Generate a unique slug for an organization name.
 * If the base slug already exists, append a counter suffix.
 * Optionally pass excludeId to ignore a specific organization (for updates).
 */
const generateUniqueSlug = async (name, excludeId = null) => {
  const base = toSlug(name);
  let slug = base;
  let counter = 1;

  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Organization.findOne(query).lean();
    if (!exists) break;
    slug = `${base}-${counter}`;
    counter++;
  }

  return slug;
};

module.exports = { toSlug, generateUniqueSlug };
