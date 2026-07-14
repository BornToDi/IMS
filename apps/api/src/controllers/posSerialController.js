const fs = require('fs');
const { randomUUID } = require('crypto');
const ExcelJS = require('exceljs');
const prisma = require('../prismaClient');
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

async function upsertPosSerialRaw({ bankName, serialNumber, model = null, location = null, place = null }) {
  await ensurePosSerialExtraColumns();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PosSerial" ("id", "bankName", "serialNumber", "model", "location", "place", "status", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("serialNumber") DO UPDATE SET
       "bankName" = excluded."bankName",
       "model" = excluded."model",
       "location" = excluded."location",
       "place" = excluded."place",
       "status" = 'ACTIVE',
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    bankName,
    serialNumber,
    model,
    location,
    place
  );
  const rows = await prisma.$queryRawUnsafe('SELECT * FROM "PosSerial" WHERE "serialNumber" = ? LIMIT 1', serialNumber);
  return Array.isArray(rows) ? rows[0] : rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseImportText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = parseCsvLine(lines[0]).map((x) => x.toLowerCase());
  const hasHeader = first.includes('bankname') || first.includes('bank') || first.includes('serialnumber') || first.includes('serial') || first.includes('posserial');
  let bankIndex = 0;
  let serialIndex = 1;
  let modelIndex = -1;
  let locationIndex = -1;
  let placeIndex = -1;
  const start = hasHeader ? 1 : 0;
  if (hasHeader) {
    bankIndex = first.findIndex((x) => ['bankname', 'bank', 'bank_name'].includes(x));
    serialIndex = first.findIndex((x) => ['serialnumber', 'serial', 'posserial', 'pos_serial', 'pos serial'].includes(x));
    modelIndex = first.findIndex((x) => ['model', 'device', 'terminalmodel'].includes(x));
    locationIndex = first.findIndex((x) => ['location', 'poslocation', 'pos_location', 'pos location', 'area', 'branch'].includes(x));
    placeIndex = first.findIndex((x) => ['place', 'building', 'buildingname', 'building_name', 'building name', 'tower', 'site'].includes(x));
    if (bankIndex < 0) bankIndex = 0;
    if (serialIndex < 0) serialIndex = 1;
  }
  return lines.slice(start).map(parseCsvLine).map((cols) => ({
    bankName: clean(cols[bankIndex]),
    serialNumber: clean(cols[serialIndex]),
    model: modelIndex >= 0 ? clean(cols[modelIndex]) || null : null,
    location: locationIndex >= 0 ? clean(cols[locationIndex]) || null : null,
    place: placeIndex >= 0 ? clean(cols[placeIndex]) || null : null
  })).filter((r) => r.bankName && r.serialNumber);
}

function normalizedHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSerialHeader(value) {
  return ['posserialno', 'posserialnumber', 'posserial', 'serialnumber', 'serialno'].includes(normalizedHeader(value));
}

function excelCellText(cell) {
  if (!cell) return '';
  if (cell.text) return clean(cell.text);
  if (cell.value && typeof cell.value === 'object') {
    if (Array.isArray(cell.value.richText)) return clean(cell.value.richText.map((part) => part.text).join(''));
    if (cell.value.result !== undefined) return clean(cell.value.result);
  }
  return clean(cell.value);
}

