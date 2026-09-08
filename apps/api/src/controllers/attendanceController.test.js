const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../prismaClient');
const ExcelJS = require('exceljs');
const { getAttendance } = require('./attendanceController');

test('only admins and assistants can access team reports and export; employees are denied', async () => {
  const original = { findUnique: prisma.user.findUnique, findMany: prisma.user.findMany, messages: prisma.globalMessage.findMany };
  let role = 'ASSISTANT';
  let where;
  prisma.user.findUnique = async () => ({ userRole: role });
  prisma.user.findMany = async () => [{ id: 'self', name: '=Example', employeeCode: 'E01' }];
  prisma.globalMessage.findMany = async args => {
    where = args.where;
    return [{ id: 'm1', authorId: 'self', author: { name: '=Example', employeeCode: 'E01' }, content: 'sign in\nReason: Deployed in AIBL', latitude: 23.81, longitude: 90.41, locationLabel: 'AIBL Dhaka', createdAt: new Date('2026-09-06T03:00:00Z') }];
  };
  const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; }, setHeader(key, value) { this.headers[key] = value; } });
  try {
    const req = { userId: 'self', query: { period: 'daily', date: '2026-09-06', employeeId: 'someone-else' } };
    let res = response();
    await getAttendance(req, res);
    assert.equal(res.code, 200);
    assert.equal(where.authorId, 'someone-else');
    assert.equal(res.body.canViewTeam, true);
    req.query.format = 'xlsx';
    res = response();
    await getAttendance(req, res);
    assert.equal(res.code, 200);
    assert.equal(where.authorId, 'someone-else');
    for (const deniedRole of ['EMPLOYEE', 'FIELD_EMPLOYEE', 'MANAGEMENT', 'BANK', 'UNKNOWN', undefined]) {
      role = deniedRole;
      for (const format of [undefined, 'xlsx']) {
        req.query.format = format;
        where = undefined;
        res = response();
        await getAttendance(req, res);
        assert.equal(res.code, 403, `${deniedRole} must not access ${format || 'report'}`);
        assert.equal(where, undefined, 'Denied requests must not query attendance messages');
      }
    }
    role = 'ADMIN';
    req.query.format = 'xlsx';
    res = response();
    await getAttendance(req, res);
    assert.equal(where.authorId, 'someone-else');
    assert.equal(res.code, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    assert.equal(workbook.worksheets.length, 2);
    assert.equal(workbook.worksheets[0].getCell('B2').value, '=Example');
    assert.equal(workbook.worksheets[0].getCell('B2').type, ExcelJS.ValueType.String);
    assert.equal(workbook.worksheets[1].rowCount, 2);
    assert.equal(workbook.worksheets[0].getCell('K2').value, 'Deployed in AIBL');
    assert.equal(workbook.worksheets[1].getCell('G2').value, 'Deployed in AIBL');
    assert.equal(workbook.worksheets[0].getCell('L2').value, 'AIBL Dhaka');
    assert.equal(workbook.worksheets[0].getCell('M2').value, 'https://www.google.com/maps?q=23.81,90.41');
    assert.equal(workbook.worksheets[1].getCell('I2').value, 23.81);
    assert.equal(workbook.worksheets[1].getCell('J2').value, 90.41);
    prisma.user.findMany = async () => [
      { id: 'other', name: 'Aaron Other' },
      { id: 'rajib', name: 'Rajib Chandra Sen (POS)' },
      { id: 'sayed', name: 'Sayed Arefin Hasan' }
    ];
    prisma.globalMessage.findMany = async () => [];
    req.query = { period: 'daily', date: '2026-09-06' };
    res = response();
    await getAttendance(req, res);
    assert.deepEqual(res.body.rows.map(row => row.employeeId), ['sayed', 'rajib', 'other']);
    assert.ok(res.body.rows.every(row => row.status === 'No attendance' && row.signIn === null && row.minutes === 0));
    assert.deepEqual(res.body.events, []);
    req.query.format = 'xlsx';
    res = response();
    await getAttendance(req, res);
    const emptyAttendance = new ExcelJS.Workbook();
    await emptyAttendance.xlsx.load(res.body);
    assert.equal(emptyAttendance.worksheets[0].rowCount, 4);
    assert.equal(emptyAttendance.worksheets[0].getCell('B2').value, 'Sayed Arefin Hasan');
    assert.equal(emptyAttendance.worksheets[0].getCell('I2').value, 'No attendance');
    assert.equal(emptyAttendance.worksheets[1].rowCount, 1);
    req.query = { period: 'weekly', date: '2026-09-06', employeeId: 'rajib' };
    res = response();
    await getAttendance(req, res);
    assert.equal(res.body.rows.length, 7);
    assert.ok(res.body.rows.every(row => row.employeeId === 'rajib'));
    assert.equal(res.body.rows[0].date, '2026-08-31');
    assert.equal(res.body.rows[6].date, '2026-09-06');
    req.query.date = 'invalid';
    res = response();
    await getAttendance(req, res);
    assert.equal(res.code, 400);
  } finally {
    prisma.user.findUnique = original.findUnique;
    prisma.user.findMany = original.findMany;
    prisma.globalMessage.findMany = original.messages;
    await prisma.$disconnect();
  }
});
