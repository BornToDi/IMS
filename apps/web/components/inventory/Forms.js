"use client"
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { s, Field, Modal, label, dateValue } from './shared'

const TITLES = { STOCK_IN: 'Receive stock', RESTOCK: 'Move to available stock', RESERVE: 'Reserve for a bank', DELIVER: 'Deliver to bank', DEPLOY: 'Deploy to merchant', TRANSFER: 'Transfer POS', FAULT: 'Report a fault', REPAIR: 'Start repair / RMA', REPAIR_UPDATE: 'Update repair', REPAIR_COMPLETE: 'Complete repair', WITHDRAWAL: 'Withdrawal', REPLACE: 'Replace faulty POS', CONFIRM_RETURN: 'Confirm old POS return', EDIT: 'Edit device details', SCRAP: 'Retire / scrap POS', ARCHIVE: 'Archive retired POS' }
const FORM_FIELDS = {
  STOCK_IN: ['serialNumbers', 'brand', 'model', 'deviceType', 'supplier', 'purchaseDate', 'warrantyUntil', 'location', 'reference', 'receivedBy', 'occurredAt', 'remarks'],
  EDIT: ['brand', 'model', 'deviceType', 'supplier', 'purchaseDate', 'warrantyUntil', 'remarks'],
  RESTOCK: ['location', 'occurredAt', 'remarks'], RESERVE: ['bankId', 'reference', 'dueDate', 'occurredAt', 'remarks'],
  DELIVER: ['bankId', 'location', 'reference', 'deliveredBy', 'receivedBy', 'occurredAt', 'dueDate', 'remarks'],
  DEPLOY: ['brand', 'model', 'deviceType', 'supplier', 'bankId', 'location', 'merchant', 'branch', 'tid', 'mid', 'address', 'telco', 'simEi', 'engineer', 'occurredAt', 'remarks'],
  TRANSFER: ['location', 'merchant', 'branch', 'tid', 'mid', 'address', 'telco', 'simEi', 'engineer', 'occurredAt', 'remarks'],
  FAULT: ['faultType', 'occurredAt', 'remarks'], REPAIR: ['technician', 'location', 'occurredAt', 'remarks'],
  REPAIR_UPDATE: ['technician', 'repairStatus', 'repairCost', 'occurredAt', 'remarks'], REPAIR_COMPLETE: ['repairCost', 'occurredAt', 'remarks'],
  WITHDRAWAL: ['receivedBy', 'occurredAt', 'remarks'], REPLACE: ['replacementSerial', 'location', 'engineer', 'dueDate', 'occurredAt', 'remarks'],
  CONFIRM_RETURN: ['location', 'receivedBy', 'occurredAt', 'remarks'], SCRAP: ['occurredAt', 'remarks'], ARCHIVE: ['remarks']
}
const FIELD_LABELS = { serialNumbers: 'Serial numbers · one per line', bankId: 'Bank', deviceType: 'Device type', purchaseDate: 'Purchase date', warrantyUntil: 'Warranty expiry', receivedBy: 'Received by / receiving officer', deliveredBy: 'Delivered by', reference: 'PO / invoice / challan reference', occurredAt: 'Event date', dueDate: 'Expected delivery / deployment / return date', merchant: 'DBN / Merchant', branch: 'Branch', tid: 'TID', mid: 'MID', address: 'Address', telco: 'Telco', simEi: 'SIM EI', faultType: 'Fault type', repairStatus: 'Repair status', repairCost: 'Repair cost (BDT)', replacementSerial: 'Available replacement serial', technician: 'Technician / vendor', location: 'Destination / current location' }
const DATE_FIELDS = ['purchaseDate', 'warrantyUntil', 'occurredAt', 'dueDate']

