"""Remove unselected banks from the local development database."""
import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parents[1] / 'apps/api/prisma/dev.db'
keep = ('BRAC Bank PLC', 'Pubali Bank', 'United Commercial Bank PLC (UCB)',
        'Islami Bank Bangladesh PLC', 'Meghna Bank')
con = sqlite3.connect(db)
con.execute('PRAGMA foreign_keys = ON')
backup = db.with_name('dev-before-remove-other-banks.db')
if not backup.exists():
    with sqlite3.connect(backup) as target:
        con.backup(target)
with con:
    banks = con.execute('SELECT id, name FROM BankMaster').fetchall()
    for bank_id, name in banks:
        if name in keep:
            continue
        devices = 'SELECT id FROM InventoryDevice WHERE bankId = ?'
        counts = {}
        for table in ('InventoryDocument', 'InventoryEvent'):
            counts[table] = con.execute(f'DELETE FROM {table} WHERE deviceId IN ({devices})', (bank_id,)).rowcount
        counts['InventoryDevice'] = con.execute('DELETE FROM InventoryDevice WHERE bankId = ?', (bank_id,)).rowcount
        counts['PosSerial'] = con.execute('DELETE FROM PosSerial WHERE bankName = ?', (name,)).rowcount
        con.execute('DELETE FROM BankMaster WHERE id = ?', (bank_id,))
        print(name, counts)
print('Backup:', backup)
