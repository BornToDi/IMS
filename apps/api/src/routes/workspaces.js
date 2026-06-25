const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const ctrl = require('../controllers/workspaceController');
const auth = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${unique}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 20 } });

router.use(auth);

router.get('/employees', ctrl.listRegisteredUsers);
router.get('/my-tasks', ctrl.listMyTasks);
router.get('/', ctrl.listWorkspaces);
router.post('/', ctrl.createWorkspace);
router.get('/:id', ctrl.getWorkspace);
router.put('/:id', ctrl.updateWorkspace);
router.delete('/:id', ctrl.deleteWorkspace);
router.post('/:id/task-updates', ctrl.addTaskUpdate);
router.patch('/:id/task-updates/:updateId', ctrl.updateTaskUpdate);
router.delete('/:id/task-updates/:updateId', ctrl.deleteTaskUpdate);
router.post('/:id/task-attachments', upload.array('files', 20), ctrl.uploadTaskAttachment);
router.post('/:id/invite', ctrl.inviteMember);
router.get('/:id/members', ctrl.listMembers);
router.patch('/:id/members/:memberId/role', ctrl.updateMemberRole);
router.delete('/:id/members/:memberId', ctrl.removeMember);

module.exports = router;
