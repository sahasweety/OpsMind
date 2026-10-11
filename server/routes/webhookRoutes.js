const express = require('express');
const {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook
} = require('../controllers/webhookController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router({ mergeParams: true });
router.use(protect);

router.get('/', listWebhooks);
router.post('/', createWebhook);
router.patch('/:webhookId', updateWebhook);
router.delete('/:webhookId', deleteWebhook);
router.post('/:webhookId/test', testWebhook);

module.exports = router;
