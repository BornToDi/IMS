"""Distribute local synthetic POS records across five device models."""
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
backup = db.with_name('dev-before-sample-models.db')
if not backup.exists():
    with sqlite3.connect(backup) as out: con.backup(out)
actor = con.execute("SELECT id,name FROM User WHERE email='admin@admin.com'").fetchone()
models = [('PAX','A920'), ('PAX','A910'), ('Verifone','V240m'), ('Ingenico','DX8000'), ('Newland','N910 Pro')]
now = int(datetime.now(timezone.utc).timestamp()*1000)
changed = 0
with con:
    for bank in con.execute('SELECT id,name FROM BankMaster ORDER BY name').fetchall():
        rows = con.execute("SELECT d.*,b.name bankName FROM InventoryDevice d JOIN BankMaster b ON b.id=d.bankId WHERE d.bankId=? AND d.archived=0 AND d.remarks='Synthetic sample record; not a verified device.' ORDER BY d.serialNumber", (bank['id'],)).fetchall()
        for i, row in enumerate(rows):
            brand, model = models[i % len(models)]
            if (row['brand'], row['model']) == (brand, model): continue
            before = {'bankId':row['bankId'],'bankName':row['bankName'],'brand':row['brand'],'model':row['model'],'status':row['status']}
            after = {**before,'brand':brand,'model':model}
            con.execute('UPDATE InventoryDevice SET brand=?,model=?,version=version+1,updatedAt=? WHERE id=?', (brand,model,now,row['id']))
            con.execute('UPDATE PosSerial SET model=?,updatedAt=? WHERE serialNumber=? AND bankName=?', (model,now,row['serialNumber'],bank['name']))
            con.execute('INSERT INTO InventoryEvent (id,deviceId,action,previousStatus,newStatus,actorId,actorName,remarks,details,occurredAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()),row['id'],'EDIT',row['status'],row['status'],actor['id'],actor['name'],'Presentation sample — model details updated.',json.dumps({'before':before,'after':after,'source':'presentation_sample'}),now,now))
            changed += 1
print('Updated synthetic devices:',changed,'Backup:',backup)
