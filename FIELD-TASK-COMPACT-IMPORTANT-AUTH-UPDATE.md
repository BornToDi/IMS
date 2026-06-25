# Field Task Compact UI, Priority and Auth Cleanup

## Updated
- Compact field task list so 20+ tasks can be scanned with less scrolling.
- Added high important flag for field tasks.
- Important tasks sort to the top and show a star marker.
- Added Important filter.
- Task create/edit form now supports High important checkbox.
- Dashboard task list is more compact and scroll-contained.
- Login and registration pages are centered and redesigned with a cleaner professional card UI.

## Files changed
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260615000000_workspace_important_flag/migration.sql
- apps/api/src/controllers/workspaceController.js
- apps/web/app/workspaces/page.js
- apps/web/app/dashboard/page.js
- apps/web/app/(auth)/login/page.js
- apps/web/app/(auth)/register/page.js
- apps/web/components/AuthForm.js

## After pulling this update
Run Prisma migration because `Workspace.isImportant` was added.

```bash
npx prisma generate --schema=apps/api/prisma/schema.prisma
cd apps/api
npx prisma migrate dev --schema=prisma/schema.prisma
npm run dev
```
