const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../prismaClient');
const { markRead } = require('./notificationsController');

test('opening chat marks its group read, while announcements remain individual', async () => {
  const original = { findFirst: prisma.notification.findFirst, update: prisma.notification.update, updateMany: prisma.notification.updateMany };
  let group;
  prisma.notification.updateMany = async args => { group = args; };
  prisma.notification.update = async args => ({ id: args.where.id, isRead: true });
  const res = { json(body) { this.body = body; } };
  try {
    prisma.notification.findFirst = async () => ({ id: 'chat', type: 'GLOBAL_CHAT' });
    await markRead({ userId: 'viewer', params: { id: 'chat' } }, res);
    assert.deepEqual(group.where, { userId: 'viewer', type: 'GLOBAL_CHAT', isRead: false });
    assert.equal(res.body.isRead, true);
    group = undefined;
    prisma.notification.findFirst = async () => ({ id: 'announcement', type: 'ANNOUNCEMENT' });
    await markRead({ userId: 'viewer', params: { id: 'announcement' } }, res);
    assert.equal(group, undefined);
    assert.equal(res.body.id, 'announcement');
  } finally {
    Object.assign(prisma.notification, original);
    await prisma.$disconnect();
  }
});
