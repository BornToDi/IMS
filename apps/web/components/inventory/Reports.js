"use client"
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { s, Icon, Field, downloadFile, Empty, label } from './shared'

const REPORTS = [['stock', 'Stock register', 'Every serial and its current position'], ['bank', 'Bank-wise stock', 'Availability and lifecycle by bank'], ['model', 'Model-wise stock', 'Device model and status totals'], ['deployment', 'Deployment', 'Merchant, engineer and TID / MID'], ['faulty', 'Faulty devices', 'Current faults awaiting service'], ['repair', 'Repair / RMA', 'Technicians, repair progress and costs'], ['replacement', 'Replacements', 'Linked serials and pending returns'], ['return', 'Returns', 'Devices returned to warehouse'], ['warranty', 'Warranty expiry', 'Expired and next 30 days by default'], ['movement', 'Stock movements', 'Full serial movement history'], ['audit', 'Audit history', 'Device, bank and access changes']]
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export default function Reports({ summary, token, onError }) {
  const [type, setType] = useState('stock')
  const [filters, setFilters] = useState({})
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const query = new URLSearchParams({ type, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) })
  async function run(format) {
    setBusy(true)
    let printWindow
    if (format === 'pdf') { printWindow = window.open('', '_blank'); if (!printWindow) { onError('Allow pop-ups to open the PDF print view.'); setBusy(false); return } printWindow.document.write('<title>Preparing report</title><p>Preparing report…</p>'); printWindow.document.close() }
    try {
      if (format === 'xlsx') await downloadFile(`/api/hardware/reports?${query}&format=xlsx`, token, `pos-${type}-${new Date().toISOString().slice(0,10)}.xlsx`)
      else {
        const result = await apiFetch(`/api/hardware/reports?${query}`, token)
        if (format === 'preview') setPreview(result)
        else {
          const columns = Object.keys(result.rows[0] || {}).filter(key => key !== 'Details')
          printWindow.document.open()
          printWindow.document.write(`<!doctype html><html><head><title>POS ${escapeHtml(type)} report</title><style>@page{size:A3 landscape;margin:12mm}body{font:10px Arial;color:#172b3a}h1{font-size:22px}p{color:#526976}table{border-collapse:collapse;width:100%;font-size:8px}th,td{border:1px solid #dce5e7;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#edf6f3}thead{display:table-header-group}tr{break-inside:avoid}button{padding:9px 15px;margin:10px 0;background:#0f766e;color:white;border:0;border-radius:5px}@media print{button{display:none}}</style></head><body><h1>POS ${escapeHtml(label(type))} Report</h1><p>${escapeHtml(new Date(result.generatedAt).toLocaleString())} · ${result.rows.length} records · ${escapeHtml(query.toString())}</p><button id="print">Print / Save as PDF</button><table><thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row => `<tr>${columns.map(c => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>${!result.rows.length ? '<p>No records match these filters.</p>' : ''}</body></html>`)
          printWindow.document.close(); printWindow.document.getElementById('print').onclick = () => printWindow.print(); printWindow.focus()
        }
      }
    } catch (e) { printWindow?.close(); onError(e.message) } finally { setBusy(false) }
  }
  return <div className={s.stack}><div><h2 className={s.sectionTitle}>Reports & exports</h2><p className={s.sub}>Choose a report, narrow the results, then download Excel or save the print view as PDF.</p></div><div className={s.reportCards}>{REPORTS.map(([key, name, description]) => <button key={key} aria-pressed={type === key} className={`${s.reportCard} ${type === key ? s.selected : ''}`} onClick={() => { setType(key); setPreview(null) }}><Icon name={key === 'audit' || key === 'movement' ? 'clock' : 'chart'}/><strong>{name}</strong><span className={s.sub}>{description}</span></button>)}</div>
    <section className={s.panel}><div className={s.filterGrid} style={{ borderBottom: 0 }}>{[['bankId', 'Bank'], ['model', 'Model'], ['from', 'From date'], ['to', 'To date'], ['q', 'Serial / merchant / TID'], ['location', 'Location'], ['warranty', 'Warranty'], ['archived', 'Record set']].map(([key, title]) => <Field key={key} name={key} title={title} type={['from','to'].includes(key) ? 'date' : 'text'} value={filters[key]} onChange={e => { setFilters({ ...filters, [key]: e.target.value }); setPreview(null) }} options={key === 'bankId' ? summary.banks.map(b => ({ value: b.id, label: b.name })) : key === 'model' ? summary.models.map(m => ({ value: m, label: m })) : key === 'warranty' ? ['valid','expiring','expired','unknown'] : key === 'archived' ? [{value:'false',label:'Current devices'},{value:'true',label:'Archived devices'}] : undefined}/>)}</div><div className={s.footer}><span>Up to 10,000 records per export</span><div className={s.actions}><button className={s.button} disabled={busy} onClick={() => run('preview')}>{busy ? 'Preparing…' : 'Preview'}</button><button className={s.button} disabled={busy} onClick={() => run('pdf')}><Icon name="file" size={15}/>PDF / Print</button><button className={s.primary} disabled={busy} onClick={() => run('xlsx')}><Icon name="download" size={15}/>Excel</button></div></div></section>
    {preview && <section className={s.panel}><div className={s.panelHead}><h2>{label(type)} preview</h2><span className={s.small}>{preview.rows.length} records · showing first 100</span></div>{preview.rows.length ? <div className={s.tableScroll}><table className={s.table}><thead><tr>{Object.keys(preview.rows[0]).filter(k => k !== 'Details').map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{preview.rows.slice(0,100).map((row,i) => <tr key={i}>{Object.entries(row).filter(([k]) => k !== 'Details').map(([k,v]) => <td key={k}>{String(v)}</td>)}</tr>)}</tbody></table></div> : <Empty title="No matching records">Try a different date range or filter.</Empty>}</section>}
  </div>
}
