"""Add report categories to synthetic local records only."""
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
now = datetime.now(timezone.utc)
stamp = lambda d=0: int((now + timedelta(days=d)).timestamp() * 1000)
note = 'Presentation sample — simulated data.'
actor = con.execute("SELECT id, name FROM User WHERE email='admin@admin.com'").fetchone()
with con:
    for bank in con.execute('SELECT id,name FROM BankMaster').fetchall():
        devices = con.execute("SELECT id,serialNumber FROM InventoryDevice WHERE bankId=? AND remarks='Synthetic sample record; not a verified device.' ORDER BY serialNumber LIMIT 8", (bank['id'],)).fetchall()
        # BRAC already contains real records and has no generated devices.
        for device, status, action in zip(devices, ['DEPLOYED','FAULTY','UNDER_REPAIR','REPLACED','RETURNED','FAULTY','UNDER_REPAIR','REPLACED'], ['DEPLOY','FAULT','REPAIR','REPLACE','RETURN','FAULT','REPAIR','REPLACE']):
            if con.execute('SELECT 1 FROM InventoryEvent WHERE deviceId=? AND action=? AND remarks=?', (device['id'],action,note)).fetchone(): continue
            con.execute('UPDATE InventoryDevice SET status=?, warrantyUntil=?, faultType=?, technician=?, repairStatus=?, replacementSerial=?, repairReceivedDate=?, dueDate=?, updatedAt=? WHERE id=?', (status, stamp(20), 'Connectivity issue' if status in ('FAULTY','UNDER_REPAIR','REPLACED') else None, 'Enayet Engineer' if status in ('UNDER_REPAIR','REPLACED') else None, 'Under observation' if status == 'UNDER_REPAIR' else None, '98099000000001' if status == 'REPLACED' else None, stamp(-5) if status in ('UNDER_REPAIR','REPLACED') else None, stamp(5), stamp(), device['id']))
            paths = {
                'DEPLOYED': [('RESERVE','IN_STOCK','RESERVED'), ('DELIVER','RESERVED','DELIVERED'), ('DEPLOY','DELIVERED','DEPLOYED')],
                'FAULTY': [('TRANSFER','IN_STOCK','IN_STOCK'), ('EDIT','IN_STOCK','IN_STOCK'), ('FAULT','IN_STOCK','FAULTY')],
                'UNDER_REPAIR': [('EDIT','IN_STOCK','IN_STOCK'), ('FAULT','IN_STOCK','FAULTY'), ('REPAIR','FAULTY','UNDER_REPAIR')],
                'REPLACED': [('FAULT','IN_STOCK','FAULTY'), ('REPAIR','FAULTY','UNDER_REPAIR'), ('REPLACE','UNDER_REPAIR','REPLACED')],
                'RETURNED': [('RESERVE','IN_STOCK','RESERVED'), ('DELIVER','RESERVED','DELIVERED'), ('RETURN','DELIVERED','RETURNED')],
            }
            old = con.execute('SELECT id FROM InventoryEvent WHERE deviceId=? AND remarks=? ORDER BY occurredAt', (device['id'],note)).fetchall()
            for event, (step, previous, current) in zip(old[2:4], paths[status][:2]):
                con.execute('UPDATE InventoryEvent SET action=?,previousStatus=?,newStatus=? WHERE id=?', (step,previous,current,event['id']))
            action, previous, status = paths[status][2]
            con.execute('INSERT INTO InventoryEvent (id,deviceId,action,previousStatus,newStatus,actorId,actorName,remarks,details,occurredAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()),device['id'],action,previous,status,actor['id'],actor['name'],note,json.dumps({'source':'presentation_sample'}),stamp(-1),stamp(-1)))
        print(bank['name'], len(devices), 'report examples')
    con.execute("UPDATE InventoryEvent SET details=json_set(details, '$.after.bankId', (SELECT bankId FROM InventoryDevice WHERE id=InventoryEvent.deviceId), '$.after.bankName', (SELECT b.name FROM InventoryDevice d JOIN BankMaster b ON b.id=d.bankId WHERE d.id=InventoryEvent.deviceId), '$.after.status', newStatus) WHERE remarks=? AND json_valid(details)", (note,))
