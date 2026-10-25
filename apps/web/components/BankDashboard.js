"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'
import { apiFetch } from '../lib/api'
import { Icon, label } from './inventory/shared'
import { ticketSummary, filterTickets, ticketCsv } from '../lib/bankDashboard.mjs'
import s from './BankDashboard.module.css'

const statuses = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED']
const colors = ['#f59e0b', '#818cf8', '#38bdf8', '#14b8a6']
const date = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
function Status({ value }) {
  const tone = ['COMPLETED', 'DEPLOYED', 'REPAIRED'].includes(value) ? s.green : ['FAULTY', 'URGENT', 'HIGH'].includes(value) ? s.red : ['SUBMITTED', 'UNDER_REPAIR'].includes(value) ? s.amber : s.blue
  return <span className={`${s.badge} ${tone}`}>{label(value)}</span>
}
function Empty({ children }) { return <div className={s.empty}><Icon name="box" size={28}/><p>{children}</p></div> }

export default function BankDashboard() {
  const user = useAuthStore(state => state.user)
  const token = useAuthStore(state => state.accessToken)
  const router = useRouter()
  const [tickets, setTickets] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [devices, setDevices] = useState(null)
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [updated, setUpdated] = useState(null)
  const [range, setRange] = useState('ALL')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [posQuery, setPosQuery] = useState('')
  const requestId = useRef(0)
  const pending = useRef(false)

  const load = useCallback(async () => {
    if (!token || pending.current) return
    pending.current = true
    const id = ++requestId.current
    setBusy(true)
    const results = await Promise.allSettled([
      apiFetch('/api/tickets', token),
      apiFetch('/api/hardware/summary', token),
      apiFetch('/api/hardware?page=1', token)
    ])
    pending.current = false
    if (id !== requestId.current) return
    const failures = []
    const setters = [setTickets, setInventory, setDevices]
    const names = ['Tickets', 'POS overview', 'POS records']
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') setters[index](result.value)
      else failures.push(`${names[index]}: ${result.reason?.message || 'Unable to load'}`)
    })
    setErrors(failures)
    if (!failures.length) setUpdated(new Date())
    setBusy(false)
  }, [token])

  useEffect(() => {
    pending.current = false
    load()
    const timer = setInterval(load, 45000)
    return () => { clearInterval(timer); requestId.current++ }
  }, [load])

  const periodTickets = useMemo(() => filterTickets(tickets || [], { range }), [tickets, range])
  const visibleTickets = useMemo(() => filterTickets(periodTickets, { query, status, urgentOnly }), [periodTickets, query, status, urgentOnly])
  const stats = useMemo(() => ticketSummary(periodTickets), [periodTickets])
  const counts = inventory?.counts || {}
  const completion = stats.total ? Math.round(stats.completed / stats.total * 100) : 0
  const posStatuses = Object.entries(counts).filter(([, count]) => count > 0)
  const needsService = (counts.FAULTY || 0) + (counts.UNDER_REPAIR || 0)
  const alerts = inventory?.alerts || {}
  const metrics = [
    { title: 'Your tickets', value: tickets ? stats.total : '—', note: 'Service requests in selected period', icon: 'file', href: '/tickets', tone: s.blueIcon },
    { title: 'Open tickets', value: tickets ? stats.open : '—', note: tickets ? `${stats.submitted} waiting for assignment` : 'Waiting for ticket data', icon: 'clock', href: '/tickets', tone: s.amberIcon },
    { title: 'Bank POS fleet', value: inventory?.total ?? '—', note: inventory ? `${counts.DEPLOYED || 0} deployed terminals` : 'Waiting for inventory data', icon: 'box', href: '/hardware', tone: s.tealIcon },
    { title: 'POS needing service', value: inventory ? needsService : '—', note: inventory ? `${counts.FAULTY || 0} faulty · ${counts.UNDER_REPAIR || 0} under repair` : 'Waiting for inventory data', icon: 'tool', href: '/hardware', tone: s.roseIcon }
  ]
  function exportTickets() {
    const url = URL.createObjectURL(new Blob(['\ufeff' + ticketCsv(visibleTickets)], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `bank-tickets-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className={s.dashboard} aria-busy={busy}>
    <header className={s.hero}>
      <div className={s.heroContent}>
        <div className={s.eyebrow}><Icon name="bank" size={16}/> BANK OPERATIONS</div>
        <h1>{user?.bankName || user?.name || 'Bank'} dashboard</h1>
        <p>Your service requests and POS fleet, in one place.</p>
        <div className={s.heroMeta}><span className={s.dot}/>{updated ? `Updated ${updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Preparing your overview'}<span>Auto-refresh every 45 seconds</span></div>
      </div>
      <div className={s.heroActions}>
        <Link href="/support" className={s.heroSecondary}><Icon name="arrow"/>Message admin</Link>
        <Link href="/tickets?new=1" className={s.heroPrimary}><Icon name="plus"/>New ticket</Link>
        <button type="button" className={s.heroSecondary} onClick={load} disabled={busy}><Icon name="refresh"/>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </header>

    {errors.length > 0 && <div role="alert" className={s.error}><strong>Some information could not refresh.</strong>{errors.map(error => <div key={error}>{error}</div>)}<button type="button" onClick={load} disabled={busy}>Try again</button></div>}
    <div className={s.toolbar}><div><h2>At a glance</h2><p>Ticket metrics follow the period below. POS counts show the current fleet.</p></div><label className={s.range}>Ticket period<select value={range} onChange={event => setRange(event.target.value)}><option value="ALL">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label></div>
    <section className={s.metrics} aria-label="Key metrics">{metrics.map(metric => <Link key={metric.title} href={metric.href} className={s.metric}><div className={s.metricTop}><span>{metric.title}</span><span className={`${s.metricIcon} ${metric.tone}`}><Icon name={metric.icon}/></span></div><strong>{typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}</strong><p>{metric.note}</p></Link>)}</section>

    <div className={s.overviewGrid}>
      <section className={s.panel}><div className={s.panelHead}><div><h2>Ticket overview</h2><p>Progress of your service requests</p></div><span className={s.kicker}>{periodTickets.length} tickets</span></div>{tickets ? <div className={s.ticketChart}><div className={s.donut} role="img" aria-label={`${completion}% of tickets completed`} style={{ background: `conic-gradient(#14b8a6 ${completion}%, #edf2f7 0)` }}><div><strong>{completion}%</strong><span>Completed</span></div></div><div className={s.legend}>{statuses.map((value, i) => <button key={value} type="button" onClick={() => setStatus(status === value ? 'ALL' : value)} aria-pressed={status === value}><span className={s.legendDot} style={{ background: colors[i] }}/><span>{label(value)}</span><strong>{stats.counts[value] || 0}</strong></button>)}</div></div> : <Empty>{busy ? 'Loading tickets…' : 'Ticket overview unavailable. Retry to load.'}</Empty>}</section>
      <section className={s.panel}><div className={s.panelHead}><div><h2>POS distribution</h2><p>Current inventory by lifecycle status</p></div><Icon name="chart"/></div><div className={s.panelBody}>{inventory ? posStatuses.length ? posStatuses.map(([value, count]) => <div className={s.progressRow} key={value}><div><span>{label(value)}</span><strong>{count.toLocaleString()}</strong></div><div className={s.track}><span style={{ width: `${count / Math.max(1, inventory.total) * 100}%`, background: value === 'FAULTY' ? '#f43f5e' : value === 'UNDER_REPAIR' ? '#f59e0b' : value === 'DEPLOYED' ? '#14b8a6' : '#818cf8' }}/></div></div>) : <Empty>No POS devices assigned to your bank yet.</Empty> : <Empty>{busy ? 'Loading POS overview…' : 'POS overview unavailable.'}</Empty>}</div></section>
      <section className={`${s.panel} ${s.attention}`}><div className={s.panelHead}><div><h2>Needs attention</h2><p>Items to follow up on</p></div><span className={s.attentionIcon}><Icon name="clock"/></span></div><div className={s.panelBody}>
        <button type="button" className={s.alertRow} aria-pressed={urgentOnly} onClick={() => { setStatus('ALL'); setQuery(''); setUrgentOnly(value => !value); document.getElementById('bank-ticket-list')?.scrollIntoView({ behavior: 'smooth' }) }}><div><strong>High priority tickets</strong><span>{urgentOnly ? 'Click to show all priorities' : 'Click to show open high / urgent requests'}</span></div><b>{tickets ? stats.urgent : '—'}</b></button>
        {[['Pending repairs', 'Beyond inventory follow-up threshold', alerts.repairs], ['Pending returns', 'Devices awaiting return confirmation', alerts.returns], ['Warranty expiring', 'Within the next 30 days', alerts.warranty], ['Overdue delivery', 'Reserved / delivered past due date', alerts.overdue]].map(([title, description, count]) => <Link href="/hardware" className={s.alertRow} key={title}><div><strong>{title}</strong><span>{description}</span></div><b>{inventory ? count || 0 : '—'}</b></Link>)}
      </div></section>
    </div>

    <section className={s.panel} id="bank-ticket-list"><div className={s.panelHead}><div><h2>Recent tickets</h2><p>{visibleTickets.length} matching requests · newest first</p></div><div className={s.inlineActions}><button type="button" className={s.button} onClick={exportTickets} disabled={!visibleTickets.length}><Icon name="download" size={16}/>Export</button><Link className={s.textLink} href="/tickets">View all <Icon name="arrow" size={16}/></Link></div></div><div className={s.filters}><label className={s.search}><Icon name="search" size={17}/><input type="search" aria-label="Search tickets" placeholder="Ticket number, TID, serial or merchant…" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter ticket status" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Ticket / service</th><th>Terminal / location</th><th>Assigned engineer</th><th>Priority</th><th>Status</th><th>Raised</th></tr></thead><tbody>{visibleTickets.slice(0, 8).map(ticket => <tr key={ticket.id}><td><Link className={s.serial} href={`/tickets/${ticket.id}`}>{ticket.ticketNo}</Link><span>{ticket.serviceType || ticket.title}</span></td><td><strong>{ticket.tidNumber || ticket.posSerial || '—'}</strong><span title={ticket.merchantAddress}>{ticket.zoneName || ticket.merchantAddress || 'Location not specified'}</span></td><td>{ticket.workspace?.assignedEmployee?.name || ticket.workspaces?.[0]?.assignedEmployee?.name || 'Awaiting assignment'}</td><td><Status value={ticket.priority || 'NORMAL'}/></td><td><Status value={ticket.status}/></td><td className={s.nowrap}>{date(ticket.createdAt)}</td></tr>)}</tbody></table></div>{!visibleTickets.length && <Empty>{tickets ? 'No tickets match. Adjust your filters or create your first ticket.' : busy ? 'Loading ticket records…' : 'Ticket records unavailable.'}</Empty>}{visibleTickets.length > 8 && <div className={s.tableFoot}>Showing the 8 most recent matches. Export includes all matching tickets.</div>}</section>

    <div className={s.bottomGrid}><section className={s.panel}><div className={s.panelHead}><div><h2>POS inventory</h2><p>Recently updated devices in your bank</p></div><Link href="/hardware" className={s.textLink}>Inventory <Icon name="arrow" size={16}/></Link></div><form className={s.filters} role="search" aria-label="Search bank POS inventory" onSubmit={event => { event.preventDefault(); router.push(`/hardware?${new URLSearchParams({ q: posQuery.trim() })}`) }}><label className={s.search}><Icon name="search" size={17}/><input type="search" aria-label="POS serial, TID or merchant" placeholder="Find a POS by serial, TID or merchant…" value={posQuery} onChange={event => setPosQuery(event.target.value)}/></label><button type="submit" className={s.button} disabled={!posQuery.trim()}>Search</button></form><div className={s.tableScroll}><table className={s.table}><thead><tr><th>POS serial / model</th><th>TID / merchant</th><th>Status</th></tr></thead><tbody>{devices?.rows?.slice(0, 5).map(device => <tr key={device.id}><td><Link className={s.serial} href={`/hardware/${device.id}`}>{device.serialNumber}</Link><span>{device.brand} · {device.model}</span></td><td><strong>{device.tid || '—'}</strong><span title={device.address || device.location}>{device.merchant || device.location || '—'}</span></td><td><Status value={device.status}/></td></tr>)}</tbody></table></div>{!devices?.rows?.length && <Empty>{devices ? 'No POS records available for your bank.' : busy ? 'Loading POS records…' : 'POS records unavailable.'}</Empty>}</section>
      <section className={s.panel}><div className={s.panelHead}><div><h2>Latest movements</h2><p>Recent POS service and delivery activity</p></div><Icon name="clock"/></div><div className={s.activityList}>{inventory?.recent?.map(event => <Link key={event.id} className={s.activity} href={`/hardware/${event.device.id}`}><span className={s.activityIcon}><Icon name={event.action.includes('REPAIR') ? 'tool' : 'box'} size={16}/></span><div><strong>{label(event.action)} · {event.device.serialNumber}</strong><span>{label(event.newStatus)} · {date(event.occurredAt)}</span></div><Icon name="arrow" size={15}/></Link>)}</div>{!inventory?.recent?.length && <Empty>{inventory ? 'New POS movements will appear here.' : busy ? 'Loading activity…' : 'Movement history unavailable.'}</Empty>}</section></div>
  </div>
}
