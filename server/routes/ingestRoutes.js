const express = require('express');
const { ingestLogs, protectIngest } = require('../controllers/ingestController');

const router = express.Router({ mergeParams: true });

// Note: This route does NOT use the standard JWT protect middleware.
// It uses protectIngest which validates the Bearer token as the service's raw ingest secret.
router.post('/logs', protectIngest, ingestLogs);

module.exports = router;
