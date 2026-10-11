const express = require('express');
const {
  getStatus, listRepos, connectRepo, getRepo, getCommits,
  getWorkflowRuns, disconnectRepo, createIncidentFromRun
} = require('../controllers/githubController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/status', getStatus);
router.get('/repos', listRepos);
router.post('/repos', connectRepo);
router.get('/repos/:id', getRepo);
router.get('/repos/:id/commits', getCommits);
router.get('/repos/:id/workflows', getWorkflowRuns);
router.delete('/repos/:id', disconnectRepo);
router.post('/repos/:id/create-incident', createIncidentFromRun);

module.exports = router;