"use client"
import { useState } from 'react'
import { s, Icon, Badge, Empty, day, label, downloadFile } from './shared'

const NEXT_STEP = {
  IN_STOCK: ['এখন Bank-এর জন্য POS রাখুন', 'Reserve'],
  RESERVED: ['POSটি Bank-এ পাঠান', 'Deliver'],
  DELIVERED: ['Merchant location-এ install করুন', 'Deploy'],
  DEPLOYED: ['সব ঠিক থাকলে কিছু করার দরকার নেই', null],
  FAULTY: ['নষ্ট POS-টি warehouse-এ ফেরত নিন', 'Return'],
  RETURNED: ['POSটি repair-এ পাঠান', 'Repair'],
  UNDER_REPAIR: ['Repair শেষ হলে status update করুন', 'Repair complete'],
  REPAIRED: ['ঠিক হওয়া POS আবার Bank-এ পাঠান', 'Deliver'],
  REPLACED: ['পুরনো POS-এর return confirm করুন', 'Confirm return'],
  SCRAPPED: ['এই POS archive করা হয়েছে', null]
}

export default function DeviceDetail({ device, summary, onAction, onBack, token, onError }) {
  const [tab, setTab] = useState('Overview')
  const actions = summary.actions.filter(action => summary.transitions[action]?.from.includes(device.status) && !device.archived)
  const [action, setAction] = useState('')
  const nextStep = NEXT_STEP[device.status]
  const nextAction = nextStep && actions.find(candidate => label(candidate).toLowerCase() === nextStep[1]?.toLowerCase())
  const groups = [
    ['Device information', [['Serial number', device.serialNumber], ['Brand / model', `${device.brand} ${device.model}`], ['Device type', label(device.deviceType)], ['Supplier / OEM', device.supplier], ['Purchase date', day(device.purchaseDate)], ['Warranty expiry', day(device.warrantyUntil)], ['PO / challan reference', device.reference], ['Registered', day(device.createdAt)], ['Updated', day(device.updatedAt)]]],
    ['Current assignment', [['Bank', device.bank?.name || 'Warehouse / unassigned'], ['Location', device.location], ['Merchant', device.merchant], ['Branch', device.branch], ['TID', device.tid], ['MID', device.mid], ['Address', device.address], ['Deployment engineer', device.engineer], ['Deployment date', day(device.deploymentDate)]]],
    ['Service & replacement', [['Fault', device.faultType], ['Technician / vendor', device.technician], ['Repair status', label(device.repairStatus)], ['Repair received', day(device.repairReceivedDate)], ['Repair completed', day(device.repairReturnDate)], ...(summary.role !== 'BANK' ? [['Repair cost', `BDT ${(device.repairCost || 0).toLocaleString()}`]] : []), ['Linked replacement serial', device.replacementSerial], ['Old-device return', device.pendingReturn ? 'Awaiting return' : 'No pending return'], ['Due date', day(device.dueDate)]]]
  ]
  return <div className={s.stack}>
    <div className={s.header} style={{ marginBottom: 0 }}><div><button className={s.serial} onClick={onBack}>← Back to inventory</button><h2 className={`${s.title} ${s.mono}`} style={{ marginTop: 10 }}>{device.serialNumber}</h2><p className={s.sub}>{device.brand} {device.model} · {device.location}</p></div><div className={s.actions}><Badge value={device.status}/>{device.archived && <span className={s.badge}>Archived</span>}</div></div>
    {device.pendingReturn && <div className={s.alert}><Icon name="clock"/><div><strong>Old device awaiting return</strong><div className={s.small}>Replacement {device.replacementSerial} · due {day(device.dueDate)}</div></div></div>}
    {nextStep && <div className={s.alert}><Icon name="arrow"/><div><strong>Next step</strong><div>{nextStep[0]}</div></div>{nextAction && <button className={s.primary} onClick={() => onAction(nextAction)}>{label(nextAction)} <Icon name="arrow" size={15}/></button>}</div>}
    {!!actions.length && <div className={s.panel}><div className={s.panelHead}><div><h2>Update this POS</h2><p className={s.sub}>Choose what happened next. The system will save the history automatically.</p></div></div><div className={s.actions}><select className={`${s.input} ${s.select}`} aria-label="Device action" value={action} onChange={e => setAction(e.target.value)}><option value="">What do you want to do?</option>{actions.map(a => <option key={a} value={a}>{label(a)}</option>)}</select><button className={s.primary} disabled={!action} onClick={() => onAction(action)}>Continue <Icon name="arrow" size={15}/></button></div></div>}
    <div className={s.tabs} role="tablist" aria-label="Device details">{['Overview', `History (${device.events.length})`, `Documents (${device.documents.length})`].map((name, i) => <button key={name} role="tab" aria-selected={tab === ['Overview', 'History', 'Documents'][i]} className={`${s.tab} ${tab === ['Overview', 'History', 'Documents'][i] ? s.activeTab : ''}`} onClick={() => setTab(['Overview', 'History', 'Documents'][i])}>{name}</button>)}</div>
    {tab === 'Overview' && <><div className={s.grid}>{groups.slice(0,2).map(([title, fields]) => <section className={s.panel} key={title}><div className={s.panelHead}><h2>{title}</h2></div><dl className={s.detailGrid}>{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl></section>)}</div><details className={s.panel} open={Boolean(device.faultType || device.replacementSerial)}><summary className={s.panelHead} style={{cursor:'pointer',fontWeight:700}}>Service & replacement <span className={s.small}>Expand details ↓</span></summary><dl className={s.detailGrid}>{groups[2][1].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl></details>{device.remarks && <section className={s.panel}><div className={s.panelHead}><h2>Remarks</h2></div><p className={s.panelBody} style={{ whiteSpace: 'pre-wrap' }}>{device.remarks}</p></section>}</>}
    {tab === 'History' && <section className={s.panel}><div className={s.panelHead}><h2>Complete lifecycle history</h2><span className={s.small}>{device.events.length} events</span></div><div className={s.panelBody}><div className={s.timeline}>{device.events.map(event => {
      let details = {}; try { details = JSON.parse(event.details || '{}') } catch {}
      const changes = Object.keys(details.after || {}).filter(key => !['updatedAt', 'version', 'createdAt', 'id', 'bankId'].includes(key) && JSON.stringify(details.before?.[key]) !== JSON.stringify(details.after[key]))
      return <article key={event.id} className={s.event}><div className={s.actions}><strong>{label(event.action)}</strong><Badge value={event.newStatus}/></div><span className={s.small}>{day(event.occurredAt)} · {event.actorName} · recorded {new Date(event.createdAt).toLocaleString()}</span>{event.previousStatus && event.previousStatus !== event.newStatus && <p className={s.muted}>{label(event.previousStatus)} → {label(event.newStatus)}</p>}{event.remarks && <p>{event.remarks}</p>}{details.reference && <p>Reference: {details.reference}</p>}{details.deliveredBy && <p>Delivered by: {details.deliveredBy}</p>}{details.receivedBy && <p>Received by: {details.receivedBy}</p>}{details.warrantyAtEvent && <span className={s.small}>Warranty at event: {label(details.warrantyAtEvent)}</span>}{!!changes.length && <details><summary>View recorded changes</summary><dl className={s.detailGrid}>{changes.map(key => <div key={key}><dt>{label(key.replace(/([A-Z])/g, '_$1'))}</dt><dd>{String(details.before?.[key] ?? '—')} → {String(details.after[key] ?? '—')}</dd></div>)}</dl></details>}</article>
    })}</div>{!device.events.length && <Empty title="No events recorded"/>}</div></section>}
    {tab === 'Documents' && <section className={s.panel}><div className={s.panelHead}><h2>Documents</h2>{summary.actions.includes('DOCUMENT') && !device.archived && <button className={s.button} onClick={() => onAction('DOCUMENT')}><Icon name="plus" size={15}/>Attach document</button>}</div>{!device.documents.length ? <Empty title="No documents attached">Keep purchase orders, invoices, challans, warranty and RMA files with this serial.</Empty> : <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Document</th><th>Category</th><th>Uploaded</th><th>Download</th></tr></thead><tbody>{device.documents.map(doc => <tr key={doc.id}><td>{doc.name}<span className={s.small}>{(doc.size / 1024).toFixed(0)} KB</span></td><td>{label(doc.category)}</td><td>{day(doc.createdAt)}<span className={s.small}>{doc.uploadedBy}</span></td><td><button className={s.button} aria-label={`Download ${doc.name}`} onClick={() => downloadFile(`/api/hardware/documents/${doc.id}`, token, doc.name).catch(e => onError(e.message))}><Icon name="download" size={15}/></button></td></tr>)}</tbody></table></div>}</section>}
  </div>
}
