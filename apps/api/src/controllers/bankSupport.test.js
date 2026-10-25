const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const root = path.resolve(__dirname, '../../../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-bank-support-'));
const dbPath = path.join(directory, 'test.db');
process.env.DATABASE_URL = `file:${dbPath.replaceAll('\\', '/')}`;
process.env.JWT_ACCESS_SECRET = 'bank-support-test-only-secret';
const schema = execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'apps/api/prisma/schema.prisma'), '--script'], { encoding: 'utf8' });
const db = new DatabaseSync(dbPath); db.exec(schema); db.close();
const prisma = require('../prismaClient');
const { signAccess } = require('../utils/jwt');
const app = express();
const emitted = [];
app.locals.io = { to(room) { return { emit(event, data) { emitted.push({ room, event, data }); } }; }, emit() {} };
app.use(express.json());
app.use('/api/direct-messages', require('../routes/directMessages'));
app.use('/api/tickets', require('../routes/tickets'));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error' }); });
let server, base, admin, otherAdmin, bank, otherBank, employee, manager;
async function request(url, { user = bank, body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(base + url, { method, headers: { ...(user ? { Authorization: `Bearer ${signAccess({ userId: user.id })}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}
test.before(async () => {
  const user = (name, userRole, bankName) => prisma.user.create({ data: { name, userRole, email: `${name}@bank-support.test`, passwordHash: 'not-used', bankName } });
  admin = await user('admin', 'ADMIN'); otherAdmin = await user('other-admin', 'ADMIN');
  bank = await user('bank', 'BANK', 'Bank Alpha'); otherBank = await user('other-bank', 'BANK', 'Bank Beta');
  employee = await user('engineer', 'EMPLOYEE'); manager = await user('manager', 'MANAGEMENT');
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
  assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'ims-bank-support-')));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('private inbox roles, participant isolation, validation and targeted delivery', async () => {
  assert.equal((await request('/direct-messages/contacts', { user: null })).status, 401);
  for (const user of [employee, manager]) assert.equal((await request('/direct-messages/contacts', { user })).status, 403);
  const contacts = await request('/direct-messages/contacts');
  assert.deepEqual(new Set(contacts.body.map(row => row.id)), new Set([admin.id, otherAdmin.id]));
  assert.ok(contacts.body.every(row => !('email' in row) && !('passwordHash' in row)));
  assert.equal((await request(`/direct-messages/${otherBank.id}`, { body: { content: 'blocked' } })).status, 403);
  assert.equal((await request(`/direct-messages/${otherAdmin.id}`, { user: admin, body: { content: 'blocked' } })).status, 403);
  for (const content of ['', '   ', 42, 'x'.repeat(4001)]) assert.equal((await request(`/direct-messages/${admin.id}`, { body: { content } })).status, 400);
  const sent = await request(`/direct-messages/${admin.id}`, { body: { content: '  My terminal needs help  ', senderId: otherBank.id } });
  assert.equal(sent.status, 201); assert.equal(sent.body.senderId, bank.id); assert.equal(sent.body.content, 'My terminal needs help');
  assert.equal((await request(`/direct-messages/${bank.id}`, { user: admin })).body.messages.length, 1);
  assert.equal((await request(`/direct-messages/${bank.id}`, { user: otherAdmin })).body.messages.length, 0);
  assert.equal((await request(`/direct-messages/${admin.id}`, { user: otherBank })).body.messages.length, 0);
  assert.equal((await request(`/direct-messages/${bank.id}?before=${sent.body.id}`, { user: otherAdmin })).status, 400);
  const events = emitted.filter(event => event.event === 'direct-message:new');
  assert.deepEqual(new Set(events.map(event => event.room)), new Set([`user:${bank.id}`, `user:${admin.id}`]));
  const adminContacts = await request('/direct-messages/contacts', { user: admin });
  assert.equal(adminContacts.body.find(row => row.id === bank.id).unread, 1);
  assert.equal((await request(`/direct-messages/${bank.id}/read`, { user: otherAdmin, method: 'PATCH', body: { messageId: sent.body.id } })).status, 400);
  assert.equal((await request(`/direct-messages/${bank.id}/read`, { user: admin, method: 'PATCH', body: { messageId: sent.body.id } })).status, 200);
  assert.ok((await prisma.directMessage.findUnique({ where: { id: sent.body.id } })).readAt);
  assert.equal((await request('/direct-messages/contacts', { user: admin })).body.find(row => row.id === bank.id).unread, 0);
  assert.equal((await request(`/direct-messages/${bank.id}`, { user: admin, body: { content: 'We are reviewing it.' } })).status, 201);
});

test('private history paginates equal timestamps without cross-conversation cursors or lost rows', async () => {
  const createdAt = new Date('2020-01-01T00:00:00Z');
  await prisma.directMessage.createMany({ data: Array.from({ length: 55 }, (_, index) => ({ id: `history-${String(index).padStart(2, '0')}`, senderId: otherBank.id, recipientId: otherAdmin.id, content: `Message ${index}`, createdAt })) });
  const first = await request(`/direct-messages/${otherAdmin.id}`, { user: otherBank });
  assert.equal(first.body.messages.length, 50); assert.equal(first.body.hasMore, true);
  const second = await request(`/direct-messages/${otherAdmin.id}?before=${first.body.messages[0].id}`, { user: otherBank });
  assert.equal(second.body.messages.length, 5); assert.equal(second.body.hasMore, false);
  assert.equal(new Set([...first.body.messages, ...second.body.messages].map(row => row.id)).size, 55);
  const read = await request(`/direct-messages/${otherBank.id}/read`, { user: otherAdmin, method: 'PATCH', body: { messageId: 'history-02' } });
  assert.equal(read.status, 200);
  assert.equal(await prisma.directMessage.count({ where: { senderId: otherBank.id, recipientId: otherAdmin.id, readAt: { not: null } } }), 3);
});

test('bank tickets create, assign, comment and remain isolated from other bank users', async () => {
  assert.equal((await request('/tickets', { method: 'POST' })).status, 400);
  for (const body of [{ title: '  ', posSerial: '  ' }, { title: 42 }, { title: 'Test', priority: 'INVALID' }]) assert.equal((await request('/tickets', { body })).status, 400);
  const created = await request('/tickets', { body: { title: ' Terminal offline ', posSerial: ' POS-100 ', bankName: 'Spoofed bank', priority: 'HIGH' } });
  assert.equal(created.status, 201); assert.equal(created.body.bankName, 'Bank Alpha'); assert.equal(created.body.title, 'Terminal offline');
  const id = created.body.id;
  assert.equal((await request(`/tickets/${id}/updates`, { method: 'POST' })).status, 400);
  assert.equal((await request(`/tickets/${id}`, { user: otherBank })).status, 403);
  assert.equal((await request(`/tickets/${id}/updates`, { user: otherBank, body: { message: 'blocked' } })).status, 403);
  assert.equal((await request(`/tickets/${id}/updates`, { body: { message: 'done', status: 'COMPLETED' } })).status, 403);
  assert.equal((await request(`/tickets/${id}/updates`, { body: { message: '   ' } })).status, 400);
  const posted = await request(`/tickets/${id}/updates`, { body: { message: 'Merchant closes at 5 PM', type: 'COMPLETED' } });
  assert.equal(posted.status, 201); assert.equal(posted.body.type, 'COMMENT');
  const assigned = await request(`/tickets/${id}/assign`, { user: admin, body: { employeeId: employee.id, note: 'Visit the merchant' } });
  assert.equal(assigned.status, 200); assert.equal(assigned.body.status, 'ASSIGNED');
  assert.equal(assigned.body.workspace.assignedEmployee.id, employee.id);
  const detail = await request(`/tickets/${id}`);
  assert.equal(detail.body.updates.length, 3);
  assert.equal((await request('/tickets', { user: otherBank })).body.length, 0);
});

test('private-message migration creates indexes and cascading participant references', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON; CREATE TABLE User (id TEXT PRIMARY KEY);');
    database.exec(fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/20261025000000_private_bank_messages/migration.sql'), 'utf8'));
    database.exec("INSERT INTO User VALUES ('bank'), ('admin'); INSERT INTO DirectMessage (id, senderId, recipientId, content) VALUES ('message','bank','admin','Hello'); DELETE FROM User WHERE id='bank';");
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM DirectMessage').get().total, 0);
    assert.equal(database.prepare("PRAGMA index_list('DirectMessage')").all().filter(row => row.origin === 'c').length, 2);
  } finally { database.close(); }
});
