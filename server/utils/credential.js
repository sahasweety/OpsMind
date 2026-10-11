const crypto = require('crypto');

/**
 * Generate a cryptographically secure random service ingestion secret.
 * Returns { rawSecret, credentialHash }
 *
 * - rawSecret: 32-byte hex string — shown to the user ONCE, never stored.
 * - credentialHash: SHA-256 hex digest of the rawSecret — stored in MongoDB.
 *
 * SHA-256 is appropriate here because the raw secret has 256 bits of entropy,
 * making preimage attacks infeasible regardless of hashing speed.
 * (Unlike passwords, we never need to verify user-supplied low-entropy input.)
 */
const generateServiceCredential = () => {
  const rawSecret = crypto.randomBytes(32).toString('hex'); // 64-char hex
  const credentialHash = crypto
    .createHash('sha256')
    .update(rawSecret)
    .digest('hex');
  return { rawSecret, credentialHash };
};

const hashCredential = (rawSecret) => {
  return crypto
    .createHash('sha256')
    .update(rawSecret)
    .digest('hex');
};

module.exports = { generateServiceCredential, hashCredential };
