const express = require('express');
const auth = require('../middleware/auth');
const { dashboardStats } = require('../controllers/statsController');

const router = express.Router();

router.use(auth);

router.get('/dashboard', dashboardStats);

module.exports = router;