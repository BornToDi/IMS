"use client"
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { s, Field, Badge, label } from './shared'
export default function Settings({ summary, token, onSaved, onError }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(summary.settings)
  const [busy, setBusy] = useState(false)
  useEffect(() => { apiFetch('/api/hardware/settings', token).then(r => setUsers(r.users)).catch(e => onError(e.message)) }, [token, onError])
  async function save(body) {
    setBusy(true)
    try { await apiFetch('/api/hardware/settings', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); onSaved('Inventory settings saved.'); if (body.userId) setUsers(rows => rows.map(u => u.id === body.userId ? { ...u, inventoryRole: body.inventoryRole } : u)) } catch (e) { onError(e.message) } finally { setBusy(false) }
  }
  return <div className={s.stack}><section className={s.panel}><div className={s.panelHead}><h2>Stock & service alerts</h2></div><form onSubmit={e => { e.preventDefault(); save({ lowStockThreshold: Number(form.lowStockThreshold), pendingDays: Number(form.pendingDays) }) }}><div className={`${s.formGrid} ${s.panelBody}`}><Field name="lowStockThreshold" title="Low-stock threshold (available POS)" type="number" min="0" max="10000" required value={form.lowStockThreshold} onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })}/><Field name="pendingDays" title="Pending repair alert after (days)" type="number" min="1" max="10000" required value={form.pendingDays} onChange={e => setForm({ ...form, pendingDays: e.target.value })}/></div><div className={s.dialogFooter}><button className={s.primary} disabled={busy}>Save thresholds</button></div></form></section><section className={s.panel}><div className={s.panelHead}><h2>Inventory access</h2><span className={s.small}>Admin, Management and Bank roles stay fixed.</span></div><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Person</th><th>Account role</th><th>Inventory role</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td>{u.name}</td><td>{label(u.userRole)}</td><td>{['ADMIN','BANK','MANAGEMENT'].includes(u.userRole) ? <Badge value={u.userRole}/> : <select className={`${s.input} ${s.select}`} aria-label={`Inventory role for ${u.name}`} value={u.inventoryRole || (u.userRole === 'ASSISTANT' ? 'STORE' : 'TECHNICIAN')} disabled={busy} onChange={e => save({ userId: u.id, inventoryRole: e.target.value })}>{['STORE','OPERATIONS','TECHNICIAN','MANAGEMENT'].map(r => <option key={r}>{r}</option>)}</select>}</td></tr>)}</tbody></table></div></section><p className={s.sub}>Store receives, issues and returns stock. Operations allocates and deploys. Technicians manage deployment and service. Management has read-only dashboards and reports.</p></div>
}
