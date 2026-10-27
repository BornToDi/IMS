# Bank teams, named POS responsibility and targets

Open **Bank Team & Targets** in navigation (`/bank-team`). Bank roles are separate from the global IMS `userRole`: every bank member remains a BANK user and cannot grant internal IMS privileges.

## Registration and approval

Bank registration lists active banks from Bank Management. A user selects **Bank employee** or **Request Bank Admin access**. Both start as PENDING. Requesting admin access does not grant it.

The IMS Admin opens Bank Team & Targets, selects the bank, then approves its first Bank Admin. Only the IMS Admin can appoint, demote or suspend Bank Admin accounts. A Bank Admin can approve their own bank's employee registrations and assign POS Manager, Employee or Viewer roles. Bank admins cannot change their own membership or manage another bank's users. Updates check a membership version to reject stale edits.

New registrations notify the IMS Admin; employee requests also notify approved Bank Admins in that bank. Bank Admin requests are not sent to Bank Admins who cannot approve them. The Bank Team & Targets navigation badge includes the actual pending approval count (including requests created before this notification feature), plus unread membership/assignment/target updates. Pending requests remain counted until decided, even if the notification is read. Approval links open the right bank's Team members tab and scroll to the applicant. Membership decisions mark the associated registration notifications read. The badge refreshes on new notification events, after decisions and periodically while the page is visible.

Existing BANK accounts retain their previous portal access. Migration links matching bank names to a canonical bank ID but does not automatically promote anyone to Bank Admin. The IMS Admin should approve/assign an explicit bank role to existing bank users in the Team members tab.

Internal IMS employees and assistants are created by IMS Admin/Management in **Employees → New internal account**. Public registration cannot be used to bypass bank restrictions by claiming an internal role.

## Roles

| Role | Access |
| --- | --- |
| Bank Admin | Own bank's membership approval and roles, all bank POS, assignments, targets and review |
| POS Manager | Own bank's POS allocation, targets and completion review; cannot approve members |
| Employee | Own currently assigned POS and related tickets, own targets and completion submission |
| Viewer | Own assigned POS and targets, read-only ticket access; no completion submission |

Pending, rejected or suspended accounts can view their membership status but cannot access bank data. Membership changes disconnect existing user sockets. Bank users cannot join internal workspaces or company chat via API or sockets.

## Assignments

Select a current owner (or Unassigned POS), optionally search serial/TID/merchant/location, then choose:

- Checked device IDs from the current page.
- Exact serial numbers pasted one per line or comma-separated.
- A specific quantity from the matching filter, sorted by serial number.

For 12,000 POS, assign 3,000 from Unassigned to the first approved employee, then repeat for the others. Maximum batch size is 5,000. A review dialog confirms recipient, count, current owner and filter before mutation. Assignment is atomic: every POS must still belong to this bank and the selected current owner. Invalid, unavailable or cross-bank selections roll back the whole batch.

There is one current responsibility per physical inventory POS. Transfers and unassignments record history, including previous employee, recipient, actor and note. A POS return, withdrawal or change to another bank clears its previous responsibility; history remains. Responsibility does not change physical inventory status or replace engineer field-task assignment.

## Targets and verified work

Managers set an employee, objective, quantity, start and deadline. Calendar dates use Asia/Dhaka. Each employee can submit a note against an exact POS currently assigned to them. A POS counts at most once per target. Only manager-approved reports count toward completion; pending/rejected counts are separate. An employee cannot approve their own work, including a manager's own target. Rejected work can be corrected and resubmitted without creating another completion record. Late reports are allowed and labeled late. Closing a target stops new submissions but retains its history and reviews.

Device lists, targets, reports and assignment history are paginated. CSV export explicitly exports the current target-summary page and escapes spreadsheet formulas. Targets can exceed the currently assigned device count, allowing future responsibility changes. A device may appear in different targets with different objectives or periods; managers must review whether each report represents the requested work.

## Deployment

Back up the production database first. From the project root:

```bash
git pull origin main
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run migrate:deploy
npm --workspace apps/web run build
```

Restart the existing API and web processes, then check `/api/health`. Migration `20261027000000_bank_teams_assignments_targets` adds bank membership fields, assignment/history tables and target/completion tables. The User table is rebuilt by the generated SQLite migration while preserving account IDs and existing fields. If the database was initialized without Prisma migration history, reconcile its baseline before using migrate deploy; never reset a populated database to bypass a baseline error.

## Validation

The bank-team integration suite uses authenticated HTTP requests and a temporary SQLite database seeded with 12,000 bank POS. It covers registration approval, main-admin appointment, same-bank role management, stale edits, a real 3,000-device assignment, atomic cross-bank rejection, exact-serial transfer, hardware/ticket scoping, completion/review counts, corrected reports, suspension and inventory-return cleanup. An isolated migration test checks preservation of users, passwords and private messages, bank-ID backfill and foreign keys.

Desktop/mobile Chrome checks use isolated fixtures to verify employee approval, a 3,000-device assignment confirmation, manager approval, employee completion and pending membership screens. Live production accounts and POS data are not used in tests.
