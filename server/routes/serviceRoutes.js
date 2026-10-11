const express = require('express');
const {
  createService,
  listServices,
  getService,
  updateService,
  updateServiceStatus,
  deleteService,
  rotateCredential
} = require('../controllers/serviceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .post(createService)
  .get(listServices);

// Specific sub-resource routes must come before the generic /:serviceId route
router.patch('/:serviceId/status', updateServiceStatus);
router.post('/:serviceId/rotate-credential', rotateCredential);

router.route('/:serviceId')
  .get(getService)
  .patch(updateService)
  .delete(deleteService);

module.exports = router;
