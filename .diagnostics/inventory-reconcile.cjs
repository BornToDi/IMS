const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'apps/api/prisma/dev.db');
const db = new DatabaseSync(dbPath);
const backup = path.join(__dirname, `inventory-before-${Date.now()}.db`);
db.prepare('VACUUM INTO ?').run(backup);
console.log('Local database backup created:', path.basename(backup));
const recorded = db.prepare('SELECT migration_name, finished_at FROM _prisma_migrations').all();
const verified = ['20260617000000_add_hardware_items','20260617010000_bank_master','20260624000000_add_pos_serial_location','20260705000000_add_pos_serial_place','20260804000000_notification_inbox_indexes','20260804010000_global_message_replies'];
db.close();
for (const name of verified) {
  if (recorded.some(r => r.migration_name === name && r.finished_at)) continue;
  execFileSync(process.execPath, [path.join(root,'node_modules/prisma/build/index.js'),'migrate','resolve','--applied',name], { cwd: path.join(root,'apps/api'), stdio: 'inherit' });
}
execFileSync(process.execPath, [path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy'], { cwd: path.join(root,'apps/api'), stdio: 'inherit' });
