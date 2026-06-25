# Company-grade rebuild notes

This rebuild focused on turning the app into a usable workspace execution system instead of a collection of disconnected demo screens.

## What changed

### Workspace module
- Rebuilt `/workspaces` with search, create/edit/delete, active workspace selection, invite flow, member previews, workspace cards, and direct navigation to workspace chat and Goals/KPI.
- Rebuilt `/workspaces/[id]` into a workspace command room with WhatsApp-style workspace chat, member panel, file panel, upload flow, and links to Goals/KPI and Action Items.
- Backend workspace deletion now safely removes dependent workflow data before deleting a workspace. Previously this could fail due database relations.

### Goals/KPI workflow
- Rebuilt `/goals` into an OKR/KPI board.
- Added summary cards: total goals, completed goals, average progress, overdue goals.
- Added filtering/search.
- Added dynamic goal form with owner, due date, status and description.
- Added KPI milestone creation, editing of milestone title/type/progress, and automatic average progress calculation.
- Backend goal deletion now removes activities and milestones and detaches linked action items before deleting.

### Action items
- Rebuilt `/action-items` into a Kanban-style execution board.
- Added status columns, search, summary stats, dynamic create/edit form, linked goal selector, assignee selector, priority, due date, and quick status movement.

### Chat
- Patched Socket.IO browser authentication. Browser clients cannot reliably send custom `extraHeaders`; the client now also sends token through Socket.IO `auth`, and the server reads it.
- Global chat already had WhatsApp-style layout; auth and API base behavior were hardened.
- Workspace detail chat now uses WhatsApp-like bubbles and responsive layout.

### Database design
- Added Prisma schema indexes for common workspace queries.
- Added unique membership protection: one user cannot be duplicated inside the same workspace.
- Added migration `20260610000000_company_workflow_indexes` with safe `IF NOT EXISTS` indexes.

### Runtime/compile hardening
- Removed illegal duplicate global CSS import from `app/page.js`.
- Added shared API helper at `apps/web/lib/api.js` for consistent authenticated requests.
- Added backend route for listing global chat files.
- Fixed duplicate `updateGoal` export.
- Backend controllers pass `node -c` syntax validation.

## Run/reset steps

From project root:

```bash
npm install
cd apps/api
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

In another terminal:

```bash
cd apps/web
npm run dev
```

If your local SQLite database is polluted from old experiments, delete `apps/api/prisma/dev.db`, then run the Prisma commands again. Yes, databases are where mistakes go to become archaeology.

## Validation limits in this environment

- API JavaScript files passed `node -c` syntax validation.
- Full Next build could not complete here because Next/Prisma attempted to download native binaries from npm/Prisma servers, and this environment has no internet access.
- The package includes source code only, not `.git`, `.next`, `node_modules`, or uploaded user files.
