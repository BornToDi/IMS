const test = require('node:test');
const assert = require('node:assert/strict');
const { command, dateKey, reportRange, buildReport } = require('./attendance');
const message = (id, content, createdAt, extra = {}) => ({ id, content, createdAt, authorId: 'employee-1', author: { name: 'Employee', employeeCode: 'E01' }, ...extra });
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
