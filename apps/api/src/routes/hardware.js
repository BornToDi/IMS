const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/hardwareController');

router.use(auth);
router.get('/', ctrl.listBatches);
router.post('/', ctrl.createBatch);
router.get('/:id', ctrl.getBatch);
router.put('/:id', ctrl.updateBatch);
router.delete('/:id', ctrl.deleteBatch);
router.post('/:id/updates', ctrl.addUpdate);

module.exports = router;
