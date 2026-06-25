# Simple Workspace Update

This update simplifies the app around one main user flow: open a workspace, chat, set workspace goals/KPIs, upload files, and review members.

## Changed

- Removed Goals/KPI and Action Items from the main navigation.
- Goals/KPI now live inside each workspace detail page.
- Rebuilt workspace page into simple tabs: Messages, Goals, Files, Members.
- Enlarged workspace message area into a WhatsApp-style full chat panel.
- Added image attachment rendering in chat.
- Clicking a chat image opens a full-screen preview.
- Workspace file upload now supports safer filenames.
- Uploaded files can be saved to workspace files or sent directly into chat.
- Workspace messages now support attachment metadata in the database.
- Live workspace messages are broadcast with Socket.IO.
- Notifications now poll automatically and also listen for live Socket.IO notification events.
- Notifications are created for workspace messages, goal creation, and file upload.
- Simplified dashboard wording so users are guided toward Workspaces instead of scattered modules.

## Required after update

From `apps/api`, run:

```bash
npx prisma generate
npx prisma db push
```

Then run the project:

```bash
cd F:\\Freecloud-simple-workspace-update
npm run dev
```

If Prisma migration complains, use `db push` because this project is SQLite-based.
