# Update: POS bank dropdown, field task service dropdown, hardware POS item problems

## Changed files

- `apps/web/app/pos-serials/page.js`
- `apps/web/app/workspaces/page.js`
- `apps/web/app/hardware/page.js`
- `apps/web/app/hardware/[id]/page.js`
- `apps/api/src/controllers/hardwareController.js`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260617000000_add_hardware_items/migration.sql`

## What changed

1. POS Serial Management
   - After adding a new POS serial with a new bank name, the bank dropdown/list refreshes immediately.
   - Example: add bank `Uttora Bank`; next serial add/filter dropdown will show `Uttora Bank`.

2. Field Task
   - Service type field is now a dropdown, using the same service list as bank tickets.

3. Hardware Batch
   - New batch form now supports POS-wise serial and problem entry.
   - Default 20 POS rows are shown.
   - More rows can be added.
   - Each row needs POS serial + problem.
   - Demo problem dropdown includes 10 common problems.
   - Total quantity is calculated automatically from filled POS rows.
   - Hardware detail page shows saved POS serial/problem list.

## Database note

A new Prisma migration was added for `HardwareItem`.
After copying the updated project, run from `apps/api`:

```bash
npx prisma migrate deploy
npx prisma generate
```

For local development, if migrate deploy is not suitable, use:

```bash
npx prisma migrate dev
```
