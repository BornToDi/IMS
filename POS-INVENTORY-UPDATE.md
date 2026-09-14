# Hardware: POS inventory

The Hardware section now manages individual POS devices, replacing the previous batch-entry interface. Previous batches remain available in the read-only Legacy archive. No previous hardware records are deleted.

## Working features

- Overview: available, reserved, delivered, deployed, faulty, repair, replaced, returned and scrapped totals; bank/model breakdowns; recent activity; stock, warranty, overdue assignment and pending-return alerts.
- Serial register: unique normalized serials, brand/model/type, supplier, purchase/warranty dates, location, bank, merchant/branch, TID/MID, engineer and remarks. Search, filters, pagination and archived records.
- Stock receipt: up to 500 serials per receipt, supplier/PO/invoice reference, receipt date and officer. Duplicate receipts roll back completely.
- Stock movement: reserve, delivery, deployment, location/merchant transfer, warehouse return and restock. Select a page of devices for atomic bulk reserve/delivery/transfer/return/restock. Delivery records include challan, delivery/receiving people and due date.
- Service: fault, repair/RMA intake, technician/vendor, repair progress/cost, completion and redeployment. Faulty returns cannot become available stock until repaired.
- Replacement: issue an available replacement to a merchant, link both serial histories, track return of the old device, then repair/restock or retire it. Old devices awaiting return cannot be repaired or scrapped prematurely.
- Documents: authenticated PDF/PNG/JPEG upload/download, up to 10 MB per file; PO, invoice, challan, acceptance, warranty and RMA categories. Documents remain with the serial and uploads create history events.
- Banks: branch, contact information, agreement reference, active/inactive state and audited edits. Bank renames update existing bank-name references elsewhere in the application. Banks with tracked inventory cannot be deleted through the old POS directory.
- Reports: stock, bank/model totals, deployment, faults, current repair, replacement links, historical returns, warranty expiry, movement and audit exports. Excel exports are real `.xlsx` files. PDF export uses the browser print view and **Save as PDF**. Exports are limited to 10,000 records; narrow filters for larger datasets.
- Audit: dated actor, previous/new status, remarks and snapshots for every device mutation. Bank/access/threshold edits have separate audit entries. Serial identity is immutable; retired devices are archived rather than physically deleted.

Updates refresh through authenticated Socket.IO events, with a 30-second polling fallback. Version checks reject stale writes; stock receipt, bulk movement and replacement execute in database transactions.

## Access

| Account / inventory role | Access |
| --- | --- |
| Admin | Full inventory access, banks, thresholds and inventory role assignment |
| Assistant → Store (default) | Receipt, issue, allocation, transfers, returns, metadata and documents |
| Employee → Technician (default) | Deployment, faults, repair, replacement and documents |
| Operations (admin-assigned) | Allocation, delivery, deployment, transfers and documents |
| Management | Read-only overview, records and reports |
| Bank | Own bank's records and service progress; no mutations, internal repair costs, other-bank history or internal documents |

Admins can change Store/Operations/Technician/Management inventory access for existing employees from Hardware → Settings without changing their account role. Admin, Management and Bank account roles cannot be overridden.

## Existing data and rollout

Apply migrations before restarting the API:

```sh
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run migrate:deploy
npm --workspace apps/web run build
```

Migration `20260914000000_pos_inventory` adds inventory tables, bank metadata and per-user inventory roles. Existing POS-directory serials are imported as **Received / unverified**, preserving bank/model/location where known. They are not assumed to be physically available or deployed. Verify the device, edit missing details, then use **Restock** with the verified warehouse location before allocation. Case/whitespace variants map to one normalized serial; all original directory rows remain unchanged. Previous batch item/update records remain in Legacy archive, because batch counts cannot establish a serial's current physical lifecycle.

The existing POS directory remains separate from the operational Hardware register after this one-time import. Receive new physical inventory through Hardware. Hardware histories remain intact if a directory row is later removed.

The local database had a pre-existing failed HardwareItem migration and several previously applied schema changes missing from its migration ledger. A SQLite backup was created under `.diagnostics/inventory-before-*.db`; existing schema was compared with the previous Prisma schema, matching changes were reconciled, and the missing push-subscription plus inventory migrations were applied. Do not blindly mark migrations applied on other environments: inspect their actual schema first.

The API health/startup checks now detect a missing inventory table. Deployment to another server has not been performed.

## Validation

```sh
node --experimental-sqlite --test apps/api/src/controllers/inventory.test.js apps/api/src/utils/inventoryMigration.test.js
npm --workspace apps/web run build
```

Integration tests use a temporary SQLite database and exercise real authenticated Express routes, transaction rollback, role/bank isolation, lifecycle transitions, repair/replacement, stale writes, documents, archive, audit and Excel contents. Migration validation checks legacy preservation and foreign keys.
