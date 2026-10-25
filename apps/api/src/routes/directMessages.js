const express = require('express');
const auth = require('../middleware/auth');
const ctrl = require('../controllers/directMessageController');
const multer = require('multer');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { DIRECTORY, MAX_SIZE } = require('../utils/privateAttachments');
const upload = multer({ storage: multer.diskStorage({
  destination(req, file, done) { fs.mkdir(DIRECTORY, { recursive: true }, error => done(error, DIRECTORY)); },
  filename(req, file, done) { done(null, randomUUID()); }
}), limits: { fileSize: MAX_SIZE, files: 1, fields: 1, parts: 3, fieldSize: 16000 } }).single('file');
const router = express.Router();
router.use(auth);
router.use(ctrl.authorizeInbox);
router.get('/contacts', ctrl.listContacts);
router.get('/attachments/:messageId', ctrl.downloadAttachment);
router.post('/:contactId/attachments', ctrl.authorizeContact, (req, res, next) => {
  upload(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Files must be 20 MB or smaller' : 'Upload one file and an optional caption' });
    next();
  });
}, ctrl.sendAttachment);
router.get('/:contactId', ctrl.listMessages);
router.post('/:contactId', ctrl.sendMessage);
router.patch('/:contactId/read', ctrl.markConversationRead);
module.exports = router;
