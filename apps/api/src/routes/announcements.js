const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/announcementController');
const auth = require('../middleware/auth');

router.use(auth);

// Announcements
router.get('/', ctrl.listAnnouncements);
router.post('/', ctrl.createAnnouncement);
router.get('/:id', ctrl.getAnnouncement);
router.put('/:id', ctrl.updateAnnouncement);
router.delete('/:id', ctrl.deleteAnnouncement);
router.patch('/:id/pin', ctrl.pinAnnouncement);

// Reactions (toggle emoji)
router.post('/:id/reactions', ctrl.addReaction);
router.delete('/:id/reactions', ctrl.removeReaction);

// Comments
router.post('/:id/comments', ctrl.addComment);
router.get('/:id/comments', ctrl.getComments);
router.delete('/comments/:commentId', ctrl.deleteComment);

module.exports = router;
