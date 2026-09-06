const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../prismaClient');
const notifications = require('../utils/globalChatNotifications');
const originalNotify = notifications.notifyGlobalChatRecipients;
notifications.notifyGlobalChatRecipients = async () => {};
const { postGlobalMessage } = require('./globalChatController');

test('sign in reason is validated, authorized and saved with the chat message', async () => {
  const originalFind = prisma.user.findUnique;
  const originalCreate = prisma.globalMessage.create;
  let role = 'ASSISTANT';
  let saved;
  prisma.user.findUnique = async () => ({ userRole: role });
  prisma.globalMessage.create = async ({ data }) => { saved = data; return { ...data, id: 'message-1' }; };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    for (const reason of ['', '   ', 'x'.repeat(501), 123]) {
      const res = response();
      await postGlobalMessage({ userId: 'self', body: { content: 'sign in', attendanceReason: reason } }, res);
      assert.equal(res.code, 400);
      assert.equal(saved, undefined);
    }
    role = 'BANK';
    let res = response();
    await postGlobalMessage({ userId: 'self', body: { content: 'sign in', attendanceReason: 'Deployed in AIBL' } }, res);
    assert.equal(res.code, 403);
    assert.equal(saved, undefined);
    role = 'EMPLOYEE';
    for (const action of ['in', 'out']) {
      for (const coords of [{}, { latitude: null, longitude: null }, { latitude: 91, longitude: 90 }, { latitude: 23, longitude: 181 }, { latitude: '23', longitude: 90 }]) {
        res = response();
        await postGlobalMessage({ userId: 'self', body: { content: `sign ${action}`, attendanceAction: action, attendanceReason: action === 'in' ? 'Deployed in AIBL' : undefined, ...coords } }, res);
        assert.equal(res.code, 400);
        assert.equal(saved, undefined);
      }
    }
    for (role of ['ADMIN', 'ASSISTANT', 'EMPLOYEE', 'FIELD_EMPLOYEE']) {
      res = response();
      await postGlobalMessage({ userId: 'self', body: { content: 'sign in', attendanceAction: 'in', attendanceReason: '  Deployed in AIBL  ', latitude: 23.81, longitude: 90.41, locationLabel: 'Dhaka' } }, res);
      assert.equal(res.code, 201);
      assert.equal(saved.content, 'sign in\nReason: Deployed in AIBL');
      assert.equal(saved.authorId, 'self');
      assert.equal(saved.latitude, 23.81);
      assert.equal(saved.longitude, 90.41);
      assert.equal(saved.locationLabel, 'Dhaka');
      res = response();
      await postGlobalMessage({ userId: 'self', body: { content: 'sign out', attendanceAction: 'out', latitude: 0, longitude: 0 } }, res);
      assert.equal(res.code, 201);
      assert.equal(saved.content, 'sign out');
      assert.equal(saved.latitude, 0);
      assert.equal(saved.longitude, 0);
      assert.equal(saved.authorId, 'self');
    }
  } finally {
    prisma.user.findUnique = originalFind;
    prisma.globalMessage.create = originalCreate;
    notifications.notifyGlobalChatRecipients = originalNotify;
    await prisma.$disconnect();
  }
});
