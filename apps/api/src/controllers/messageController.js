const prisma = require('../prismaClient');

async function createMessage(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const { content } = req.body;

    if (!content || !workspaceId) {
      return res.status(400).json({ error: 'Content and workspaceId required' });
    }

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const message = await prisma.message.create({
      data: {
        workspaceId,
        authorId: userId,
        content
      },
      include: {
        author: true
      }
    });

    res.status(201).json(message);
  } catch (err) {
    console.error('[messageController] createMessage error:', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
}

async function getMessages(req, res) {
  try {
    const userId = req.userId;
    const { workspaceId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check if user is member of workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId }
    });
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }

    const messages = await prisma.message.findMany({
      where: { workspaceId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    res.json(messages);
  } catch (err) {
    console.error('[messageController] getMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

module.exports = {
  createMessage,
  getMessages
};
