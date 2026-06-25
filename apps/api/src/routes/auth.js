const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.post('/refresh', controller.refresh);
router.get('/me', auth, controller.me);
router.get('/users', auth, controller.listUsers);
router.put('/profile', auth, controller.updateProfile);

module.exports = router;
