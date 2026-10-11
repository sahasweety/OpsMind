const express = require('express');
const { getLogs } = require('../controllers/logController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', getLogs);

module.exports = router;
