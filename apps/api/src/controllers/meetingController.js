const prisma = require('../prismaClient');

async function createMeeting(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const { title, description, startTime, endTime, location, meetingLink, inviteeIds = [], reminderMinutes } = req.body;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!workspaceId || !title || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!member) return res.status(403).json({ error: 'Not a workspace member' });

    const uniqueInviteeIds = [...new Set((Array.isArray(inviteeIds) ? inviteeIds : []).filter((id) => id && id !== userId))];
    const validInvitees = uniqueInviteeIds.length
      ? await prisma.user.findMany({ where: { id: { in: uniqueInviteeIds } }, select: { id: true } })
      : [];
    const validInviteeIds = validInvitees.map((user) => user.id);

    // Create meeting
    const meeting = await prisma.meeting.create({
      data: {
        workspaceId,
        title,
        description,
        organizerId: userId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        location,
        meetingLink,
        reminderMinutes: reminderMinutes || 15,
        invitees: {
          create: validInviteeIds.map(id => ({ userId: id }))
        }
      },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        invitees: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    // Create notifications for invitees
    await createMeetingNotifications(meeting, 'MEETING_INVITED', req.app);

    res.json(meeting);
  } catch (err) {
    console.error('[meetings/create]', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
}

async function listMeetings(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!member) return res.status(403).json({ error: 'Not a workspace member' });

    const meetings = await prisma.meeting.findMany({
      where: { workspaceId },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        invitees: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.json(meetings);
  } catch (err) {
    console.error('[meetings/list]', err);
    res.status(500).json({ error: 'Failed to list meetings' });
  }
}

async function getMeeting(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        invitees: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    // Check if user is organizer or invitee
    const isOrganizer = meeting.organizerId === userId;
    const isInvitee = meeting.invitees.some(inv => inv.userId === userId);

    if (!isOrganizer && !isInvitee) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(meeting);
  } catch (err) {
    console.error('[meetings/get]', err);
    res.status(500).json({ error: 'Failed to get meeting' });
  }
}

async function updateMeeting(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { title, description, startTime, endTime, location, meetingLink, reminderMinutes, inviteeIds } = req.body;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.organizerId !== userId) return res.status(403).json({ error: 'Only organizer can update' });

    // Update meeting
    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        title: title || undefined,
        description: description || undefined,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        location: location || undefined,
        meetingLink: meetingLink || undefined,
        reminderMinutes: reminderMinutes || undefined,
        reminderSent: false
      },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        invitees: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    // Update invitees if provided
    if (inviteeIds) {
      await prisma.meetingInvite.deleteMany({ where: { meetingId: id } });
      await prisma.meetingInvite.createMany({
        data: inviteeIds.map(userId => ({ meetingId: id, userId }))
      });
      updated.invitees = await prisma.meetingInvite.findMany({
        where: { meetingId: id },
        include: { user: { select: { id: true, name: true, email: true } } }
      });
    }

    res.json(updated);
  } catch (err) {
    console.error('[meetings/update]', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
}

async function deleteMeeting(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.organizerId !== userId) return res.status(403).json({ error: 'Only organizer can delete' });

    await prisma.meeting.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[meetings/delete]', err);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
}

async function inviteEmployeesToMeeting(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { inviteeIds = [] } = req.body;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!Array.isArray(inviteeIds) || inviteeIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one employee' });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: { invitees: true }
    });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.organizerId !== userId) return res.status(403).json({ error: 'Only organizer can invite employees' });

    const existingIds = new Set(meeting.invitees.map((invite) => invite.userId));
    const requestedIds = [...new Set(inviteeIds.filter((employeeId) => employeeId && employeeId !== userId && !existingIds.has(employeeId)))];

    if (!requestedIds.length) {
      return res.status(409).json({ error: 'Selected employee is already invited' });
    }

    const validUsers = await prisma.user.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true }
    });
    const validInviteeIds = validUsers.map((user) => user.id);

    if (!validInviteeIds.length) return res.status(404).json({ error: 'No registered employee found' });

    await prisma.meetingInvite.createMany({
      data: validInviteeIds.map((employeeId) => ({ meetingId: id, userId: employeeId }))
    });

    const updated = await prisma.meeting.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        invitees: { include: { user: { select: { id: true, name: true, email: true } } } }
      }
    });

    const newInvites = updated.invitees.filter((invite) => validInviteeIds.includes(invite.userId));
    await createMeetingNotifications({ ...updated, invitees: newInvites }, 'MEETING_INVITED', req.app);

    res.json(updated);
  } catch (err) {
    console.error('[meetings/inviteEmployees]', err);
    res.status(500).json({ error: 'Failed to invite employees' });
  }
}

