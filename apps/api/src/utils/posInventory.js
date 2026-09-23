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
  for (const source of rows) {
    if (!validPosSerial(source.serialNumber)) { result.invalid++; continue; }
    const serialNumber = source.serialNumber.trim().toUpperCase();
    if (!banks.has(source.bankName)) banks.set(source.bankName, await tx.bankMaster.upsert({
      where: { name: source.bankName }, update: {}, create: { name: source.bankName }
    }));
    const bank = banks.get(source.bankName);
    const existing = await tx.inventoryDevice.findUnique({ where: { serialNumber } });
    if (existing) {
      result[existing.bankId === bank.id ? 'existing' : 'conflicts']++;
      continue;
    }
    if (status === 'DEPLOYED' && source.tidNumber && await tx.inventoryDevice.findFirst({
      where: { bankId: bank.id, tid: source.tidNumber, status: 'DEPLOYED', archived: false }
    })) { result.conflicts++; continue; }
    const device = await tx.inventoryDevice.create({ data: {
      serialNumber, bankId: bank.id, status, brand: source.brand || 'Unknown', model: source.model || 'Unknown',
      location: source.location || source.place || source.merchantAddress || 'Not specified',
      merchant: source.merchantName || null, tid: source.tidNumber || null,
      mid: source.midNumber || null, address: source.merchantAddress || null,
      telco: source.operator || null, simEi: source.simNumber || null,
      engineer: source.engineer || null, remarks: source.remarks || null
    }, include: { bank: true } });
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
