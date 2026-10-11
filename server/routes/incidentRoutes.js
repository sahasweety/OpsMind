const express = require('express');
const { getIncidents, getIncident, acknowledgeIncident, resolveIncident, reopenIncident } = require('../controllers/incidentController');
const { investigateIncident } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getIncidents);
router.get('/:id', getIncident);
router.post('/:id/investigate', investigateIncident);
router.post('/:id/acknowledge', acknowledgeIncident);
router.post('/:id/resolve', resolveIncident);
router.post('/:id/reopen', reopenIncident);

module.exports = router;
