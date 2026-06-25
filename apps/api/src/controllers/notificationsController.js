const prisma = require('../prismaClient');

async function listNotifications(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const { workspaceId } = req.params;
    const where = workspaceId ? { userId, workspaceId } : { userId };
    const notes = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(notes);
  } catch (err) {
    console.error('[notifications/list]', err);
    res.status(500).json({ error: 'Failed to list notifications' });
  }
}

async function markRead(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const note = await prisma.notification.findUnique({ where: { id } });
    if (!note) return res.status(404).json({ error: 'Not found' });
    if (note.userId !== userId) return res.status(403).json({ error: 'Access denied' });
    const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
    res.json(updated);
  } catch (err) {
    console.error('[notifications/markRead]', err);
    res.status(500).json({ error: 'Failed to mark read' });
  }
}

module.exports = { listNotifications, markRead };
