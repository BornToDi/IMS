"""Add clearly identified merchant transfer examples to local sample devices."""
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
def stamp(days): return int((now + timedelta(days=days)).timestamp() * 1000)
note = 'Presentation sample — simulated merchant transfer.'
actor = con.execute("SELECT id,name FROM User WHERE email='admin@admin.com'").fetchone()
with con:
    for bank in con.execute('SELECT id,name FROM BankMaster ORDER BY name').fetchall():
        if bank['name'] == 'BRAC Bank PLC':
            devices = con.execute("SELECT * FROM InventoryDevice WHERE bankId=? AND serialNumber LIKE 'DEMO-%' AND archived=0 ORDER BY serialNumber LIMIT 5", (bank['id'],)).fetchall()
        else:
            devices = con.execute("SELECT * FROM InventoryDevice WHERE bankId=? AND remarks='Synthetic sample record; not a verified device.' AND status='IN_STOCK' AND archived=0 ORDER BY serialNumber LIMIT 5", (bank['id'],)).fetchall()
        count = 0
        for device in devices:
            if con.execute('SELECT 1 FROM InventoryEvent WHERE deviceId=? AND remarks=?', (device['id'], note)).fetchone(): continue
            original = {'bankId':bank['id'], 'bankName':bank['name'], 'status':'DEPLOYED', 'merchant':'Shwapno Super Shop', 'location':'Gulshan', 'branch':'Gulshan Branch', 'address':'Gulshan, Dhaka', 'tid':'71'+device['tid'][-6:], 'mid':'71'+device['mid'][-10:]}
            intermediate = {**original, 'merchant':'Foodpanda', 'location':'Banani', 'branch':'Banani Branch', 'address':'Banani, Dhaka', 'tid':'72'+device['tid'][-6:], 'mid':'72'+device['mid'][-10:]}
            current = {**original, 'merchant':device['merchant'], 'location':device['location'], 'branch':device['branch'], 'address':device['address'], 'tid':device['tid'], 'mid':device['mid']}
            if device['status'] != 'DEPLOYED':
                con.execute('INSERT INTO InventoryEvent (id,deviceId,action,previousStatus,newStatus,actorId,actorName,remarks,details,occurredAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()),device['id'],'DEPLOY',device['status'],'DEPLOYED',actor['id'],actor['name'],note,json.dumps({'before':{'status':device['status'],'bankId':bank['id']},'after':original,'source':'presentation_sample'}),stamp(-120),stamp(-120)))
            for old, new, days in [(original, intermediate, -90), (intermediate, current, -30)]:
                con.execute('INSERT INTO InventoryEvent (id,deviceId,action,previousStatus,newStatus,actorId,actorName,remarks,details,occurredAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()),device['id'],'TRANSFER','DEPLOYED','DEPLOYED',actor['id'],actor['name'],note,json.dumps({'before':old,'after':new,'source':'presentation_sample'}),stamp(days),stamp(days)))
            # Only generated sample records are changed; current merchant remains as before.
            con.execute("UPDATE InventoryDevice SET status='DEPLOYED',updatedAt=? WHERE id=?", (stamp(0),device['id']))
            count += 1
        print(bank['name'], count, 'devices with merchant transfer examples')
