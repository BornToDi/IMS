"use client"
import { memo, useEffect, useRef, useState } from 'react'
import { getCurrentLocationWithPlace } from '../lib/location'

const API = process.env.NEXT_PUBLIC_API_URL || ''
const today = () => new Date(Date.now() + 21600000).toISOString().slice(0, 10)
const time = value => value ? new Date(value).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) : '—'
const control = 'rounded-xl border border-white/15 bg-[#202c33] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50'
const compactControl = 'shrink-0 rounded-lg border border-white/15 bg-[#202c33] px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40'

export default memo(function ChatAttendance({ accessToken, user, messages, onMessage, historyLoading }) {
  const canUseAttendance = ['ADMIN', 'ASSISTANT', 'EMPLOYEE', 'FIELD_EMPLOYEE'].includes(user?.userRole)
  const canViewReports = ['ADMIN', 'ASSISTANT'].includes(user?.userRole)
  const [expanded, setExpanded] = useState(false)
  const [period, setPeriod] = useState('daily')
  const [date, setDate] = useState(today)
  const [employeeId, setEmployeeId] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [locating, setLocating] = useState(false)
  const reasonDialog = useRef(null)
  const submitting = useRef(false)
  useEffect(() => {
    if (reasonOpen && canUseAttendance) reasonDialog.current?.showModal()
    else reasonDialog.current?.close()
  }, [reasonOpen, canUseAttendance])
  const query = new URLSearchParams({ period, date, employeeId }).toString()
  useEffect(() => {
    if (!canViewReports || !expanded || !accessToken || !date) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`${API}/api/chat/attendance?${query}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body })
      .then(setReport)
      .catch(err => { if (err.name !== 'AbortError') { setError(err.message || 'Unable to load attendance'); setReport(null) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canViewReports, expanded, accessToken, query, messages.length, revision])

  if (!canUseAttendance) return null
  const ownEvents = messages.filter(message => message.authorId === user?.id && !message.replyToId && !message.attachmentType && /^sign[\s-]*(in|out)[.!]?(?:\nReason: ([\s\S]+))?$/i.test(message.content.trim()) && new Date(new Date(message.createdAt).getTime() + 21600000).toISOString().slice(0, 10) === today())
  const latest = ownEvents[ownEvents.length - 1]
  const signedIn = latest && /^sign[\s-]*in[.!]?(?:\nReason: ([\s\S]+))?$/i.test(latest.content.trim())
  async function mark(action) {
    if (submitting.current) return
    if (action === 'in' && (!reason.trim() || reason.trim().length > 500)) { setReasonError('Enter a reason between 1 and 500 characters.'); return }
    submitting.current = true
    setReasonError('')
    setBusy(action); setNotice(''); setError('')
    try {
      setLocating(true)
      let location
      try { location = await getCurrentLocationWithPlace({ maximumAge: 0 }) }
      catch (err) { throw new Error(`Location is required to sign ${action}. Allow location access and retry. ${err.message || ''}`) }
      finally { setLocating(false) }
      const response = await fetch(`${API}/api/chat`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `sign ${action}`, attendanceAction: action, ...location, ...(action === 'in' ? { attendanceReason: reason.trim() } : {}) }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not record attendance')
      onMessage(body)
      setNotice(`Sign ${action} recorded at ${time(body.createdAt)} (Dhaka).`)
      if (action === 'in') { setReasonOpen(false); setReason('') }
    } catch (err) { if (action === 'in') setReasonError(err.message); else setError(err.message) } finally { submitting.current = false; setBusy('') }
  }
  async function download() {
    setBusy('export'); setError('')
    try {
      const response = await fetch(`${API}/api/chat/attendance?${query}&format=xlsx`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!response.ok) throw new Error('Could not export attendance. Please try again.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a'); link.href = url; link.download = `attendance-${period}-${date}.xlsx`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const rows = report?.rows || []
  return <div className="flex-none border-b border-emerald-400/15 bg-gradient-to-r from-emerald-950/60 to-[#111b21]">
    <dialog ref={reasonDialog} aria-labelledby="sign-in-title" onCancel={event => { if (submitting.current) event.preventDefault(); else setReasonOpen(false) }} onClose={() => setReasonOpen(false)} className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-white/15 bg-[#111b21] p-5 text-white shadow-2xl backdrop:bg-black/65">
      <form onSubmit={event => { event.preventDefault(); mark('in') }}>
        <h2 id="sign-in-title" className="text-lg font-semibold">Sign in</h2>
        <p className="mt-1 text-sm text-slate-400">Where are you deployed or working today?</p>
        <label htmlFor="sign-in-reason" className="mb-2 mt-4 block text-sm font-medium">Reason <span className="text-emerald-300">*</span></label>
        <textarea autoFocus id="sign-in-reason" required maxLength={500} rows={3} value={reason} disabled={busy === 'in'} onChange={event => { setReason(event.target.value); setReasonError('') }} placeholder="e.g. Deployed in AIBL" aria-describedby="sign-in-reason-help" className={`${control} w-full resize-none`} />
        <p id="sign-in-reason-help" className="mt-1 text-xs text-slate-400">Your reason and current location will be saved with your sign in. Allow location access when prompted.</p>
        {reasonError && <p role="alert" className="mt-2 text-sm text-rose-300">{reasonError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy === 'in'} onClick={() => setReasonOpen(false)} className={control}>Cancel</button>
          <button type="submit" disabled={busy === 'in' || !reason.trim()} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-40">{locating ? 'Getting location…' : busy === 'in' ? 'Saving…' : 'Confirm sign in'}</button>
        </div>
      </form>
    </dialog>
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-400" title={latest ? `Signed ${signedIn ? 'in' : 'out'} at ${time(latest.createdAt)} (Dhaka)` : 'Attendance · Dhaka time'}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${signedIn ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        <span className="hidden sm:inline">Attendance</span>
        <span className="truncate tabular-nums">{latest ? `${signedIn ? 'In' : 'Out'} ${time(latest.createdAt)}` : 'Today'}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button type="button" disabled={historyLoading || !!busy || !!signedIn} onClick={() => { setReasonError(''); setReasonOpen(true) }} className="shrink-0 rounded-lg bg-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-40">{busy === 'in' ? 'Saving…' : 'Sign in'}</button>
        <button type="button" title="Sign out and save your current location" disabled={historyLoading || !!busy || !signedIn} onClick={() => mark('out')} className={compactControl}>{busy === 'out' ? locating ? 'Locating…' : 'Saving…' : 'Sign out'}</button>
        {canViewReports && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={compactControl}>{expanded ? 'Close' : 'Reports'}</button>}
      </div>
    </div>
    <span role="status" className="sr-only">{notice}</span>
    {error && <p role="alert" className="px-6 pb-2 text-sm text-rose-300">{error}</p>}
    {canViewReports && expanded && <div className="max-h-[55vh] overflow-y-auto border-t border-white/10 px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto"><h2 className="text-lg font-semibold text-white">{report?.canViewTeam ? 'Team attendance' : 'My attendance'}</h2><p className="mt-1 text-xs text-slate-400">Type “sign in” or “sign out” as a standalone chat message, or use the buttons.</p></div>
        <button type="button" disabled={loading || !!busy || !date || !report} onClick={download} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-40">{busy === 'export' ? 'Exporting…' : '↓ Export Excel'}</button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-slate-400">Report period<select className={control} value={period} onChange={e => setPeriod(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label className="grid gap-1 text-xs text-slate-400">Date in period<input type="date" className={control} value={date} onChange={e => setDate(e.target.value)} /></label>
        {report?.canViewTeam && <label className="grid gap-1 text-xs text-slate-400">Employee<select className={control} value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">All employees</option>{report.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.employeeCode ? ` · ${employee.employeeCode}` : ''}</option>)}</select></label>}
        <button type="button" className={control} onClick={() => setRevision(value => value + 1)}>Refresh</button>
      </div>
      {loading ? <p role="status" className="py-6 text-sm text-slate-300">Loading attendance…</p> : !date ? <p className="py-6 text-sm text-slate-300">Choose a date to view attendance.</p> : report && <>
        <p className="mt-3 text-xs text-slate-400">{report.from} to {new Date(new Date(`${report.until}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)} · Weeks start Monday</p>
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Employee days', rows.length], ['Sign ins', rows.reduce((sum, row) => sum + row.signIns, 0)], ['Sign outs', rows.reduce((sum, row) => sum + row.signOuts, 0)], ['Worked hours', (rows.reduce((sum, row) => sum + row.minutes, 0) / 60).toFixed(1)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p></div>)}</div>
        <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-white/5 text-xs text-slate-400"><tr>{['Employee / Date', 'Sign in', 'Sign out', 'Worked', 'Status'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/5">{rows.map(row => <tr key={`${row.employeeId}-${row.date}`} className="text-slate-200"><td className="px-4 py-3"><p className="font-medium text-white">{row.name} <span className="text-xs text-slate-400">{row.employeeCode}</span></p><p className="mt-1 text-xs text-slate-400">{row.date}</p></td><td className="px-4 py-3 tabular-nums">{time(row.signIn)}</td><td className="px-4 py-3 tabular-nums">{time(row.signOut)}</td><td className="px-4 py-3">{Math.floor(row.minutes / 60)}h {row.minutes % 60}m</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${row.status === 'Complete' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>{row.status}</span>{row.issues.length > 0 && <p className="mt-2 text-xs text-amber-200">{row.issues.join(', ')}</p>}</td></tr>)}</tbody></table>{!rows.length && <div className="px-4 py-8 text-center"><p className="text-white">No attendance recorded</p><p className="mt-2 text-sm text-slate-400">Choose another period or start with a sign in message.</p></div>}</div>
        {rows.some(row => row.reasons?.length) && <details className="mt-3 text-sm text-slate-300"><summary className="cursor-pointer text-emerald-300">Sign in reasons</summary><ul className="mt-2 space-y-2">{rows.filter(row => row.reasons?.length).map(row => <li key={`${row.employeeId}-${row.date}`} className="rounded-lg bg-white/5 p-2"><span className="text-xs text-slate-400">{row.name} · {row.date}</span><p className="whitespace-pre-wrap break-words">{row.reasons.join('; ')}</p></li>)}</ul></details>}
        {report.events?.some(event => event.mapUrl) && <details className="mt-3 text-sm text-slate-300"><summary className="cursor-pointer text-emerald-300">Sign in / out locations</summary><ul className="mt-2 space-y-2">{report.events.filter(event => event.mapUrl).map(event => <li key={event.messageId} className="rounded-lg bg-white/5 p-2"><p className="text-xs text-slate-400">{event.name} · {event.date} · Sign {event.action} {time(event.time)}</p><a href={event.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-words text-emerald-300 underline">{event.locationLabel || `${event.latitude}, ${event.longitude}`} ↗</a></li>)}</ul></details>}
        <p className="mt-3 text-xs leading-5 text-slate-400">Hours include completed sign in/out pairs within each Dhaka calendar day. Open sessions, overnight shifts and unmatched events need review. Excel includes every sign event; days without messages are not marked absent.</p>
      </>}
    </div>}
  </div>
})
