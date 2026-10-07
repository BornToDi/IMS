const { snapshot } = require('./inventory');

function validPosSerial(value) {
  const serial = String(value || '').trim();
  return serial.length > 0 && serial.length <= 120 &&
    !/^(?:pending\b.*|n\/?a|none|null|unknown|tbd|-+)$/i.test(serial);
}

// Add missing devices only: the inventory lifecycle remains authoritative.
async function addPosToInventory(tx, rows, user) {
  const status = 'DEPLOYED';
  const result = { added: 0, existing: 0, invalid: 0, conflicts: 0 };
  const banks = new Map();
  const serials = rows.filter(source => validPosSerial(source.serialNumber)).map(source => source.serialNumber.trim().toUpperCase());
  const existingDevices = await tx.inventoryDevice.findMany({ where: { serialNumber: { in: serials } }, select: { serialNumber: true, bankId: true } });
  const devicesBySerial = new Map(existingDevices.map(device => [device.serialNumber, device]));
  const deployedTids = new Set();
  for (const bankName of new Set(rows.filter(source => validPosSerial(source.serialNumber)).map(source => source.bankName))) {
    const bank = await tx.bankMaster.upsert({ where: { name: bankName }, update: {}, create: { name: bankName } });
    banks.set(bankName, bank);
    const tids = rows.filter(source => source.bankName === bankName && source.tidNumber).map(source => source.tidNumber);
    if (tids.length) {
      const deployed = await tx.inventoryDevice.findMany({ where: { bankId: bank.id, tid: { in: tids }, status: 'DEPLOYED', archived: false }, select: { tid: true } });
      for (const device of deployed) deployedTids.add(JSON.stringify([bank.id, device.tid]));
    }
  }
  for (const source of rows) {
    if (!validPosSerial(source.serialNumber)) { result.invalid++; continue; }
    const serialNumber = source.serialNumber.trim().toUpperCase();
    const bank = banks.get(source.bankName);
    const existing = devicesBySerial.get(serialNumber);
    if (existing) {
      result[existing.bankId === bank.id ? 'existing' : 'conflicts']++;
      continue;
    }
    const tidKey = JSON.stringify([bank.id, source.tidNumber]);
    if (source.tidNumber && deployedTids.has(tidKey)) { result.conflicts++; continue; }
    const device = await tx.inventoryDevice.create({ data: {
      serialNumber, bankId: bank.id, status, brand: source.brand || 'Unknown', model: source.model || 'Unknown',
      location: source.location || source.place || source.merchantAddress || 'Not specified',
      merchant: source.merchantName || null, tid: source.tidNumber || null,
      mid: source.midNumber || null, address: source.merchantAddress || null,
      telco: source.operator || null, simEi: source.simNumber || null,
      engineer: source.engineer || null, remarks: source.remarks || null
    }, include: { bank: true } });
    devicesBySerial.set(serialNumber, device);
    if (source.tidNumber) deployedTids.add(tidKey);
    await tx.inventoryEvent.create({ data: {
      deviceId: device.id, action: 'IMPORT', newStatus: status,
      actorId: user.id, actorName: user.name,
      remarks: 'Imported from POS Serials. Installation date and brand require verification.',
      details: JSON.stringify({ before: null, after: snapshot(device), source: 'POS_SERIALS', sourceId: source.id || null })
    } });
    result.added++;
  }
  return result;
}

module.exports = { validPosSerial, addPosToInventory };
