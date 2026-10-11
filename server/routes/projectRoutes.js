const express = require('express');
const {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .post(createProject)
  .get(getProjects);

router.route('/:projectId')
  .get(getProject)
  .patch(updateProject)
  .delete(deleteProject);

module.exports = router;
