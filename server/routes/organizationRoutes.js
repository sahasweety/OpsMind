const express = require('express');
const {
  createOrganization,
  getMyOrganizations,
  getOrganization,
  updateOrganization,
  deleteOrganization
} = require('../controllers/organizationController');
const { protect } = require('../middleware/authMiddleware');

const webhookRoutes = require('./webhookRoutes');

const router = express.Router();

router.use(protect);

router.use('/:organizationId/webhooks', webhookRoutes);

router.route('/')
  .post(createOrganization)
  .get(getMyOrganizations);

router.route('/:organizationId')
  .get(getOrganization)
  .patch(updateOrganization)
  .delete(deleteOrganization);

module.exports = router;
