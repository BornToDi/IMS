const prisma = require('../prismaClient');
const { sendPushForUser } = require('./push');

function messagePreview(message) {
  const content = String(message.content || message.attachmentName || 'New message').trim();
  return content.length > 90 ? `${content.slice(0, 87)}...` : content;
}

async function notifyGlobalChatRecipients(app, message) {
  const recipients = await prisma.user.findMany({
    where: { id: { not: message.authorId } },
    select: { id: true }
  });
  if (!recipients.length) return;

  const author = message.author?.name || message.author?.email || 'Someone';
  const notes = await Promise.all(recipients.map(({ id: userId }) => prisma.notification.create({
    data: {
      userId,
      type: 'GLOBAL_CHAT',
      message: `${author}: ${messagePreview(message)}`,
      targetUrl: '/chat',
      isRead: false
    }
  })));

  const io = app?.locals?.io;
  if (io) notes.forEach((note) => io.to(`user:${note.userId}`).emit('notification:new', note));
  notes.forEach((note) => {
    sendPushForUser(note.userId, note).catch((error) => console.error('[push/global-chat]', error));
  });
}

module.exports = { notifyGlobalChatRecipients };
