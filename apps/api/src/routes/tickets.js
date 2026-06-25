const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/ticketController');

router.use(auth);
router.get('/options', ctrl.listTicketOptions);
router.get('/', ctrl.listTickets);
router.post('/', ctrl.createTicket);
router.get('/:id', ctrl.getTicket);
router.post('/:id/assign', ctrl.assignTicket);
router.post('/:id/updates', ctrl.addTicketUpdate);

module.exports = router;
