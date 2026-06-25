const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/auditController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', ctrl.listAuditLogs);

module.exports = router;
