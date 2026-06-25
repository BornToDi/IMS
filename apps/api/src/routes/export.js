const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/exportController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', ctrl.exportWorkspace);

module.exports = router;