async function updateInviteStatus(req, res) {
  try {
    const userId = req.userId;
    const { status } = req.body;
    const meetingId = req.params.id || req.body.meetingId;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!['ACCEPTED', 'DECLINED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const invite = await prisma.meetingInvite.findFirst({
      where: { meetingId, userId }
    });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const updated = await prisma.meetingInvite.update({
      where: { id: invite.id },
      data: { status }
    });

    // Create notification for organizer
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { organizer: true }
    });
    const user = await prisma.user.findUnique({ where: { id: userId } });

    await prisma.notification.create({
      data: {
        userId: meeting.organizerId,
        workspaceId: meeting.workspaceId,
        type: 'MEETING_RESPONSE',
        message: `${user.name} ${status.toLowerCase()} your meeting invitation for "${meeting.title}"`
      }
    });

    res.json(updated);
  } catch (err) {
    console.error('[meetings/updateInviteStatus]', err);
    res.status(500).json({ error: 'Failed to update invite status' });
  }
}

async function getUpcomingMeetings(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get meetings where user is organizer or invitee
    const meetings = await prisma.meeting.findMany({
      where: {
        OR: [
          { organizerId: userId },
          { invitees: { some: { userId } } }
        ],
        startTime: {
          gte: now,
          lte: tomorrow
        }
      },
      include: {
        workspace: true,
        organizer: { select: { id: true, name: true, email: true } },
        invitees: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.json(meetings);
  } catch (err) {
    console.error('[meetings/upcoming]', err);
    res.status(500).json({ error: 'Failed to get upcoming meetings' });
  }
}

async function sendMeetingReminders() {
  try {
    const now = new Date();

    // Find meetings where reminder hasn't been sent yet
    const meetings = await prisma.meeting.findMany({
      where: {
        reminderSent: false,
        startTime: {
          lte: new Date(now.getTime() + 20 * 60 * 1000) // 20 min window
        }
      },
      include: {
        organizer: { select: { id: true, name: true } },
        invitees: { include: { user: { select: { id: true, name: true } } } }
      }
    });

    for (const meeting of meetings) {
      // Create notifications for all invitees
      await createMeetingNotifications(meeting, 'MEETING_REMINDER');

      // Mark as sent
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { reminderSent: true }
      });
    }

    console.log(`[meetings] Sent reminders for ${meetings.length} meetings`);
  } catch (err) {
    console.error('[meetings/sendReminders]', err);
  }
}

async function createMeetingNotifications(meeting, type, app) {
  const notificationData = (meeting.invitees || []).map(invite => ({
    userId: invite.userId,
    workspaceId: meeting.workspaceId,
    type,
    message: type === 'MEETING_REMINDER'
      ? `Reminder: ${meeting.title} starts in ${meeting.reminderMinutes} minutes${meeting.meetingLink ? ` - Join: ${meeting.meetingLink}` : ''}`
      : `You're invited to meeting: ${meeting.title} on ${new Date(meeting.startTime).toLocaleString()}${meeting.meetingLink ? ` - Join: ${meeting.meetingLink}` : ''}`
  }));

  if (type === 'MEETING_REMINDER') {
    notificationData.push({
      userId: meeting.organizerId,
      workspaceId: meeting.workspaceId,
      type,
      message: `Reminder: Your meeting ${meeting.title} starts in ${meeting.reminderMinutes} minutes${meeting.meetingLink ? ` - Join: ${meeting.meetingLink}` : ''}`
    });
  }

  if (!notificationData.length) return;

  const created = await Promise.all(notificationData.map((data) => prisma.notification.create({ data })));
  const io = app && app.locals && app.locals.io;
  if (io) {
    created.forEach((note) => io.to(`user:${note.userId}`).emit('notification:new', note));
  }
}

module.exports = { 
  createMeeting, 
  listMeetings, 
  getMeeting, 
  updateMeeting, 
  deleteMeeting, 
  updateInviteStatus,
  inviteEmployeesToMeeting,
  getUpcomingMeetings,
  sendMeetingReminders
};
