const prisma = require('../prismaClient');
const { isAdminRole, isBankRole, getUser, createNotification, notifyAdmins, nextCode, parseMentionIds } = require('../utils/workflow');

const includeBatch = {
  createdBy: { select: { id: true, name: true, email: true, userRole: true } },
  assignedTo: { select: { id: true, name: true, email: true, userRole: true } },
  ticket: { select: { id: true, ticketNo: true, title: true, bankUserId: true, status: true } },
  items: { orderBy: { createdAt: 'asc' } },
  updates: { include: { user: { select: { id: true, name: true, email: true, userRole: true } } }, orderBy: { createdAt: 'desc' } }
};

async function currentUser(req, res) {
  const user = await getUser(req.userId);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

function canSeeBatch(user, batch) {
  if (!user || !batch) return false;
  if (isAdminRole(user.userRole)) return true;
  if (batch.createdById === user.id || batch.assignedToId === user.id) return true;
  if (batch.ticket && batch.ticket.bankUserId === user.id) return true;
  return false;
}

async function notifyMentioned(req, userIds, message, exceptUserId) {
  await Promise.all([...new Set(userIds)].filter((id) => id && id !== exceptUserId).map((id) => createNotification(req, { userId: id, type: 'HARDWARE_MENTION', message })));
}

async function listBatches(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const where = isAdminRole(user.userRole)
    ? {}
    : isBankRole(user.userRole)
      ? { OR: [{ createdById: user.id }, { ticket: { bankUserId: user.id } }] }
      : { OR: [{ createdById: user.id }, { assignedToId: user.id }] };
  const rows = await prisma.hardwareBatch.findMany({ where, include: includeBatch, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  res.json(rows);
}

async function createBatch(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const { ticketId, assignedToId, totalQuantity, note } = req.body;
  const requestedBankName = String(req.body.bankName || '').trim();
  const bankName = isBankRole(user.userRole) ? (String(user.bankName || '').trim() || String(user.name || '').trim()) : requestedBankName;
  const items = Array.isArray(req.body.items) ? req.body.items.map((item) => ({ serialNumber: String(item.serialNumber || '').trim(), problem: String(item.problem || '').trim(), note: String(item.note || '').trim() || null })).filter((item) => item.serialNumber && item.problem) : [];
  const quantity = items.length || Number(totalQuantity);
  if (!quantity || Number(quantity) <= 0) return res.status(400).json({ error: 'Total POS quantity is required' });
  if (Array.isArray(req.body.items) && req.body.items.length && !items.length) return res.status(400).json({ error: 'At least one POS serial and problem is required' });
  let ticket = null;
  if (ticketId) {
    ticket = await prisma.bankTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  }
  if (isBankRole(user.userRole) && !bankName) return res.status(400).json({ error: 'Your bank account has no bank assigned. Register/select bank first.' });
  let assignedTo = null;
  if (assignedToId) {
    assignedTo = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!assignedTo) return res.status(404).json({ error: 'Assigned person not found' });
    if (isBankRole(user.userRole) && !isAdminRole(assignedTo.userRole)) return res.status(400).json({ error: 'Bank hardware batch must be assigned to admin' });
  }
  const batch = await prisma.hardwareBatch.create({
    data: {
      batchNo: nextCode('HW'),
      ticketId: ticketId || null,
      bankName: bankName || null,
      createdById: user.id,
      assignedToId: assignedToId || null,
      totalQuantity: Number(quantity),
      pendingQuantity: Number(quantity),
      status: 'SENT',
      note: note || null,
      items: items.length ? { create: items } : undefined,
      updates: { create: { userId: user.id, type: 'SENT', quantity: Number(quantity), pendingQuantity: Number(quantity), comment: note || `${quantity} POS sent${assignedTo ? ` to ${assignedTo.name || assignedTo.email}` : ''}` } }
    },
    include: includeBatch
  });
  if (assignedToId) await createNotification(req, { userId: assignedToId, type: 'HARDWARE_ASSIGNED', message: `${batch.batchNo}: ${quantity} POS batch assigned to you by ${user.name || user.email}` });
  else if (isBankRole(user.userRole)) await notifyAdmins(req, `${batch.batchNo}: ${quantity} POS hardware batch created by ${bankName}`, user.id);
  if (ticket?.bankUserId && ticket.bankUserId !== user.id) await createNotification(req, { userId: ticket.bankUserId, type: 'HARDWARE_UPDATE', message: `${batch.batchNo}: ${quantity} POS sent to hardware` });
  const io = req.app.locals.io;
  if (io) io.emit('hardware:updated', { batchId: batch.id });
  res.status(201).json(batch);
}

async function getBatch(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const batch = await prisma.hardwareBatch.findUnique({ where: { id: req.params.id }, include: includeBatch });
  if (!batch) return res.status(404).json({ error: 'Hardware batch not found' });
  if (!canSeeBatch(user, batch)) return res.status(403).json({ error: 'Access denied' });
  res.json(batch);
}

async function updateBatch(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const batch = await prisma.hardwareBatch.findUnique({ where: { id: req.params.id }, include: includeBatch });
  if (!batch) return res.status(404).json({ error: 'Hardware batch not found' });
  if (!isAdminRole(user.userRole) && batch.createdById !== user.id) return res.status(403).json({ error: 'Only creator/admin can edit batch' });
  const { bankName, assignedToId, totalQuantity, note, status } = req.body;
  const updated = await prisma.hardwareBatch.update({
    where: { id: batch.id },
    data: {
      bankName: bankName === undefined ? batch.bankName : bankName,
      assignedToId: assignedToId === undefined ? batch.assignedToId : (assignedToId || null),
      totalQuantity: totalQuantity === undefined ? batch.totalQuantity : Number(totalQuantity),
      note: note === undefined ? batch.note : note,
      status: status || batch.status
    },
    include: includeBatch
  });
  if (assignedToId && assignedToId !== batch.assignedToId) await createNotification(req, { userId: assignedToId, type: 'HARDWARE_ASSIGNED', message: `${batch.batchNo} assigned to you` });
  res.json(updated);
}

async function addUpdate(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const batch = await prisma.hardwareBatch.findUnique({ where: { id: req.params.id }, include: includeBatch });
  if (!batch) return res.status(404).json({ error: 'Hardware batch not found' });
  if (!canSeeBatch(user, batch)) return res.status(403).json({ error: 'Access denied' });
  const { type = 'COMMENT', quantity, receivedQuantity, repairedQuantity, faultyQuantity, pendingQuantity, returnedQuantity, comment, mentionedUserIds } = req.body;
  if (!comment && !receivedQuantity && !repairedQuantity && !faultyQuantity && !pendingQuantity && !returnedQuantity && !quantity) return res.status(400).json({ error: 'Update detail is required' });
  const mentions = parseMentionIds(mentionedUserIds);
  const update = await prisma.hardwareUpdate.create({
    data: {
      batchId: batch.id,
      userId: user.id,
      type,
      quantity: quantity === undefined || quantity === '' ? null : Number(quantity),
      receivedQuantity: receivedQuantity === undefined || receivedQuantity === '' ? null : Number(receivedQuantity),
      repairedQuantity: repairedQuantity === undefined || repairedQuantity === '' ? null : Number(repairedQuantity),
      faultyQuantity: faultyQuantity === undefined || faultyQuantity === '' ? null : Number(faultyQuantity),
      pendingQuantity: pendingQuantity === undefined || pendingQuantity === '' ? null : Number(pendingQuantity),
      returnedQuantity: returnedQuantity === undefined || returnedQuantity === '' ? null : Number(returnedQuantity),
      comment: comment || null,
      mentionedUserIds: mentions.length ? JSON.stringify(mentions) : null
    }
  });
  const data = {};
  if (receivedQuantity !== undefined && receivedQuantity !== '') data.receivedQuantity = Number(receivedQuantity);
  if (repairedQuantity !== undefined && repairedQuantity !== '') data.repairedQuantity = Number(repairedQuantity);
  if (faultyQuantity !== undefined && faultyQuantity !== '') data.faultyQuantity = Number(faultyQuantity);
  if (pendingQuantity !== undefined && pendingQuantity !== '') data.pendingQuantity = Number(pendingQuantity);
  if (returnedQuantity !== undefined && returnedQuantity !== '') data.returnedQuantity = Number(returnedQuantity);
  if (type === 'RECEIVED') data.status = 'RECEIVED';
  if (type === 'REPAIR_UPDATE') data.status = 'REPAIRING';
  if (type === 'RETURNED') data.status = Number(returnedQuantity || 0) >= batch.totalQuantity ? 'COMPLETED' : 'PARTIALLY_RETURNED';
  const updatedBatch = await prisma.hardwareBatch.update({ where: { id: batch.id }, data, include: includeBatch });
  const notifyIds = [batch.createdById, batch.assignedToId, batch.ticket?.bankUserId, ...mentions].filter(Boolean).filter((id) => id !== user.id);
  await Promise.all([...new Set(notifyIds)].map((id) => createNotification(req, { userId: id, type: 'HARDWARE_UPDATE', message: `${batch.batchNo}: ${comment || type}` })));
  await notifyMentioned(req, mentions, `${user.name || user.email} mentioned you in ${batch.batchNo}`, user.id);
  const io = req.app.locals.io;
  if (io) io.emit('hardware:updated', { batchId: batch.id });
  res.status(201).json({ update, batch: updatedBatch });
}

async function deleteBatch(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  const batch = await prisma.hardwareBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return res.status(404).json({ error: 'Hardware batch not found' });
  if (!isAdminRole(user.userRole) && batch.createdById !== user.id) return res.status(403).json({ error: 'Only creator/admin can delete batch' });
  await prisma.hardwareUpdate.deleteMany({ where: { batchId: batch.id } });
  await prisma.hardwareItem.deleteMany({ where: { batchId: batch.id } });
  await prisma.hardwareBatch.delete({ where: { id: batch.id } });
  res.json({ ok: true });
}

module.exports = { listBatches, createBatch, getBatch, updateBatch, addUpdate, deleteBatch };
