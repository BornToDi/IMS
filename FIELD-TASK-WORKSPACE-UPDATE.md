# Field Task Workspace Update

Workspace has been redesigned as a field service task board.

## Main changes
- Removed the workspace focus from goals/activity clutter.
- Workspace creation now supports TID number, POS serial, zone, service type, merchant address, and assigned employee.
- Assigned employee is automatically added as a workspace member and receives a notification.
- Employee can open the task, submit actual service type, remarks, timestamp, location, and multiple images/files.
- Creator can monitor the task timeline and uploaded proof in real time through socket events.
- UI is wider, white-background, deep-black text, responsive, and simplified.

## Important run commands after unzip
From project root:

```bash
npm install
npx prisma generate --schema=apps/api/prisma/schema.prisma
cd apps/api
npx prisma migrate dev --schema=prisma/schema.prisma
npm run dev
```

In another terminal:

```bash
cd apps/web
npm run dev
```

If Prisma migration complains during local development, run this from `apps/api`:

```bash
npx prisma db push --schema=prisma/schema.prisma
```
