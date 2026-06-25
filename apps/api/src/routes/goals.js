const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/goalController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', ctrl.listGoals);
router.post('/', ctrl.createGoal);
router.get('/:id', ctrl.getGoal);
router.put('/:id', ctrl.updateGoal);
router.delete('/:id', ctrl.deleteGoal);

router.post('/:id/milestones', ctrl.addMilestone);
router.put('/:id/milestones/:milestoneId', ctrl.updateMilestone);
router.delete('/:id/milestones/:milestoneId', ctrl.deleteMilestone);

router.post('/:id/activity', ctrl.addActivity);
router.get('/:id/activity', ctrl.getActivities);

module.exports = router;
