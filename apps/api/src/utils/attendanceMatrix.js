function buildAttendanceMatrix(rows, range) {
  const dates = [];
  for (const day = new Date(`${range.from}T00:00:00Z`); day.toISOString().slice(0, 10) < range.until; day.setUTCDate(day.getUTCDate() + 1)) dates.push(day.toISOString().slice(0, 10));
  const people = new Map();
  for (const row of rows) {
    if (!people.has(row.employeeId)) people.set(row.employeeId, { employeeId: row.employeeId, name: row.name, employeeCode: row.employeeCode, days: {} });
    const remarks = [];
    if (!row.signIns && !row.signOuts) remarks.push('NO RESPONSE');
    else {
      if (!row.signIn) remarks.push('NO SIGN IN');
      if (row.status === 'Missing sign out') remarks.push('NO SIGN OUT');
      remarks.push(...row.issues.filter(issue => issue !== 'Sign out without sign in'));
    }
    people.get(row.employeeId).days[row.date] = { date: row.date, signIn: row.signIn, signOut: row.signOut, remarks: remarks.join('; ') };
  }
  return { dates, employees: [...people.values()].map((person, index) => ({ ...person, serial: index + 1 })) };
}

function addAttendanceMatrixSheet(workbook, matrix) {
  const sheet = workbook.addWorksheet('Attendance report');
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 34;
  sheet.mergeCells('A1:A2'); sheet.getCell('A1').value = 'SL';
  sheet.mergeCells('B1:B2'); sheet.getCell('B1').value = 'Engineer Name';
  const time = value => value ? new Date(value).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
  matrix.dates.forEach((date, index) => {
    const start = 3 + index * 4;
    sheet.mergeCells(1, start, 1, start + 3);
    sheet.getCell(1, start).value = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
    ['Date', 'Sign In Time', 'Sign Out Time', 'Remarks'].forEach((title, offset) => {
      sheet.getCell(2, start + offset).value = title;
      sheet.getColumn(start + offset).width = offset === 3 ? 24 : 16;
    });
  });
  matrix.employees.forEach(person => sheet.addRow([person.serial, `${person.name}${person.employeeCode ? ` (${person.employeeCode})` : ''}`, ...matrix.dates.flatMap(date => {
    const day = person.days[date];
    return [date.split('-').reverse().join('-'), time(day?.signIn), time(day?.signOut), day?.remarks || ''];
  })]));
  sheet.eachRow(row => row.eachCell({ includeEmpty: true }, cell => {
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [side, { style: 'thin', color: { argb: 'FF808080' } }]));
  }));
  for (const index of [1, 2]) { sheet.getRow(index).font = { bold: true }; sheet.getRow(index).height = 26; }
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2', printTitlesColumn: 'A:B' };
  return sheet;
}
module.exports = { buildAttendanceMatrix, addAttendanceMatrixSheet };
