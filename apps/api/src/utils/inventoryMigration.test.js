const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

test('inventory migration preserves legacy data and imports serials as unverified, never available stock', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE User (id TEXT PRIMARY KEY);
      CREATE TABLE BankMaster (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX BankMaster_name_key ON BankMaster(name);
      CREATE INDEX BankMaster_name_idx ON BankMaster(name);
      CREATE TABLE PosSerial (id TEXT PRIMARY KEY, serialNumber TEXT, bankName TEXT, model TEXT, status TEXT, location TEXT);
      INSERT INTO BankMaster(id,name) VALUES ('bank-1','Existing bank');
      INSERT INTO PosSerial VALUES ('serial-1','pos-001','Existing bank','A920','ACTIVE','Bank location');
      INSERT INTO PosSerial VALUES ('serial-2','POS-001','Existing bank','A920','ACTIVE','Duplicate directory spelling');
      INSERT INTO PosSerial VALUES ('serial-3','pos-002','New bank',NULL,'ACTIVE',NULL);
    `);
    db.exec(fs.readFileSync(path.join(__dirname,'../../prisma/migrations/20260914000000_pos_inventory/migration.sql'),'utf8'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM PosSerial').get().n,3);
    assert.equal(db.prepare('SELECT count(*) AS n FROM InventoryDevice').get().n,2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM InventoryDevice WHERE status = 'IN_STOCK'").get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM InventoryEvent').get().n,2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM BankMaster').get().n,2);
    assert.equal(db.prepare("SELECT id FROM BankMaster WHERE name='Existing bank'").get().id,'bank-1');
    const imported=db.prepare("SELECT * FROM InventoryDevice WHERE serialNumber='POS-002'").get();
    assert.equal(imported.status,'RECEIVED'); assert.equal(imported.location,'Unverified location');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});
