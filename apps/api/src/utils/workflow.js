
const prisma = require('../prismaClient');

function isAdminRole(role) {
  return ['ADMIN', 'MANAGEMENT'].includes(String(role || '').toUpperCase());
}
function isBankRole(role) {
  return String(role || '').toUpperCase() === 'BANK';
}
async function getUser(userId) {
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, userRole: true, bankName: true } });
}
async function createNotification(req, { userId, workspaceId = null, type, message, targetUrl = null }) {
  if (!userId || !message) return null;
  const note = await prisma.notification.create({ data: { userId, workspaceId, type, message, targetUrl, isRead: false } });
  const io = req.app && req.app.locals && req.app.locals.io;
  if (io) io.to(`user:${userId}`).emit('notification:new', note);
  return note;
}
async function notifyAdmins(req, message, exceptUserId = null) {
  const admins = await prisma.user.findMany({ where: { userRole: { in: ['ADMIN', 'MANAGEMENT'] } }, select: { id: true } });
  await Promise.all(admins.filter((u) => u.id !== exceptUserId).map((u) => createNotification(req, { userId: u.id, type: 'ADMIN_ALERT', message, targetUrl: '/tickets' })));
}
function nextCode(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return `${prefix}-${stamp}-${Math.floor(Math.random() * 900 + 100)}`;
}
function parseMentionIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (e) {}
  return String(value).split(',').map((x) => x.trim()).filter(Boolean);
}

module.exports = { isAdminRole, isBankRole, getUser, createNotification, notifyAdmins, nextCode, parseMentionIds };
