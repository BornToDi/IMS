# Bank Ticket + Hardware Movement Update

Implemented a clean three-role workflow:

- BANK: register separately, create tickets, track progress in real time.
- ADMIN: sees bank tickets, assigns engineers, creates hardware batches, monitors reports.
- EMPLOYEE: receives assigned field tasks and hardware batches, posts updates, comments and quantities.

## New pages

- `/bank-register` - bank-only registration page.
- `/tickets` - bank/admin/employee ticket board with search and status filters.
- `/tickets/[id]` - ticket timeline, admin assignment panel, comments.
- `/hardware` - POS hardware movement/repair batch board.
- `/hardware/[id]` - batch summary, received/repaired/faulty/pending/returned updates, mention notifications.

## API added

- `/api/tickets`
- `/api/tickets/:id`
- `/api/tickets/:id/assign`
- `/api/tickets/:id/updates`
- `/api/hardware`
- `/api/hardware/:id`
- `/api/hardware/:id/updates`

## Database added

- `BankTicket`
- `TicketUpdate`
- `HardwareBatch`
- `HardwareUpdate`

Run after pulling this version:

```bash
npm install
npx prisma generate --schema=apps/api/prisma/schema.prisma
cd apps/api
npx prisma migrate dev --schema=prisma/schema.prisma
npm run dev
```

Frontend:

```bash
cd apps/web
npm run dev
```
