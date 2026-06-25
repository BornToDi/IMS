# Bank ticket / POS serial / notification update

Updated items:

1. Bank ticket create form now has bank name select.
2. POS serial field now supports filtered suggestions after typing at least two characters.
3. Service type is now a dropdown with an `Others` option. Choosing `Others` opens a custom input.
4. Bank users are limited to their own bank identity for ticket creation and POS serial options.
5. Employee sidebar no longer shows `Bank Tickets`.
6. Notification items now support `targetUrl`; clicking a notification marks it read and opens the related ticket, field task, or hardware page.
7. Ticket update/timeline cards were made narrower and cleaner.
8. Field task create/edit form now has a bank dropdown.
9. Ticket assignment still clears the assign form and shows `Assigned successfully`.

Database/schema changes:

- `User.bankName`
- `BankTicket.bankName`
- `Workspace.bankName`
- `Notification.targetUrl`

Run after copying this update:

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
```

For existing SQLite dev data, the included `apps/api/prisma/dev.db` has already been altered and backfilled where possible.
