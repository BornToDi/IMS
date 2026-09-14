const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/inventoryController');
const legacy = require('../controllers/hardwareController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

router.use(auth);
router.use(ctrl.identify);
router.get('/legacy', legacy.listBatches);
router.get('/legacy/:id', legacy.getBatch);
router.get('/summary', ctrl.summary);
router.get('/reports', ctrl.report);
router.get('/settings', ctrl.settings);
router.put('/settings', ctrl.settings);
router.post('/banks', ctrl.saveBank);
router.put('/banks/:id', ctrl.saveBank);
router.get('/documents/:documentId', ctrl.download);
router.get('/', ctrl.list);
router.post('/stock-in', ctrl.stockIn);
router.post('/actions', ctrl.bulkAct);
router.get('/:id', ctrl.detail);
router.post('/:id/actions', ctrl.act);
router.post('/:id/documents', upload.single('file'), ctrl.upload);
router.use(ctrl.errors);

module.exports = router;
