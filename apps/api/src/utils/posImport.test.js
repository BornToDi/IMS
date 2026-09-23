const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTables, parseImportText, cellText } = require('./posImport');

test('EBL headers map by name with explicit field priority and withdrawal exclusion', () => {
  const result = parseTables([
    { name: 'Master Database', rows: [
      ['SL', 'TID', 'MID', 'Merchant Name', 'DBA Name', 'Address', 'ADERESS LINE', 'ZONE', 'ZONE AREA', 'POS BRAND', 'Model', 'POS SERIAL', 'TELCO', 'SIM SERIAL', 'Configuration BY', 'Facility'],
      ['1', '00123', '00456', 'Legal merchant', 'Outlet name', 'Full address', 'N/A', 'Dhaka', 'Mirpur', 'UROVO', 'i9100', 'POS-001', 'GP', '8988013502727207928F', 'Engineer A', 'Extra']
    ] },
    { name: 'Withdraw sheets', rows: [['POS SERIAL', 'DBA NAME'], ['POS-001', 'Old merchant'], ['OLD-001', 'Withdrawn merchant']] }
  ], 'EBL');
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], { serialNumber: 'POS-001', bankName: 'EBL', tidNumber: '00123', midNumber: '00456', merchantName: 'Legal merchant', merchantAddress: 'Full address', location: 'Mirpur', brand: 'UROVO', model: 'i9100', operator: 'GP', simNumber: '8988013502727207928F', engineer: 'Engineer A' });
  assert.ok(result.mapping.sheets[1].skipped);
  assert.deepEqual(result.mapping.sheets[0].headers[0].unmapped, ['SL', 'Facility']);
});

test('reordered columns, title rows, repeated tables and multiple active sheets work', () => {
  const result = parseTables([
    { name: 'First bank', rows: [...Array.from({ length: 25 }, () => ['Report title']), ['SIM ICCID', 'Terminal ID', 'Device Serial No.', 'Outlet Name', 'POS Model'], ['001122', '0003', 'abc-1', 'Shop one', 'A920'], [], ['Merchant ID', 'S/N', 'DBN', 'Address'], ['0004', 'ABC-2', 'Shop two', 'Dhaka']] },
    { name: 'Second table', rows: [['POS Serial', 'Merchant Name', 'DBA Name'], ['ABC-3', '', 'Fallback shop']] }
  ], 'Bank');
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].simNumber, '001122');
  assert.equal(result.rows[0].tidNumber, '0003');
  assert.equal(result.rows[1].midNumber, '0004');
  assert.equal(result.rows[2].merchantName, 'Fallback shop');
  assert.equal(result.mapping.sheets[0].headers.length, 2);
});

test('conflicting duplicate serials and inactive rows are not silently imported', () => {
  const result = parseTables([{ name: 'Data', rows: [
    ['POS SERIAL', 'TID', 'STATUS'], ['A', '1', 'Active'], ['a', '2', 'Active'], ['B', '3', 'Withdrawn'], ['C', '4', 'Active'], ['c', '4', 'Active'], ['Pending', '5', 'Active']
  ] }], 'Bank');
  assert.deepEqual(result.rows.map(row => row.serialNumber), ['C']);
  assert.equal(result.mapping.conflictingSerials, 1);
  assert.equal(result.mapping.duplicateRows, 2);
  assert.equal(result.mapping.inactiveRows, 1);
  assert.equal(result.mapping.invalidSerials, 1);
});

test('bank column mismatches and ambiguous serial headers do not misassign devices', () => {
  const result = parseImportText('Bank,Terminal Serial,Terminal ID\nEBL,ONE,01\nOther,TWO,02', 'EBL');
  assert.equal(result.rows.length, 1);
  assert.equal(result.mapping.mismatchedBankRows, 1);
  assert.throws(() => parseImportText('POS SERIAL,POS SERIAL,TID\nONE,TWO,03', 'EBL'), /Multiple POS serial/);
});

test('CSV preserves quoted multiline addresses, delimiters, BOM and leading zero IDs', () => {
  const result = parseImportText('\uFEFFSIM SERIAL;POS SL NO;DBA NAME;ADDRESS;TID\r\n000123;POS-1;"Shop; name";"First line\nSecond ""quoted"" line";000001', 'EBL');
  assert.equal(result.rows[0].simNumber, '000123');
  assert.equal(result.rows[0].tidNumber, '000001');
  assert.equal(result.rows[0].merchantAddress, 'First line\nSecond "quoted" line');
  assert.equal(parseImportText('Bank,LEGACY-1').rows[0].serialNumber, 'LEGACY-1');
});

test('Excel text, rich text, cached formulas and padded numeric identifiers remain intact', () => {
  assert.equal(cellText({ value: 123, numFmt: '000000' }), '000123');
  assert.equal(cellText({ value: { formula: 'A1', result: 123 }, numFmt: '000000' }), '000123');
  assert.equal(cellText({ value: { richText: [{ text: 'POS ' }, { text: 'SERIAL' }] } }), 'POS SERIAL');
  assert.equal(cellText({ value: '8988013502727207928F' }), '8988013502727207928F');
  assert.equal(cellText({ value: 8988013502727207928 }), '');
  assert.equal(cellText({ value: { error: '#N/A' } }), '');
});
