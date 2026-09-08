const test = require('node:test');
const assert = require('node:assert/strict');
const { command, dateKey, reportRange, buildReport } = require('./attendance');
const message = (id, content, createdAt, extra = {}) => ({ id, content, createdAt, authorId: 'employee-1', author: { name: 'Employee', employeeCode: 'E01' }, ...extra });
test('monthly reports retain empty days without duplicating recorded attendance', () => {
  const result = buildReport([
    message('1', 'sign in', '2024-02-10T03:00:00Z'),
    message('2', 'sign out', '2024-02-10T11:00:00Z')
  ], [{ id: 'employee-1', name: 'Employee', employeeCode: 'E01' }], reportRange('monthly', '2024-02-10'));
  assert.equal(result.rows.length, 29);
  assert.equal(result.rows.filter(row => row.status === 'No attendance').length, 28);
  assert.equal(result.rows.find(row => row.date === '2024-02-10').minutes, 480);
  assert.equal(result.events.length, 2);
  assert.ok(result.rows.every(row => Array.isArray(row.reasons)));
});
test('roster employees come first in image order across dates and sign events', () => {
  const entries = [
    ['other', 'Aaron Other', '2026-09-06T01:00:00Z'],
    ['rajib', 'Rajib Chandra Sen (POS)', '2026-09-06T02:00:00Z'],
    ['susanta', ' SUSANTA Kumar Das (POS) ', '2026-09-06T03:00:00Z'],
    ['sayed', 'Sayed Arefin Hasan', '2026-09-07T03:00:00Z'],
    ['sayed', 'Sayed Arefin Hasan', '2026-09-06T03:00:00Z'],
    ['ma', 'M A Al Mahmud', '2026-09-06T03:00:00Z']
  ];
  const messages = entries.map(([authorId, name, date], index) => message(String(index), 'sign in', date, { authorId, author: { name } }));
  const report = buildReport(messages);
  assert.deepEqual(report.rows.map(row => row.employeeId), ['sayed', 'sayed', 'susanta', 'ma', 'rajib', 'other']);
  assert.deepEqual(report.events.map(event => event.employeeId), ['sayed', 'sayed', 'susanta', 'ma', 'rajib', 'other']);
  assert.deepEqual(report.rows.slice(0, 2).map(row => row.date), ['2026-09-06', '2026-09-07']);
  assert.equal(messages[0].authorId, 'other');
});
test('recognizes standalone commands without matching conversation or quoted text', () => {
  for (const value of ['sign in', ' SIGN-IN! ', 'signin', 'Sign  In.']) assert.equal(command(value), 'in');
  assert.equal(command('Sign out'), 'out');
  for (const value of ['please sign in', 'I will sign out later', 'design in', 'sign in\nsome text']) assert.equal(command(value), null);
});
test('Dhaka dates and calendar report boundaries', () => {
  assert.equal(dateKey('2026-09-06T18:00:00Z'), '2026-09-07');
  assert.equal(reportRange('weekly', '2026-09-06').from, '2026-08-31');
  assert.equal(reportRange('monthly', '2024-02-20').until, '2024-03-01');
  assert.equal(reportRange('daily', '2026-09-06').start.toISOString(), '2026-09-05T18:00:00.000Z');
  assert.throws(() => reportRange('daily', '2026-02-30'));
  assert.throws(() => reportRange('yearly', '2026-09-06'));
});
test('reason-bearing sign ins preserve reasons and completed hours', () => {
  const result = buildReport([
    message('1', 'sign in\nReason: Deployed in AIBL', '2026-09-06T03:00:00Z'),
    message('2', 'sign out', '2026-09-06T11:00:00Z')
  ]);
  assert.equal(command('sign in\nReason: Deployed in AIBL'), 'in');
  assert.deepEqual(result.rows[0].reasons, ['Deployed in AIBL']);
  assert.equal(result.events[0].reason, 'Deployed in AIBL');
  assert.equal(result.rows[0].minutes, 480);
  assert.equal(result.rows[0].status, 'Complete');
});
test('preserves separate sign in/out locations and leaves legacy locations empty', () => {
  const report = buildReport([
    message('1', 'sign in', '2026-09-06T03:00:00Z', { latitude: 23.81, longitude: 90.41, locationLabel: 'AIBL' }),
    message('2', 'sign out', '2026-09-06T11:00:00Z', { latitude: 0, longitude: 0 }),
    message('3', 'sign in', '2026-09-07T03:00:00Z')
  ]);
  assert.equal(report.rows[0].signInLocation.locationLabel, 'AIBL');
  assert.equal(report.rows[0].signOutLocation.mapUrl, 'https://www.google.com/maps?q=0,0');
  assert.equal(report.events[0].latitude, 23.81);
  assert.equal(report.events[2].mapUrl, '');
});
test('sums completed sessions and flags duplicates without inflating hours', () => {
  const result = buildReport([
    message('1', 'sign in', '2026-09-06T03:00:00Z'),
    message('2', 'sign in', '2026-09-06T04:00:00Z'),
    message('3', 'sign out', '2026-09-06T06:00:00Z'),
    message('4', 'sign in', '2026-09-06T07:00:00Z'),
    message('5', 'sign out', '2026-09-06T11:00:00Z'),
    message('6', 'sign in', '2026-09-06T12:00:00Z', { replyToId: '1' }),
    message('7', 'sign in', '2026-09-06T12:00:00Z', { attachmentType: 'image/png' })
  ]);
  assert.equal(result.rows[0].minutes, 420);
  assert.equal(result.rows[0].signIns, 3);
  assert.equal(result.events.length, 5);
  assert.equal(result.rows[0].status, 'Needs review');
});
test('keeps missing events and employees separate and flags overnight sessions', () => {
  const result = buildReport([
    message('1', 'sign in', '2026-09-06T17:00:00Z'),
    message('2', 'sign out', '2026-09-06T19:00:00Z'),
    message('3', 'sign out', '2026-09-06T17:00:00Z', { authorId: 'employee-2' })
  ]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.find(row => row.signIn).status, 'Missing sign out');
  assert.ok(result.rows.every(row => row.minutes === 0));
});
