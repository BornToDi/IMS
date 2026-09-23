const prisma = require('../prismaClient');
const ExcelJS = require('exceljs');
const { addPosToInventory } = require('../utils/posInventory');
const { STATUSES, TRANSITIONS, ROLE_ACTIONS, inventoryRole, fail, clean, date, assertAction, fields, snapshot } = require('../utils/inventory');
const include = { bank: true };
const documentSelect = { id: true, deviceId: true, category: true, name: true, mimeType: true, size: true, uploadedBy: true, createdAt: true };

async function identify(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, userRole: true, inventoryRole: true, bankName: true } });
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.inventoryUser = user;
  req.inventoryRole = inventoryRole(user);
  if (req.inventoryRole === 'BANK') req.inventoryBankId = (await prisma.bankMaster.findUnique({ where: { name: user.bankName || '\u0000' }, select: { id: true } }))?.id;
  res.set('Cache-Control', 'no-store');
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) res.once('finish', () => {
    if (res.statusCode < 300) req.app.locals.io?.emit('inventory:updated');
  });
  next();
}
function scope(req) {
  return req.inventoryRole === 'BANK' ? { bankId: req.inventoryBankId || '\u0000' } : {};
}
function visibleEvent(req, event) {
  const after = JSON.parse(event.details).after;
  return (after?.bankId === req.inventoryBankId || (!after?.bankId && after?.bankName === req.inventoryUser.bankName)) && !['EDIT','DOCUMENT','STOCK_IN'].includes(event.action);
}
async function deviceFor(req, client = prisma, id = req.params.id) {
  const row = await client.inventoryDevice.findFirst({ where: { id, ...scope(req) }, include });
  if (!row) fail('POS device not found', 404);
  return row;
}
function eventData(req, action, before, after, body = {}) {
  return {
    deviceId: after.id, action, previousStatus: before?.status || null, newStatus: after.status,
    actorId: req.inventoryUser.id, actorName: req.inventoryUser.name,
    remarks: clean(body.remarks, 2000) || null,
    occurredAt: date(body.occurredAt, 'event date') || new Date(),
    details: JSON.stringify({ before: before ? snapshot(before) : null, after: snapshot(after), reference: clean(body.reference), deliveredBy: clean(body.deliveredBy), receivedBy: clean(body.receivedBy), replacementSerial: clean(body.replacementSerial), warrantyAtEvent: after.warrantyUntil ? (new Date(after.warrantyUntil) >= (date(body.occurredAt, 'event date') || new Date()) ? 'IN_WARRANTY' : 'EXPIRED') : 'UNKNOWN' })
  };
}
async function bankCheck(tx, bankId) {
  const bank = bankId ? await tx.bankMaster.findUnique({ where: { id: clean(bankId) } }) : null;
  if (!bank || !bank.active) fail('Select an active bank');
  return bank.id;
}
function buildWhere(req) {
  const where = { AND: [scope(req)], archived: req.query.archived === 'true' };
  const q = clean(req.query.q);
  if (q) where.OR = [...['serialNumber', 'brand', 'model', 'tid', 'mid', 'merchant', 'address', 'telco', 'simEi', 'engineer', 'location'].map(key => ({ [key]: { contains: q } })), { bank: { name: { contains: q } } }];
  if (req.query.status) {
    const statuses = clean(req.query.status).split(',');
    if (statuses.some(s => !STATUSES.includes(s))) fail('Invalid status filter');
    where.status = { in: statuses };
  }
  if (req.query.bankId) where.bankId = clean(req.query.bankId);
  if (req.query.model) where.model = clean(req.query.model);
  if (req.query.location) where.location = { contains: clean(req.query.location) };
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = date(req.query.from, 'from date');
    if (req.query.to) { const end = date(req.query.to, 'to date'); end.setUTCHours(23, 59, 59, 999); where.createdAt.lte = end; }
    if (where.createdAt.gte > where.createdAt.lte) fail('From date must be before to date');
  }
  const now = new Date();
  if (req.query.warranty === 'expired') where.warrantyUntil = { lt: now };
  if (req.query.warranty === 'expiring') where.warrantyUntil = { gte: now, lte: new Date(Date.now() + 30 * 86400000) };
  if (req.query.warranty === 'valid') where.warrantyUntil = { gte: now };
  if (req.query.warranty === 'unknown') where.warrantyUntil = null;
  if (req.query.pendingReturn === 'true') where.pendingReturn = true;
  if (req.query.unassigned === 'true') where.bankId = null;
  if (req.query.overdue === 'true') { where.status = { in: ['RESERVED', 'DELIVERED'] }; where.dueDate = { lt: now }; }
  if (req.query.pendingRepair === 'true') where.repairReceivedDate = { lte: new Date(Date.now() - Number(req.inventorySettings?.pendingDays || 7) * 86400000) };
  return where;
}
async function list(req, res) {
  if (req.query.pendingRepair === 'true') req.inventorySettings = await prisma.inventorySetting.findUnique({ where: { id: 'default' } });
  const where = buildWhere(req);
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) fail('Invalid page number');
  const take = 25;
  const [rows, total] = await prisma.$transaction([
    prisma.inventoryDevice.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take, skip: (page - 1) * take }),
    prisma.inventoryDevice.count({ where })
  ]);
  if (req.inventoryRole === 'BANK') for (const row of rows) delete row.repairCost;
  res.json({ rows, total, page, pages: Math.max(1, Math.ceil(total / take)) });
}
async function syncPosSerials(req, res) {
  assertAction(req.inventoryRole, 'STOCK_IN');
  if (req.inventoryRole !== 'ADMIN') fail('Only admin can import POS records into Hardware', 403);
  const bankName = clean(req.body.bankName);
  if (!bankName) fail('Select a bank');
  const rows = await prisma.posSerial.findMany({ where: { bankName } });
  const result = { added: 0, existing: 0, invalid: 0, conflicts: 0 };
  for (let i = 0; i < rows.length; i += 100) {
    const counts = await prisma.$transaction(tx => addPosToInventory(tx, rows.slice(i, i + 100), req.inventoryUser), { timeout: 30000 });
    for (const key of Object.keys(result)) result[key] += counts[key];
  }
  res.json(result);
}
async function summary(req, res) {
  const where = { ...scope(req), archived: false };
  const settings = await prisma.inventorySetting.findUnique({ where: { id: 'default' } }) || { lowStockThreshold: 10, pendingDays: 7 };
  const now = new Date();
  const pendingBefore = new Date(Date.now() - settings.pendingDays * 86400000);
  let [statusCounts, modelCounts, bankCounts, eventCounts, warranty, repairs, returns, overdue, recent, models, banks] = await prisma.$transaction([
    prisma.inventoryDevice.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.inventoryDevice.groupBy({ by: ['model', 'status'], where, _count: { _all: true } }),
    prisma.inventoryDevice.groupBy({ by: ['bankId', 'status'], where, _count: { _all: true } }),
    prisma.inventoryEvent.groupBy({ by: ['action'], where: { device: where }, _count: { _all: true } }),
    prisma.inventoryDevice.count({ where: { ...where, warrantyUntil: { gte: now, lte: new Date(Date.now() + 30 * 86400000) }, status: { not: 'SCRAPPED' } } }),
    prisma.inventoryDevice.count({ where: { ...where, status: 'UNDER_REPAIR', repairReceivedDate: { lte: pendingBefore } } }),
    prisma.inventoryDevice.count({ where: { ...where, pendingReturn: true } }),
    prisma.inventoryDevice.count({ where: { ...where, status: { in: ['RESERVED', 'DELIVERED'] }, dueDate: { lt: now } } }),
    prisma.inventoryEvent.findMany({ where: { device: scope(req) }, orderBy: { createdAt: 'desc' }, take: req.inventoryRole === 'BANK' ? 100 : 8, select: { id: true, action: true, actorName: true, occurredAt: true, newStatus: true, details: true, device: { select: { id: true, serialNumber: true } } } }),
    prisma.inventoryDevice.findMany({ where, distinct: ['model'], select: { model: true }, orderBy: { model: 'asc' } }),
    prisma.bankMaster.findMany({ where: req.inventoryRole === 'BANK' ? { name: req.inventoryUser.bankName || '\u0000' } : {}, orderBy: { name: 'asc' }, include: { _count: { select: { devices: true } } } })
  ]);
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  for (const row of statusCounts) counts[row.status] = row._count._all;
  const movements = Object.fromEntries(eventCounts.map(row => [row.action, row._count._all]));
  if (req.inventoryRole === 'BANK') recent = recent.filter(event => visibleEvent(req, event)).slice(0,8);
  for (const event of recent) delete event.details;
  res.json({ counts, total: statusCounts.reduce((sum, row) => sum + row._count._all, 0), modelCounts, bankCounts, movements, banks, models: models.map(r => r.model), settings, alerts: { lowStock: counts.IN_STOCK <= settings.lowStockThreshold, warranty, repairs, returns, overdue }, recent, role: req.inventoryRole, actions: ROLE_ACTIONS[req.inventoryRole] || [], transitions: TRANSITIONS });
}
async function detail(req, res) {
  const row = await deviceFor(req);
  let [events, documents] = await prisma.$transaction([
    prisma.inventoryEvent.findMany({ where: { deviceId: row.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.inventoryDocument.findMany({ where: { deviceId: row.id }, select: documentSelect, orderBy: { createdAt: 'desc' } })
  ]);
  // Bank users see service progress, never internal costs or previous banks' snapshots.
  if (req.inventoryRole === 'BANK') {
    delete row.repairCost;
    events = events.filter(event => visibleEvent(req, event));
    for (const event of events) { delete event.details; delete event.actorId; }
    documents = [];
  }
  res.json({ ...row, events, documents });
}
async function stockIn(req, res) {
  assertAction(req.inventoryRole, 'STOCK_IN');
  const body = req.body || {};
  const serials = (Array.isArray(body.serialNumbers) ? body.serialNumbers : clean(body.serialNumbers, 30000).split(/[\n,]+/)).map(s => clean(s, 120));
  if (!serials.length || serials.length > 500 || serials.some(s => !s)) fail('Enter between 1 and 500 serial numbers; remove blank entries');
  if (new Set(serials.map(s => s.toUpperCase())).size !== serials.length) fail('Duplicate serial numbers in this receipt');
  for (const key of ['brand', 'model', 'location', 'supplier', 'reference', 'receivedBy']) if (!clean(body[key])) fail(`${key} is required`);
  const purchaseDate = date(body.purchaseDate, 'purchase date');
  const warrantyUntil = date(body.warrantyUntil, 'warranty date');
  if (purchaseDate && warrantyUntil && warrantyUntil < purchaseDate) fail('Warranty cannot end before purchase');
  const occurredAt = date(body.occurredAt, 'receipt date') || new Date();
  if (occurredAt > new Date(Date.now() + 60000)) fail('Receipt date cannot be in the future');
  if (purchaseDate && purchaseDate > occurredAt) fail('Purchase date cannot be after receipt');
  const rows = await prisma.$transaction(async tx => {
    const result = [];
    for (const serialNumber of serials) {
      const existing = await tx.inventoryDevice.findUnique({ where: { serialNumber: serialNumber.toUpperCase() } });
      if (existing) fail(`Serial ${serialNumber} already exists`, 409);
      const row = await tx.inventoryDevice.create({ data: { ...fields(body, ['brand', 'model', 'deviceType', 'supplier', 'location', 'remarks', 'reference']), serialNumber: serialNumber.toUpperCase(), purchaseDate, warrantyUntil, status: 'IN_STOCK', deviceType: clean(body.deviceType) || 'POS' }, include });
      await tx.inventoryEvent.create({ data: eventData(req, 'STOCK_IN', null, row, body) });
      result.push(row);
    }
    return result;
  }, { timeout: 30000 });
  res.status(201).json({ rows, received: rows.length });
}
async function applyAction(req, tx, id, body) {
  const action = clean(body.action);
    const before = await deviceFor(req, tx, id);
    assertAction(req.inventoryRole, action, before, body);
    const now = date(body.occurredAt, 'event date') || new Date();
    if (now > new Date(Date.now() + 60000)) fail('Event date cannot be in the future');
    if (now < new Date(before.createdAt).setUTCHours(0, 0, 0, 0)) fail('Event date cannot be before this device was registered');
    let data = { status: TRANSITIONS[action].to || before.status, version: { increment: 1 } };
    const actionFields = {
      EDIT: ['brand', 'model', 'deviceType', 'supplier', 'telco', 'simEi', 'remarks'],
      RESTOCK: ['location', 'remarks'], RESERVE: ['remarks', 'reference'],
      DELIVER: ['location', 'reference', 'remarks'],
      DEPLOY: ['location', 'merchant', 'branch', 'tid', 'mid', 'address', 'telco', 'simEi', 'engineer', 'remarks'],
      TRANSFER: ['location', 'merchant', 'branch', 'tid', 'mid', 'address', 'telco', 'simEi', 'engineer', 'remarks'],
      FAULT: ['faultType', 'remarks'], REPAIR: ['technician', 'location', 'remarks'],
      REPAIR_UPDATE: ['technician', 'repairStatus', 'remarks'], REPAIR_COMPLETE: ['remarks'],
      RETURN: ['location', 'remarks'], CONFIRM_RETURN: ['location', 'remarks'], REPLACE: ['remarks'], SCRAP: ['remarks'], ARCHIVE: ['remarks']
    };
    data = { ...data, ...fields(body, actionFields[action]) };
    if (action === 'EDIT') {
      for (const key of ['brand', 'model', 'deviceType']) if (data[key] === null) fail(`${key} is required`);
      if (body.purchaseDate !== undefined) data.purchaseDate = date(body.purchaseDate, 'purchase date');
      if (body.warrantyUntil !== undefined) data.warrantyUntil = date(body.warrantyUntil, 'warranty date');
      const purchase = data.purchaseDate === undefined ? before.purchaseDate : data.purchaseDate;
      const warranty = data.warrantyUntil === undefined ? before.warrantyUntil : data.warrantyUntil;
      if (purchase && warranty && warranty < purchase) fail('Warranty cannot end before purchase');
    }
    if (['RESERVE', 'DELIVER', 'DEPLOY'].includes(action)) {
      data.bankId = await bankCheck(tx, body.bankId);
      if (before.bankId && before.bankId !== data.bankId) fail('Return this POS to stock before assigning another bank', 409);
    }
    if (['RESERVE', 'DELIVER', 'REPLACE'].includes(action)) {
      data.dueDate = date(body.dueDate, 'due date');
      if (data.dueDate < new Date(now.toISOString().slice(0, 10))) fail('Due date cannot be before the event');
    }
    if (action === 'DEPLOY') { data.deploymentDate = now; data.dueDate = null; }
    if (action === 'TRANSFER') {
      if (data.location === before.location && (!data.merchant || data.merchant === before.merchant) && (!data.branch || data.branch === before.branch)) fail('Choose a different destination');
      if (before.status === 'DEPLOYED') for (const key of ['merchant', 'tid', 'mid', 'address', 'engineer']) if (!clean(body[key])) fail(`${key} is required for an active device transfer`);
      if (body.bankId && body.bankId !== before.bankId) fail('Use return, then delivery to change banks');
    }
    if (action === 'FAULT') { data.repairStatus = 'PENDING'; data.repairReceivedDate = null; data.repairReturnDate = null; }
    if (action === 'RESTOCK' && before.faultType && before.repairStatus !== 'COMPLETED') fail('Repair this faulty device before returning it to available stock', 409);
    if (action === 'RESTOCK' && [before.brand, before.model].includes('Unverified')) fail('Edit and verify the brand and model before making this POS available');
    if (action === 'REPAIR' && before.status === 'RETURNED' && (!before.faultType || before.repairStatus === 'COMPLETED')) fail('This returned POS has no unresolved fault', 409);
    if (action === 'REPAIR') { data.repairReceivedDate = now; data.repairStatus = 'RECEIVED'; data.repairReturnDate = null; data.repairCost = 0; }
    if (['REPAIR_UPDATE', 'REPAIR_COMPLETE'].includes(action) && body.repairCost !== undefined) {
      const cost = Number(body.repairCost);
      if (!Number.isFinite(cost) || cost < 0 || cost > 100000000) fail('Enter a valid non-negative repair cost');
      data.repairCost = Math.round(cost * 100) / 100;
    }
    if (action === 'REPAIR_COMPLETE') { data.repairStatus = 'COMPLETED'; data.repairReturnDate = now; }
    if (action === 'RETURN' || action === 'RESTOCK') {
      data = { ...data, bankId: null, merchant: null, branch: null, tid: null, mid: null, address: null, telco: null, simEi: null, engineer: null, deploymentDate: null, pendingReturn: false, dueDate: null };
      if (action === 'RESTOCK' && !clean(body.location)) fail('Warehouse location is required');
    }
    if (action === 'CONFIRM_RETURN') {
      if (!before.pendingReturn) fail('Return already confirmed', 409);
      data.pendingReturn = false; data.dueDate = null;
    }
    if (action === 'ARCHIVE') data.archived = true;
    if (action === 'REPLACE') {
      if (!before.bankId || !before.merchant || !before.tid || !before.mid) fail('Replacement requires a previously deployed device with bank, merchant, TID and MID');
      const replacement = await tx.inventoryDevice.findUnique({ where: { serialNumber: clean(body.replacementSerial).toUpperCase() }, include });
      if (!replacement || replacement.id === before.id || replacement.archived || replacement.status !== 'IN_STOCK' || replacement.bankId) fail('Replacement must be a different, available warehouse POS', 409);
      await bankCheck(tx, before.bankId);
      const conflict = await tx.inventoryDevice.findFirst({ where: { bankId: before.bankId, tid: before.tid, status: 'DEPLOYED', archived: false } });
      if (conflict) fail(`TID ${before.tid} is already active on ${conflict.serialNumber}`, 409);
      const updated = await tx.inventoryDevice.updateMany({ where: { id: replacement.id, version: replacement.version, status: 'IN_STOCK' }, data: { bankId: before.bankId, location: clean(body.location), merchant: before.merchant, branch: before.branch, tid: before.tid, mid: before.mid, address: before.address, telco: before.telco, simEi: before.simEi, engineer: clean(body.engineer), deploymentDate: now, status: 'DEPLOYED', replacementSerial: before.serialNumber, version: { increment: 1 } } });
      if (updated.count !== 1) fail('Replacement is no longer available', 409);
      const next = await tx.inventoryDevice.findUnique({ where: { id: replacement.id }, include });
      await tx.inventoryEvent.create({ data: eventData(req, 'REPLACEMENT_ISSUED', replacement, next, body) });
      data.replacementSerial = replacement.serialNumber;
      data.pendingReturn = true;
    }
    if (data.status === 'DEPLOYED') {
      const bankId = data.bankId || before.bankId;
      const tid = data.tid || before.tid;
      const conflict = await tx.inventoryDevice.findFirst({ where: { id: { not: before.id }, bankId, tid, status: 'DEPLOYED', archived: false } });
      if (conflict) fail(`TID ${tid} is already active on ${conflict.serialNumber}`, 409);
    }
    const updated = await tx.inventoryDevice.updateMany({ where: { id: before.id, version: body.version }, data });
    if (updated.count !== 1) fail('This device changed. Refresh and try again.', 409);
    const after = await tx.inventoryDevice.findUnique({ where: { id: before.id }, include });
    await tx.inventoryEvent.create({ data: eventData(req, action, before, after, body) });
    return after;
}
async function act(req, res) {
  res.json(await prisma.$transaction(tx => applyAction(req, tx, req.params.id, req.body || {})));
}
async function bulkAct(req, res) {
  const { devices, ...body } = req.body || {};
  if (!['DELIVER','RESERVE','TRANSFER','RETURN','RESTOCK'].includes(body.action)) fail('Choose a stock movement for bulk updates');
  if (!Array.isArray(devices) || !devices.length || devices.length > 100 || devices.some(d => !d || typeof d.id !== 'string') || new Set(devices.map(d => d.id)).size !== devices.length) fail('Select 1–100 different devices');
  const rows = await prisma.$transaction(async tx => {
    const result = [];
    for (const device of devices) result.push(await applyAction(req, tx, clean(device.id), { ...body, version: device.version }));
    return result;
  }, { timeout: 30000 });
  res.json({ rows, quantity: rows.length });
}
async function bulkBySerial(req, res) {
  const { serialNumbers, ...body } = req.body || {};
  if (!['DELIVER', 'RETURN', 'RESTOCK'].includes(body.action)) fail('Choose Deliver, Return or Restock');
  assertAction(req.inventoryRole, body.action);
  if (!Array.isArray(serialNumbers) || !serialNumbers.length || serialNumbers.length > 50) fail('Send 1–50 serial numbers per batch');
  const serials = serialNumbers.map(value => clean(value, 120).toUpperCase());
  if (serials.some(value => !value) || new Set(serials).size !== serials.length) fail('Serial numbers must be filled and unique');
  const bankId = clean(body.bankId);
  if (body.action !== 'RESTOCK' && !bankId) fail('Select a bank');
  const rows = await prisma.$transaction(async tx => {
    if (body.action === 'DELIVER') await bankCheck(tx, bankId);
    else if (body.action === 'RETURN' && !await tx.bankMaster.findUnique({ where: { id: bankId }, select: { id: true } })) fail('Bank not found');
    const devices = await tx.inventoryDevice.findMany({ where: { serialNumber: { in: serials } }, select: { id: true, serialNumber: true, version: true, bankId: true } });
    const bySerial = new Map(devices.map(device => [device.serialNumber, device]));
    const result = [];
    for (const serial of serials) {
      const device = bySerial.get(serial);
      if (!device) fail(`${serial}: POS is not in the Hardware register`, 404);
      if (body.action === 'RETURN' && device.bankId !== bankId) fail(`${serial}: POS is not assigned to the selected bank`, 409);
      try { result.push(await applyAction(req, tx, device.id, { ...body, version: device.version })); }
      catch (error) { error.message = `${serial}: ${error.message}`; throw error; }
    }
    return result;
  }, { timeout: 30000 });
  res.json({ quantity: rows.length, serialNumbers: rows.map(row => row.serialNumber) });
}
async function saveBank(req, res) {
  assertAction(req.inventoryRole, 'BANK');
  const data = fields(req.body, ['branch', 'contactPerson', 'contactDetails', 'agreementReference']);
  data.name = clean(req.body.name);
  if (!data.name) fail('Bank name is required');
  if (req.body.active !== undefined && typeof req.body.active !== 'boolean') fail('Invalid bank status');
  data.active = req.body.active !== false;
  const row = await prisma.$transaction(async tx => {
    const before = req.params.id ? await tx.bankMaster.findUnique({ where: { id: req.params.id } }) : null;
    if (req.params.id && !before) fail('Bank not found', 404);
    const after = before ? await tx.bankMaster.update({ where: { id: before.id }, data }) : await tx.bankMaster.create({ data });
    if (before && before.name !== after.name) {
      for (const model of ['posSerial', 'user', 'bankTicket', 'workspace', 'hardwareBatch']) await tx[model].updateMany({ where: { bankName: before.name }, data: { bankName: after.name } });
    }
    await tx.inventoryAdminAudit.create({ data: { action: before ? 'BANK_EDIT' : 'BANK_CREATE', actorId: req.inventoryUser.id, actorName: req.inventoryUser.name, details: JSON.stringify({ before, after }) } });
    return after;
  });
  res.status(req.params.id ? 200 : 201).json(row);
}
async function upload(req, res) {
  assertAction(req.inventoryRole, 'DOCUMENT');
  const file = req.file;
  if (!file) fail('Choose a PDF, PNG or JPEG document');
  const category = clean(req.body.category);
  if (!['PURCHASE_ORDER', 'INVOICE', 'DELIVERY_CHALLAN', 'BANK_ACCEPTANCE', 'WARRANTY', 'RMA'].includes(category)) fail('Select a document category');
  const b = file.buffer;
  const detected = b.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg' : null;
  if (!detected) fail('Only valid PDF, PNG and JPEG files are supported');
  const result = await prisma.$transaction(async tx => {
    const device = await deviceFor(req, tx);
    if (device.archived) fail('Archived devices are read-only', 409);
    const doc = await tx.inventoryDocument.create({ data: { deviceId: device.id, category, name: clean(file.originalname, 255), mimeType: detected, content: b, size: file.size, uploadedBy: req.inventoryUser.name }, select: documentSelect });
    await tx.inventoryEvent.create({ data: eventData(req, 'DOCUMENT', device, device, { remarks: `${category}: ${doc.name}` }) });
    return doc;
  });
  res.status(201).json(result);
}
async function download(req, res) {
  if (req.inventoryRole === 'BANK') fail('Internal inventory documents are not available to bank accounts', 403);
  const doc = await prisma.inventoryDocument.findFirst({ where: { id: req.params.documentId, device: scope(req) } });
  if (!doc) fail('Document not found', 404);
  res.set({ 'Content-Type': doc.mimeType, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}` }).send(Buffer.from(doc.content));
}
const REPORTS = ['stock', 'bank', 'model', 'deployment', 'faulty', 'repair', 'replacement', 'return', 'warranty', 'movement', 'audit'];
async function reportRows(req) {
  const type = clean(req.query.type) || 'stock';
  if (!REPORTS.includes(type)) fail('Unknown report');
  const where = buildWhere(req);
  const status = { deployment: ['DEPLOYED'], faulty: ['FAULTY'], repair: ['UNDER_REPAIR', 'REPAIRED'] }[type];
  if (status) where.status = { in: status };
  if (type === 'replacement') where.replacementSerial = { not: null };
  if (type === 'warranty' && !req.query.warranty) where.warrantyUntil = { lte: new Date(Date.now() + 30 * 86400000) };
  if (['movement', 'audit', 'return'].includes(type)) {
    const { createdAt, ...deviceWhere } = where;
    let events = await prisma.inventoryEvent.findMany({ where: { device: deviceWhere, ...(createdAt ? { occurredAt: createdAt } : {}), ...(type === 'return' ? { action: { in: ['RETURN','CONFIRM_RETURN'] } } : {}) }, include: { device: { select: { serialNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 10001 });
    if (events.length > 10000) fail('Narrow the filters to export 10,000 events or fewer');
    if (req.inventoryRole === 'BANK') events = events.filter(event => visibleEvent(req, event));
    const rows = events.map(e => ({ Serial: e.device.serialNumber, Action: e.action, Previous: e.previousStatus || '', Status: e.newStatus, User: e.actorName, Date: e.occurredAt.toISOString(), Remarks: e.remarks || '', ...(req.inventoryRole !== 'BANK' ? { Details: e.details } : {}) }));
    if (type === 'audit' && req.inventoryRole !== 'BANK') {
      const admin = await prisma.inventoryAdminAudit.findMany({ where: createdAt ? { createdAt } : {}, orderBy: { createdAt: 'desc' }, take: 10001 });
      if (rows.length + admin.length > 10000) fail('Narrow the date range to export 10,000 events or fewer');
      rows.push(...admin.map(e => ({ Serial: '', Action: e.action, Previous: '', Status: '', User: e.actorName, Date: e.createdAt.toISOString(), Remarks: '', Details: e.details })));
    }
    return rows;
  }
  const rows = await prisma.inventoryDevice.findMany({ where, include, orderBy: { serialNumber: 'asc' }, take: 10001 });
  if (rows.length > 10000) fail('Narrow the filters to export 10,000 devices or fewer');
  if (['bank', 'model'].includes(type)) {
    const groups = new Map();
    for (const row of rows) {
      const key = type === 'bank' ? row.bank?.name || 'Warehouse / unassigned' : row.model;
      if (!groups.has(key)) groups.set(key, { [type === 'bank' ? 'Bank' : 'Model']: key, Total: 0, ...Object.fromEntries(STATUSES.map(s => [s, 0])) });
      const group = groups.get(key); group.Total++; group[row.status]++;
    }
    return [...groups.values()];
  }
  return rows.map(r => ({ Serial: r.serialNumber, Brand: r.brand, Model: r.model, Type: r.deviceType, Supplier: r.supplier || '', Status: r.status, Bank: r.bank?.name || '', Location: r.location, Merchant: r.merchant || '', Branch: r.branch || '', TID: r.tid || '', MID: r.mid || '', Address: r.address || '', Engineer: r.engineer || '', Purchase: r.purchaseDate?.toISOString().slice(0,10) || '', Warranty: r.warrantyUntil?.toISOString().slice(0,10) || '', Deployed: r.deploymentDate?.toISOString().slice(0,10) || '', Fault: r.faultType || '', Technician: r.technician || '', Repair: r.repairStatus || '', ...(req.inventoryRole !== 'BANK' ? { RepairCost: r.repairCost } : {}), Replacement: r.replacementSerial || '', PendingReturn: r.pendingReturn ? 'Yes' : 'No', Reference: r.reference || '', Due: r.dueDate?.toISOString().slice(0,10) || '', Remarks: r.remarks || '' }));
}
async function report(req, res) {
  const rows = await reportRows(req);
  if (req.query.format !== 'xlsx') return res.json({ rows, generatedAt: new Date().toISOString() });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('POS inventory');
  const keys = Object.keys(rows[0] || { Serial: '' });
  sheet.columns = keys.map(key => ({ header: key, key, width: key === 'Details' ? 50 : 22 }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: keys.length } };
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="pos-inventory.xlsx"' });
  res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
}
async function settings(req, res) {
  assertAction(req.inventoryRole, 'SETTINGS');
  if (req.method === 'GET') {
    const users = await prisma.user.findMany({ select: { id: true, name: true, userRole: true, inventoryRole: true }, orderBy: { name: 'asc' } });
    return res.json({ users });
  }
  const body = req.body;
  await prisma.$transaction(async tx => {
    if (body.userId) {
      const role = clean(body.inventoryRole);
      if (!['STORE', 'OPERATIONS', 'TECHNICIAN', 'MANAGEMENT'].includes(role)) fail('Invalid inventory role');
      const target = await tx.user.findUnique({ where: { id: clean(body.userId) } });
      if (!target || ['ADMIN', 'BANK', 'MANAGEMENT'].includes(target.userRole)) fail('This account role cannot be overridden');
      await tx.user.update({ where: { id: target.id }, data: { inventoryRole: role } });
    } else {
      for (const key of ['lowStockThreshold', 'pendingDays']) if (!Number.isInteger(body[key]) || body[key] < (key === 'pendingDays' ? 1 : 0) || body[key] > 10000) fail(`Invalid ${key}`);
      const data = { lowStockThreshold: body.lowStockThreshold, pendingDays: body.pendingDays };
      await tx.inventorySetting.upsert({ where: { id: 'default' }, create: data, update: data });
    }
    await tx.inventoryAdminAudit.create({ data: { action: 'SETTINGS', actorId: req.inventoryUser.id, actorName: req.inventoryUser.name, details: JSON.stringify(body) } });
  });
  res.json({ ok: true });
}
function errors(err, req, res, next) {
  if (err.code === 'P2002') return res.status(409).json({ error: 'This serial or bank already exists. No duplicate was saved.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Document must be 10 MB or smaller' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  next(err);
}
module.exports = { identify, list, summary, detail, stockIn, act, bulkAct, bulkBySerial, saveBank, upload, download, report, settings, errors, syncPosSerials };
