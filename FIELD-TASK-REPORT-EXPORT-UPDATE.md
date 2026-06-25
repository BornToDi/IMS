# Field Task Report Export Update

Changes included:

- Removed fixed service-type dropdown from field task creation.
- Admin now types service type manually.
- Employee work update service type remains a normal input field.
- Added Excel report download from Dashboard.
- Added Excel report download from Workspaces/Field Tasks page.
- Excel columns are exactly:
  - Time
  - Zone
  - engineer name
  - TID
  - POS serial
  - Merchant address
  - service type
  - Remarks
- Export respects the visible filtered list, so admin can search/filter first and then download the report.

Notes:

- Export is client-side and does not require adding another npm package.
- The downloaded file is `.xls` and opens in Microsoft Excel.
