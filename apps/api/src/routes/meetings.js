const express = require('express');
const authMiddleware = require('../middleware/auth');
const { 
  createMeeting, 
  listMeetings, 
  getMeeting, 
  updateMeeting, 
  deleteMeeting, 
  updateInviteStatus,
  inviteEmployeesToMeeting,
  getUpcomingMeetings
} = require('../controllers/meetingController');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// Specific meeting routes
router.get('/meeting/:id', getMeeting);
router.put('/meeting/:id', updateMeeting);
router.delete('/meeting/:id', deleteMeeting);
router.post('/meeting/:id/invite', inviteEmployeesToMeeting);
router.patch('/meeting/:id/invite/respond', updateInviteStatus);

// User-specific routes
router.get('/upcoming', getUpcomingMeetings);

// Workspace-specific meetings (router is mounted at /api/workspaces/:workspaceId/meetings)
router.get('/', listMeetings);
router.post('/', createMeeting);

// Invite responses
router.patch('/invite/respond', updateInviteStatus);

module.exports = router;
