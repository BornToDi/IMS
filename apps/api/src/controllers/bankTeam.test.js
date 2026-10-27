const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const root = path.resolve(__dirname, '../../../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-bank-team-'));
process.env.DATABASE_URL = `file:${path.join(directory, 'test.db').replaceAll('\\', '/')}`;
process.env.JWT_ACCESS_SECRET = 'bank-team-tests-access';
process.env.JWT_REFRESH_SECRET = 'bank-team-tests-refresh';
const schema = execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'apps/api/prisma/schema.prisma'), '--script'], { encoding: 'utf8' });
const database = new DatabaseSync(path.join(directory, 'test.db')); database.exec(schema); database.close();
const prisma = require('../prismaClient');
const { signAccess } = require('../utils/jwt');
const app = express(); app.use(express.json());
app.locals.io = { to() { return { emit() {} }; }, emit() {} };
app.use('/api/bank-team', require('../routes/bankTeam'));
app.use('/api/auth', require('../routes/auth'));
app.use('/api/hardware', require('../routes/hardware'));
app.use('/api/pos-serials', require('../routes/posSerials'));
app.use('/api/tickets', require('../routes/tickets'));
app.use('/api/direct-messages', require('../routes/directMessages'));
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
let server, base, ims, bank, otherBank, admin, manager, employee, secondEmployee, outsider, pending, viewer;
async function request(url, { user = admin, body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(base + url, { method, headers: { ...(user ? { Authorization: `Bearer ${signAccess({ userId: user.id })}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  return { status: response.status, body: result };
}
const url = route => `/bank-team/${route}?bankId=${bank.id}`;
test.before(async () => {
  ims = await prisma.user.create({ data: { name: 'IMS Admin', email: 'ims@team.test', passwordHash: 'unused', userRole: 'ADMIN' } });
  bank = await prisma.bankMaster.create({ data: { name: 'Pubali Bank' } });
  otherBank = await prisma.bankMaster.create({ data: { name: 'Other Bank' } });
  const user = (name, bankRole, bankId = bank.id, bankStatus = 'APPROVED') => prisma.user.create({ data: { name, email: `${name}@team.test`, passwordHash: 'unused', userRole: 'BANK', bankId, bankName: bankId === bank.id ? bank.name : otherBank.name, bankRole, bankStatus } });
  admin = await user('bank-admin', 'ADMIN'); manager = await user('pos-manager', 'POS_MANAGER'); employee = await user('employee', 'EMPLOYEE'); secondEmployee = await user('second-employee', 'EMPLOYEE');
  outsider = await user('other-bank-admin', 'ADMIN', otherBank.id); pending = await user('pending-employee', 'EMPLOYEE', bank.id, 'PENDING'); viewer = await user('viewer', 'VIEWER');
  for (let offset = 0; offset < 12000; offset += 500) await prisma.inventoryDevice.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ id: `a-${offset + index}`, serialNumber: `PA-${String(offset + index).padStart(5, '0')}`, brand: 'PAX', model: 'A920', location: 'Dhaka', bankId: bank.id, status: 'DELIVERED', tid: `TID-${offset + index}` })) });
  await prisma.inventoryDevice.create({ data: { id: 'foreign', serialNumber: 'OTHER-POS', brand: 'PAX', model: 'A920', location: 'Other bank', bankId: otherBank.id, status: 'DELIVERED' } });
  await prisma.posSerial.createMany({ data: [{ bankName: bank.name, serialNumber: 'PA-00000' }, { bankName: bank.name, serialNumber: 'PA-09000' }, { bankName: otherBank.name, serialNumber: 'OTHER-POS' }] });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'ims-bank-team-'))); fs.rmSync(directory, { recursive: true, force: true }); });

test('registration requests membership without granting privileges and blocks self-registration as internal staff', async () => {
  const payload = { name: 'New bank admin', email: 'request-admin@team.test', password: 'valid-password-123', userRole: 'BANK', bankName: bank.name, bankRole: 'ADMIN', bankStatus: 'APPROVED', bankId: otherBank.id };
  const registered = await request('/auth/register', { user: null, body: payload });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  assert.equal(registered.body.user.bankId, bank.id); assert.equal(registered.body.user.bankStatus, 'PENDING');
  const applicant = registered.body.user;
  const adminRequestNotes = await prisma.notification.findMany({ where: { type: 'BANK_REGISTRATION', targetUrl: { contains: applicant.id } } });
  assert.deepEqual(adminRequestNotes.map(note => note.userId), [ims.id]);
  assert.ok(adminRequestNotes[0].targetUrl.includes(`bankId=${bank.id}`));
  assert.ok(adminRequestNotes[0].targetUrl.includes('tab=members'));
  assert.equal((await request('/hardware/summary', { user: applicant })).status, 403);
  assert.equal((await request('/bank-team/me', { user: applicant })).status, 200);
  assert.equal((await request(url(`members/${applicant.id}`), { method: 'PATCH', body: { bankRole: 'ADMIN', bankStatus: 'APPROVED', version: 0 } })).status, 403);
  assert.equal((await request(url(`members/${applicant.id}`), { user: ims, method: 'PATCH', body: { bankRole: 'ADMIN', bankStatus: 'APPROVED', version: 0 } })).status, 200);
  assert.equal((await request('/bank-team/me', { user: applicant })).body.canManage, true);
  assert.equal((await prisma.notification.findUnique({ where: { id: adminRequestNotes[0].id } })).isRead, true);
  assert.equal((await request('/auth/register', { user: null, body: { ...payload, email: 'fake-bank@team.test', bankName: 'Not registered' } })).status, 400);
  assert.equal((await request('/auth/register', { user: null, body: { ...payload, email: 'fake-global@team.test', userRole: 'ASSISTANT' } })).status, 403);
  assert.equal((await request('/auth/admin/users', { user: employee, body: { name: 'Bad', email: 'bad@team.test', password: 'valid-password-123' } })).status, 403);
  assert.equal((await request('/auth/users', { user: employee })).status, 403);
  assert.equal((await request('/auth/admin/users', { user: ims, body: { name: 'Internal', email: 'internal@team.test', password: 'valid-password-123' } })).status, 201);
});

test('bank admins approve only their own employees with version checks and cannot escalate bank or global roles', async () => {
  const members = await request(url('members'));
  assert.equal(members.status, 200); assert.ok(members.body.every(member => member.bankId === bank.id));
  assert.equal((await request(url('members'), { user: outsider })).body.every(member => member.bankId === otherBank.id), true);
  assert.equal((await request(url(`members/${pending.id}`), { user: manager, method: 'PATCH', body: { bankRole: 'EMPLOYEE', bankStatus: 'APPROVED', version: 0 } })).status, 403);
  const approved = await request(url(`members/${pending.id}`), { method: 'PATCH', body: { bankRole: 'EMPLOYEE', bankStatus: 'APPROVED', version: 0 } });
  assert.equal(approved.status, 200); assert.equal(approved.body.userRole, 'BANK');
  assert.equal((await request(url(`members/${pending.id}`), { method: 'PATCH', body: { bankRole: 'EMPLOYEE', bankStatus: 'SUSPENDED', version: 0 } })).status, 409);
  assert.equal((await request(url(`members/${outsider.id}`), { method: 'PATCH', body: { bankRole: 'EMPLOYEE', bankStatus: 'APPROVED', version: 0 } })).status, 404);
});

test('12,000 POS can be split into exact 3,000-device responsibilities with atomic isolation and scoped hardware', async () => {
  assert.equal((await request(url('assignments'), { body: { source: 'UNASSIGNED', count: 1, note: 'No-op unassign' } })).status, 400);
  const assigned = await request(url('assignments'), { body: { source: 'UNASSIGNED', employeeId: employee.id, count: 3000, note: 'First 3,000 Pubali Bank POS' } });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body)); assert.equal(assigned.body.count, 3000);
  assert.equal(await prisma.bankPosAssignment.count({ where: { employeeId: employee.id } }), 3000);
  assert.equal((await request(url('devices'))).body.total, 12000);
  assert.equal((await request(url('devices') + '&source=UNASSIGNED')).body.total, 9000);
  assert.equal((await request(url('devices'), { user: employee })).body.total, 3000);
  assert.equal((await request('/hardware/summary', { user: employee })).body.total, 3000);
  assert.equal((await request('/hardware/a-9000', { user: employee })).status, 404);
  const serials = await request('/pos-serials?take=100', { user: employee }); assert.deepEqual(serials.body.map(row => row.serialNumber), ['PA-00000']);
  assert.equal((await request(url('assignments'), { body: { source: 'UNASSIGNED', employeeId: outsider.id, count: 1, note: 'Bad bank' } })).status, 403);
  assert.equal((await request(url('assignments'), { body: { source: 'UNASSIGNED', employeeId: secondEmployee.id, deviceIds: ['a-9000', 'foreign'], note: 'Mixed bank batch' } })).status, 409);
  assert.equal(await prisma.bankPosAssignment.count({ where: { employeeId: secondEmployee.id } }), 0);
  assert.equal((await request(url('assignments'), { body: { source: 'UNASSIGNED', employeeId: secondEmployee.id, deviceIds: ['a-0'], note: 'Stale owner' } })).status, 409);
  assert.equal((await request(url('assignments'), { user: employee, body: { source: 'UNASSIGNED', employeeId: employee.id, count: 1, note: 'Self assignment' } })).status, 403);
});

test('exact serial transfer, target submissions and manager review keep verified progress accurate', async () => {
  const transferred = await request(url('assignments'), { body: { source: employee.id, employeeId: secondEmployee.id, serialNumbers: ['PA-00000'], note: 'Rebalance portfolio' } });
  assert.equal(transferred.status, 200); assert.equal((await request('/hardware/a-0', { user: employee })).status, 404);
  const history = await request(url('history')); assert.ok(history.body.rows.some(row => row.action === 'TRANSFER' && row.previousEmployeeId === employee.id));
  const from = new Date(Date.now() + 21600000).toISOString().slice(0, 10);
  const created = await request(url('targets'), { body: { employeeId: secondEmployee.id, title: 'Monthly service visits', quantity: 500, from, until: from } });
  assert.equal(created.status, 201); const target = created.body;
  assert.equal((await request(url(`targets/${target.id}/completions`), { user: employee, body: { deviceId: 'a-1', note: 'Wrong target' } })).status, 404);
  assert.equal((await request(url(`targets/${target.id}/completions`), { user: secondEmployee, body: { deviceId: 'foreign', note: 'Wrong bank' } })).status, 403);
  const submitted = await request(url(`targets/${target.id}/completions`), { user: secondEmployee, body: { deviceId: 'a-0', note: 'Visited merchant and checked terminal' } });
  assert.equal(submitted.status, 201);
  assert.equal((await request(url(`targets/${target.id}/completions`), { user: secondEmployee, body: { deviceId: 'a-0', note: 'Duplicate' } })).status, 409);
  const before = await request(url('targets'), { user: secondEmployee }); assert.equal(before.body.rows[0].completed, 0); assert.equal(before.body.rows[0].pending, 1);
  assert.equal((await request(url(`targets/${target.id}/completions/${submitted.body.id}`), { user: secondEmployee, method: 'PATCH', body: { status: 'APPROVED' } })).status, 403);
  const reviewed = await request(url(`targets/${target.id}/completions/${submitted.body.id}`), { user: manager, method: 'PATCH', body: { status: 'APPROVED' } }); assert.equal(reviewed.status, 200);
  assert.equal((await request(url('targets'), { user: secondEmployee })).body.rows[0].completed, 1);
  assert.equal((await request(url(`targets/${target.id}/completions/${submitted.body.id}`), { method: 'PATCH', body: { status: 'APPROVED' } })).status, 409);
  assert.equal((await request(url(`targets/${target.id}/completions`), { user: outsider })).status, 404);
  assert.equal((await request(url('targets'), { user: employee })).body.total, 0);
  assert.equal((await request(url('targets'), { body: { employeeId: outsider.id, title: 'Wrong bank', quantity: 1, from, until: from } })).status, 403);
});

test('bank employees can create tickets only for assigned POS and suspension immediately revokes access', async () => {
  const good = await request('/tickets', { user: secondEmployee, body: { posSerial: 'PA-00000', title: 'Connection issue' } }); assert.equal(good.status, 201);
  assert.equal((await request(`/tickets/${good.body.id}`)).status, 200);
  assert.equal((await request(`/tickets/${good.body.id}`, { user: outsider })).status, 403);
  assert.equal((await request('/tickets', { user: employee, body: { posSerial: 'PA-09000', title: 'Unassigned' } })).status, 403);
  assert.equal((await request('/tickets', { user: viewer, body: { title: 'Read-only' } })).status, 403);
  const suspended = await request(url(`members/${pending.id}`), { method: 'PATCH', body: { bankRole: 'EMPLOYEE', bankStatus: 'SUSPENDED', version: 1 } }); assert.equal(suspended.status, 200);
  assert.equal((await request('/hardware/summary', { user: pending })).status, 403);
  assert.equal((await request('/direct-messages/contacts', { user: pending })).status, 403);
  assert.equal((await request('/bank-team/me', { user: pending })).body.user.bankStatus, 'SUSPENDED');
});

test('inventory return clears bank employee responsibility and records its history', async () => {
  const returned = await request('/hardware/a-0/actions', { user: ims, body: { action: 'RETURN', version: 0, location: 'Warehouse', reference: 'RET-TEAM', remarks: 'Returned by bank', receivedBy: 'Store' } });
  assert.equal(returned.status, 200, JSON.stringify(returned.body));
  assert.equal(await prisma.bankPosAssignment.findUnique({ where: { deviceId: 'a-0' } }), null);
  assert.ok(await prisma.bankAssignmentHistory.findFirst({ where: { deviceId: 'a-0', action: 'BANK_TRANSFER_CLEAR' } }));
});

test('rejected completion can be corrected once, with no duplicate progress or invalid dates', async () => {
  const from = new Date(Date.now() + 21600000).toISOString().slice(0, 10);
  assert.equal((await request(url('targets'), { body: { employeeId: employee.id, title: 'Invalid date', quantity: 1, from: '2026-02-30', until: from } })).status, 400);
  const target = (await request(url('targets'), { body: { employeeId: employee.id, title: 'Corrected visit', quantity: 1, from, until: from } })).body;
  const report = (await request(url(`targets/${target.id}/completions`), { user: employee, body: { deviceId: 'a-1', note: 'Visit details' } })).body;
  const reviewUrl = url(`targets/${target.id}/completions/${report.id}`);
  assert.equal((await request(reviewUrl, { method: 'PATCH', body: { status: 'REJECTED' } })).status, 400);
  assert.equal((await request(reviewUrl, { method: 'PATCH', body: { status: 'REJECTED', note: 'Add the test result' } })).status, 200);
  const corrected = await request(url(`targets/${target.id}/completions`), { user: employee, body: { deviceId: 'a-1', note: 'Transaction print test completed successfully' } });
  assert.equal(corrected.status, 201); assert.equal(corrected.body.id, report.id);
  assert.equal(await prisma.bankTargetCompletion.count({ where: { targetId: target.id } }), 1);
  assert.equal((await request(reviewUrl, { method: 'PATCH', body: { status: 'APPROVED' } })).status, 200);
  const rows = (await request(url('targets'), { user: employee })).body.rows;
  assert.equal(rows.find(row => row.id === target.id).completed, 1);
  assert.equal((await request(url(`targets/${target.id}/close`), { method: 'PATCH', body: {} })).status, 200);
  assert.equal((await request(url(`targets/${target.id}/completions`), { user: employee, body: { deviceId: 'a-2', note: 'After closing' } })).status, 400);
});

test('migration preserves existing accounts and private messages while linking legacy bank identities', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE BankMaster (id TEXT PRIMARY KEY, name TEXT UNIQUE, active BOOLEAN DEFAULT true);
      CREATE TABLE User (id TEXT PRIMARY KEY, employeeCode TEXT UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL, avatarUrl TEXT, userRole TEXT NOT NULL DEFAULT 'EMPLOYEE', inventoryRole TEXT, bankName TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL);
      CREATE TABLE DirectMessage (id TEXT PRIMARY KEY, senderId TEXT REFERENCES User(id), recipientId TEXT REFERENCES User(id), content TEXT);
      INSERT INTO BankMaster (id,name) VALUES ('pubali','Pubali Bank');
      INSERT INTO User (id,name,email,passwordHash,userRole,bankName,updatedAt) VALUES ('bank','Bank member','bank@test.local','unchanged','BANK','  pubali bank  ',CURRENT_TIMESTAMP),('admin','IMS Admin','admin@test.local','unchanged','ADMIN',NULL,CURRENT_TIMESTAMP);
      INSERT INTO DirectMessage VALUES ('message','bank','admin','Keep this message');`);
    db.exec(fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/20261027000000_bank_teams_assignments_targets/migration.sql'), 'utf8'));
    const user = db.prepare("SELECT * FROM User WHERE id='bank'").get();
    assert.equal(user.bankId, 'pubali'); assert.equal(user.bankName, 'Pubali Bank'); assert.equal(user.bankRole, null); assert.equal(user.bankStatus, 'APPROVED'); assert.equal(user.passwordHash, 'unchanged');
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM User').get().total, 2);
    assert.equal(db.prepare('SELECT content FROM DirectMessage').get().content, 'Keep this message');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('employee registrations notify the correct approvers and pending badges reflect decisions, including existing requests', async () => {
  const employeeRequest = await request('/auth/register', { user: null, body: { name: 'New Pubali employee', email: 'new-employee@team.test', password: 'valid-password-123', userRole: 'BANK', bankName: bank.name, bankRole: 'EMPLOYEE' } });
  assert.equal(employeeRequest.status, 200);
  const applicant = employeeRequest.body.user;
  const notes = await prisma.notification.findMany({ where: { type: 'BANK_REGISTRATION', targetUrl: { contains: applicant.id } } });
  assert.ok(notes.some(note => note.userId === ims.id));
  assert.ok(notes.some(note => note.userId === admin.id));
  assert.ok(notes.every(note => ![outsider.id, manager.id, employee.id].includes(note.userId)));
  const ownBefore = await request('/bank-team/pending-count');
  const globalBefore = await request('/bank-team/pending-count', { user: ims });
  assert.ok(ownBefore.body.pending >= 1); assert.equal(ownBefore.body.bankId, bank.id);
  assert.equal((await request('/bank-team/pending-count', { user: manager })).body.pending, 0);
  await prisma.user.create({ data: { name: 'Other pending', email: 'other-pending@team.test', passwordHash: 'unused', userRole: 'BANK', bankId: otherBank.id, bankName: otherBank.name, bankRole: 'EMPLOYEE', bankStatus: 'PENDING' } });
  assert.equal((await request('/bank-team/pending-count')).body.pending, ownBefore.body.pending);
  assert.equal((await request('/bank-team/pending-count', { user: ims })).body.pending, globalBefore.body.pending + 1);
  assert.equal((await request('/bank-team/pending-count', { user: outsider })).body.pending, 1);
  const approved = await request(url(`members/${applicant.id}`), { method: 'PATCH', body: { bankRole: 'EMPLOYEE', bankStatus: 'APPROVED', version: 0 } });
  assert.equal(approved.status, 200);
  assert.equal((await request('/bank-team/pending-count')).body.pending, ownBefore.body.pending - 1);
  assert.equal(await prisma.notification.count({ where: { id: { in: notes.map(note => note.id) }, isRead: false } }), 0);
});
