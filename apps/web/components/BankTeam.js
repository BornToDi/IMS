'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useNotificationStore } from '../store/useNotificationStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiFetch } from '../lib/api'
import { Icon, Modal, label } from './inventory/shared'
import s from './TicketDesk.module.css'
import b from './BankTeam.module.css'

const day = value => new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric' })
const today = () => new Date(Date.now() + 21600000).toISOString().slice(0, 10)
const emptyTarget = { employeeId: '', title: '', quantity: 500, from: today(), until: today() }
function Pager({ page, total, size, setPage }) { return total > size && <div className={b.pager}><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / size)} · {total.toLocaleString()} records</span><button type="button" disabled={page * size >= total} onClick={() => setPage(page + 1)}>Next</button></div> }
function Member({ member, mainAdmin, busy, onSave }) {
  const [role, setRole] = useState(member.bankRole || 'EMPLOYEE')
  const [status, setStatus] = useState(member.bankStatus)
  const protectedAdmin = member.bankRole === 'ADMIN' && !mainAdmin
  return <tr id={`bank-member-${member.id}`}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{member.assigned.toLocaleString()}</td><td><select aria-label={`Role for ${member.name}`} disabled={busy || protectedAdmin} value={role} onChange={event => setRole(event.target.value)}>{(mainAdmin || member.bankRole === 'ADMIN' ? ['ADMIN', 'POS_MANAGER', 'EMPLOYEE', 'VIEWER'] : ['POS_MANAGER', 'EMPLOYEE', 'VIEWER']).map(value => <option key={value} value={value}>{label(value)}</option>)}</select></td><td><select aria-label={`Status for ${member.name}`} disabled={busy || protectedAdmin} value={status} onChange={event => setStatus(event.target.value)}>{['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].map(value => <option key={value}>{value}</option>)}</select></td><td><button className={s.secondary} type="button" disabled={busy || protectedAdmin || (role === member.bankRole && status === member.bankStatus)} onClick={() => onSave(member, role, status)}>Save membership</button>{protectedAdmin && <small>IMS admin approval required</small>}</td></tr>
}

export default function BankTeam() {
  const params = useSearchParams()
  const requestedBank = params.get('bankId') || ''
  const requestedTab = params.get('tab') || ''
  const requestedMember = params.get('member') || ''
  const navigation = useRef('')
  const focusedMember = useRef('')
  const token = useAuthStore(state => state.accessToken)
  const refreshSession = useAuthStore(state => state.refreshAccessToken)
  const [context, setContext] = useState(null)
  const [bankId, setBankId] = useState('')
  const [tab, setTab] = useState('devices')
  const [members, setMembers] = useState([])
  const [devices, setDevices] = useState({ rows: [], total: 0, assigned: 0 })
  const [targets, setTargets] = useState({ rows: [], total: 0 })
  const [history, setHistory] = useState({ rows: [], total: 0 })
  const [page, setPage] = useState(1)
  const [targetPage, setTargetPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('UNASSIGNED')
  const [selected, setSelected] = useState([])
  const [assignment, setAssignment] = useState({ employeeId: '', count: 3000, serials: '', mode: 'count', note: '' })
  const [targetForm, setTargetForm] = useState(emptyTarget)
  const [review, setReview] = useState(null)
  const [activeTarget, setActiveTarget] = useState(null)
  const [reports, setReports] = useState({ rows: [], total: 0 })
  const [reportPage, setReportPage] = useState(1)
  const [reportForm, setReportForm] = useState({ serial: '', note: '' })
  const [reviewNotes, setReviewNotes] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const generation = useRef(0)
  const mainAdmin = context?.user.userRole === 'ADMIN'
  const canManage = context?.canManage
  const canApprove = context?.canApprove
  const approved = context && (mainAdmin || context.user.bankStatus === 'APPROVED')
  const activeBank = mainAdmin ? bankId : context?.user.bankId
  const approvedMembers = members.filter(member => member.bankStatus === 'APPROVED' && member.bankRole)
  const pendingMembers = members.filter(member => member.bankStatus === 'PENDING' && (mainAdmin || member.bankRole !== 'ADMIN'))
  const call = useCallback((path, options) => apiFetch(`/api/bank-team/${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ bankId: activeBank || '' })}`, token, options), [activeBank, token])
  const post = (body, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  useEffect(() => {
    if (!token) return
    let active = true
    apiFetch('/api/bank-team/me', token).then(data => { if (active) { setContext(data); setBankId(current => current || data.banks?.[0]?.id || data.user.bankId || '') } }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [token, revision])
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(1) }, 300); return () => clearTimeout(timer) }, [query])
  useEffect(() => { setSelected([]); setPage(1); setTargetPage(1); setHistoryPage(1); setActiveTarget(null); setReview(null) }, [activeBank, source, search])
  useEffect(() => {
    setAssignment({ employeeId: '', count: 3000, serials: '', mode: 'count', note: '' })
    setTargetForm(emptyTarget); setReviewNotes({}); setSource('UNASSIGNED')
    setNotice(''); setError('')
  }, [activeBank])
  useEffect(() => {
    if (!context) return
    const key = `${requestedBank}:${requestedTab}:${requestedMember}`
    if (navigation.current === key) return
    navigation.current = key
    focusedMember.current = ''
    if (context.user.userRole === 'ADMIN' && context.banks.some(bank => bank.id === requestedBank)) setBankId(requestedBank)
    if (['members', 'devices', 'targets', 'history'].includes(requestedTab)) setTab(requestedTab)
  }, [requestedBank, requestedTab, requestedMember, context])
  useEffect(() => {
    if (tab !== 'members' || !requestedMember || focusedMember.current === requestedMember || !members.some(member => member.id === requestedMember)) return
    const row = document.getElementById(`bank-member-${requestedMember}`)
    if (row) { row.scrollIntoView({ block: 'center' }); focusedMember.current = requestedMember }
  }, [tab, members, requestedMember])
  useEffect(() => {
    if (!approved || !activeBank) return
    const current = ++generation.current
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), q: search, ...(canManage ? { source } : {}) })
    Promise.all([call(`devices?${params}`), call(`targets?page=${targetPage}`), canManage ? call('members') : Promise.resolve([]), tab === 'history' ? call(`history?page=${historyPage}`) : Promise.resolve({ rows: [], total: 0 })]).then(([deviceRows, targetRows, team, events]) => {
      if (current === generation.current) { setDevices(deviceRows); setTargets(targetRows); setMembers(team); setHistory(events) }
    }).catch(err => { if (current === generation.current) setError(err.message) }).finally(() => { if (current === generation.current) setLoading(false) })
    return () => { generation.current++ }
  }, [approved, activeBank, canManage, call, page, source, search, targetPage, tab, historyPage, revision])
  useEffect(() => {
    if (!activeTarget) return
    let active = true
    call(`targets/${activeTarget.id}/completions?page=${reportPage}`).then(data => { if (active) setReports(data) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [activeTarget, call, reportPage, revision])
  async function run(action, message) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await action(); setNotice(message); setRevision(value => value + 1)
      window.dispatchEvent(new Event('bank-team:updated'))
      if (tab === 'members') {
        const notes = await apiFetch('/api/notifications', token).catch(() => null)
        if (Array.isArray(notes)) useNotificationStore.getState().setNotes(notes)
      }
    }
    catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  function prepareAssignment(event) {
    event.preventDefault()
    if (!source) { setError('Choose Unassigned POS or a specific current owner before assigning devices'); return }
    const serialNumbers = assignment.serials.split(/[\n,]+/).map(serial => serial.trim()).filter(Boolean)
    const body = { source, employeeId: assignment.employeeId || null, note: assignment.note.trim(), q: search }
    if (assignment.mode === 'selection') body.deviceIds = selected
    else if (assignment.mode === 'serials') body.serialNumbers = serialNumbers
    else body.count = Number(assignment.count)
    const count = body.deviceIds?.length || body.serialNumbers?.length || body.count
    if (!count || count < 1 || count > 5000) { setError('Choose 1–5,000 devices per batch'); return }
    setReview({ body, count, bankId: activeBank })
  }
  function exportSummary() {
    const rows = [['Employee', 'Target', 'Required', 'Approved', 'Pending review', 'Deadline', 'Status'], ...targets.rows.map(target => [target.employee.name, target.title, target.quantity, target.completed, target.pending, day(target.dueAt), target.status])]
    const csv = rows.map(row => row.map(value => { const cell = String(value ?? ''); return '"' + (/^\s*[=+@-]/.test(cell) ? "'" : '') + cell.replaceAll('"', '""') + '"' }).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'bank-targets-current-page.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!context) return <div className={s.empty} role={error ? 'alert' : 'status'}><h2>{error || 'Loading bank workspace…'}</h2>{error && <button className={s.primary} onClick={() => setRevision(value => value + 1)}>Retry</button>}</div>
  if (!approved) return <div className={s.page}><header className={s.hero}><div><span className={s.eyebrow}>BANK MEMBERSHIP</span><h1>{label(context.user.bankStatus)}</h1><p>{context.user.bankName} · {label(context.user.bankRole)}</p></div></header><section className={`${s.panel} ${s.detailBody}`}><h2 className="text-xl font-semibold">Your bank access is not active yet.</h2><p className={s.threadHelp}>{context.user.bankRole === 'ADMIN' ? 'The IMS admin must verify and approve your Bank Admin request.' : 'Your bank admin must approve your registration before you can see bank data.'} Suspended or rejected accounts need an authorized admin to restore access.</p><button className={s.primary} disabled={busy} onClick={() => run(async () => { await refreshSession() }, 'Membership status refreshed')}>Refresh membership status</button></section>{notice && <p role="status">{notice}</p>}</div>
  return <div className={s.page}>
    <header className={s.hero}><div><span className={s.eyebrow}>BANK OPERATIONS / PEOPLE & RESPONSIBILITY</span><h1>{mainAdmin ? 'Bank administration' : `${context.user.bankName} workspace`}</h1><p>Named POS responsibility. Clear targets. Verified progress.</p></div><div className={s.actions}>{mainAdmin && <label className={s.field}><span>Manage bank</span><select disabled={busy} value={bankId} onChange={event => setBankId(event.target.value)}>{context.banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>}<button className={s.secondary} disabled={loading || busy} onClick={() => setRevision(value => value + 1)}><Icon name="refresh" size={16}/>Refresh</button></div></header>
    {error && <div role="alert" className={s.error}>{error}<button onClick={() => setError('')}>Dismiss</button></div>}{notice && <div role="status" className={s.success}>{notice}</div>}
    {!activeBank ? <section className={`${s.panel} ${s.detailBody}`}><h2>Select or configure a bank first</h2><p className={s.threadHelp}>The IMS admin can create banks in Hardware → Banks, then link or approve bank members here.</p></section> : <>
    <div className={b.metrics}><div><span>{canManage ? 'Matching POS' : 'My matching POS'}</span><strong>{devices.total.toLocaleString()}</strong></div><div><span>{canManage ? 'Bank assigned POS' : 'My assigned POS'}</span><strong>{devices.assigned.toLocaleString()}</strong></div><div><span>Targets</span><strong>{targets.total}</strong></div><div><span>My access</span><strong className={b.role}>{mainAdmin ? 'IMS Admin' : label(context.user.bankRole || 'Legacy bank user')}</strong></div></div>
    <nav className={b.tabs} aria-label="Bank workspace sections">{[...(canManage ? [['members', 'Team members']] : []), ['devices', canManage ? 'POS responsibility' : 'My POS'], ['targets', 'Targets & progress'], ['history', 'Assignment history']].map(([value, title]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{title}</button>)}</nav>
    {canApprove && pendingMembers.length > 0 && <div role="status" className={s.success}><div><strong>{pendingMembers.length} membership {pendingMembers.length === 1 ? 'request needs' : 'requests need'} approval</strong><p>Review registered users for this bank before granting access.</p></div><button className={s.secondary} onClick={() => setTab('members')}>Review requests</button></div>}
    {tab === 'members' && <section className={s.panel}><div className={s.listHeader}><div><h2>People in this bank</h2><p>Only registered members of the selected bank are listed. Bank Admin appointments require the IMS admin.</p></div></div><div className={b.tableScroll}><table className={b.table}><thead><tr><th>Member</th><th>Assigned POS</th><th>Bank role</th><th>Approval status</th><th>Action</th></tr></thead><tbody>{members.map(member => canApprove && member.id !== context.user.id ? <Member key={`${member.id}-${member.bankVersion}`} member={member} mainAdmin={mainAdmin} busy={busy} onSave={(row, role, status) => run(() => call(`members/${row.id}`, post({ bankRole: role, bankStatus: status, version: row.bankVersion }, 'PATCH')), 'Membership updated')}/> : <tr key={member.id}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{member.assigned}</td><td>{label(member.bankRole || 'Legacy')}</td><td>{label(member.bankStatus)}</td><td>{member.id === context.user.id ? 'Your account' : 'Bank admin manages membership'}</td></tr>)}</tbody></table></div>{!members.length && <div className={s.empty}>No bank members yet. Ask employees to register with this bank.</div>}</section>}
    {tab === 'devices' && <><section className={s.panel}><div className={s.listHeader}><div><h2>{canManage ? 'POS responsibility register' : 'Your assigned terminals'}</h2><p>{loading ? 'Refreshing…' : `${devices.total.toLocaleString()} matching terminals`} · 50 per page</p></div><Link href="/hardware" className={s.secondary}>Hardware details</Link></div><div className={b.filters}><input type="search" aria-label="Search bank POS" placeholder="Serial, TID, merchant or location" value={query} onChange={event => setQuery(event.target.value)}/>{canManage && <select aria-label="Current POS owner" value={source} onChange={event => setSource(event.target.value)}><option value="">All bank POS</option><option value="UNASSIGNED">Unassigned POS</option>{members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.assigned} POS</option>)}</select>}</div><div className={b.tableScroll}><table className={b.table}><thead><tr>{canManage && <th><input type="checkbox" aria-label="Select this page" checked={!!devices.rows.length && devices.rows.every(row => selected.includes(row.id))} onChange={event => setSelected(event.target.checked ? devices.rows.map(row => row.id) : [])}/></th>}<th>POS serial / TID</th><th>Merchant / location</th><th>Current responsibility</th><th>Status</th></tr></thead><tbody>{devices.rows.map(row => <tr key={row.id}>{canManage && <td><input type="checkbox" aria-label={`Select ${row.serialNumber}`} checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))}/></td>}<td><Link className={b.link} href={`/hardware/${row.id}`}>{row.serialNumber}</Link><small>{row.tid || 'No TID'}</small></td><td>{row.merchant || '—'}<small>{row.location}</small></td><td>{row.bankAssignment?.employee.name || 'Unassigned'}</td><td>{label(row.status)}</td></tr>)}</tbody></table></div>{!devices.rows.length && <p className={s.empty}>{loading ? 'Loading POS…' : 'No POS matches. Try another owner or search.'}</p>}<Pager page={page} total={devices.total} size={50} setPage={value => { setPage(value); setSelected([]) }}/></section>
      {canManage && <form onSubmit={prepareAssignment} className={s.createForm}><div className={s.sectionHeader}><div><h2>Assign or transfer responsibility</h2><p>Every device has one current owner. Assignment history is retained.</p></div></div><fieldset disabled={busy} className={s.detailBody}><div className={s.fieldGrid}><label className={s.field}><span>Recipient</span><select value={assignment.employeeId} onChange={event => setAssignment(current => ({ ...current, employeeId: event.target.value }))}><option value="">Remove responsibility (unassign)</option>{approvedMembers.filter(member => member.id !== source).map(member => <option key={member.id} value={member.id}>{member.name} · {label(member.bankRole)}</option>)}</select></label><label className={s.field}><span>Selection method</span><select value={assignment.mode} onChange={event => setAssignment(current => ({ ...current, mode: event.target.value }))}><option value="count">Exact count from current filter</option><option value="selection">Checked devices ({selected.length})</option><option value="serials">Paste exact serial numbers</option></select></label>{assignment.mode === 'count' && <label className={s.field}><span>Device count *</span><input type="number" min="1" max="5000" required value={assignment.count} onChange={event => setAssignment(current => ({ ...current, count: Number(event.target.value) }))}/><small>First N matching serials in ascending order. Example: 3,000 from 12,000 unassigned POS.</small></label>}{assignment.mode === 'serials' && <label className={`${s.field} ${s.wide}`}><span>Exact serials *</span><textarea required maxLength={250000} rows={5} placeholder="One serial per line, or comma-separated" value={assignment.serials} onChange={event => setAssignment(current => ({ ...current, serials: event.target.value }))}/></label>}<label className={`${s.field} ${s.wide}`}><span>Assignment / transfer note *</span><textarea required rows={2} maxLength={1000} value={assignment.note} onChange={event => setAssignment(current => ({ ...current, note: event.target.value }))} placeholder="e.g. Dhaka North merchant portfolio for November"/></label></div><div className={b.formActions}><button className={s.primary} disabled={loading || busy}>Review assignment<Icon name="arrow" size={16}/></button></div></fieldset></form>}
    </>}
    {tab === 'targets' && <>
      {canManage && <form className={s.createForm} onSubmit={event => { event.preventDefault(); run(async () => { await call('targets', post({ ...targetForm, quantity: Number(targetForm.quantity) })); setTargetForm(emptyTarget) }, 'Target created') }}><div className={s.sectionHeader}><div><h2>Create a measurable target</h2><p>Only approved completion reports count. Dates use Bangladesh time.</p></div></div><fieldset className={s.detailBody} disabled={busy}><div className={s.fieldGrid}><label className={s.field}><span>Employee *</span><select required value={targetForm.employeeId} onChange={event => setTargetForm(current => ({ ...current, employeeId: event.target.value }))}><option value="">Select an approved employee</option>{approvedMembers.filter(member => member.bankRole !== 'VIEWER').map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className={s.field}><span>Visit / service objective *</span><input required maxLength={200} value={targetForm.title} onChange={event => setTargetForm(current => ({ ...current, title: event.target.value }))} placeholder="e.g. Monthly POS service visits"/></label><label className={s.field}><span>POS quantity *</span><input type="number" min="1" max="100000" required value={targetForm.quantity} onChange={event => setTargetForm(current => ({ ...current, quantity: event.target.value }))}/></label><div className={b.dateFields}><label className={s.field}><span>Starts *</span><input type="date" required value={targetForm.from} onChange={event => setTargetForm(current => ({ ...current, from: event.target.value }))}/></label><label className={s.field}><span>Deadline *</span><input type="date" required min={targetForm.from} value={targetForm.until} onChange={event => setTargetForm(current => ({ ...current, until: event.target.value }))}/></label></div></div><div className={b.formActions}><button className={s.primary}>Create target</button></div></fieldset></form>}
      <section className={s.panel}><div className={s.listHeader}><div><h2>Targets & verified progress</h2><p>Approval prevents a duplicate POS report from inflating the target.</p></div><button className={s.secondary} disabled={!targets.rows.length} onClick={exportSummary}>Export this page</button></div><div className={b.targetGrid}>{targets.rows.map(target => <article key={target.id} className={b.target}><div className={b.targetTop}><span>{target.employee.name}</span><span>{target.status === 'CLOSED' ? 'Closed' : new Date(target.dueAt) < new Date() ? 'Past deadline' : 'Active'}</span></div><h3>{target.title}</h3><strong>{target.completed}<small> / {target.quantity.toLocaleString()} POS</small></strong><progress max={target.quantity} value={Math.min(target.completed, target.quantity)} aria-label={`${target.title} completion`}/><p>{target.pending} awaiting review · {Math.max(0, target.quantity - target.completed)} remaining</p><p>{day(target.startsAt)} → {day(target.dueAt)}</p><div className={s.actions}><button className={s.secondary} onClick={() => { setActiveTarget(target); setReportPage(1); setReports({ rows: [], total: 0 }); setReportForm({ serial: '', note: '' }) }}>Open reports</button>{canManage && target.status === 'ACTIVE' && <button className={s.secondary} disabled={busy} onClick={() => run(() => call(`targets/${target.id}/close`, post({}, 'PATCH')), 'Target closed')}>Close target</button>}</div></article>)}</div>{!targets.rows.length && <p className={s.empty}>No targets yet.</p>}<Pager page={targetPage} total={targets.total} size={20} setPage={setTargetPage}/></section>
      {activeTarget && <section className={s.panel}><div className={s.listHeader}><div><h2>{activeTarget.title}: work reports</h2><p>Reports after the deadline are marked late. Rejected work can be corrected and resubmitted.</p></div><button className={s.secondary} onClick={() => setActiveTarget(null)}>Close reports</button></div>{activeTarget.employeeId === context.user.id && context.user.bankRole !== 'VIEWER' && activeTarget.status === 'ACTIVE' && <form className={s.detailBody} onSubmit={event => { event.preventDefault(); run(async () => { const result = await call(`devices?${new URLSearchParams({ q: reportForm.serial.trim() })}`); const device = result.rows.find(row => row.serialNumber === reportForm.serial.trim()); if (!device) throw new Error('Enter an exact serial currently assigned to you'); await call(`targets/${activeTarget.id}/completions`, post({ deviceId: device.id, note: reportForm.note })); setReportForm({ serial: '', note: '' }) }, 'Completion submitted for review') }}><div className={s.fieldGrid}><label className={s.field}><span>Your assigned POS serial *</span><input required value={reportForm.serial} onChange={event => setReportForm(current => ({ ...current, serial: event.target.value }))}/></label><label className={s.field}><span>Work completed *</span><textarea required maxLength={2000} rows={2} value={reportForm.note} onChange={event => setReportForm(current => ({ ...current, note: event.target.value }))}/></label></div><div className={b.formActions}><button className={s.primary} disabled={busy}>Submit completed work</button></div></form>}<div className={b.tableScroll}><table className={b.table}><thead><tr><th>POS serial</th><th>Work / submitted</th><th>Review</th><th>Decision</th></tr></thead><tbody>{reports.rows.map(row => <tr key={row.id}><td><strong>{row.serialNumber}</strong>{new Date(row.createdAt) > new Date(activeTarget.dueAt) && <small className="text-amber-700">Late submission</small>}</td><td className={b.wrap}>{row.note}<small>{day(row.createdAt)}</small></td><td>{label(row.status)}<small>{row.reviewNote}</small></td><td>{canManage && activeTarget.employeeId !== context.user.id && row.status === 'PENDING' ? <div className={b.reviewActions}><input aria-label={`Review note for ${row.serialNumber}`} placeholder="Review note (required to reject)" maxLength={1000} value={reviewNotes[row.id] || ''} onChange={event => setReviewNotes(current => ({ ...current, [row.id]: event.target.value }))}/>{['APPROVED', 'REJECTED'].map(status => <button className={s.secondary} key={status} disabled={busy} onClick={() => run(() => call(`targets/${activeTarget.id}/completions/${row.id}`, post({ status, note: reviewNotes[row.id] || '' }, 'PATCH')), 'Completion reviewed')}>{status === 'APPROVED' ? 'Approve' : 'Reject'}</button>)}</div> : row.reviewedAt ? day(row.reviewedAt) : 'Awaiting manager review'}</td></tr>)}</tbody></table></div>{!reports.rows.length && <p className={s.empty}>No completion reports for this target.</p>}<Pager page={reportPage} total={reports.total} size={50} setPage={setReportPage}/></section>}
    </>}
    {tab === 'history' && <section className={s.panel}><div className={s.listHeader}><div><h2>Responsibility history</h2><p>Assignments and transfers are recorded per physical POS.</p></div></div><div className={b.tableScroll}><table className={b.table}><thead><tr><th>POS serial</th><th>Action</th><th>Recipient</th><th>Note</th><th>Date</th></tr></thead><tbody>{history.rows.map(row => <tr key={row.id}><td>{row.serialNumber}</td><td>{label(row.action)}</td><td>{row.employeeName || 'Unassigned'}</td><td className={b.wrap}>{row.note}</td><td>{day(row.createdAt)}</td></tr>)}</tbody></table></div>{!history.rows.length && <p className={s.empty}>No assignment history yet.</p>}<Pager page={historyPage} total={history.total} size={50} setPage={setHistoryPage}/></section>}
    </>}
    {review && <Modal title="Review POS responsibility change" busy={busy} onClose={() => setReview(null)}><div className="space-y-4 text-sm text-slate-600"><p><strong>{review.count.toLocaleString()} specific POS devices</strong> will {review.body.employeeId ? `be assigned to ${members.find(member => member.id === review.body.employeeId)?.name || 'the selected employee'}` : 'become unassigned'}.</p><p>Current owner: <strong>{source === 'UNASSIGNED' ? 'Unassigned' : members.find(member => member.id === source)?.name}</strong></p><p>{assignment.mode === 'count' ? 'This selects the first matching serials in ascending order from the current bank and filter.' : 'Only the selected IDs or exact serial numbers will change.'} All records must still belong to the selected bank and owner.</p><p>Note: {review.body.note}</p><div className={s.actions}><button className={s.secondary} disabled={busy} onClick={() => setReview(null)}>Cancel</button><button className={s.primary} disabled={busy || review.bankId !== activeBank} onClick={() => run(async () => { const result = await call('assignments', post(review.body)); setReview(null); setSelected([]); setAssignment(current => ({ ...current, serials: '', note: '' })); setNotice(`${result.count} POS responsibility records updated`) }, 'POS responsibility updated')}>{busy ? 'Updating devices…' : 'Confirm responsibility change'}</button></div></div></Modal>}
  </div>
}
