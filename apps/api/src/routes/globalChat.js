const express = require('express');
const auth = require('../middleware/auth');
const ctrl = require('../controllers/globalChatController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Routes
router.get('/', auth, ctrl.getGlobalMessages);
router.post('/', auth, ctrl.postGlobalMessage);
router.get('/files', auth, ctrl.getGlobalFiles);
router.post('/files', auth, upload.single('file'), ctrl.uploadGlobalFile);

module.exports = router;
