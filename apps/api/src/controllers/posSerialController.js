const fs = require('fs');
const { randomUUID } = require('crypto');
const { parseExcelFile, parseImportText } = require('../utils/posImport');
const { PDFParse } = require('pdf-parse');
const prisma = require('../prismaClient');
const { validPosSerial, addPosToInventory } = require('../utils/posInventory');
const { isAdminRole, isFullAdminRole, isBankRole, getUser } = require('../utils/workflow');

function clean(v) { return String(v || '').trim(); }
function bankOfUser(user) { return clean(user?.bankName) || (isBankRole(user?.userRole) ? clean(user?.name) : ''); }

async function currentUser(req, res) {
  const user = await getUser(req.userId);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return user;
}

let extraColumnsReady = false;
async function ensurePosSerialExtraColumns() {
  if (extraColumnsReady) return;
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("PosSerial")').catch(() => []);
  const hasLocation = Array.isArray(columns) && columns.some((col) => col.name === 'location');
  const hasPlace = Array.isArray(columns) && columns.some((col) => col.name === 'place');
  if (!hasLocation) {
    await prisma.$executeRawUnsafe('ALTER TABLE "PosSerial" ADD COLUMN "location" TEXT').catch((e) => {
      if (!String(e?.message || '').includes('duplicate column')) throw e;
    });
  }
  if (!hasPlace) {
    await prisma.$executeRawUnsafe('ALTER TABLE "PosSerial" ADD COLUMN "place" TEXT').catch((e) => {
      if (!String(e?.message || '').includes('duplicate column')) throw e;
    });
  }
  extraColumnsReady = true;
}

const detailFields = ['tidNumber', 'midNumber', 'merchantName', 'merchantAddress', 'merchantStatus', 'operator', 'simNumber', 'remarks'];

