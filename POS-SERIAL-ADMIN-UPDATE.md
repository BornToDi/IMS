# POS Serial Admin Update

Implemented:

- Admin-only POS Serial Management page: `/pos-serials`
- Admin can add single POS serial by bank
- Admin can bulk import CSV with columns: `bankName,serialNumber,model`
- Backend POS serial APIs:
  - `GET /api/pos-serials?bankName=AB Bank&q=AB001&take=30`
  - `POST /api/pos-serials`
  - `POST /api/pos-serials/import`
  - `DELETE /api/pos-serials/:id`
- Bank users can only retrieve POS serials for their own `bankName`
- Admin/management can access all POS serials
- Field task create/edit uses searchable POS serial lookup instead of loading all 30k rows
- Bank ticket create uses searchable POS serial lookup
- Field task employee assignment now excludes bank/admin users at both frontend and backend levels

CSV import format:

```csv
bankName,serialNumber,model
AB Bank,AB001,PAX A920
EBL,EBL001,Verifone VX520
```

After copying this project, run from `apps/api`:

```bash
npx prisma@5.6.0 migrate dev
npx prisma@5.6.0 generate
npm run dev
```

For frontend, run from project root or `apps/web` as usual.