export function DeviceForm({ action, device, devices, summary, token, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const values = { occurredAt: new Date().toISOString().slice(0, 10), deviceType: 'POS' }
    for (const key of FORM_FIELDS[action]) if (device?.[key] !== undefined && !['remarks', 'replacementSerial', 'occurredAt', 'dueDate'].includes(key)) values[key] = DATE_FIELDS.includes(key) ? dateValue(device[key]) : device[key] || ''
    if (['RETURN', 'RESTOCK', 'CONFIRM_RETURN', 'TRANSFER', 'DELIVER'].includes(action)) values.location = ''
    if (action === 'REPLACE') values.location = device.address || ''
    return values
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const required = action === 'STOCK_IN' ? ['serialNumbers', 'brand', 'model', 'supplier', 'reference', 'receivedBy', 'location'] : [...(summary.transitions[action]?.required || []), ...(action === 'RESTOCK' ? ['location'] : []), ...(action === 'DEPLOY' ? ['brand', 'model', 'deviceType'] : []), ...(action === 'EDIT' ? ['brand', 'model', 'deviceType'] : []), ...(action === 'TRANSFER' && device.status === 'DEPLOYED' ? ['merchant', 'tid', 'mid', 'address', 'engineer'] : [])]
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const body = { ...form, action, version: device?.version }
      if (devices) body.devices = devices.map(d => ({ id: d.id, version: d.version }))
      if (action === 'STOCK_IN') body.serialNumbers = form.serialNumbers.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      await apiFetch(action === 'STOCK_IN' ? '/api/hardware/stock-in' : devices ? '/api/hardware/actions' : `/api/hardware/${device.id}/actions`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      onSaved(`${TITLES[action]} completed${action === 'STOCK_IN' ? ` · ${body.serialNumbers.length} POS received` : ''}.`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Modal title={TITLES[action] || label(action)} onClose={onClose} busy={busy} footer={<><button className={s.button} disabled={busy} onClick={onClose}>Cancel</button><button className={s.primary} disabled={busy} type="submit" form="device-action-form">{busy ? 'Saving…' : action === 'STOCK_IN' ? 'Receive stock' : 'Save update'}</button></>}>
    {device && <p className={s.sub} style={{ marginTop: 0, marginBottom: 16 }}>{devices ? `${devices.length} selected POS · ${devices.map(d => d.serialNumber).join(', ')}` : `${device.serialNumber} · ${device.brand} ${device.model} · ${label(device.status)}`}</p>}
    {action === 'WITHDRAWAL' && <p className={s.alert}>Withdrawal clears all current device details except the POS serial. Enter fresh details when deploying again.</p>}
    {action === 'REPLACE' && <div className={s.alert} style={{ marginBottom: 15 }}>The replacement inherits this merchant, bank and TID/MID. The old device remains tracked until its return is confirmed.</div>}
    {action === 'ARCHIVE' && <div className={s.alert} style={{ marginBottom: 15 }}>This retired device will move to the archive. Its serial number and complete history remain available.</div>}
    {error && <div role="alert" className={`${s.message} ${s.error}`}>{error}</div>}
    <form id="device-action-form" onSubmit={submit} className={s.formGrid}>
      {FORM_FIELDS[action].map(key => <Field key={key} name={key} title={FIELD_LABELS[key]} value={form[key]} onChange={change} required={required.includes(key)} wide={['serialNumbers', 'remarks', 'address'].includes(key)} type={['serialNumbers', 'remarks', 'address'].includes(key) ? 'textarea' : DATE_FIELDS.includes(key) ? 'date' : key === 'repairCost' ? 'number' : 'text'} {...(key === 'repairCost' ? { min: 0, step: '.01' } : {})} {...(key === 'occurredAt' ? { max: new Date().toISOString().slice(0, 10) } : {})} options={key === 'bankId' ? summary.banks.filter(b => b.active).map(b => ({ value: b.id, label: b.name })) : key === 'deviceType' ? ['POS', 'SMART_POS', 'MPOS', 'PIN_PAD'] : key === 'repairStatus' ? ['DIAGNOSING', 'WAITING_PARTS', 'WITH_VENDOR', 'REPAIRING', 'TESTING'] : undefined} placeholder={key === 'serialNumbers' ? 'POS000001\nPOS000002\nPOS000003' : undefined}/>) }
      {action === 'STOCK_IN' && <div className={`${s.sub} ${s.wide}`}>{(form.serialNumbers || '').split(/[\n,]+/).filter(v => v.trim()).length} serials · maximum 500 per receipt · documents can be attached after receiving.</div>}
    </form>
  </Modal>
}

export function BankForm({ bank, token, onClose, onSaved }) {
  const [form, setForm] = useState(bank || { name: '', branch: '', contactPerson: '', contactDetails: '', agreementReference: '', active: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('')
    try { await apiFetch(`/api/hardware/banks${bank ? `/${bank.id}` : ''}`, token, { method: bank ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); onSaved('Bank details saved.') } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Modal title={bank ? 'Edit bank' : 'Add bank'} onClose={onClose} busy={busy} footer={<><button className={s.button} disabled={busy} onClick={onClose}>Cancel</button><button className={s.primary} form="bank-form" disabled={busy}>Save bank</button></>}>
    {error && <div role="alert" className={`${s.message} ${s.error}`}>{error}</div>}<form id="bank-form" className={s.formGrid} onSubmit={save}>{['name', 'branch', 'contactPerson', 'contactDetails', 'agreementReference'].map(key => <Field key={key} name={key} title={{ name: 'Bank name', branch: 'Branch / department', contactPerson: 'Contact person', contactDetails: 'Phone / email', agreementReference: 'PO / agreement reference' }[key]} required={key === 'name'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/>)}<label className={s.field}><span>Availability</span><select className={s.input} value={form.active ? 'true' : 'false'} onChange={e => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive · no new allocations</option></select></label></form>
  </Modal>
}

export function DocumentForm({ device, token, onClose, onSaved }) {
  const [category, setCategory] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setError('')
    if (!file || file.size > 10 * 1024 * 1024) { setError('Choose a PDF, PNG or JPEG document up to 10 MB.'); return }
    setBusy(true)
    const body = new FormData(); body.append('category', category); body.append('file', file)
    try { await apiFetch(`/api/hardware/${device.id}/documents`, token, { method: 'POST', body }); onSaved('Document uploaded.') } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Modal title="Attach document" busy={busy} onClose={onClose} footer={<button className={s.primary} form="document-form" disabled={busy}>{busy ? 'Uploading…' : 'Upload document'}</button>}>
    {error && <div role="alert" className={`${s.message} ${s.error}`}>{error}</div>}<form id="document-form" onSubmit={submit} className={s.stack}><Field name="category" title="Document type" required options={['PURCHASE_ORDER', 'INVOICE', 'DELIVERY_CHALLAN', 'BANK_ACCEPTANCE', 'WARRANTY', 'RMA']} value={category} onChange={e => setCategory(e.target.value)}/><label className={s.field}><span>Document · PDF, PNG or JPEG · up to 10 MB</span><input className={s.input} type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={e => setFile(e.target.files[0])}/></label></form>
  </Modal>
}
