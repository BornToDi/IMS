const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/notificationsController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', ctrl.listNotifications);
router.patch('/:id/read', ctrl.markRead);

module.exports = router;
