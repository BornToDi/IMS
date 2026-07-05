const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../prismaClient');
const { sendPushForUser } = require('../utils/push');

const router = express.Router({ mergeParams: true });
const publicUser = { id: true, name: true, email: true, avatarUrl: true, userRole: true, bankName: true };

function previewText(content, attachmentName) {
  const base = content || (attachmentName ? `📎 ${attachmentName}` : 'Attachment');
  return base.length > 80 ? `${base.slice(0, 77)}...` : base;
}

async function notifyWorkspace({ req, workspaceId, senderId, type, message }) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { members: { select: { userId: true } } }
  });
  if (!workspace) return;

  const recipientIds = workspace.members.map((m) => m.userId).filter((id) => id !== senderId);
  if (recipientIds.length === 0) return;

  const created = await Promise.all(recipientIds.map((userId) => prisma.notification.create({
    data: { userId, workspaceId, type, message, isRead: false }
  })));

  const io = req.app && req.app.locals && req.app.locals.io;
  if (io) {
    created.forEach((note) => io.to(`user:${note.userId}`).emit('notification:new', note));
  }
  created.forEach((note) => sendPushForUser(note.userId, note).catch((error) => console.error('[push/message]', error)));
}

router.post('/', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const { content = '', attachmentUrl, attachmentType, attachmentName, attachmentSize, latitude, longitude, locationLabel } = req.body || {};

    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (!String(content).trim() && !attachmentUrl) return res.status(400).json({ error: 'Message or attachment required' });

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
      include: { user: { select: { name: true, email: true } }, workspace: { select: { name: true } } }
    });
    if (!member) return res.status(403).json({ error: 'Not a member of this workspace' });

    const message = await prisma.message.create({
      data: {
        workspaceId,
        authorId: userId,
        content: String(content || '').trim() || (attachmentName ? `📎 ${attachmentName}` : 'Attachment'),
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        attachmentName: attachmentName || null,
        attachmentSize: attachmentSize ? Number(attachmentSize) : null,
        latitude: latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude),
        longitude: longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude),
        locationLabel: locationLabel || null
      },
      include: { author: { select: publicUser } }
    });

    const io = req.app && req.app.locals && req.app.locals.io;
    if (io) io.to(`workspace:${workspaceId}`).emit('workspace:message:new', message);

    await notifyWorkspace({
      req,
      workspaceId,
      senderId: userId,
      type: 'MESSAGE',
      message: `${member.user.name || member.user.email} messaged in ${member.workspace.name}: ${previewText(content, attachmentName)}`
    });

    res.status(201).json(message);
  } catch (err) {
    console.error('[messages POST] error:', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!member) return res.status(403).json({ error: 'Not a member of this workspace' });

    const messages = await prisma.message.findMany({
      where: { workspaceId },
      include: { author: { select: publicUser } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(parseInt(limit, 10) || 100, 200),
      skip: parseInt(offset, 10) || 0
    });

    res.json(messages);
  } catch (err) {
    console.error('[messages GET] error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
