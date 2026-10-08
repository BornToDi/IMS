const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../prismaClient');
const { getAttendanceState } = require('./attendanceController');
const { dateKey } = require('../utils/attendance');

test('attendance status uses only the current user and Dhaka day, ignoring ordinary chat', async () => {
  const originalUser = prisma.user.findUnique;
  const originalMessages = prisma.globalMessage.findMany;
  let role = 'EMPLOYEE';
  let queries = 0;
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, setHeader() {}, json(body) { this.body = body; return this; } });
  try {
    prisma.user.findUnique = async () => ({ userRole: role });
    prisma.globalMessage.findMany = async ({ where, orderBy }) => {
      queries++;
      assert.equal(where.authorId, 'self');
      assert.equal(dateKey(where.createdAt.gte), dateKey(new Date()));
      assert.equal(where.createdAt.lt - where.createdAt.gte, 86400000);
      assert.equal(where.replyToId, null);
      assert.equal(where.attachmentType, null);
      assert.deepEqual(orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
      return [{ id: 'chat', content: 'Hello' }, { id: 'out', content: 'sign out' }, { id: 'in', content: 'sign in\nReason: Bank visit' }];
    };
    const res = response();
    await getAttendanceState({ userId: 'self' }, res);
    assert.equal(res.body.latest.id, 'out');
    role = 'BANK';
    const denied = response();
    await getAttendanceState({ userId: 'self' }, denied);
    assert.equal(denied.code, 403);
    assert.equal(queries, 1);
    role = 'EMPLOYEE';
    prisma.globalMessage.findMany = async () => [];
    const empty = response();
    await getAttendanceState({ userId: 'self' }, empty);
    assert.equal(empty.body.latest, null);
  } finally {
    prisma.user.findUnique = originalUser;
    prisma.globalMessage.findMany = originalMessages;
    await prisma.$disconnect();
  }
});
