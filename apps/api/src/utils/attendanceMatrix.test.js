const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildReport, reportRange } = require('./attendance');
const { buildAttendanceMatrix, addAttendanceMatrixSheet } = require('./attendanceMatrix');

test('side-by-side report keeps each employee once, dates, blank times and accurate remarks', async () => {
  const range = reportRange('weekly', '2026-09-09');
  const employees = [{ id: 'a', name: 'Sayed Arefin Hasan' }, { id: 'b', name: 'Mir Raihan Hossain' }];
  const message = (id, authorId, content, createdAt) => ({ id, authorId, author: employees.find(person => person.id === authorId), content, createdAt });
  const report = buildReport([
    message('1', 'a', 'sign in', '2026-09-07T04:16:00Z'),
    message('2', 'a', 'sign out', '2026-09-07T13:30:00Z'),
    message('3', 'a', 'sign in', '2026-09-08T03:00:00Z'),
    message('4', 'b', 'sign out', '2026-09-08T13:00:00Z')
  ], employees, range);
  const matrix = buildAttendanceMatrix(report.rows, range);
  assert.equal(matrix.employees.length, 2);
  assert.equal(matrix.dates.length, 7);
  assert.equal(matrix.employees[0].days['2026-09-07'].remarks, '');
  assert.equal(matrix.employees[0].days['2026-09-08'].remarks, 'NO SIGN OUT');
  assert.equal(matrix.employees[1].days['2026-09-08'].remarks, 'NO SIGN IN');
  assert.equal(matrix.employees[1].days['2026-09-07'].remarks, 'NO RESPONSE');
  const workbook = new ExcelJS.Workbook();
  addAttendanceMatrixSheet(workbook, matrix);
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = exported.worksheets[0];
  assert.equal(sheet.rowCount, 4);
  assert.equal(sheet.columnCount, 30);
  assert.equal(sheet.getCell('B3').value, 'Sayed Arefin Hasan');
  assert.equal(sheet.getCell('C3').value, '07-09-2026');
  assert.equal(sheet.getCell('D3').value, '10:16 AM');
  assert.equal(sheet.getCell('E3').value, '07:30 PM');
  assert.equal(sheet.getCell('J3').value, 'NO SIGN OUT');
  assert.equal(sheet.getCell('F4').value, 'NO RESPONSE');
  assert.equal(sheet.getCell('D4').value, '');
  assert.equal(sheet.getCell('F1').master.address, 'C1');
  assert.equal(sheet.views[0].xSplit, 2);
  assert.equal(sheet.views[0].ySplit, 2);
});
