const prisma = require('../prismaClient');
const { createNotification } = require('../utils/workflow');
const { registrationTarget } = require('../utils/bankRegistrationNotifications');
const memberFields = { id: true, name: true, email: true, bankId: true, bankName: true, bankRole: true, bankStatus: true, bankVersion: true, userRole: true };
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const manager = user => user.userRole === 'ADMIN' || (user.bankStatus === 'APPROVED' && ['ADMIN', 'POS_MANAGER'].includes(user.bankRole));
const approver = user => user.userRole === 'ADMIN' || (user.bankRole === 'ADMIN' && user.bankStatus === 'APPROVED');
async function context(req) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: memberFields });
  if (!user || !['ADMIN', 'BANK'].includes(user.userRole)) fail('Bank team access is required', 403);
  if (user.userRole === 'BANK' && user.bankStatus !== 'APPROVED') fail('Your bank membership is not approved', 403);
  const bankId = user.userRole === 'ADMIN' ? text(req.query.bankId || req.body?.bankId) : user.bankId;
  const bank = bankId ? await prisma.bankMaster.findUnique({ where: { id: bankId } }) : null;
  if (!bank || !bank.active) fail('Select an active bank. Existing accounts need an IMS admin to link their bank membership.', 403);
  return { user, bank };
}
async function banks(req, res) { res.json(await prisma.bankMaster.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })); }
async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: memberFields });
  if (!user || !['ADMIN', 'BANK'].includes(user.userRole)) fail('Bank team access required', 403);
  res.json({ user, canManage: manager(user), canApprove: approver(user), banks: user.userRole === 'ADMIN' ? await prisma.bankMaster.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [] });
}
async function pendingCount(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: memberFields });
  if (!user || !['ADMIN', 'BANK'].includes(user.userRole)) fail('Bank team access required', 403);
  if (!approver(user)) return res.json({ pending: 0 });
  const where = { userRole: 'BANK', bankStatus: 'PENDING', ...(user.userRole === 'ADMIN' ? { bankId: { not: null } } : { bankId: user.bankId || '\u0000', bankRole: { not: 'ADMIN' } }) };
  const pending = await prisma.user.count({ where });
  const first = pending ? await prisma.user.findFirst({ where, select: { bankId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : null;
  res.json({ pending, bankId: first?.bankId || null });
}
async function listMembers(req, res) {
  const { user, bank } = await context(req);
  if (!manager(user)) fail('Only bank admins and POS managers can view the team', 403);
  const rows = await prisma.user.findMany({ where: { userRole: 'BANK', OR: [{ bankId: bank.id }, { bankId: null, bankName: bank.name }] }, select: memberFields, orderBy: [{ bankStatus: 'asc' }, { name: 'asc' }] });
  const counts = await prisma.bankPosAssignment.groupBy({ by: ['employeeId'], where: { device: { bankId: bank.id, archived: false } }, _count: { _all: true } });
  const assigned = new Map(counts.map(row => [row.employeeId, row._count._all]));
  res.json(rows.map(row => ({ ...row, assigned: assigned.get(row.id) || 0 })));
}
async function updateMember(req, res) {
  const { user, bank } = await context(req);
  if (!approver(user)) fail('Only a bank admin can approve or change team roles', 403);
  const { bankRole, bankStatus, version } = req.body || {};
  if (!['ADMIN', 'POS_MANAGER', 'EMPLOYEE', 'VIEWER'].includes(bankRole) || !['APPROVED', 'PENDING', 'SUSPENDED', 'REJECTED'].includes(bankStatus) || !Number.isInteger(version)) fail('Choose a valid role, status and current member version');
  const updated = await prisma.$transaction(async tx => {
    const target = await tx.user.findFirst({ where: { id: req.params.id, userRole: 'BANK', OR: [{ bankId: bank.id }, { bankId: null, bankName: bank.name }] } });
    if (!target) fail('This employee does not belong to your bank', 404);
    if (target.id === user.id) fail('Ask another authorized admin to change your membership', 403);
    if (user.userRole !== 'ADMIN' && (target.bankRole === 'ADMIN' || bankRole === 'ADMIN')) fail('Only the IMS admin can appoint or change bank admins', 403);
    const changed = await tx.user.updateMany({ where: { id: target.id, bankVersion: version }, data: { bankId: bank.id, bankName: bank.name, bankRole, bankStatus, bankVersion: { increment: 1 } } });
    if (!changed.count) fail('Membership changed. Refresh before trying again.', 409);
    await tx.inventoryAdminAudit.create({ data: { action: 'BANK_MEMBER_UPDATE', actorId: user.id, actorName: user.name, details: JSON.stringify({ bankId: bank.id, employeeId: target.id, before: { role: target.bankRole, status: target.bankStatus }, after: { role: bankRole, status: bankStatus } }) } });
    return tx.user.findUnique({ where: { id: target.id }, select: memberFields });
  });
  req.app?.locals?.io?.in?.(`user:${updated.id}`)?.disconnectSockets?.(true);
  if (updated.bankStatus !== 'PENDING') await prisma.notification.updateMany({ where: { type: 'BANK_REGISTRATION', targetUrl: registrationTarget(updated), isRead: false }, data: { isRead: true } }).catch(error => console.error('[bank-registration] read status:', error.code || error.message));
  await createNotification(req, { userId: updated.id, type: 'BANK_TEAM', message: `Your ${bank.name} membership is ${bankStatus.toLowerCase()} (${bankRole.toLowerCase()})`, targetUrl: '/bank-team' }).catch(() => {});
  res.json(updated);
}
function deviceWhere(bank, user, query) {
  const where = { bankId: bank.id, archived: false };
  if (!manager(user)) where.bankAssignment = { is: { employeeId: user.id } };
  else if (query.source === 'UNASSIGNED') where.bankAssignment = { is: null };
  else if (query.source) where.bankAssignment = { is: { employeeId: query.source } };
  const q = text(query.q, 150);
  if (q) where.OR = ['serialNumber', 'tid', 'merchant', 'location', 'model'].map(key => ({ [key]: { contains: q } }));
  return where;
}
async function devices(req, res) {
  const { user, bank } = await context(req);
  const where = deviceWhere(bank, user, req.query);
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const [total, rows, assigned] = await prisma.$transaction([
    prisma.inventoryDevice.count({ where }),
    prisma.inventoryDevice.findMany({ where, skip: (page - 1) * 50, take: 50, orderBy: { serialNumber: 'asc' }, select: { id: true, serialNumber: true, tid: true, merchant: true, location: true, status: true, bankAssignment: { select: { employeeId: true, assignedAt: true, employee: { select: { name: true } } } } } }),
    prisma.bankPosAssignment.count({ where: { device: { bankId: bank.id, archived: false }, ...(manager(user) ? {} : { employeeId: user.id }) } })
  ]);
  res.json({ rows, total, page, pages: Math.ceil(total / 50), assigned });
}
async function assignDevices(req, res) {
  const { user, bank } = await context(req);
  if (!manager(user)) fail('Only bank admins and POS managers can assign devices', 403);
  const body = req.body || {};
  const employeeId = body.employeeId ? text(body.employeeId) : null;
  const source = text(body.source);
  if (!source) fail('Choose the current responsibility holder or Unassigned first');
  if (!employeeId && source === 'UNASSIGNED') fail('Choose an assigned employee as the current owner before removing responsibility');
  if (source === employeeId) fail('Choose a different employee');
  const ids = body.deviceIds;
  const serials = body.serialNumbers;
  if (ids && serials) fail('Choose device IDs or serial numbers, not both');
  if (serials && (!Array.isArray(serials) || !serials.length || serials.length > 5000 || serials.some(serial => typeof serial !== 'string' || !serial.trim()) || new Set(serials).size !== serials.length)) fail('Enter 1–5,000 different serial numbers');
  if (ids && (!Array.isArray(ids) || !ids.length || ids.length > 5000 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length)) fail('Select 1–5,000 different devices');
  const count = ids ? ids.length : serials ? serials.length : body.count;
  if (!Number.isInteger(count) || count < 1 || count > 5000) fail('Choose 1–5,000 devices per batch');
  const note = text(body.note);
  if (!note) fail('Add an assignment or transfer note');
  const result = await prisma.$transaction(async tx => {
    const employee = employeeId ? await tx.user.findFirst({ where: { id: employeeId, userRole: 'BANK', bankId: bank.id, bankStatus: 'APPROVED', bankRole: { in: ['ADMIN', 'POS_MANAGER', 'EMPLOYEE', 'VIEWER'] } } }) : null;
    if (employeeId && !employee) fail('Choose an approved employee of your bank', 403);
    const where = deviceWhere(bank, user, { source, q: body.q });
    if (ids) where.id = { in: ids };
    if (serials) where.serialNumber = { in: serials };
    const rows = await tx.inventoryDevice.findMany({ where, take: count, orderBy: { serialNumber: 'asc' }, select: { id: true, serialNumber: true, bankAssignment: true } });
    if (rows.length !== count) fail('Some devices are unavailable or their owner changed. Refresh the selection.', 409);
    for (const row of rows) {
      if (employee) await tx.bankPosAssignment.upsert({ where: { deviceId: row.id }, create: { deviceId: row.id, employeeId, assignedBy: user.id }, update: { employeeId, assignedBy: user.id, assignedAt: new Date(), version: { increment: 1 } } });
      else await tx.bankPosAssignment.delete({ where: { deviceId: row.id } });
    }
    await tx.bankAssignmentHistory.createMany({ data: rows.map(row => ({ bankId: bank.id, deviceId: row.id, serialNumber: row.serialNumber, previousEmployeeId: row.bankAssignment?.employeeId || null, employeeId, employeeName: employee?.name || null, actorId: user.id, action: employee ? source === 'UNASSIGNED' ? 'ASSIGN' : 'TRANSFER' : 'UNASSIGN', note })) });
    return { count: rows.length, employeeId };
  }, { timeout: 60000, maxWait: 10000 });
  if (employeeId) await createNotification(req, { userId: employeeId, type: 'BANK_ASSIGNMENT', message: `${result.count} specific POS devices assigned to you at ${bank.name}`, targetUrl: '/bank-team' }).catch(() => {});
  res.json(result);
}
async function history(req, res) {
  const { user, bank } = await context(req);
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const where = { bankId: bank.id, ...(manager(user) ? {} : { OR: [{ employeeId: user.id }, { previousEmployeeId: user.id }] }), ...(req.query.deviceId ? { deviceId: text(req.query.deviceId) } : {}) };
  const [total, rows] = await prisma.$transaction([prisma.bankAssignmentHistory.count({ where }), prisma.bankAssignmentHistory.findMany({ where, take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })]);
  res.json({ rows, total, page });
}
async function targets(req, res) {
  const { user, bank } = await context(req);
  const where = { bankId: bank.id, ...(manager(user) ? {} : { employeeId: user.id }) };
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const total = await prisma.bankTarget.count({ where });
  const rows = await prisma.bankTarget.findMany({ where, include: { employee: { select: { name: true } } }, orderBy: [{ dueAt: 'desc' }, { id: 'asc' }], take: 20, skip: (page - 1) * 20 });
  const counts = await prisma.bankTargetCompletion.groupBy({ by: ['targetId', 'status'], where: { targetId: { in: rows.map(row => row.id) } }, _count: { _all: true } });
  res.json({ total, page, rows: rows.map(row => { const count = status => counts.find(item => item.targetId === row.id && item.status === status)?._count._all || 0; return { ...row, completed: count('APPROVED'), pending: count('PENDING'), rejected: count('REJECTED') }; }) });
}
function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Choose valid target dates');
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) fail('Invalid target date');
  return new Date(day.getTime() - 21600000);
}
async function createTarget(req, res) {
  const { user, bank } = await context(req);
  if (!manager(user)) fail('Only managers can set targets', 403);
  const body = req.body || {};
  const startsAt = calendar(body.from), dueAt = new Date(calendar(body.until).getTime() + 86400000 - 1);
  const title = text(body.title, 200);
  if (!title || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100000 || dueAt < startsAt) fail('Enter a title, positive target quantity and valid date range');
  const employee = await prisma.user.findFirst({ where: { id: text(body.employeeId), bankId: bank.id, userRole: 'BANK', bankStatus: 'APPROVED', bankRole: { in: ['ADMIN', 'POS_MANAGER', 'EMPLOYEE'] } } });
  if (!employee) fail('Choose an approved employee of your bank', 403);
  const row = await prisma.bankTarget.create({ data: { bankId: bank.id, employeeId: employee.id, title, quantity: body.quantity, startsAt, dueAt, createdBy: user.id } });
  await createNotification(req, { userId: employee.id, type: 'BANK_TARGET', message: `New target: ${title} (${body.quantity} POS)`, targetUrl: '/bank-team' }).catch(() => {});
  res.status(201).json(row);
}
async function targetFor(req, user, bank) {
  const target = await prisma.bankTarget.findFirst({ where: { id: req.params.id, bankId: bank.id, ...(manager(user) ? {} : { employeeId: user.id }) } });
  if (!target) fail('Target not found', 404);
  return target;
}
async function completions(req, res) {
  const { user, bank } = await context(req);
  const target = await targetFor(req, user, bank);
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const [total, rows] = await prisma.$transaction([prisma.bankTargetCompletion.count({ where: { targetId: target.id } }), prisma.bankTargetCompletion.findMany({ where: { targetId: target.id }, take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })]);
  res.json({ rows, total, page });
}
async function reportCompletion(req, res) {
  const { user, bank } = await context(req);
  if (user.bankRole === 'VIEWER') fail('Viewers cannot submit completion reports', 403);
  const target = await targetFor(req, user, bank);
  if (target.employeeId !== user.id) fail('Only the assigned employee can submit work for this target', 403);
  if (target.status !== 'ACTIVE' || new Date() < target.startsAt) fail('This target is closed or has not started');
  const note = text(req.body?.note, 2000);
  if (!note) fail('Describe the completed visit or service');
  const row = await prisma.$transaction(async tx => {
    const device = await tx.inventoryDevice.findFirst({ where: { id: text(req.body.deviceId), bankId: bank.id, archived: false, bankAssignment: { is: { employeeId: user.id } } } });
    if (!device) fail('This POS is not currently assigned to you', 403);
    const previous = await tx.bankTargetCompletion.findUnique({ where: { targetId_deviceId: { targetId: target.id, deviceId: device.id } } });
    if (previous && previous.status !== 'REJECTED') fail('This POS has already been reported for this target', 409);
    const data = { note, status: 'PENDING', reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: new Date() };
    return previous ? tx.bankTargetCompletion.update({ where: { id: previous.id }, data }) : tx.bankTargetCompletion.create({ data: { ...data, targetId: target.id, deviceId: device.id, serialNumber: device.serialNumber } });
  });
  res.status(201).json(row);
}
async function reviewCompletion(req, res) {
  const { user, bank } = await context(req);
  if (!manager(user)) fail('Only bank managers can review completed work', 403);
  const target = await targetFor(req, user, bank);
  if (target.employeeId === user.id) fail('Another manager must review your work', 403);
  const status = req.body?.status;
  if (!['APPROVED', 'REJECTED'].includes(status)) fail('Choose approve or reject');
  const reviewNote = text(req.body?.note);
  if (status === 'REJECTED' && !reviewNote) fail('Add a reason for rejection');
  const changed = await prisma.bankTargetCompletion.updateMany({ where: { id: req.params.completionId, targetId: target.id, status: 'PENDING' }, data: { status, reviewedBy: user.id, reviewedAt: new Date(), reviewNote } });
  if (!changed.count) fail('This completion was already reviewed or does not belong to this target', 409);
  res.json({ status });
}
async function closeTarget(req, res) { const { user, bank } = await context(req); if (!manager(user)) fail('Only managers can close targets', 403); const target = await targetFor(req, user, bank); res.json(await prisma.bankTarget.update({ where: { id: target.id }, data: { status: 'CLOSED' } })); }
module.exports = { banks, me, pendingCount, listMembers, updateMember, devices, assignDevices, history, targets, createTarget, completions, reportCompletion, reviewCompletion, closeTarget };
