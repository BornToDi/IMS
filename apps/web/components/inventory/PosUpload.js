"use client"
import { useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { s, Field, Modal } from './shared'

export default function PosUpload({ banks, initialBank = '', token, onClose, onUpdated, onView }) {
  const [bank, setBank] = useState(initialBank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  async function upload(event) {
    event.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!bank || !file || busy) return
    if (file.size > 20 * 1024 * 1024) { setError('Choose a file smaller than 20 MB.'); return }
    setBusy(true); setError(''); setResult(null)
    try {
      const body = new FormData()
      body.append('file', file); body.append('bankName', bank)
      const data = await apiFetch('/api/pos-serials/import', token, { method: 'POST', body })
      setResult(data)
      fileRef.current.value = ''
    } catch (e) { setError(`${e.message} Some rows may have been saved. You can retry the file safely.`) }
    finally { setBusy(false); onUpdated() }
  }

  async function addEarlier() {
    if (!bank || busy) return
    setBusy(true); setError(''); setResult(null)
    try {
      const hardware = await apiFetch('/api/hardware/sync-pos-serials', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankName: bank })
      })
      setResult({ hardware })
    } catch (e) { setError(e.message) }
    finally { setBusy(false); onUpdated() }
  }

  const mapping = result?.mapping
  return <Modal title="Upload POS to Hardware" onClose={onClose} busy={busy}>
    <div className={s.stack}>
      <p className={s.sub}>Select a bank and upload Excel, CSV or PDF (up to 20 MB). Missing devices are added as Deployed. Existing Hardware devices keep their status and history. For new warehouse stock, use Receive stock.</p>
      {error && <div role="alert" className={`${s.message} ${s.error}`}>{error}</div>}
      <form onSubmit={upload} className={s.stack}>
        <Field name="uploadBank" title="Bank" required value={bank} disabled={busy} onChange={e => { setBank(e.target.value); setResult(null); setError('') }} options={banks.map(b => ({ value: b.name, label: b.name }))}/>
        {!banks.length && <p className={s.sub}>Add a bank in the Banks tab first.</p>}
        <label className={s.field}><span>POS file</span><input ref={fileRef} className={s.input} type="file" accept=".xlsx,.csv,.pdf" required disabled={busy}/></label>
        <p className={s.sub}>Excel and CSV columns are matched by name. Inactive rows and conflicting serials are skipped. PDF files use detected serial numbers.</p>
        <button className={s.primary} disabled={busy || !bank}>{busy ? 'Processing…' : 'Upload POS'}</button>
      </form>
      {result && <div role="status" className={s.stack}>
        {result.hardware && <p className={s.message}>{result.hardware.added} devices added; {result.hardware.existing} already present; {result.hardware.invalid} invalid; {result.hardware.conflicts} bank or active TID conflicts skipped.</p>}
        {result.imported !== undefined && <p className={s.sub}>{result.imported} POS records saved; {result.skipped || 0} cross-bank records skipped; {result.invalidSerials || 0} invalid serial entries skipped.</p>}
        <button className={s.button} disabled={busy} onClick={() => onView(banks.find(b => b.name === bank)?.id)}>View bank inventory</button>
      </div>}
      {mapping && <section className={s.stack} aria-label="Import column mapping">
        <h3>Detected column mapping</h3>
        <p className={s.sub}>Skipped: {mapping.inactiveRows} inactive rows, {mapping.conflictingSerials} conflicting serials, {mapping.mismatchedBankRows} rows naming a different bank. {mapping.duplicateRows} duplicate rows detected.</p>
        {mapping.unsafeNumericCells > 0 && <p>{mapping.unsafeNumericCells} long numeric cells could not be read exactly. Store serial and SIM numbers as Text using the original digits, then upload again.</p>}
        {mapping.sheets.map((sheet, index) => <details key={index}><summary>{sheet.name} — {sheet.skipped || `${sheet.rows} source rows`}</summary>{sheet.headers.map(header => <div key={header.row}><p>Header row {header.row}</p><table className={s.table}><thead><tr><th>File column</th><th>Saved field</th></tr></thead><tbody>{Object.entries(header.mapped).map(([field, names]) => <tr key={field}><td>{names.join(' / ')}</td><td>{field}</td></tr>)}</tbody></table>{header.unmapped.length > 0 && <p>Not imported: {header.unmapped.join(', ')}</p>}</div>)}</details>)}
      </section>}
      <details><summary>Previously uploaded POS</summary><p className={s.sub}>Add this bank’s earlier POS records to Hardware. Existing devices keep their status and history.</p><button className={s.button} disabled={busy || !bank} onClick={addEarlier}>Add missing devices</button></details>
    </div>
  </Modal>
}
