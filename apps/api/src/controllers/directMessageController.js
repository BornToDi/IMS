const prisma = require('../prismaClient');
const { createNotification } = require('../utils/workflow');
const publicUser = { id: true, name: true, userRole: true, bankName: true, avatarUrl: true };
const pairWhere = (senderId, recipientId) => ({ OR: [{ senderId, recipientId }, { senderId: recipientId, recipientId: senderId }] });

async function authorizeInbox(req, res, next) {
  try {
    const viewer = await prisma.user.findUnique({ where: { id: req.userId }, select: publicUser });
    if (!viewer) return res.status(401).json({ error: 'Please sign in again' });
    if (!['BANK', 'ADMIN'].includes(viewer.userRole)) return res.status(403).json({ error: 'Private bank support is available to bank users and admins only' });
    req.inboxUser = viewer;
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch (error) { next(error); }
}

async function contactFor(req, res) {
  const contact = await prisma.user.findUnique({ where: { id: req.params.contactId }, select: publicUser });
  const expected = req.inboxUser.userRole === 'BANK' ? 'ADMIN' : 'BANK';
  if (!contact || contact.userRole !== expected) {
    res.status(403).json({ error: 'Choose a bank user or admin from your contacts' });
    return null;
  }
  return contact;
}

async function listContacts(req, res, next) {
  try {
    const viewer = req.inboxUser;
    const contacts = await prisma.user.findMany({ where: { userRole: viewer.userRole === 'BANK' ? 'ADMIN' : 'BANK' }, select: publicUser, orderBy: { name: 'asc' } });
    const unread = await prisma.directMessage.groupBy({ by: ['senderId'], where: { recipientId: viewer.id, readAt: null }, _count: { _all: true } });
    const counts = new Map(unread.map(row => [row.senderId, row._count._all]));
    const result = await Promise.all(contacts.map(async contact => {
      const latest = await prisma.directMessage.findFirst({ where: pairWhere(viewer.id, contact.id), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      return { ...contact, unread: counts.get(contact.id) || 0, latest };
    }));
    result.sort((a, b) => Number(Boolean(b.unread)) - Number(Boolean(a.unread)) || new Date(b.latest?.createdAt || 0) - new Date(a.latest?.createdAt || 0) || a.name.localeCompare(b.name));
    res.json(result);
  } catch (error) { next(error); }
}

async function listMessages(req, res, next) {
  try {
    const contact = await contactFor(req, res); if (!contact) return;
    const where = pairWhere(req.userId, contact.id);
    if (req.query.before) {
      if (typeof req.query.before !== 'string') return res.status(400).json({ error: 'Invalid message cursor' });
      const anchor = await prisma.directMessage.findFirst({ where: { AND: [where, { id: req.query.before }] } });
      if (!anchor) return res.status(400).json({ error: 'Message cursor does not belong to this conversation' });
      where.AND = [{ OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }];
    }
    const rows = await prisma.directMessage.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51 });
    res.json({ contact, hasMore: rows.length > 50, messages: rows.slice(0, 50).reverse() });
  } catch (error) { next(error); }
}

async function sendMessage(req, res, next) {
  try {
    const contact = await contactFor(req, res); if (!contact) return;
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length > 4000) return res.status(400).json({ error: 'Enter a message between 1 and 4,000 characters' });
    const message = await prisma.directMessage.create({ data: { senderId: req.userId, recipientId: contact.id, content } });
    // Persist the notification before live delivery so an immediate read cannot leave a stale alert.
    await createNotification(req, { userId: contact.id, type: 'DIRECT_MESSAGE', message: `${req.inboxUser.name} sent you a private message`, targetUrl: `/support?contact=${encodeURIComponent(req.userId)}` }).catch(error => console.error('[direct-message] notification:', error));
    const io = req.app?.locals?.io;
    if (io) {
      io.to(`user:${contact.id}`).emit('direct-message:new', message);
      io.to(`user:${req.userId}`).emit('direct-message:new', message);
    }
    res.status(201).json(message);
  } catch (error) { next(error); }
}

async function markConversationRead(req, res, next) {
  try {
    const contact = await contactFor(req, res); if (!contact) return;
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
    const lastSeen = await prisma.directMessage.findFirst({ where: { AND: [pairWhere(req.userId, contact.id), { id: messageId }] } });
    if (!lastSeen) return res.status(400).json({ error: 'Choose the last message you have viewed' });
    const readAt = new Date();
    await prisma.directMessage.updateMany({ where: { senderId: contact.id, recipientId: req.userId, readAt: null, OR: [{ createdAt: { lt: lastSeen.createdAt } }, { createdAt: lastSeen.createdAt, id: { lte: lastSeen.id } }] }, data: { readAt } });
    const remaining = await prisma.directMessage.count({ where: { senderId: contact.id, recipientId: req.userId, readAt: null } });
    if (!remaining) await prisma.notification.updateMany({ where: { userId: req.userId, type: 'DIRECT_MESSAGE', targetUrl: `/support?contact=${encodeURIComponent(contact.id)}`, isRead: false }, data: { isRead: true } });
    const io = req.app?.locals?.io;
    if (io) io.to(`user:${contact.id}`).emit('direct-message:read', { readerId: req.userId, throughId: lastSeen.id, throughTime: lastSeen.createdAt, readAt });
    res.json({ readAt });
  } catch (error) { next(error); }
}

module.exports = { authorizeInbox, listContacts, listMessages, sendMessage, markConversationRead };
