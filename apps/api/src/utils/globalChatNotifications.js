const prisma = require('../prismaClient');
const { sendPushForNotifications } = require('./push');

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
  const notes = await prisma.notification.createManyAndReturn({
    data: recipients.map(({ id: userId }) => ({
      userId,
      type: 'GLOBAL_CHAT',
      message: `${author}: ${messagePreview(message)}`,
      targetUrl: '/chat',
      isRead: false
    }))
  });

  const io = app?.locals?.io;
  if (io) notes.forEach((note) => io.to(`user:${note.userId}`).emit('notification:new', note));
  sendPushForNotifications(notes).catch((error) => console.error('[push/global-chat]', error));
}

module.exports = { notifyGlobalChatRecipients };
