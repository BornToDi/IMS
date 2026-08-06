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
router.get('/admin/users', auth, controller.adminListUsers);
router.put('/admin/users/:id', auth, controller.adminUpdateUser);
router.put('/admin/users/:id/password', auth, controller.adminResetPassword);
router.delete('/admin/users/:id', auth, controller.adminDeleteUser);

module.exports = router;