async function upsertPosSerialRaw({ bankName, serialNumber, model = null, location = null, place = null, ...details }) {
  await ensurePosSerialExtraColumns();
  const existing = await prisma.posSerial.findUnique({ where: { serialNumber }, select: { bankName: true } });
  if (existing && existing.bankName !== bankName) {
    const error = new Error(`This POS serial already belongs to ${existing.bankName}`);
    error.status = 409;
    throw error;
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PosSerial" ("id", "bankName", "serialNumber", "model", "location", "place", "tidNumber", "midNumber", "merchantName", "merchantAddress", "merchantStatus", "operator", "simNumber", "remarks", "status", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("serialNumber") DO UPDATE SET
       "model" = COALESCE(excluded."model", "PosSerial"."model"),
       "location" = COALESCE(excluded."location", "PosSerial"."location"),
       "place" = COALESCE(excluded."place", "PosSerial"."place"),
       "tidNumber" = COALESCE(excluded."tidNumber", "PosSerial"."tidNumber"),
       "midNumber" = COALESCE(excluded."midNumber", "PosSerial"."midNumber"),
       "merchantName" = COALESCE(excluded."merchantName", "PosSerial"."merchantName"),
       "merchantAddress" = COALESCE(excluded."merchantAddress", "PosSerial"."merchantAddress"),
       "merchantStatus" = COALESCE(excluded."merchantStatus", "PosSerial"."merchantStatus"),
       "operator" = COALESCE(excluded."operator", "PosSerial"."operator"),
       "simNumber" = COALESCE(excluded."simNumber", "PosSerial"."simNumber"),
       "remarks" = COALESCE(excluded."remarks", "PosSerial"."remarks"),
       "status" = 'ACTIVE',
       "updatedAt" = CURRENT_TIMESTAMP
     WHERE "PosSerial"."bankName" = excluded."bankName"`,
    randomUUID(),
    bankName,
    serialNumber,
    model,
    location,
    place,
    ...detailFields.map((field) => details[field] || null)
  );
  const rows = await prisma.$queryRawUnsafe('SELECT * FROM "PosSerial" WHERE "serialNumber" = ? LIMIT 1', serialNumber);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (row?.bankName !== bankName) {
    const error = new Error(`This POS serial already belongs to ${row?.bankName || 'another bank'}`);
    error.status = 409;
    throw error;
  }
  return row;
}

async function parsePdfFile(filePath, bankName) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  const data = await parser.getText();
  await parser.destroy();
  const text = String(data.text || '').replace(/\r/g, '');
  const { rows: structured } = parseImportText(text, bankName);
  if (structured.length) return structured;

  const unique = new Set();
  const rows = [];
  for (const line of text.split('\n')) {
    const candidates = line.match(/\b[A-Z0-9][A-Z0-9-]{5,}\b/gi) || [];
    const serialNumber = candidates.find((value) => /\d/.test(value) && !/^20\d{2}-?\d{2}/.test(value));
    if (serialNumber && !unique.has(serialNumber.toUpperCase())) {
      unique.add(serialNumber.toUpperCase());
      rows.push({ bankName, serialNumber: serialNumber.trim() });
    }
  }
  return rows;
}

async function bankNamesFromMasterAndSerials() {
  const [masters, serials] = await Promise.all([
    prisma.bankMaster.findMany({ select: { name: true }, orderBy: { name: 'asc' } }).catch(() => []),
    prisma.posSerial.findMany({ where: { status: 'ACTIVE' }, select: { bankName: true }, orderBy: { bankName: 'asc' } })
  ]);
  return [...new Set([
    ...masters.map((r) => clean(r.name)),
    ...serials.map((r) => clean(r.bankName))
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function listPublicBanks(req, res) {
  const banks = await bankNamesFromMasterAndSerials();
  res.json({ banks });
}

async function listBanks(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (isBankRole(user.userRole)) {
    const ownBank = bankOfUser(user);
    return res.json(ownBank ? [{ id: ownBank, name: ownBank }] : []);
  }
  const [masters, serialCounts] = await Promise.all([
    prisma.bankMaster.findMany({ orderBy: { name: 'asc' } }).catch(() => []),
    prisma.posSerial.groupBy({ by: ['bankName'], where: { status: 'ACTIVE' }, _count: { _all: true } }).catch(() => [])
  ]);
  const counts = new Map(serialCounts.map((r) => [clean(r.bankName), r._count._all]));
  const seen = new Set();
  const rows = masters.map((b) => {
    seen.add(clean(b.name));
    return { ...b, posCount: counts.get(clean(b.name)) || 0 };
  });
  for (const [name, count] of counts.entries()) {
    if (!seen.has(name)) rows.push({ id: name, name, posCount: count, legacy: true });
  }
  rows.sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
  res.json(rows);
}

async function createBank(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can create bank' });
  const name = clean(req.body.name || req.body.bankName);
  if (!name) return res.status(400).json({ error: 'Bank name is required' });
  const row = await prisma.bankMaster.upsert({ where: { name }, update: { name }, create: { name } });
  res.status(201).json(row);
}

async function updateBank(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can edit bank' });
  const oldName = clean(req.params.id);
  const trackedBank = await prisma.bankMaster.findUnique({ where: { name: oldName }, include: { _count: { select: { devices: true } } } });
  if (trackedBank?._count.devices) return res.status(409).json({ error: 'Edit this bank in Hardware → Banks to preserve the inventory audit trail.' });
  const name = clean(req.body.name || req.body.bankName);
  if (!oldName || !name) return res.status(400).json({ error: 'Old and new bank name are required' });

  const existing = await prisma.bankMaster.findUnique({ where: { name } }).catch(() => null);
  if (existing && name !== oldName) return res.status(409).json({ error: 'Another bank already has this name' });

  await prisma.$transaction(async (tx) => {
    await tx.bankMaster.upsert({ where: { name: oldName }, update: { name }, create: { name } });
    await tx.posSerial.updateMany({ where: { bankName: oldName }, data: { bankName: name } });
    await tx.user.updateMany({ where: { bankName: oldName }, data: { bankName: name } });
    await tx.bankTicket.updateMany({ where: { bankName: oldName }, data: { bankName: name } }).catch(() => {});
    await tx.workspace.updateMany({ where: { bankName: oldName }, data: { bankName: name } }).catch(() => {});
    await tx.hardwareBatch.updateMany({ where: { bankName: oldName }, data: { bankName: name } }).catch(() => {});
  });
  const row = await prisma.bankMaster.findUnique({ where: { name } });
  res.json(row || { name });
}

async function deleteBank(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can delete bank' });
  const name = clean(req.params.id);
  const trackedBank = await prisma.bankMaster.findUnique({ where: { name }, include: { _count: { select: { devices: true } } } });
  if (trackedBank?._count.devices) return res.status(409).json({ error: 'This bank has inventory history. Deactivate it in Hardware → Banks instead.' });
  if (!name) return res.status(400).json({ error: 'Bank name is required' });

  const result = await prisma.$transaction(async (tx) => {
    const posSerials = await tx.posSerial.deleteMany({ where: { bankName: name } });
    await tx.bankMaster.delete({ where: { name } }).catch(() => null);
    return { deletedPosSerials: posSerials.count };
  });

  res.json({ ok: true, bankName: name, deletedPosSerials: result.deletedPosSerials });
}

async function listPosSerials(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  await ensurePosSerialExtraColumns();
  const q = clean(req.query.q);
  const bankQuery = clean(req.query.bankName);
  const take = Math.min(Math.max(Number(req.query.take) || 20, 1), 500);
  const paginated = String(req.query.paginated || '') === 'true';
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * take;
  const ownBank = bankOfUser(user);

  const where = ['"status" = ?'];
  const values = ['ACTIVE'];
  if (isBankRole(user.userRole)) {
    if (!ownBank) return res.json([]);
    where.push('"bankName" = ?');
    values.push(ownBank);
  } else if (bankQuery) {
    where.push('"bankName" = ?');
    values.push(bankQuery);
  }
  if (q) {
    where.push('("serialNumber" LIKE ? OR "bankName" LIKE ? OR "model" LIKE ? OR "location" LIKE ? OR "place" LIKE ? OR "tidNumber" LIKE ? OR "midNumber" LIKE ? OR "merchantName" LIKE ? OR "merchantAddress" LIKE ? OR "operator" LIKE ? OR "simNumber" LIKE ?)');
    values.push(...Array(11).fill(`%${q}%`));
  }

  const whereSql = where.join(' AND ');
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM "PosSerial" WHERE ${whereSql} ORDER BY "bankName" ASC, "serialNumber" ASC LIMIT ? OFFSET ?`,
    ...values,
    take,
    paginated ? offset : 0
  );
  if (!paginated) return res.json(rows);

  const countRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS "total" FROM "PosSerial" WHERE ${whereSql}`,
    ...values
  );
  const total = Number(countRows?.[0]?.total || 0);
  res.json({ rows, total, page, pageSize: take, totalPages: Math.max(Math.ceil(total / take), 1) });
}

async function createPosSerial(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole) && !isBankRole(user.userRole)) return res.status(403).json({ error: 'Only admin or bank users can add POS serials' });
  const requestedBank = clean(req.body.bankName);
  const bankName = isBankRole(user.userRole) ? bankOfUser(user) : requestedBank;
  const serialNumber = clean(req.body.serialNumber);
  const model = clean(req.body.model) || null;
  const location = clean(req.body.location) || null;
  const place = clean(req.body.place) || null;
  const details = Object.fromEntries(detailFields.map((field) => [field, clean(req.body[field]) || null]));
  if (!bankName || !serialNumber) return res.status(400).json({ error: 'Bank name and serial number are required' });
  await prisma.bankMaster.upsert({ where: { name: bankName }, update: { name: bankName }, create: { name: bankName } }).catch(() => null);
  let row;
  try { row = await upsertPosSerialRaw({ bankName, serialNumber, model, location, place, ...details }); }
  catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); throw error; }
  res.status(201).json(row);
}

async function updatePosSerial(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole) && !isBankRole(user.userRole)) return res.status(403).json({ error: 'Only admin or bank users can edit POS records' });
  const existing = await prisma.posSerial.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'POS record not found' });
  if (isBankRole(user.userRole) && existing.bankName !== bankOfUser(user)) return res.status(403).json({ error: 'You can only edit POS records for your bank' });
  const serialNumber = clean(req.body.serialNumber);
  if (!serialNumber) return res.status(400).json({ error: 'POS serial is required' });
  const conflict = await prisma.posSerial.findUnique({ where: { serialNumber }, select: { id: true } });
  if (conflict && conflict.id !== existing.id) return res.status(409).json({ error: 'This POS serial already exists' });
  const fields = ['serialNumber', 'model', 'location', 'place', ...detailFields];
  const data = Object.fromEntries(fields.map((field) => [field, clean(req.body[field]) || null]));
  data.serialNumber = serialNumber;
  const row = await prisma.posSerial.update({ where: { id: existing.id }, data });
  res.json(row);
}

async function importPosSerials(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole) && !isBankRole(user.userRole)) return res.status(403).json({ error: 'Only admin or bank users can import POS serials' });
  if (!req.file) return res.status(400).json({ error: 'Excel or CSV file is required' });

  try {
    const selectedBank = isBankRole(user.userRole) ? bankOfUser(user) : clean(req.body.bankName);
    const syncHardware = String(user.userRole).toUpperCase() === 'ADMIN';
    const extension = String(req.file.originalname || '').toLowerCase().split('.').pop();
    let rows = [];
    let mapping = null;

    if (extension === 'xlsx') {
      if (!selectedBank) return res.status(400).json({ error: 'Select a bank before uploading Excel' });
      ({ rows, mapping } = await parseExcelFile(req.file.path, selectedBank));
    } else if (extension === 'csv') {
      const text = fs.readFileSync(req.file.path, 'utf8');
      ({ rows, mapping } = parseImportText(text, selectedBank));
    } else if (extension === 'pdf') {
      if (!selectedBank) return res.status(400).json({ error: 'Select a bank before uploading PDF' });
      rows = await parsePdfFile(req.file.path, selectedBank);
    } else {
      return res.status(400).json({ error: 'Only .xlsx, .csv and .pdf files are supported' });
    }

    const invalidSerials = (mapping?.invalidSerials || 0) + rows.filter(row => !validPosSerial(row.serialNumber)).length;
    rows = rows.filter(row => validPosSerial(row.serialNumber));
    if (!rows.length) {
      return res.status(400).json({ error: 'No importable POS rows found. Use a POS Serial / Terminal Serial column in an active sheet; check invalid or conflicting serials.', mapping });
    }
    if (isBankRole(user.userRole) && rows.some((row) => row.bankName !== selectedBank)) {
      return res.status(403).json({ error: 'You can only import POS records for your bank' });
    }

    let inserted = 0;
    const hardware = { added: 0, existing: 0, invalid: 0, conflicts: 0 };
    const chunkSize = 100;
    await ensurePosSerialExtraColumns();
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await prisma.$transaction(async (tx) => {
        for (const name of [...new Set(chunk.map((r) => r.bankName))]) {
          await tx.bankMaster.upsert({ where: { name }, update: { name }, create: { name } });
        }
        for (const item of chunk) {
          const affected = await tx.$executeRawUnsafe(
            `INSERT INTO "PosSerial" ("id", "bankName", "serialNumber", "model", "location", "place", "tidNumber", "midNumber", "merchantName", "merchantAddress", "merchantStatus", "operator", "simNumber", "remarks", "status", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT("serialNumber") DO UPDATE SET
               "model" = COALESCE(excluded."model", "PosSerial"."model"),
               "location" = COALESCE(excluded."location", "PosSerial"."location"),
               "place" = COALESCE(excluded."place", "PosSerial"."place"),
               "tidNumber" = COALESCE(excluded."tidNumber", "PosSerial"."tidNumber"),
               "midNumber" = COALESCE(excluded."midNumber", "PosSerial"."midNumber"),
               "merchantName" = COALESCE(excluded."merchantName", "PosSerial"."merchantName"),
               "merchantAddress" = COALESCE(excluded."merchantAddress", "PosSerial"."merchantAddress"),
               "merchantStatus" = COALESCE(excluded."merchantStatus", "PosSerial"."merchantStatus"),
               "operator" = COALESCE(excluded."operator", "PosSerial"."operator"),
               "simNumber" = COALESCE(excluded."simNumber", "PosSerial"."simNumber"),
               "remarks" = COALESCE(excluded."remarks", "PosSerial"."remarks"),
               "status" = 'ACTIVE',
               "updatedAt" = CURRENT_TIMESTAMP
             WHERE "PosSerial"."bankName" = excluded."bankName"`,
            randomUUID(),
            item.bankName,
            item.serialNumber,
            item.model || null,
            item.location || null,
            item.place || null,
            ...detailFields.map((field) => item[field] || null)
          );
          inserted += Number(affected) || 0;
          if (syncHardware && affected) {
            const saved = await tx.posSerial.findUnique({ where: { serialNumber: item.serialNumber } });
            const counts = await addPosToInventory(tx, [{ ...saved, brand: item.brand, engineer: item.engineer }], user);
            for (const key of Object.keys(hardware)) hardware[key] += counts[key];
          }
        }
      }, { timeout: 30000 });
    }
    if (syncHardware) req.app.locals.io?.emit('inventory:updated');
    res.json({ ok: true, bankName: selectedBank || null, processed: rows.length, imported: inserted, skipped: rows.length - inserted, invalidSerials, mapping, hardware: syncHardware ? hardware : null });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
}

async function deletePosSerial(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can delete POS serials' });
  await prisma.posSerial.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}

async function deletePosSerials(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can delete POS serials' });
  const bankName = clean(req.body.bankName);
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(clean).filter(Boolean))] : [];
  const deleteAll = req.body.all === true;

  if (!bankName) return res.status(400).json({ error: 'Bank name is required' });
  if (!deleteAll && !ids.length) return res.status(400).json({ error: 'Select at least one POS serial' });

  const where = deleteAll
    ? { bankName }
    : { bankName, id: { in: ids } };
  const result = await prisma.posSerial.deleteMany({ where });
  res.json({ ok: true, deleted: result.count, bankName });
}

module.exports = { listPublicBanks, listBanks, createBank, updateBank, deleteBank, listPosSerials, createPosSerial, updatePosSerial, importPosSerials, deletePosSerials, deletePosSerial };
