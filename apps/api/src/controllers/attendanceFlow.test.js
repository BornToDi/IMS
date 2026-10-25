const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const prisma = require('../prismaClient');
const notifications = require('../utils/globalChatNotifications');
const originalNotify = notifications.notifyGlobalChatRecipients;
notifications.notifyGlobalChatRecipients = async () => {};
const { postGlobalMessage } = require('./globalChatController');
const { getAttendance, getAttendanceState } = require('./attendanceController');

const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; }, setHeader(key, value) { this.headers[key] = value; } });

test('saved employee sign events retain identity, separate locations and times through JSON and Excel', async () => {
  const originals = { user: prisma.user.findUnique, users: prisma.user.findMany, create: prisma.globalMessage.create, messages: prisma.globalMessage.findMany };
  const employees = [{ id: 'a', name: 'Employee A', employeeCode: 'A' }, { id: 'b', name: 'Employee B', employeeCode: 'B' }];
  const saved = [];
  const date = new Date(Date.now() + 21600000).toISOString().slice(0, 10);
  let createdAt;
  prisma.user.findUnique = async ({ where }) => ({ userRole: where.id === 'admin' ? 'ADMIN' : 'EMPLOYEE' });
  prisma.user.findMany = async () => employees;
  prisma.globalMessage.create = async ({ data }) => {
    const record = { ...data, id: String(saved.length), createdAt, author: employees.find(person => person.id === data.authorId) };
    saved.push(record);
    return record;
  };
  prisma.globalMessage.findMany = async ({ where, orderBy }) => {
    const matching = saved.filter(message => (!where.authorId || message.authorId === where.authorId) && message.createdAt >= where.createdAt.gte && message.createdAt < where.createdAt.lt);
    return orderBy[0].createdAt === 'desc' ? matching.reverse() : matching;
  };
  try {
    for (const employee of employees) {
      for (const action of ['in', 'out']) {
        createdAt = new Date(`${date}T${action === 'in' ? '03' : '11'}:00:00Z`);
        const res = response();
        const location = action === 'in' ? { latitude: 23.81, longitude: 90.41, locationLabel: 'Office' } : { latitude: 23.75, longitude: 90.39, locationLabel: 'Bank' };
        await postGlobalMessage({ userId: employee.id, body: { content: `sign ${action}`, attendanceAction: action, ...location, ...(action === 'in' ? { attendanceReason: 'Bank visit' } : {}) } }, res);
        assert.equal(res.code, 201);
        assert.equal(res.body.authorId, employee.id);
      }
      const state = response();
      await getAttendanceState({ userId: employee.id }, state);
      assert.equal(state.body.latest.content, 'sign out');
      assert.equal(state.body.latest.authorId, employee.id);
    }
    const req = { userId: 'admin', query: { period: 'daily', date } };
    let res = response();
    await getAttendance(req, res);
    assert.equal(res.body.rows.length, 2);
    assert.equal(res.body.events.length, 4);
    for (const row of res.body.rows) {
      assert.equal(row.minutes, 480);
      assert.equal(row.status, 'Complete');
      assert.equal(row.signInLocation.locationLabel, 'Office');
      assert.equal(row.signOutLocation.locationLabel, 'Bank');
    }
    req.query.format = 'xlsx';
    res = response();
    await getAttendance(req, res);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const daily = workbook.getWorksheet('Daily attendance');
    for (let row = 2; row <= 3; row++) {
      assert.equal(daily.getCell(row, 12).value, 'Office');
      assert.equal(daily.getCell(row, 13).value, 'https://www.google.com/maps?q=23.81,90.41');
      assert.equal(daily.getCell(row, 14).value, 'Bank');
      assert.equal(daily.getCell(row, 15).value, 'https://www.google.com/maps?q=23.75,90.39');
    }
    const events = workbook.getWorksheet('All sign events');
    assert.equal(events.rowCount, 5);
    assert.equal(events.getCell('H2').value, 'Office');
    assert.equal(events.getCell('I2').value, 23.81);
    assert.equal(events.getCell('J2').value, 90.41);
    assert.equal(events.getCell('H3').value, 'Bank');
    req.query = { period: 'daily', date, employeeId: 'b' };
    res = response();
    await getAttendance(req, res);
    assert.equal(res.body.rows.length, 1);
    assert.equal(res.body.rows[0].employeeId, 'b');
    assert.ok(res.body.events.every(event => event.employeeId === 'b'));
  } finally {
    prisma.user.findUnique = originals.user;
    prisma.user.findMany = originals.users;
    prisma.globalMessage.create = originals.create;
    prisma.globalMessage.findMany = originals.messages;
    notifications.notifyGlobalChatRecipients = originalNotify;
    await prisma.$disconnect();
  }
});
