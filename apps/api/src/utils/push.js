const webpush = require('web-push');
const prisma = require('../prismaClient');

const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const subject = String(process.env.VAPID_SUBJECT || 'mailto:admin@netfield.local').trim();
const enabled = Boolean(publicKey && privateKey);

if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey);

async function sendPushForUser(userId, notification) {
  if (!enabled || !userId) return;

  const [subscriptions, unreadCount] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } })
  ]);

  const payload = JSON.stringify({
    title: 'NetField',
    body: notification.message,
    url: notification.targetUrl || '/',
    tag: notification.id,
    unreadCount
  });

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload);
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { endpoint: subscription.endpoint } }).catch(() => {});
      } else {
        console.error('[push/send]', error?.message || error);
      }
    }
  }));
}

module.exports = { enabled, publicKey, sendPushForUser };
