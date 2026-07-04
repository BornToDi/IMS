const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/posSerialController');

const uploadDir = path.join(__dirname, '../../uploads/pos-imports');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/banks', ctrl.listPublicBanks);

router.use(auth);
router.get('/bank-master', ctrl.listBanks);
router.post('/bank-master', ctrl.createBank);
router.put('/bank-master/:id', ctrl.updateBank);
router.delete('/bank-master/:id', ctrl.deleteBank);
router.get('/', ctrl.listPosSerials);
router.post('/', ctrl.createPosSerial);
router.post('/import', upload.single('file'), ctrl.importPosSerials);
router.delete('/bulk', ctrl.deletePosSerials);
router.delete('/:id', ctrl.deletePosSerial);

module.exports = router;
