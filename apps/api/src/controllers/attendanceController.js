const prisma = require('../prismaClient');
const ExcelJS = require('exceljs');
const { reportRange, buildReport, TIME_ZONE } = require('../utils/attendance');

async function getAttendance(req, res) {
  try {
    const viewer = await prisma.user.findUnique({ where: { id: req.userId }, select: { userRole: true } });
    if (!viewer || !['ADMIN', 'ASSISTANT'].includes(viewer.userRole)) return res.status(403).json({ error: 'Attendance is available to admins and assistants only' });
    const canViewTeam = true;
    let range;
    try { range = reportRange(req.query.period, req.query.date); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const employeeId = req.query.employeeId || undefined;
    const employees = await prisma.user.findMany({ where: { userRole: { not: 'BANK' } }, select: { id: true, name: true, employeeCode: true }, orderBy: { name: 'asc' } });
    const messages = await prisma.globalMessage.findMany({
      where: { createdAt: { gte: range.start, lt: range.end }, authorId: employeeId, author: { userRole: { not: 'BANK' } }, attachmentType: null, replyToId: null },
      select: { id: true, authorId: true, content: true, createdAt: true, author: { select: { name: true, employeeCode: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    const report = buildReport(messages);
    if (req.query.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Daily attendance');
      sheet.columns = [ ['Date', 'date'], ['Employee', 'name'], ['Employee code', 'employeeCode'], ['First sign in (Dhaka)', 'signIn'], ['Last sign out (Dhaka)', 'signOut'], ['Worked minutes', 'minutes'], ['Sign in count', 'signIns'], ['Sign out count', 'signOuts'], ['Status', 'status'], ['Notes', 'issues'] ].map(([header, key]) => ({ header, key, width: 25 }));
      const time = (value) => value ? new Date(value).toLocaleString('en-GB', { timeZone: TIME_ZONE, hour12: false }) : '';
      sheet.columns = [...sheet.columns.map(column => ({ header: column.header, key: column.key, width: column.width })), { header: 'Sign in reasons', key: 'reasons', width: 45 }];
      report.rows.forEach(row => sheet.addRow({ ...row, signIn: time(row.signIn), signOut: time(row.signOut), issues: row.issues.join('; '), reasons: row.reasons.join('; ') }));
      const events = workbook.addWorksheet('All sign events');
      events.columns = [['Date', 'date'], ['Employee', 'name'], ['Employee code', 'employeeCode'], ['Action', 'action'], ['Time (Dhaka)', 'time'], ['Chat message ID', 'messageId']].map(([header, key]) => ({ header, key, width: 25 }));
      events.columns = [...events.columns.map(column => ({ header: column.header, key: column.key, width: column.width })), { header: 'Reason', key: 'reason', width: 45 }];
      report.events.forEach(event => events.addRow({ ...event, time: time(event.time) }));
      for (const page of [sheet, events]) {
        page.views = [{ state: 'frozen', ySplit: 1 }];
        page.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: page.columnCount } };
        page.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        page.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      }
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-${range.from}.xlsx"`);
      return res.send(Buffer.from(buffer));
    }
    return res.json({ ...report, employees, canViewTeam, from: range.from, until: range.until, timeZone: TIME_ZONE });
  } catch (error) {
    console.error('[attendance]', error);
    return res.status(500).json({ error: 'Could not load attendance report' });
  }
}
module.exports = { getAttendance };
