"""Populate the local development database with identifiable sample POS records."""
import sqlite3
import uuid
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
banks = ['BRAC Bank PLC', 'Pubali Bank', 'United Commercial Bank PLC (UCB)',
         'Islami Bank Bangladesh PLC', 'Meghna Bank']
connection = sqlite3.connect(db)
connection.execute('PRAGMA foreign_keys = ON')
backup = db.with_name('dev-before-sample-banks.db')
if not backup.exists():
    with sqlite3.connect(backup) as destination:
        connection.backup(destination)
with connection:
    for index, name in enumerate(banks, 1):
        bank = connection.execute('SELECT id FROM BankMaster WHERE name = ?', (name,)).fetchone()
        if not bank:
            bank = (str(uuid.uuid4()),)
            connection.execute('INSERT INTO BankMaster (id, name, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)', (bank[0], name))
        current = connection.execute("SELECT count(*) FROM InventoryDevice WHERE bankId = ? AND deviceType = 'POS' AND archived = 0", bank).fetchone()[0]
        for sequence in range(1, max(0, 501 - current) + 1):
            serial = f'980{index:02d}{sequence:09d}'
            while connection.execute('SELECT 1 FROM PosSerial WHERE serialNumber = ? UNION ALL SELECT 1 FROM InventoryDevice WHERE serialNumber = ?', (serial, serial)).fetchone():
                sequence += 100000
                serial = f'980{index:02d}{sequence:09d}'
            note = 'Synthetic sample record; not a verified device.'
            connection.execute('INSERT INTO PosSerial (id, bankName, serialNumber, model, remarks, updatedAt) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)', (str(uuid.uuid4()), name, serial, 'PAX A920', note))
            connection.execute("INSERT INTO InventoryDevice (id, serialNumber, brand, model, bankId, location, status, remarks, updatedAt) VALUES (?, ?, 'PAX', 'A920', ?, 'Dhaka', 'IN_STOCK', ?, CURRENT_TIMESTAMP)", (str(uuid.uuid4()), serial, bank[0], note))
        print(name, connection.execute("SELECT count(*) FROM InventoryDevice WHERE bankId = ? AND deviceType = 'POS' AND archived = 0", bank).fetchone()[0])
print('Backup:', backup)
