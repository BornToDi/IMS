const prisma = require('../src/prismaClient');
const { snapshot } = require('../src/utils/inventory');

async function correctImportedPosStatus(client, apply = false) {
  return client.$transaction(async tx => {
    const rows = await tx.inventoryDevice.findMany({
      where: { status: 'RECEIVED', archived: false, version: 0 },
      include: { bank: true, events: true }
    });
    const active = await tx.inventoryDevice.findMany({
      where: { status: 'DEPLOYED', archived: false }, select: { bankId: true, tid: true }
    });
    const tidKey = row => JSON.stringify([row.bankId, row.tid]);
    const tids = new Set(active.filter(row => row.tid).map(tidKey));
    const result = { eligible: 0, corrected: 0, skipped: 0, conflicts: 0 };
    for (const row of rows) {
      const event = row.events[0];
      let details;
      try { details = JSON.parse(event?.details || '{}'); } catch { details = {}; }
      if (!row.bankId || row.events.length !== 1 || event.action !== 'IMPORT' ||
          event.newStatus !== 'RECEIVED' || details.source !== 'POS_SERIALS') {
        result.skipped++; continue;
      }
      if (row.tid && tids.has(tidKey(row))) { result.conflicts++; continue; }
      if (row.tid) tids.add(tidKey(row));
      result.eligible++;
      if (!apply) continue;
      const updated = await tx.inventoryDevice.updateMany({
        where: { id: row.id, status: 'RECEIVED', version: 0, archived: false },
        data: { status: 'DEPLOYED', version: { increment: 1 } }
      });
      if (updated.count !== 1) throw new Error('Device changed during correction; retry.');
      const after = await tx.inventoryDevice.findUnique({ where: { id: row.id }, include: { bank: true } });
      await tx.inventoryEvent.create({ data: {
        deviceId: row.id, action: 'STATUS_CORRECTION', previousStatus: 'RECEIVED', newStatus: 'DEPLOYED',
        actorId: 'system:pos-import-correction', actorName: 'POS import status correction',
        remarks: 'Corrected the old POS upload default to Deployed. This records a data correction, not a new installation.',
        details: JSON.stringify({ before: snapshot(row), after: snapshot(after), source: 'POS_IMPORT_STATUS_CORRECTION' })
      } });
      result.corrected++;
    }
    return result;
  }, { timeout: 60000 });
}

if (require.main === module) {
  correctImportedPosStatus(prisma, process.argv.includes('--apply'))
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = { correctImportedPosStatus };
