"""Mark assigned local presentation stock as deployed, preserving its history."""
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
backup = db.with_name('dev-before-deploy-stock.db')
if not backup.exists():
    with sqlite3.connect(backup) as target: con.backup(target)
actor = con.execute("SELECT id,name FROM User WHERE email='admin@admin.com'").fetchone()
devices = con.execute("SELECT d.*,b.name AS bankName FROM InventoryDevice d LEFT JOIN BankMaster b ON b.id=d.bankId WHERE d.status='IN_STOCK' AND d.archived=0").fetchall()
for d in devices:
    if not all(d[key] for key in ('bankId','merchant','tid','mid','address','engineer')):
        raise RuntimeError('Missing assignment on ' + d['serialNumber'])
now = int(datetime.now(timezone.utc).timestamp()*1000)
with con:
    for d in devices:
        before = {key:d[key] for key in ('bankId','bankName','status','location','merchant','branch','tid','mid','address','engineer')}
        after = {**before, 'status':'DEPLOYED'}
        con.execute("UPDATE InventoryDevice SET status='DEPLOYED', version=version+1, updatedAt=? WHERE id=?", (now,d['id']))
        con.execute('INSERT INTO InventoryEvent (id,deviceId,action,previousStatus,newStatus,actorId,actorName,remarks,details,occurredAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()),d['id'],'DEPLOY','IN_STOCK','DEPLOYED',actor['id'],actor['name'],'Presentation sample — marked deployed.',json.dumps({'before':before,'after':after,'source':'presentation_sample'}),now,now))
print('Updated:',len(devices),'Backup:',backup)