async function parseExcelFile(filePath, bankName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const rows = [];

  workbook.eachSheet((sheet) => {
    let headerRowNumber = 0;
    let serialColumns = [];
    let modelColumn = 0;
    let locationColumn = 0;
    let placeColumn = 0;
    const scanUntil = Math.min(sheet.rowCount, 20);

    for (let rowNumber = 1; rowNumber <= scanUntil; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const matches = [];
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const header = normalizedHeader(excelCellText(cell));
        if (isSerialHeader(header)) {
          matches.push(columnNumber);
        }
      });
      if (matches.length) {
        headerRowNumber = rowNumber;
        serialColumns = matches;
        row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
          const header = normalizedHeader(excelCellText(cell));
          if (['model', 'device', 'terminalmodel'].includes(header)) modelColumn = columnNumber;
          if (['location', 'poslocation', 'area', 'branch'].includes(header)) locationColumn = columnNumber;
          if (['place', 'building', 'buildingname', 'tower', 'site'].includes(header)) placeColumn = columnNumber;
        });
        break;
      }
    }

    if (!headerRowNumber) return;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (const columnNumber of serialColumns) {
        const serialNumber = excelCellText(row.getCell(columnNumber));
        if (serialNumber && !isSerialHeader(serialNumber)) {
          rows.push({
            bankName,
            serialNumber,
            model: modelColumn ? excelCellText(row.getCell(modelColumn)) || null : null,
            location: locationColumn ? excelCellText(row.getCell(locationColumn)) || null : null,
            place: placeColumn ? excelCellText(row.getCell(placeColumn)) || null : null
          });
        }
      }
    }
  });

  const unique = new Map();
  for (const row of rows) unique.set(row.serialNumber, row);
  return [...unique.values()];
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
    where.push('("serialNumber" LIKE ? OR "bankName" LIKE ? OR "model" LIKE ? OR "location" LIKE ? OR "place" LIKE ?)');
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can add POS serials' });
  const bankName = clean(req.body.bankName);
  const serialNumber = clean(req.body.serialNumber);
  const model = clean(req.body.model) || null;
  const location = clean(req.body.location) || null;
  const place = clean(req.body.place) || null;
  if (!bankName || !serialNumber) return res.status(400).json({ error: 'Bank name and serial number are required' });
  await prisma.bankMaster.upsert({ where: { name: bankName }, update: { name: bankName }, create: { name: bankName } }).catch(() => null);
  const row = await upsertPosSerialRaw({ bankName, serialNumber, model, location, place });
  res.status(201).json(row);
}

async function importPosSerials(req, res) {
  const user = await currentUser(req, res); if (!user) return;
  if (!isFullAdminRole(user.userRole)) return res.status(403).json({ error: 'Only admin can import POS serials' });
  if (!req.file) return res.status(400).json({ error: 'Excel or CSV file is required' });

  try {
    const selectedBank = clean(req.body.bankName);
    const extension = String(req.file.originalname || '').toLowerCase().split('.').pop();
    let rows = [];

    if (extension === 'xlsx') {
      if (!selectedBank) return res.status(400).json({ error: 'Select a bank before uploading Excel' });
      rows = await parseExcelFile(req.file.path, selectedBank);
    } else if (extension === 'csv') {
      const text = fs.readFileSync(req.file.path, 'utf8');
      rows = parseImportText(text);
      if (selectedBank) rows = rows.map((row) => ({ ...row, bankName: selectedBank }));
    } else {
      return res.status(400).json({ error: 'Only .xlsx and .csv files are supported' });
    }

    if (!rows.length) {
      return res.status(400).json({ error: 'No POS serial found. Excel must contain a POS Serial NO column.' });
    }

    let inserted = 0;
    const chunkSize = 500;
    await ensurePosSerialExtraColumns();
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await prisma.$transaction(async (tx) => {
        for (const name of [...new Set(chunk.map((r) => r.bankName))]) {
          await tx.bankMaster.upsert({ where: { name }, update: { name }, create: { name } });
        }
        for (const item of chunk) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "PosSerial" ("id", "bankName", "serialNumber", "model", "location", "place", "status", "createdAt", "updatedAt")
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT("serialNumber") DO UPDATE SET
               "bankName" = excluded."bankName",
               "model" = COALESCE(excluded."model", "PosSerial"."model"),
               "location" = COALESCE(excluded."location", "PosSerial"."location"),
               "place" = COALESCE(excluded."place", "PosSerial"."place"),
               "status" = 'ACTIVE',
               "updatedAt" = CURRENT_TIMESTAMP`,
            randomUUID(),
            item.bankName,
            item.serialNumber,
            item.model,
            item.location,
            item.place
          );
        }
      });
      inserted += chunk.length;
    }
    res.json({ ok: true, bankName: selectedBank || null, processed: inserted, imported: inserted, skipped: 0 });
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

module.exports = { listPublicBanks, listBanks, createBank, updateBank, deleteBank, listPosSerials, createPosSerial, importPosSerials, deletePosSerials, deletePosSerial };
