const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/actionItemController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', ctrl.listActionItems);
router.post('/', ctrl.createActionItem);
router.get('/:id', ctrl.getActionItem);
router.put('/:id', ctrl.updateActionItem);
router.delete('/:id', ctrl.deleteActionItem);
router.patch('/:id/status', ctrl.updateStatus);

module.exports = router;
