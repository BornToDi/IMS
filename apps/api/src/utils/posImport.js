const ExcelJS = require('exceljs');
const { validPosSerial } = require('./posInventory');

const importError = message => Object.assign(new Error(message), { status: 400 });
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
// Ordered aliases: prefer the exact field, then the most specific alternative.
const ALIASES = {
  serialNumber: ['posserialnumber', 'posserialno', 'posserial', 'posslno', 'possl', 'terminalserialnumber', 'terminalserialno', 'terminalserial', 'deviceserialnumber', 'deviceserialno', 'deviceserial', 'serialnumber', 'serialno', 'serial', 'sn'],
  bankName: ['bankname', 'bank'],
  model: ['model', 'posmodel', 'terminalmodel', 'devicemodel', 'device'],
  brand: ['posbrand', 'terminalbrand', 'devicebrand', 'brand', 'manufacturer'],
  location: ['location', 'poslocation', 'zonearea', 'area', 'region', 'zone', 'branch'],
  place: ['place', 'buildingname', 'building', 'tower', 'site'],
  tidNumber: ['tidnumber', 'tid', 'terminalid', 'terminalidentificationnumber', 'terminalnumber', 'terminalno'],
  midNumber: ['midnumber', 'mid', 'merchantid', 'merchantidentificationnumber', 'merchantnumber', 'merchantno'],
  merchantName: ['merchantname', 'dbaname', 'dbnname', 'dba', 'dbn', 'outletname', 'storename', 'shopname', 'merchant'],
  merchantAddress: ['merchantaddress', 'address', 'outletaddress', 'installationaddress', 'addressline', 'aderessline'],
  merchantStatus: ['merchantstatus', 'installationstatus', 'deploystatus', 'status'],
  operator: ['operator', 'telco', 'simoperator', 'networkoperator', 'mobileoperator'],
  simNumber: ['simnumber', 'simserialnumber', 'simserialno', 'simserial', 'simno', 'simei', 'sim', 'iccid', 'simiccid'],
  engineer: ['engineer', 'installationengineer', 'installedby', 'installationby', 'configurationby', 'rolloutby'],
  remarks: ['remarks', 'remark', 'comments', 'comment', 'notes', 'note']
};
const fieldFor = header => Object.keys(ALIASES).find(field => ALIASES[field].includes(normalize(header)));
const isInactive = value => /^(withdrawn|withdrawal|withdraw|poswithdraw|poswithdrawn|removed|closed|deinstalled|uninstalled|inactive)$/.test(normalize(value));
const inactiveSheet = name => /withdraw|archive|history|deinstall|uninstall|inactive|closed|removed/i.test(name);

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER) return '';
  if (typeof value === 'object') {
    if (value.error || value.result?.error) return '';
    if (value.richText) return value.richText.map(part => part.text).join('').trim();
    if (value.formula || value.sharedFormula) return cellText({ value: value.result, numFmt: cell.numFmt });
    return String(value.text ?? '').trim();
  }
  if (typeof value === 'number' && /^0+$/.test(cell.numFmt || '')) return String(value).padStart(cell.numFmt.length, '0');
  return String(value).trim();
}

function mapHeader(cells) {
  const candidates = {};
  cells.forEach((header, index) => {
    const field = fieldFor(header);
    if (field) (candidates[field] ||= []).push({ index, header, rank: ALIASES[field].indexOf(normalize(header)) });
  });
  if (!candidates.serialNumber) return null;
  // Two serial columns might be old/new POS or two side-by-side tables. Never guess.
  if (candidates.serialNumber.length !== 1) throw importError('Multiple POS serial columns found. Split old/new POS or side-by-side tables into separate sheets before importing.');
  const columns = Object.fromEntries(Object.entries(candidates).map(([field, matches]) => [field, matches.sort((a, b) => a.rank - b.rank || a.index - b.index)]));
  return { columns, unmapped: cells.filter(header => header && !fieldFor(header)) };
}

