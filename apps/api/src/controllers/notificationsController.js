const prisma = require('../prismaClient');
const { enabled: pushEnabled, publicKey } = require('../utils/push');

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

function getPushPublicKey(req, res) {
  if (!pushEnabled) return res.status(503).json({ error: 'Push notifications are not configured' });
  res.json({ publicKey });
}

async function subscribePush(req, res) {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }
    });
    res.status(201).json({ id: subscription.id });
  } catch (err) {
    console.error('[notifications/subscribePush]', err);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
}

async function unsubscribePush(req, res) {
  try {
    const endpoint = String(req.body?.endpoint || '');
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } });
    }
    res.status(204).end();
  } catch (err) {
    console.error('[notifications/unsubscribePush]', err);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
}

module.exports = { listNotifications, markRead, getPushPublicKey, subscribePush, unsubscribePush };
