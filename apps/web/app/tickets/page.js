'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'
import { Icon, label } from '../../components/inventory/shared'
import s from '../../components/TicketDesk.module.css'

const empty = { title: '', bankName: '', tidNumber: '', posSerial: '', zoneName: '', serviceType: '', customServiceType: '', merchantAddress: '', priority: 'NORMAL', description: '' }
const statuses = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']
const services = ['Installation', 'Maintenance', 'Repair', 'Replacement', 'Network issue', 'POS not working', 'Paper roll issue', 'Settlement issue', 'Others']
function Field({ title, hint, wide, children }) { return <label className={`${s.field} ${wide ? s.wide : ''}`}><span>{title}</span>{children}{hint && <small>{hint}</small>}</label> }
function Status({ value }) { return <span className={`${s.badge} ${value === 'COMPLETED' ? s.green : value === 'IN_PROGRESS' ? s.blue : value === 'ASSIGNED' ? s.purple : s.amber}`}>{label(value)}</span> }

export default function TicketsPage() {
  const token = useAuthStore(state => state.accessToken)
  const user = useAuthStore(state => state.user)
  const role = user?.userRole
  const isBank = role === 'BANK'
  const canCreate = ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT'].includes(role) && user?.bankRole !== 'VIEWER'
  const bankName = String(user?.bankName || (isBank ? user?.name : '') || '').trim()
  const [tickets, setTickets] = useState([])
  const [options, setOptions] = useState({ banks: [], serviceTypes: services })
  const [form, setForm] = useState(empty)
  const [posOptions, setPosOptions] = useState([])
  const [posOpen, setPosOpen] = useState(false)
  const [posBusy, setPosBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  const submitLock = useRef(false)
  const formRef = useRef(null)
  const loadVersion = useRef(0)
  const load = useCallback(async () => {
    if (!token) return
    const version = ++loadVersion.current
    const rows = await apiFetch('/api/tickets', token)
    if (version === loadVersion.current) { setTickets(rows); setLoading(false) }
  }, [token])
  useEffect(() => { if (canCreate && new URLSearchParams(window.location.search).get('new') === '1') setOpen(true) }, [canCreate])
  useEffect(() => { if (open) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [open])
  useEffect(() => {
    let active = true
    const refresh = () => load().catch(err => { if (active) { setError(err.message); setLoading(false) } })
    refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 30000)
    return () => { active = false; loadVersion.current++; clearInterval(timer) }
  }, [load])
  useEffect(() => {
    if (!token) return
    let active = true
    apiFetch('/api/tickets/options', token).then(data => { if (active) setOptions(data) }).catch(err => { if (active) setError(`Ticket options could not load: ${err.message}`) })
    return () => { active = false }
  }, [token])
  useEffect(() => {
    const bank = isBank ? bankName : form.bankName
    if (!token || !bank) { setPosOptions([]); return }
    let active = true
    const timer = setTimeout(async () => {
      setPosBusy(true)
      try {
        const rows = await apiFetch(`/api/pos-serials?${new URLSearchParams({ bankName: bank, q: form.posSerial, take: '30' })}`, token)
        if (active) setPosOptions(rows)
      } catch { if (active) setPosOptions([]) }
      finally { if (active) setPosBusy(false) }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [token, isBank, bankName, form.bankName, form.posSerial])
  async function create(event) {
    event.preventDefault()
    if (submitLock.current) return
    submitLock.current = true; setBusy(true); setError(''); setCreated(null)
    const { customServiceType, ...fields } = form
    try {
      const ticket = await apiFetch('/api/tickets', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, bankName: isBank ? bankName : form.bankName, serviceType: form.serviceType === 'Others' ? customServiceType : form.serviceType }) })
      setCreated(ticket); setOpen(false); setForm(empty); setPosOpen(false); setPosOptions([])
      loadVersion.current++
      setTickets(current => [ticket, ...current.filter(row => row.id !== ticket.id)])
    } catch (err) { setError(err.message) }
    finally { submitLock.current = false; setBusy(false) }
  }
  const filtered = useMemo(() => tickets.filter(ticket => (status === 'ALL' || ticket.status === status) && [ticket.ticketNo, ticket.title, ticket.bankName, ticket.tidNumber, ticket.posSerial, ticket.zoneName, ticket.merchantAddress, ticket.serviceType].join(' ').toLowerCase().includes(query.trim().toLowerCase())), [tickets, status, query])
  const counts = Object.fromEntries(statuses.map(value => [value, tickets.filter(ticket => ticket.status === value).length]))
  const change = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  return <Layout><div className={s.page}>
    <header className={s.hero}><div><span className={s.eyebrow}>SERVICE DESK / BANK OPERATIONS</span><h1>A clearer path to resolution.</h1><p>{isBank ? 'Raise a request, stay in touch, and follow every update.' : 'Manage bank requests, assign engineers, and keep everyone informed.'}</p></div><div className={s.actions}>{['BANK', 'ADMIN'].includes(role) && <Link className={s.secondary} href="/support"><Icon name="arrow" size={16}/>{isBank ? 'Message admin' : 'Private inbox'}</Link>}{canCreate && <button type="button" aria-expanded={open} className={s.primary} onClick={() => setOpen(value => !value)}><Icon name={open ? 'close' : 'plus'} size={18}/>{open ? 'Close form' : 'New ticket'}</button>}</div></header>
    <section className={s.stats} aria-label="Ticket summary">{[['ALL', 'All requests', tickets.length], ['SUBMITTED', 'Awaiting assignment', counts.SUBMITTED], ['ASSIGNED', 'Engineer assigned', counts.ASSIGNED], ['IN_PROGRESS', 'In progress', counts.IN_PROGRESS], ['COMPLETED', 'Resolved', counts.COMPLETED]].map(([value, title, count]) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)} className={`${s.stat} ${status === value ? s.selectedStat : ''}`}><span>{title}</span><strong>{loading ? '—' : count}</strong><span className={s.statFoot}>View requests <Icon name="arrow" size={13}/></span></button>)}</section>
    {error && <div role="alert" className={s.error}>{error}<button type="button" onClick={() => { setError(''); load().catch(err => setError(err.message)) }}>Retry</button></div>}
    {created && <div role="status" className={s.success}><Icon name="check"/><div><strong>{created.ticketNo} is submitted</strong><p>Your request is ready for admin review.</p></div><Link href={`/tickets/${created.id}`}>Track ticket →</Link></div>}
    {open && <form ref={formRef} onSubmit={create} className={s.createForm}>
      <div className={s.sectionHeader}><div><span className={s.eyebrow}>NEW SERVICE REQUEST</span><h2>Tell us what needs attention</h2><p>Fields marked * are required. Add details to help the engineer prepare.</p></div><span className={s.formTag}>Assigned and tracked</span></div>
      <fieldset disabled={busy} className={s.formFields}>
        <section className={s.formSection}><div className={s.sectionNumber}>01</div><div className={s.sectionContent}><h3>Terminal & location</h3><p>Identify the bank terminal that needs service.</p><div className={s.fieldGrid}>
          <Field title="Bank *"><select required disabled={isBank} value={isBank ? bankName : form.bankName} onChange={event => { setForm(current => ({ ...current, bankName: event.target.value, posSerial: '' })); setPosOptions([]) }}><option value="">Select a bank</option>{[...new Set([...(options.banks || []), ...(bankName ? [bankName] : [])])].map(bank => <option key={bank}>{bank}</option>)}</select></Field>
          <div className={s.posField} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPosOpen(false) }}><Field title="POS serial *" hint="Select a terminal or enter its serial manually."><input required autoComplete="off" maxLength={150} disabled={!(isBank ? bankName : form.bankName)} value={form.posSerial} onFocus={() => setPosOpen(true)} onChange={event => { change('posSerial')(event); setPosOpen(true) }} placeholder="Search or enter a serial" aria-expanded={posOpen} aria-controls="ticket-pos-options"/></Field>{posOpen && <div id="ticket-pos-options" className={s.posOptions}>{posOptions.map(pos => <button type="button" key={pos.id || pos.serialNumber} onClick={() => { setForm(current => ({ ...current, posSerial: pos.serialNumber })); setPosOpen(false) }}><strong>{pos.serialNumber}</strong><span>{[pos.model, pos.location].filter(Boolean).join(' · ')}</span></button>)}{!posOptions.length && <p>{posBusy ? 'Searching terminals…' : 'No match. You can enter the serial above.'}</p>}</div>}</div>
          <Field title="TID number"><input value={form.tidNumber} onChange={change('tidNumber')} maxLength={150} placeholder="e.g. 12345678"/></Field><Field title="Zone / branch"><input value={form.zoneName} onChange={change('zoneName')} maxLength={200} placeholder="e.g. Dhaka North"/></Field><Field title="Merchant address" wide><input value={form.merchantAddress} onChange={change('merchantAddress')} maxLength={1000} placeholder="Merchant name, road and area"/></Field>
        </div></div></section>
        <section className={s.formSection}><div className={s.sectionNumber}>02</div><div className={s.sectionContent}><h3>Issue & service</h3><p>A short summary helps the team understand the problem.</p><div className={s.fieldGrid}>
          <Field title="Issue title" wide hint="Optional — the terminal reference is used if left blank."><input value={form.title} onChange={change('title')} maxLength={200} placeholder="e.g. POS cannot connect to the network"/></Field><Field title="Service type"><select value={form.serviceType} onChange={change('serviceType')}><option value="">Choose a service</option>{(options.serviceTypes?.length ? options.serviceTypes : services).map(type => <option key={type}>{type}</option>)}</select></Field>
          {form.serviceType === 'Others' && <Field title="Describe the service *"><input required maxLength={200} value={form.customServiceType} onChange={change('customServiceType')} placeholder="What service do you need?"/></Field>}
          <Field title="Problem details" wide><textarea rows={4} maxLength={6000} value={form.description} onChange={change('description')} placeholder="What happened? Include the error message, when it started, and what you have tried."/></Field>
        </div></div></section>
        <section className={s.formSection}><div className={s.sectionNumber}>03</div><div className={s.sectionContent}><h3>How urgent is it?</h3><p>Choose the priority that matches the impact.</p><div className={s.priorities}>{[['NORMAL', 'Normal', 'Routine service request'], ['HIGH', 'High', 'Service is affected'], ['URGENT', 'Urgent', 'Immediate attention needed']].map(([value, title, help]) => <button key={value} type="button" aria-pressed={form.priority === value} className={form.priority === value ? s.chosenPriority : ''} onClick={() => setForm(current => ({ ...current, priority: value }))}><strong>{title}</strong><small>{help}</small></button>)}</div></div></section>
      </fieldset>
      <footer className={s.formFooter}><p>You can add more information after submitting.</p><div className={s.actions}><button type="button" disabled={busy} className={s.secondary} onClick={() => setOpen(false)}>Keep draft & close</button><button type="submit" disabled={busy} className={s.primary}>{busy ? 'Submitting…' : 'Submit request'}<Icon name="arrow" size={17}/></button></div></footer>
    </form>}
    <section className={s.panel}><div className={s.listHeader}><div><h2>Service requests</h2><p>{filtered.length} matching requests · select a ticket to see updates</p></div><button type="button" className={s.secondary} onClick={() => load().catch(err => setError(err.message))}><Icon name="refresh" size={16}/>Refresh</button></div><div className={s.filters}><label className={s.search}><Icon name="search" size={18}/><input type="search" aria-label="Search service requests" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ticket, POS serial, TID or merchant…"/></label><select aria-label="Filter ticket status" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div>
      <div>{filtered.map(ticket => <Link key={ticket.id} className={s.ticketCard} href={`/tickets/${ticket.id}`}><div className={s.ticketIcon}><Icon name="file" size={20}/></div><div className={s.ticketMain}><div className={s.ticketHeading}><strong>{ticket.ticketNo}</strong><Status value={ticket.status}/>{['HIGH', 'URGENT'].includes(ticket.priority) && <span className={s.urgent}>{label(ticket.priority)}</span>}</div><h3>{ticket.title}</h3><p>{ticket.bankName} · {ticket.serviceType || 'General service'} · {ticket.posSerial || ticket.tidNumber || 'No terminal reference'}</p></div><div className={s.ticketMeta}><span>{ticket.workspace?.assignedEmployee?.name || 'Awaiting engineer'}</span><time>{new Date(ticket.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</time></div><Icon name="arrow" size={18}/></Link>)}{!filtered.length && <div className={s.empty}><Icon name={loading ? 'clock' : 'file'} size={32}/><h3>{loading ? 'Loading requests…' : query || status !== 'ALL' ? 'No matching requests' : 'Your first request starts here'}</h3><p>{loading ? 'Fetching the latest ticket updates.' : query || status !== 'ALL' ? 'Try another search or status filter.' : 'Create a ticket to get service and track it from start to finish.'}</p>{!loading && canCreate && <button type="button" className={s.primary} onClick={() => { setQuery(''); setStatus('ALL'); setOpen(true) }}>Create a ticket</button>}</div>}</div>
    </section>
  </div></Layout>
}
