"""Add identifiable, varied presentation transfers without changing device assignments."""
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
con.execute('PRAGMA foreign_keys=ON')
backup = db.with_name('dev-before-all-merchant-history.db')
if not backup.exists():
    with sqlite3.connect(backup) as target:
        con.backup(target)
actor = con.execute("SELECT id,name FROM User WHERE email='admin@admin.com'").fetchone()
names = ['Shwapno Super Shop', 'Foodpanda', 'City Mart', 'Green Pharmacy', 'Metro Electronics', 'Family Super Shop', 'Central Fashion', 'Fresh Foods']
locations = ['Gulshan', 'Banani', 'Uttara', 'Dhanmondi', 'Mirpur', 'Motijheel', 'Chattogram', 'Sylhet']
note = 'Presentation sample — simulated merchant transfer.'
created = 0
with con:
    devices = con.execute('SELECT d.*, b.name bankName FROM InventoryDevice d JOIN BankMaster b ON b.id=d.bankId WHERE d.archived=0 AND d.deviceType=?', ('POS',)).fetchall()
    for d in devices:
        if con.execute('SELECT 1 FROM InventoryEvent WHERE deviceId=? AND action=? AND remarks=?', (d['id'],'TRANSFER',note)).fetchone(): continue
        number = int.from_bytes(hashlib.sha256(d['serialNumber'].encode()).digest()[:4], 'big')
        merchant = names[number % len(names)]
        if merchant == d['merchant']: merchant = names[(number + 1) % len(names)]
        location = locations[(number // len(names)) % len(locations)]
        before = {'bankId':d['bankId'],'bankName':d['bankName'],'merchant':merchant,'location':location,'branch':location+' Branch','address':location+', Bangladesh','tid':f'{number%100000000:08d}','mid':f'{number%1000000000000000:015d}'}
        after = {'bankId':d['bankId'],'bankName':d['bankName'],'merchant':d['merchant'],'location':d['location'],'branch':d['branch'],'address':d['address'],'tid':d['tid'],'mid':d['mid']}
        when = int((datetime.now(timezone.utc)-timedelta(days=30+number%150)).timestamp()*1000)
        con.execute('INSERT INTO InventoryEvent (id,deviceId,action,previousStatus,newStatus,actorId,actorName,remarks,details,occurredAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()),d['id'],'TRANSFER',d['status'],d['status'],actor['id'],actor['name'],note,json.dumps({'before':before,'after':after,'source':'presentation_sample'}),when,when))
        created += 1
print('Added:', created, 'Existing examples retained:',len(devices)-created, 'Backup:',backup)
