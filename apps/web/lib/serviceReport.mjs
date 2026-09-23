const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const serviceReportStyles = `
@page{size:A4 portrait;margin:18mm 15mm}
*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;margin:0}
.bank-section{break-after:page}.bank-section:last-child{break-after:auto}
.bank-name{text-align:right;font-size:26px;margin:0 0 28px;overflow-wrap:anywhere}
.gate-title{text-align:center;font-size:16px;margin:0 0 16px}
.report-date{text-align:right;margin:0 0 14px}.report-intro{margin:0 0 14px;line-height:1.5}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #777;padding:5px 8px;text-align:center;overflow-wrap:anywhere;font-weight:normal}
.service-table th:first-child{width:24%}.service-table th:nth-child(2){width:36%}.service-table th:nth-child(3){width:40%}
thead{display:table-header-group}tr{break-inside:avoid}
.signatures{display:flex;justify-content:space-between;margin-top:65px;break-inside:avoid}
.signatures div{min-width:145px;text-align:center;border-top:1px solid #555;padding-top:8px}
button{padding:9px 15px;margin-bottom:20px;cursor:pointer}@media print{button{display:none}}
`

export function serviceReportHtml(result, firstColumn = 'Model') {
  const groups = new Map()
  for (const row of result.rows) {
    const bank = row.Bank || 'Warehouse / unassigned'
    if (!groups.has(bank)) groups.set(bank, [])
    groups.get(bank).push(row)
  }
  const date = new Date(result.generatedAt).toLocaleDateString('en-GB')
  return [...groups].map(([bank, rows]) => `<section class="bank-section">
    <h1 class="bank-name">${escapeHtml(bank)}</h1>
    <h2 class="gate-title">GATE PASS</h2>
    <p class="report-date">${escapeHtml(date)}</p>
    <p class="report-intro">We are sending ${rows.length} units of POS for repairing to Networld Bangladesh PLC.</p>
    <table class="service-table"><thead><tr><th>${firstColumn === 'SL' ? 'SL' : 'MODEL'}</th><th>POS S/N</th><th>REMARKS</th></tr></thead>
    <tbody>${rows.map((row, index) => `<tr><td>${escapeHtml(firstColumn === 'SL' ? index + 1 : row.Model)}</td><td>${escapeHtml(row.Serial)}</td><td>${escapeHtml(row.Fault || row.Remarks || '')}</td></tr>`).join('')}</tbody></table>
    <div class="signatures"><div>Authorized Signature</div><div>Received By</div></div>
  </section>`).join('') || '<p>No records match these filters.</p>'
}
