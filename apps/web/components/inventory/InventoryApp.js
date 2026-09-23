"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { io } from 'socket.io-client'
import Layout from '../Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch, SOCKET_BASE_URL } from '../../lib/api'
import { s, Icon, Badge, Empty, Field, Modal, day, label } from './shared'
import { DeviceForm, BankForm, DocumentForm } from './Forms'
import DeviceDetail from './DeviceDetail'
import Reports from './Reports'
import Settings from './Settings'
import BulkBankMovement from './BulkBankMovement'

function Breakdown({ title, rows, onView }) {
  const max = Math.max(1, ...rows.map(r => r.count))
  return <section className={s.panel}><div className={s.panelHead}><h2>{title}</h2><span className={s.small}>{rows.length} groups</span></div><div className={s.panelBody}>{rows.length ? rows.slice(0, 6).map(r => <div className={s.progressRow} key={r.name}><div className={s.progressLabel}><button className={s.serial} onClick={() => onView(r)}>{r.name}</button><strong>{r.count.toLocaleString()}</strong></div><div className={s.bar}><span style={{ width: `${r.count / max * 100}%` }}/></div></div>) : <Empty title="No stock yet">Receive POS devices to see the breakdown.</Empty>}</div></section>
}
export default function InventoryApp({ initialId, initialQuery = '' }) {
  const token = useAuthStore(state => state.accessToken)
  const router = useRouter()
  const [summary, setSummary] = useState(null)
  const [data, setData] = useState({ rows: [], total: 0, pages: 1 })
  const [tab, setTab] = useState(initialQuery ? 'Inventory' : 'Overview')
  const [filters, setFilters] = useState({ page: 1, ...(initialQuery ? { q: initialQuery } : {}) })
  const [query, setQuery] = useState(initialQuery)
  const [extra, setExtra] = useState(false)
  const [selected, setSelected] = useState([])
  const [bulkAction, setBulkAction] = useState('')
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [device, setDevice] = useState(null)
  const [deviceId, setDeviceId] = useState(initialId || null)
  const [modal, setModal] = useState(null)
  const [legacy, setLegacy] = useState(null)
  const [legacyDetail, setLegacyDetail] = useState(null)
  const listSequence = useRef(0)
  const detailSequence = useRef(0)
  const fail = useCallback(message => setError(message), [])
  const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== '' && v !== undefined))).toString()
  const loadSummary = useCallback(async () => {
    if (!token) return
    try { setSummary(await apiFetch('/api/hardware/summary', token)) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [token])
  const loadList = useCallback(async () => {
    if (!token) return
    const sequence = ++listSequence.current; setListLoading(true)
    try { const result = await apiFetch(`/api/hardware?${params}`, token); if (sequence === listSequence.current) setData(result) } catch (e) { if (sequence === listSequence.current) setError(e.message) } finally { if (sequence === listSequence.current) setListLoading(false) }
  }, [token, params])
  const loadDetail = useCallback(async () => {
    if (!token || !deviceId) return
    const sequence = ++detailSequence.current
    try { const result = await apiFetch(`/api/hardware/${deviceId}`, token); if (sequence === detailSequence.current) setDevice(result) } catch (e) { if (sequence === detailSequence.current) setError(e.message) }
  }, [token, deviceId])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadList(); setSelected([]) }, [loadList])
  useEffect(() => { setDevice(null); loadDetail() }, [loadDetail])
  useEffect(() => { const timer = setTimeout(() => setFilters(f => ({ ...f, q: query, page: 1 })), 300); return () => clearTimeout(timer) }, [query])
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') { loadSummary(); loadList(); if (deviceId && !modal) loadDetail() } }
    const timer = setInterval(update, 30000); window.addEventListener('focus', update)
    const socket = token ? io(SOCKET_BASE_URL, { auth: { token } }) : null
    socket?.on('inventory:updated', update)
    return () => { clearInterval(timer); window.removeEventListener('focus', update); socket?.disconnect() }
  }, [loadSummary, loadList, loadDetail, deviceId, modal, token])
  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }))
  function view(next = {}) { ++detailSequence.current; setDeviceId(null); setDevice(null); setTab('Inventory'); setQuery(''); setFilters({ page: 1, ...next }) }
  function openDevice(id) { ++detailSequence.current; setDevice(null); setDeviceId(id); setError(''); setModal(null) }
  function saved(message) { setSelected([]); setModal(null); setNotice(message); setError(''); loadSummary(); loadList(); loadDetail() }
  function back() { view(); if (initialId) router.push('/hardware') }
  async function openLegacy() { setTab('Legacy archive'); setDeviceId(null); try { setLegacy(await apiFetch('/api/hardware/legacy', token)) } catch (e) { setError(e.message) } }
  function switchTab(next) { ++detailSequence.current; setDeviceId(null); setDevice(null); setTab(next); if (['Service','Inventory'].includes(next)) { setQuery(''); setFilters({ page: 1, ...(next === 'Service' ? { status: 'FAULTY,UNDER_REPAIR,REPAIRED,REPLACED' } : {}) }) } }
  const counts = summary?.counts || {}
  const bulkAllowed = summary?.actions.some(a => ['RESERVE','DELIVER','TRANSFER','WITHDRAWAL','RESTOCK'].includes(a))
  const bankGroups = new Map(), modelGroups = new Map()
  for (const row of summary?.bankCounts || []) { const key = row.bankId || ''; bankGroups.set(key, (bankGroups.get(key) || 0) + row._count._all) }
  for (const row of summary?.modelCounts || []) modelGroups.set(row.model, (modelGroups.get(row.model) || 0) + row._count._all)
  const banks = [...bankGroups].map(([id,count]) => ({ id, name: summary.banks.find(b => b.id === id)?.name || 'Warehouse / unassigned', count })).sort((a,b) => b.count-a.count)
  const bankStatus = [...bankGroups].map(([id]) => {
    const row = { id, name: summary.banks.find(b => b.id === id)?.name || 'Warehouse / unassigned' }
    for (const status of ['IN_STOCK', 'DEPLOYED', 'FAULTY', 'UNDER_REPAIR', 'REPAIRED', 'RETURNED']) row[status] = (summary.bankCounts || []).find(item => (item.bankId || '') === id && item.status === status)?._count._all || 0
    row.total = ['IN_STOCK', 'DEPLOYED', 'FAULTY', 'UNDER_REPAIR', 'REPAIRED', 'RETURNED'].reduce((total, status) => total + row[status], 0)
    return row
  }).sort((a,b) => b.total-a.total)
  const models = [...modelGroups].map(([name,count]) => ({name,count})).sort((a,b) => b.count-a.count)
  const tabs = ['Overview', 'Inventory', 'Banks', 'Service', 'Reports', ...(summary?.actions.includes('SETTINGS') ? ['Settings'] : [])]

  return <Layout><div className={s.shell}>
    <header className={s.header}><div><div className={s.eyebrow}>Hardware / POS operations</div><h1 className={s.title}>POS inventory</h1><p className={s.sub}>Every terminal. Every movement. One clear record.</p></div><div className={s.actions}><button className={s.button} aria-label="Refresh inventory" onClick={() => { setError(''); loadSummary(); loadList(); loadDetail() }}><Icon name="refresh" size={16}/></button>{summary?.actions.includes('STOCK_IN') && <button className={s.primary} onClick={() => setModal({ action: 'STOCK_IN' })}><Icon name="plus" size={16}/>Receive stock</button>}</div></header>
    {error && <div role="alert" className={`${s.message} ${s.error}`}><span>{error}</span><button className={s.serial} onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {notice && <div role="status" className={s.message}><span>{notice}</span><button className={s.serial} onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
    {loading ? <Empty title="Loading inventory…">Preparing stock counts and device records.</Empty> : !summary ? <Empty title="Inventory could not load">Use refresh to retry. The server may need the inventory database migration.</Empty> : <>
      {!deviceId && <nav className={s.tabs} aria-label="Inventory sections">{tabs.map(name => <button key={name} aria-current={tab === name ? 'page' : undefined} className={`${s.tab} ${tab === name ? s.activeTab : ''}`} onClick={() => switchTab(name)}>{name}</button>)}<button className={`${s.tab} ${tab === 'Legacy archive' ? s.activeTab : ''}`} onClick={openLegacy}>Legacy archive</button></nav>}
      <div style={{ display: !deviceId && tab === 'Inventory' ? undefined : 'none' }}><BulkBankMovement summary={summary} token={token} onUpdated={() => { loadSummary(); loadList() }}/></div>
      {deviceId ? device ? <DeviceDetail key={device.id} device={device} summary={summary} token={token} onError={fail} onBack={back} onAction={action => setModal({ action, device })}/> : <div><button className={s.serial} onClick={back}>← Back to inventory</button><Empty title={error ? 'Unable to open this device' : 'Loading device history…'}/></div> : <>
      {tab === 'Overview' && <>
        <section className={s.panel}><div className={s.panelHead}><div><h2>Start here</h2><p className={s.sub}>নতুন হলে এই ৩টি ধাপ অনুসরণ করুন</p></div></div><div className={`${s.actions} ${s.panelBody}`}><div className={s.alert}><strong>1</strong><span><b>Receive stock</b><br/><span className={s.small}>Warehouse-এর সব POS serial যোগ করুন</span></span></div><div className={s.alert}><strong>2</strong><span><b>Deliver / Deploy</b><br/><span className={s.small}>Bank ও merchant-এর তথ্য দিন</span></span></div><div className={s.alert}><strong>3</strong><span><b>Fault হলে update করুন</b><br/><span className={s.small}>Fault → Return → Repair → Repair complete</span></span></div></div></section>
        <div className={s.cards}>{[['Total inventory', summary.total, 'Across all banks and locations', 'box', ''], ['Available stock', counts.IN_STOCK, `${counts.RESERVED} reserved · ${counts.RECEIVED} received`, 'check', 'IN_STOCK'], ['Deployed / active', counts.DEPLOYED, `${counts.DELIVERED} delivered, awaiting deployment`, 'arrow', 'DEPLOYED'], ['Needs service', counts.FAULTY + counts.UNDER_REPAIR, `${counts.FAULTY} faulty · ${counts.UNDER_REPAIR} under repair`, 'tool', 'FAULTY,UNDER_REPAIR']].map(([title,value,note,icon,status]) => <button className={s.card} key={title} onClick={() => view({ status })}><div className={s.cardLabel}>{title}<Icon name={icon} size={17}/></div><div className={s.number}>{value.toLocaleString()}</div><div className={s.cardNote}>{note}</div></button>)}</div>
        <section className={s.panel}><div className={s.panelHead}><div><h2>Bank-wise POS control</h2><p className={s.sub}>Current devices by bank and status</p></div></div><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Bank</th><th>Total</th><th>Available</th><th>Deployed</th><th>Faulty</th><th>Repairing</th><th>Repaired</th><th>Returned</th></tr></thead><tbody>{bankStatus.map(row => <tr key={row.id}><td><button className={s.serial} onClick={() => view(row.id ? { bankId: row.id } : { unassigned: 'true' })}>{row.name}</button></td><td><strong>{row.total}</strong></td><td>{row.IN_STOCK}</td><td>{row.DEPLOYED}</td><td>{row.FAULTY}</td><td>{row.UNDER_REPAIR}</td><td>{row.REPAIRED}</td><td>{row.RETURNED}</td></tr>)}</tbody></table></div>{!bankStatus.length && <Empty title="No bank-wise data">Receive or assign POS devices to see the breakdown.</Empty>}</section>
        <section className={s.panel}><div className={s.panelHead}><div><h2>Repair movement summary</h2><p className={s.sub}>Lifetime recorded movements, including every POS event</p></div></div><div className={`${s.cards} ${s.panelBody}`}><button className={s.card} onClick={() => view({ status: 'WITHDRAWN' })}><div className={s.cardLabel}>Withdrawals</div><div className={s.number}>{summary.movements?.WITHDRAWAL || 0}</div></button><button className={s.card} onClick={() => view({ status: 'REPAIRED' })}><div className={s.cardLabel}>Repair completed</div><div className={s.number}>{summary.movements?.REPAIR_COMPLETE || 0}</div></button><button className={s.card} onClick={() => view({ status: 'DELIVERED' })}><div className={s.cardLabel}>Delivered back / onward</div><div className={s.number}>{summary.movements?.DELIVER || 0}</div></button><button className={s.card} onClick={() => view({ status: 'UNDER_REPAIR' })}><div className={s.cardLabel}>Currently repairing</div><div className={s.number}>{counts.UNDER_REPAIR}</div></button></div></section>
        <div className={s.grid}><div className={s.stack}><Breakdown title="Stock by bank" rows={banks} onView={r => view(r.id ? { bankId: r.id } : { unassigned: 'true' })}/><Breakdown title="Stock by model" rows={models} onView={r => view({ model: r.name })}/><section className={s.panel}><div className={s.panelHead}><h2>Lifecycle totals</h2></div><div className={`${s.actions} ${s.panelBody}`}>{Object.entries(counts).map(([status,count]) => <button className={s.button} key={status} onClick={() => view({ status })}>{label(status)} <strong>{count}</strong></button>)}</div></section></div>
        <div className={s.stack}><section className={s.panel}><div className={s.panelHead}><h2>Attention needed</h2><Icon name="clock" size={16}/></div><div className={`${s.stack} ${s.panelBody}`}>
          {counts.RECEIVED > 0 && <div className={s.alert}><Icon name="check"/><div><strong>{counts.RECEIVED} POS awaiting verification</strong><div className={s.small}>Check imported details and physical stock before allocation.</div></div><button className={s.button} onClick={() => view({status:"RECEIVED"})}>View</button></div>}{summary.alerts.lowStock && <div className={s.alert}><Icon name="box"/><div><strong>Low warehouse stock</strong><div className={s.small}>{counts.IN_STOCK} available · threshold {summary.settings.lowStockThreshold}</div></div><button className={s.button} onClick={() => view({ status: 'IN_STOCK' })}>View</button></div>}
          {[[summary.alerts.warranty,'Warranties expiring in 30 days',{ warranty: 'expiring' }], [summary.alerts.repairs,'Repairs awaiting completion',{ status: 'UNDER_REPAIR',pendingRepair:'true' }], [summary.alerts.returns,'Old POS awaiting replacement return',{ pendingReturn:'true' }], [summary.alerts.overdue,'Overdue delivery / deployment',{ overdue:'true' }]].filter(([count]) => count > 0).map(([count,title,filter]) => <div className={s.alert} key={title}><strong>{count}</strong><span>{title}</span><button className={s.button} onClick={() => view(filter)}>View</button></div>)}
          {!counts.RECEIVED && !summary.alerts.lowStock && !Object.entries(summary.alerts).some(([k,v]) => k !== 'lowStock' && v > 0) && <p className={s.sub}>All clear. No stock or service alerts.</p>}
        </div></section><section className={s.panel}><div className={s.panelHead}><h2>Recent activity</h2><span className={s.small}>Refreshes every 30s</span></div><div className={s.panelBody}>{summary.recent.length ? summary.recent.map(e => <div className={s.activity} key={e.id}><div className={s.dot}><Icon name={e.action.includes('REPAIR') ? 'tool' : 'arrow'} size={14}/></div><div className={s.activityText}><button className={`${s.serial} ${s.mono}`} onClick={() => openDevice(e.device.id)}>{e.device.serialNumber}</button><span className={s.small}>{label(e.action)} · {e.actorName}</span></div><span className={s.small}>{day(e.occurredAt)}</span></div>) : <Empty title="Your activity starts here">Receive stock to create the first device history.</Empty>}</div></section></div></div>
      </>}
      {['Inventory', 'Service'].includes(tab) && <section className={s.panel}><div className={s.panelHead}><div><h2>{tab === 'Service' ? 'Repair & replacement desk' : 'Device register'}</h2><p className={s.sub}>{data.total.toLocaleString()} devices · click a row to view history or record a movement</p></div></div>
        <div className={s.toolbar}><div className={s.search}><Icon name="search" size={16}/><input className={s.input} aria-label="Search inventory" placeholder="Search serial, bank, merchant, TID, engineer…" value={query} onChange={e => setQuery(e.target.value)}/></div><select className={`${s.input} ${s.select}`} aria-label="Filter status" value={filters.status || ''} onChange={e => setFilter('status',e.target.value)}><option value="">All statuses</option>{tab === 'Service' && <option value="FAULTY,UNDER_REPAIR,REPAIRED,REPLACED">All service devices</option>}{Object.keys(counts).map(status => <option key={status} value={status}>{label(status)}</option>)}</select><select className={`${s.input} ${s.select}`} aria-label="Filter bank" value={filters.bankId || ''} onChange={e => setFilter('bankId',e.target.value)}><option value="">All banks</option>{summary.banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className={s.button} aria-expanded={extra} onClick={() => setExtra(v => !v)}><Icon name="filter" size={15}/>Filters</button><button className={s.button} onClick={() => { setFilters({ page:1 }); setQuery('') }}>Reset</button></div>
        {extra && <div className={s.filterGrid}>{[['model','Model'],['location','Stock location'],['warranty','Warranty'],['from','Registered from'],['to','Registered to'],['archived','Record set']].map(([key,title]) => <Field key={key} name={key} title={title} type={['from','to'].includes(key) ? 'date' : 'text'} value={filters[key]} onChange={e => setFilter(key,e.target.value)} options={key === 'model' ? summary.models.map(m => ({value:m,label:m})) : key === 'warranty' ? ['valid','expiring','expired','unknown'] : key === 'archived' ? [{value:'false',label:'Current devices'},{value:'true',label:'Archived devices'}] : undefined}/>)}</div>}
        {Object.entries(filters).some(([k,v]) => ['pendingReturn','pendingRepair','overdue','unassigned'].includes(k) && v === 'true') && <div className={s.toolbar}>{Object.entries(filters).filter(([k,v]) => ['pendingReturn','pendingRepair','overdue','unassigned'].includes(k) && v === 'true').map(([k]) => <span key={k} className={`${s.badge} ${s.amber}`}>{label(k.replace(/([A-Z])/g,'_$1'))}</span>)}</div>}
        {bulkAllowed && <div className={s.toolbar}><label className={s.actions}><input type="checkbox" aria-label="Select all devices on this page" checked={data.rows.length > 0 && data.rows.every(r => selected.includes(r.id))} onChange={e => setSelected(e.target.checked ? data.rows.map(r => r.id) : [])}/>Select page</label><span className={s.sub}>{selected.length} selected</span><select className={s.input + ' ' + s.select} aria-label="Bulk movement" value={bulkAction} onChange={e => setBulkAction(e.target.value)}><option value="">Stock movement</option>{['RESERVE','DELIVER','TRANSFER','WITHDRAWAL','RESTOCK'].filter(a => summary.actions.includes(a)).map(a => <option key={a} value={a}>{label(a)}</option>)}</select><button className={s.button} disabled={!selected.length || !bulkAction || listLoading} onClick={() => { const devices = data.rows.filter(r => selected.includes(r.id)); setModal({ action:bulkAction, device:devices[0], devices }) }}>Apply to selected</button></div>}<div className={s.tableScroll} aria-busy={listLoading}><table className={s.table}><thead><tr><th>Serial / device</th><th>Status</th><th>Bank / merchant</th><th>Location</th><th>{tab === 'Service' ? 'Service' : 'Warranty'}</th><th>Updated</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id} className={s.clickableRow} onClick={event => {
          if (event.target.closest('button, a, input, select, textarea, label')) return
          openDevice(row.id)
        }}><td>{bulkAllowed && <input type="checkbox" aria-label={`Select ${row.serialNumber}`} style={{marginRight:9}} checked={selected.includes(row.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids,row.id] : ids.filter(id => id !== row.id))}/>}<button className={`${s.serial} ${s.mono}`} onClick={() => openDevice(row.id)}>{row.serialNumber}</button><span className={s.small}>{row.brand} · {row.model}</span></td><td><Badge value={row.status}/>{row.pendingReturn && <span className={s.small} style={{color:'#a36718'}}>Old POS return pending</span>}</td><td>{row.bank?.name || 'Unassigned'}<span className={s.small}>{row.merchant || (row.status === 'IN_STOCK' ? 'Warehouse stock' : '—')}</span></td><td>{row.location}<span className={s.small}>{row.tid ? `TID ${row.tid}` : row.engineer || '—'}</span></td><td>{tab === 'Service' ? <>{row.faultType || '—'}<span className={s.small}>{row.technician || 'No technician'} · {label(row.repairStatus) || 'Pending'}</span></> : <>{day(row.warrantyUntil)}{row.warrantyUntil && new Date(row.warrantyUntil) < new Date() && <span className={s.small} style={{color:'#b44747'}}>Expired</span>}</>}</td><td>{day(row.updatedAt)}<span className={s.small}>{row.archived ? 'Archived' : 'View serial →'}</span></td></tr>)}</tbody></table></div>
        {!data.rows.length && <Empty title={listLoading ? 'Loading devices…' : 'No devices match'}>{listLoading ? 'Fetching current inventory.' : 'Adjust your filters or receive your first stock.'}</Empty>}
        <div className={s.footer}><span>{listLoading ? 'Refreshing…' : `${data.total ? ((filters.page || 1)-1)*25+1 : 0}–${Math.min((filters.page || 1)*25,data.total)} of ${data.total}`}</span><div className={s.actions}><button className={s.button} disabled={(filters.page || 1) <= 1 || listLoading} onClick={() => setFilters(f => ({...f,page:(f.page || 1)-1}))}>Previous</button><span>{filters.page || 1} / {data.pages}</span><button className={s.button} disabled={(filters.page || 1) >= data.pages || listLoading} onClick={() => setFilters(f => ({...f,page:(f.page || 1)+1}))}>Next</button></div></div>
      </section>}
      {tab === 'Banks' && <section className={s.panel}><div className={s.panelHead}><div><h2>Bank directory</h2><p className={s.sub}>Contacts, agreements and stock allocation</p></div>{summary.actions.includes('BANK') && <button className={s.primary} onClick={() => setModal({action:'BANK'})}><Icon name="plus" size={15}/>Add bank</button>}</div><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Bank</th><th>Contact</th><th>PO / agreement</th><th>POS</th><th>Status</th><th>Actions</th></tr></thead><tbody>{summary.banks.map(b => <tr key={b.id}><td><strong>{b.name}</strong><span className={s.small}>{b.branch || 'No branch / department'}</span></td><td>{b.contactPerson || '—'}<span className={s.small}>{b.contactDetails || '—'}</span></td><td>{b.agreementReference || '—'}</td><td>{bankGroups.get(b.id) || 0}</td><td><Badge value={b.active ? 'ACTIVE' : 'INACTIVE'}/></td><td><div className={s.actions}><button className={s.serial} onClick={() => view({bankId:b.id})}>View stock</button><button className={s.button} onClick={() => router.push(`/pos-serials?bank=${encodeURIComponent(b.name)}`)}>Upload POS</button>{summary.actions.includes('BANK') && <button className={s.button} onClick={() => setModal({action:'BANK',bank:b})}>Edit</button>}</div></td></tr>)}</tbody></table></div>{!summary.banks.length && <Empty title="No banks registered">Add bank details before reserving or delivering a POS.</Empty>}</section>}
      {tab === 'Reports' && <Reports summary={summary} token={token} onError={fail}/>}
      {tab === 'Settings' && <Settings summary={summary} token={token} onSaved={saved} onError={fail}/>}
      {tab === 'Legacy archive' && <section className={s.panel}><div className={s.panelHead}><div><h2>Previous hardware batches</h2><p className={s.sub}>Read-only records from the former batch workflow. New movements are recorded against POS serials.</p></div></div>{legacy === null ? <Empty title="Loading previous batches…"/> : !legacy.length ? <Empty title="No previous hardware batches"/> : <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Batch</th><th>Bank</th><th>Quantity</th><th>Status</th><th>Created</th></tr></thead><tbody>{legacy.map(b => <tr key={b.id}><td><button className={s.serial} onClick={() => setLegacyDetail(b)}>{b.batchNo}</button></td><td>{b.bankName || '—'}</td><td>{b.totalQuantity}</td><td><Badge value={b.status}/></td><td>{day(b.createdAt)}</td></tr>)}</tbody></table></div>}</section>}
      </>}
    </>}
    {summary && modal && (modal.action === 'BANK' ? <BankForm bank={modal.bank} token={token} onClose={() => setModal(null)} onSaved={saved}/> : modal.action === 'DOCUMENT' ? <DocumentForm device={modal.device} token={token} onClose={() => setModal(null)} onSaved={saved}/> : <DeviceForm action={modal.action} devices={modal.devices} device={modal.device} summary={summary} token={token} onClose={() => setModal(null)} onSaved={saved}/>)}
    {legacyDetail && <Modal title={legacyDetail.batchNo} onClose={() => setLegacyDetail(null)}><div className={s.stack}><p>{legacyDetail.bankName} · {legacyDetail.totalQuantity} POS · {label(legacyDetail.status)}</p><p>{legacyDetail.note}</p>{legacyDetail.items?.map(item => <div key={item.id} className={s.card}><strong>{item.serialNumber}</strong><p className={s.sub}>{item.problem} · {item.note}</p></div>)}{legacyDetail.updates?.map(e => <div key={e.id} className={s.card}><strong>{label(e.type)}</strong><p className={s.sub}>{day(e.createdAt)} · {e.user?.name}</p><p>{e.comment}</p><p className={s.sub}>Received {e.receivedQuantity ?? '—'} · Repaired {e.repairedQuantity ?? '—'} · Returned {e.returnedQuantity ?? '—'}</p></div>)}</div></Modal>}
  </div></Layout>
}
