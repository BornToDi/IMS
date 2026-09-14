const p = require('../apps/api/src/prismaClient');
Promise.all([
  p.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at, logs FROM _prisma_migrations'),
  p.$queryRawUnsafe('PRAGMA table_info(HardwareItem)'),
  p.$queryRawUnsafe('PRAGMA index_list(HardwareItem)'),
  p.$queryRawUnsafe('PRAGMA table_info(User)')
]).then(r => console.log(JSON.stringify(r, (_, value) => typeof value === 'bigint' ? Number(value) : value, 2))).finally(() => p.$disconnect());
