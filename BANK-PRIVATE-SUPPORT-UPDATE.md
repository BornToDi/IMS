# Bank private support and service desk

Bank users can open **Private Messages** in navigation or **Message admin** on their dashboard. Admins use the same inbox to reply to bank users. Each conversation is private to its two participants; other admins, bank users, employees, management and assistants cannot access its messages. Management and assistants retain their existing ticket permissions.

The inbox includes contact search, unread counts, sent/read receipts, live delivery with periodic refresh as a fallback, drafts per contact, and paginated history. Mobile layouts show contacts and the conversation separately. Notifications open the relevant conversation. Ticket details can open the inbox and add a ticket reference to a draft; references are never sent automatically.

The service desk includes a labeled ticket form, bank-scoped terminal search, priority selection, submission confirmation, search and status filters. Ticket details show progress, engineer assignment and an activity timeline. Bank users can post ticket updates; they cannot change ticket status or read another bank user's ticket. Ticket comments are shared with ticket participants and authorized staff; private messages remain separate.

## Deployment

Run these commands from the project root before restarting the running API and web processes:

```bash
git pull origin main
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run migrate:deploy
npm --workspace apps/web run build
```

The migration `20261025000000_private_bank_messages` creates the DirectMessage table and indexes. It does not modify existing ticket or chat records. No new package dependencies are required. The API health check now checks the private-message table, so migration must finish before the new API is considered ready.

Restart both existing services using the server's current process manager. For a server started manually with `nohup`, identify the existing listeners on ports 5000 and 3001 with `ss -ltnp` and stop those specific processes before starting replacements. Do not launch duplicate listeners.

```bash
nohup npm --workspace apps/api run start > api.log 2>&1 &
nohup npm --workspace apps/web run start -- -p 3001 > web.log 2>&1 &
curl -i http://127.0.0.1:5000/api/health
```

Confirm the health endpoint returns 200, then sign in as a bank user and an admin in separate browser sessions. Send and reply to a message, check unread/read state, create a ticket, assign an engineer, and post a ticket update. Check the inbox and service desk on a phone.

## Validation

`node --test apps/api/src/controllers/bankSupport.test.js` uses a temporary SQLite database and real authenticated HTTP requests to verify role checks, participant isolation, cursor pagination, read boundaries, ticket access, creation and assignment. It also applies the migration SQL to an isolated database to verify indexes and cascading foreign keys.

Desktop/mobile Chrome smoke tests used isolated API fixtures to verify bank and admin inboxes, sending text, ticket creation and posting updates, with no horizontal overflow or runtime exceptions. The production frontend build was checked. Production credentials, messages and tickets were not used in testing.