function parseTables(tables, selectedBank = '') {
  const report = { sheets: [], invalidSerials: 0, inactiveRows: 0, duplicateRows: 0, conflictingSerials: 0, mismatchedBankRows: 0, unsafeNumericCells: 0 };
  const records = new Map(), conflicts = new Set();
  for (const table of tables) {
    const info = { name: table.name, headers: [], rows: 0 };
    report.sheets.push(info);
    if (inactiveSheet(table.name)) { info.skipped = 'Withdrawal / archive sheet excluded from active import'; continue; }
    report.unsafeNumericCells += table.unsafeNumericCells || 0;
    let mapping;
    for (let index = 0; index < table.rows.length; index++) {
      const cells = table.rows[index];
      const header = mapHeader(cells);
      if (header) {
        mapping = header;
        info.headers.push({ row: index + 1, mapped: Object.fromEntries(Object.entries(header.columns).map(([field, entries]) => [field, entries.map(entry => entry.header)])), unmapped: header.unmapped });
        continue;
      }
      if (!mapping || !cells.some(Boolean)) continue;
      const record = {};
      for (const [field, entries] of Object.entries(mapping.columns)) record[field] = entries.map(entry => cells[entry.index]).find(value => value != null && String(value).trim()) || null;
      const serial = String(record.serialNumber || '').trim().toUpperCase();
      if (!validPosSerial(serial)) { report.invalidSerials++; continue; }
      const inactiveColumns = info.headers.at(-1).unmapped.filter(header => /status|reason/i.test(header));
      const headerCells = table.rows[info.headers.at(-1).row - 1];
      if (isInactive(record.merchantStatus) || inactiveColumns.some(header => isInactive(cells[headerCells.indexOf(header)]))) { report.inactiveRows++; continue; }
      record.serialNumber = serial;
      if (selectedBank && record.bankName && normalize(record.bankName) !== normalize(selectedBank)) { report.mismatchedBankRows++; continue; }
      record.bankName = selectedBank || record.bankName;
      if (!record.bankName) throw importError('Select a bank or include a Bank Name column.');
      info.rows++;
      if (conflicts.has(serial)) { report.duplicateRows++; continue; }
      const existing = records.get(serial);
      if (existing) {
        report.duplicateRows++;
        const differs = Object.keys(record).some(key => record[key] && existing[key] && record[key] !== existing[key]);
        if (differs) { conflicts.add(serial); records.delete(serial); continue; }
        records.set(serial, { ...existing, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value)) });
      } else records.set(serial, record);
    }
    if (!info.headers.length) info.skipped = 'No recognized POS serial header';
  }
  report.conflictingSerials = conflicts.size;
  return { rows: [...records.values()], mapping: report };
}

async function parseExcelFile(path, bank) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const tables = workbook.worksheets.map(sheet => {
    const rows = []; let unsafeNumericCells = 0;
    sheet.eachRow({ includeEmpty: true }, row => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const value = cell.value?.result ?? cell.value;
        if (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER) unsafeNumericCells++;
        cells[column - 1] = cellText(cell);
      });
      rows.push(cells);
    });
    return { name: sheet.name, rows, unsafeNumericCells };
  });
  return parseTables(tables, bank);
}

function csvRows(text, delimiter) {
  const rows = []; let row = [], value = '', quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) { row.push(value.trim()); value = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(value.trim()); rows.push(row); row = []; value = '';
    } else value += ch;
  }
  if (quoted) throw importError('CSV contains an unclosed quoted field.');
  if (row.length || value) { row.push(value.trim()); rows.push(row); }
  return rows;
}

function parseImportText(text, bank) {
  const candidates = [',', '\t', ';'].map(delimiter => csvRows(text, delimiter));
  const rows = candidates.find(rows => rows.some(row => row.some(value => fieldFor(value) === 'serialNumber'))) || candidates[0];
  if (!rows.some(row => row.some(value => fieldFor(value) === 'serialNumber'))) rows.unshift(['Bank Name', 'POS Serial']);
  return parseTables([{ name: 'CSV', rows }], bank);
}

module.exports = { parseExcelFile, parseImportText, parseTables, cellText };
