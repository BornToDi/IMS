"use client"

import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { s } from './shared'

function serialList(text) {
  return [...new Set(String(text || '').split(/[\s,;]+/).map(value => value.trim().toUpperCase()).filter(Boolean))]
}

export default function BulkBankMovement({ summary, token, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState(summary.actions.includes('DELIVER') ? 'DELIVER' : 'WITHDRAWAL')
  const [bankId, setBankId] = useState('')
  const [serialText, setSerialText] = useState('')
  const [lastCompleted, setLastCompleted] = useState([])
  const [form, setForm] = useState({ location: '', reference: '', deliveredBy: '', receivedBy: '', dueDate: '', remarks: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const serials = serialList(serialText)
  const canDeliver = summary.actions.includes('DELIVER')
  const canWithdraw = summary.actions.includes('WITHDRAWAL')
  const canRestock = summary.actions.includes('RESTOCK')
  if (!canDeliver && !canWithdraw && !canRestock) return null

  async function submit(e) {
    e.preventDefault()
    if (!serials.length || (action !== 'RESTOCK' && !bankId)) return
    const verb = action === 'DELIVER' ? 'Deliver' : action === 'WITHDRAWAL' ? 'Withdraw' : 'Restock'
    const target = action === 'RESTOCK' ? form.location : summary.banks.find(bank => bank.id === bankId)?.name
    if (!confirm(`${verb} ${serials.length} POS ${action === 'WITHDRAWAL' ? 'from' : 'for'} ${target}? Each successful group will be saved to device history.`)) return
    setBusy(true); setError(''); setNotice(''); setDone(0)
    let remaining = serials
    let completed = 0
    try {
      while (remaining.length) {
        const batch = remaining.slice(0, 50)
        await apiFetch('/api/hardware/actions/by-serial', token, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, action, bankId, serialNumbers: batch })
        })
        completed += batch.length
        remaining = remaining.slice(batch.length)
        setDone(completed)
        setSerialText(remaining.join('\n'))
      }
      setLastCompleted(serials)
      setNotice(`${completed} POS ${action === 'DELIVER' ? 'delivered' : action === 'WITHDRAWAL' ? 'withdrawn' : 'restocked'} successfully.`)
      onUpdated()
    } catch (e) {
      setError(`${completed} POS completed. ${remaining.length} remain below. ${e.message || 'Batch failed.'} Fix the issue and run again.`)
      onUpdated()
    } finally { setBusy(false) }
  }

  return <section className={s.panel}>
    <div className={s.panelHead}><div><h2>Move many POS by serial</h2><p className={s.sub}>For large deliveries, withdrawals and restock. Copy the serial column from Excel and paste it here; the page processes 50 at a time.</p></div><button type="button" className={s.button} disabled={busy} onClick={() => setOpen(value => !value)}>{open ? 'Close' : 'Open'}</button></div>
    {open && <div className={s.panelBody}>
      <form onSubmit={submit} className={s.stack}>
        <div className={s.filterGrid}>
          <label className={s.field}><span>Movement</span><select className={s.input} value={action} disabled={busy} onChange={e => { setAction(e.target.value); setError(''); setNotice('') }}>{canDeliver && <option value="DELIVER">Deliver to bank</option>}{canWithdraw && <option value="WITHDRAWAL">Withdrawal from bank</option>}{canRestock && <option value="RESTOCK">Restock after verification</option>}</select></label>
          {action !== 'RESTOCK' && <label className={s.field}><span>Bank</span><select className={s.input} value={bankId} required disabled={busy} onChange={e => setBankId(e.target.value)}><option value="">Select bank</option>{summary.banks.filter(bank => action === 'WITHDRAWAL' || bank.active).map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>}
          {action !== 'WITHDRAWAL' && <label className={s.field}><span>{action === 'DELIVER' ? 'Destination / bank location' : 'Warehouse location'}</span><input className={s.input} value={form.location} required disabled={busy} onChange={e => setForm(value => ({ ...value, location: e.target.value }))}/></label>}
          {action !== 'RESTOCK' && <label className={s.field}><span>Received by / receiving officer</span><input className={s.input} value={form.receivedBy} required disabled={busy} onChange={e => setForm(value => ({ ...value, receivedBy: e.target.value }))}/></label>}
          {action === 'DELIVER' && <>
            <label className={s.field}><span>PO / challan reference</span><input className={s.input} value={form.reference} required disabled={busy} onChange={e => setForm(value => ({ ...value, reference: e.target.value }))}/></label>
            <label className={s.field}><span>Delivered by</span><input className={s.input} value={form.deliveredBy} required disabled={busy} onChange={e => setForm(value => ({ ...value, deliveredBy: e.target.value }))}/></label>
            <label className={s.field}><span>Expected delivery / deployment date</span><input className={s.input} type="date" value={form.dueDate} required disabled={busy} onChange={e => setForm(value => ({ ...value, dueDate: e.target.value }))}/></label>
          </>}
          {action === 'WITHDRAWAL' && <label className={s.field}><span>Withdrawal reason / remarks</span><input className={s.input} value={form.remarks} required disabled={busy} onChange={e => setForm(value => ({ ...value, remarks: e.target.value }))}/></label>}
        </div>
        <label className={s.field}><span>POS serials · one per line</span><textarea className={s.input} rows={8} value={serialText} required disabled={busy} onChange={e => setSerialText(e.target.value)} placeholder={'NAA700756520\nNAA700755711\nNAA700755770'} /></label>
        <div className={s.actions}><span className={s.sub}>{serials.length} unique serials pending{busy ? ` · ${done} completed · keep this page open` : ''}</span>{!busy && !serials.length && lastCompleted.length > 0 && <button type="button" className={s.button} onClick={() => setSerialText(lastCompleted.join('\n'))}>Reuse last list</button>}<button className={s.primary} disabled={busy || !serials.length || (action !== 'RESTOCK' && !bankId)}>{busy ? 'Processing…' : action === 'DELIVER' ? 'Deliver listed POS' : action === 'WITHDRAWAL' ? 'Withdraw listed POS' : 'Restock listed POS'}</button></div>
        {action === 'WITHDRAWAL' && <p className={s.sub}>Withdrawal clears all current device details except the POS serial. Enter fresh details when deploying again.</p>}
        {action === 'RESTOCK' && <p className={s.sub}>Check that every returned device is physically available and repaired if needed before restocking.</p>}
        {notice && <p role="status" className={s.message}>{notice}</p>}
        {error && <p role="alert" className={`${s.message} ${s.error}`}>{error}</p>}
      </form>
    </div>}
  </section>
}
