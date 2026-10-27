'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Layout from '../../../components/Layout'
import { useAuthStore } from '../../../store/useAuthStore'
import { apiFetch } from '../../../lib/api'
import { Icon, label } from '../../../components/inventory/shared'
import s from '../../../components/TicketDesk.module.css'

const steps = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']
const dateTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'
export default function TicketDetail() {
  const { id } = useParams()
  const token = useAuthStore(state => state.accessToken)
  const user = useAuthStore(state => state.user)
  const isStaff = ['ADMIN', 'MANAGEMENT', 'ASSISTANT'].includes(user?.userRole)
  const [ticket, setTicket] = useState(null)
  const [employees, setEmployees] = useState([])
  const [assignment, setAssignment] = useState({ employeeId: '', serviceType: '', note: '', isImportant: false })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const lock = useRef(false)
  const version = useRef(0)
  const load = useCallback(async () => {
    if (!token) return
    const request = ++version.current
    const data = await apiFetch(`/api/tickets/${encodeURIComponent(id)}`, token)
    if (request === version.current) setTicket(data)
  }, [token, id])
  useEffect(() => {
    setTicket(null)
    let active = true
    const refresh = () => load().catch(err => { if (active) setError(err.message) })
    refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 20000)
    return () => { active = false; version.current++; clearInterval(timer) }
  }, [load])
  useEffect(() => {
    if (!isStaff || !token) return
    let active = true
    apiFetch('/api/workspaces/employees', token).then(rows => { if (active) setEmployees(rows.filter(employee => ['EMPLOYEE', 'FIELD_EMPLOYEE'].includes(employee.userRole))) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [isStaff, token])
  async function submitAssignment(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy('assign'); setError(''); setNotice('')
    try {
      await apiFetch(`/api/tickets/${id}/assign`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assignment) })
      setNotice('Engineer assigned. The bank user and engineer have been notified.')
      setAssignment({ employeeId: '', serviceType: '', note: '', isImportant: false })
      await load()
    } catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy('') }
  }
  async function postUpdate(event) {
    event.preventDefault()
    if (lock.current || !message.trim()) return
    lock.current = true; setBusy('update'); setError(''); setNotice('')
    try {
      await apiFetch(`/api/tickets/${id}/updates`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() }) })
      setMessage(''); setNotice('Your update has been added to this ticket.'); await load()
    } catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy('') }
  }
  if (!ticket) return <Layout><div className={s.empty} role={error ? 'alert' : 'status'}><Icon name="file" size={30}/><h3>{error || 'Opening ticket…'}</h3>{error && <button type="button" className={s.primary} onClick={() => { setError(''); load().catch(err => setError(err.message)) }}>Retry</button>}<Link href="/tickets">Back to tickets</Link></div></Layout>
  const peer = user?.userRole === 'ADMIN' && ticket.bankUser?.userRole === 'BANK' ? ticket.bankUserId : user?.userRole === 'BANK' && ticket.assignedAdmin?.userRole === 'ADMIN' ? ticket.assignedAdminId : ''
  const supportQuery = new URLSearchParams({ ticket: ticket.id, ...(peer ? { contact: peer } : {}) })
  const progress = steps.indexOf(ticket.status)
  const details = [['Bank', ticket.bankName], ['Raised by', ticket.bankUser?.name], ['POS serial', ticket.posSerial], ['TID number', ticket.tidNumber], ['Zone / branch', ticket.zoneName], ['Service type', ticket.serviceType], ['Priority', label(ticket.priority)], ['Merchant address', ticket.merchantAddress], ['Assigned engineer', ticket.workspace?.assignedEmployee?.name || 'Awaiting assignment'], ['Submitted', dateTime(ticket.createdAt)]]
  return <Layout><div className={s.page}>
    <Link href="/tickets" className={s.backLink}>← Back to service requests</Link>
    <header className={s.hero}><div><span className={s.eyebrow}>{ticket.ticketNo}</span><h1>{ticket.title}</h1><p>{ticket.bankName} · Submitted {dateTime(ticket.createdAt)}</p></div><div className={s.actions}><span className={`${s.badge} ${ticket.status === 'COMPLETED' ? s.green : ticket.status === 'IN_PROGRESS' ? s.blue : s.amber}`}>{label(ticket.status)}</span>{['BANK', 'ADMIN'].includes(user?.userRole) && <Link className={s.secondary} href={`/support?${supportQuery}`}>{user.userRole === 'BANK' ? 'Message admin privately' : 'Message bank user' }<Icon name="arrow" size={16}/></Link>}{isStaff && ticket.workspace && <Link className={s.primary} href={`/workspaces/${ticket.workspace.id}`}>Open field task<Icon name="arrow" size={16}/></Link>}</div></header>
    {notice && <div role="status" className={s.success}><Icon name="check"/>{notice}</div>}{error && <div role="alert" className={s.error}>{error}</div>}
    <div className={s.detailGrid}><div className={s.detailStack}>
      <section className={s.panel}><div className={s.listHeader}><div><h2>Request details</h2><p>The terminal, location and service information</p></div><Icon name="file"/></div><div className={s.detailBody}><dl className={s.detailValues}>{details.map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>{ticket.description && <p className={s.description}>{ticket.description}</p>}</div><div className={s.steps} aria-label="Ticket progress">{steps.map((value, index) => <div key={value} className={`${s.step} ${index <= progress ? s.stepDone : ''}`} aria-current={value === ticket.status ? 'step' : undefined}><b>{index < progress ? '✓' : index + 1}</b><span>{label(value)}</span></div>)}</div></section>
      <section className={s.panel}><div className={s.listHeader}><div><h2>Updates & activity</h2><p>Service history shared with the ticket participants</p></div><span className={s.count}>{ticket.updates?.length || 0} updates</span></div><div className={s.detailBody}><div className={s.timeline}>{ticket.updates?.map(update => <article key={update.id} className={s.event}><div className={s.eventHeader}><strong>{update.user?.name || 'Team member'}</strong><time>{dateTime(update.createdAt)}</time></div><div className={s.eventType}>{label(update.type)}</div><p>{update.message}</p></article>)}</div>{!ticket.updates?.length && <p className={s.threadHelp}>Updates will appear here as work progresses.</p>}</div></section>
    </div><aside className={s.aside}>
      {user?.bankRole !== 'VIEWER' && <form onSubmit={postUpdate} className={s.panel}><div className={s.detailBody}><h3>Add an update</h3><p className={s.threadHelp}>Share more information or ask about progress. This update is visible to the ticket participants.</p><label className={s.field}><span>Your update</span><textarea required maxLength={6000} rows={5} value={message} onChange={event => setMessage(event.target.value)} placeholder="Add a detail, question or follow-up…"/></label><button type="submit" disabled={!!busy || !message.trim()} className={s.primary}>{busy === 'update' ? 'Posting…' : 'Post update'}<Icon name="arrow" size={16}/></button></div></form>}
      {isStaff && <form onSubmit={submitAssignment} className={s.panel}><fieldset disabled={!!busy} className={s.detailBody}><h3>{ticket.workspace ? 'Reassign engineer' : 'Assign an engineer'}</h3><label className={s.field}><span>Engineer *</span><select required value={assignment.employeeId} onChange={event => setAssignment(current => ({ ...current, employeeId: event.target.value }))}><option value="">Choose an engineer</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className={s.field}><span>Assigned work</span><input value={assignment.serviceType} onChange={event => setAssignment(current => ({ ...current, serviceType: event.target.value }))} maxLength={200} placeholder={ticket.serviceType || 'Describe the assigned service'}/></label><label className={s.field}><span>Instructions</span><textarea value={assignment.note} onChange={event => setAssignment(current => ({ ...current, note: event.target.value }))} rows={3} maxLength={6000} placeholder="Useful instructions for the engineer"/></label><label className={s.threadHelp}><input type="checkbox" checked={assignment.isImportant} onChange={event => setAssignment(current => ({ ...current, isImportant: event.target.checked }))}/> Mark as important</label><button type="submit" className={s.primary}>{busy === 'assign' ? 'Assigning…' : 'Assign engineer'}</button></fieldset></form>}
      <section className={s.panel}><div className={s.detailBody}><h3>What happens next?</h3><p className={s.threadHelp}>Admin reviews your request and assigns an engineer. Progress and completion updates appear in this timeline.</p><p className={s.threadHelp}>For a personal conversation, use the private inbox. For service details, keep updates on this ticket.</p></div></section>
    </aside></div>
  </div></Layout>
}
