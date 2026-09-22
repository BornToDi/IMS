"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

const blank = { serialNumber: '', tidNumber: '', midNumber: '', merchantName: '', merchantAddress: '', merchantStatus: '', model: '', location: '', place: '', operator: '', simNumber: '', remarks: '' }
const fields = [
  ['serialNumber', 'POS SL No *'], ['tidNumber', 'TID'], ['midNumber', 'MID'],
  ['merchantName', 'DBN / Merchant'], ['merchantAddress', 'Address'],
  ['merchantStatus', 'Status'], ['model', 'Model'], ['location', 'Area / location'],
  ['place', 'Place'], ['operator', 'Telco'], ['simNumber', 'SIM EI'], ['remarks', 'Remarks']
]
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-700'

export default function PosSerialsPage() {
  const token = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const [requestedBank, setRequestedBank] = useState('')
  const role = String(user?.userRole || '').toUpperCase()
  const isAdmin = ['ADMIN', 'MANAGEMENT'].includes(role)
  const isBank = role === 'BANK'
  const canManage = isAdmin || isBank
  const fileRef = useRef(null)
  const [banks, setBanks] = useState([])
  const [bank, setBank] = useState('')
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)
  const [newBank, setNewBank] = useState('')
  const [rename, setRename] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState([])

  useEffect(() => {
    setRequestedBank(new URLSearchParams(window.location.search).get('bank') || '')
  }, [])

  const loadBanks = useCallback(async (preferred) => {
    if (!token) return
    const data = await apiFetch('/api/pos-serials/bank-master', token)
    const list = Array.isArray(data) ? data : []
    setBanks(list)
    setBank((current) => preferred || (list.some((item) => item.name === current) ? current : list[0]?.name || ''))
  }, [token])
  const loadRows = useCallback(async (activeBank, search, currentPage) => {
    if (!token || !activeBank) { setRows([]); setTotal(0); return }
    const params = new URLSearchParams({ bankName: activeBank, q: search, page: String(currentPage), take: '50', paginated: 'true' })
    const data = await apiFetch(`/api/pos-serials?${params}`, token)
    setRows(data.rows || []); setTotal(data.total || 0); setPages(data.totalPages || 1); setSelected([])
  }, [token])
  useEffect(() => { loadBanks(requestedBank).catch((e) => setError(e.message)) }, [loadBanks, requestedBank])
  useEffect(() => {
    const timer = setTimeout(() => { loadRows(bank, query.trim(), page).catch((e) => setError(e.message)) }, 250)
    return () => clearTimeout(timer)
  }, [bank, query, page, loadRows])

  function chooseBank(value) {
    setBank(value); setPage(1); setQuery(''); setSelected([]); setEditing(null); setShowForm(false); setForm(blank)
  }
  function openEdit(row) {
    setEditing(row.id)
    setForm(Object.fromEntries(Object.keys(blank).map((key) => [key, row[key] || ''])))
    setShowForm(true); setError(''); setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function save(e) {
    e.preventDefault()
    if (!bank || !form.serialNumber.trim()) return setError('Select bank and enter POS serial')
    setBusy(true); setError(''); setNotice('')
    try {
      await apiFetch(editing ? `/api/pos-serials/${editing}` : '/api/pos-serials', token, {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bankName: bank })
      })
      setNotice(editing ? 'POS record updated.' : 'POS record saved.')
      setEditing(null); setShowForm(false); setForm(blank)
      await Promise.all([loadRows(bank, query.trim(), page), loadBanks()])
    } catch (e) { setError(e.message || 'Could not save POS record') }
    finally { setBusy(false) }
  }
  async function upload(e) {
    const file = e.target.files?.[0]
    if (!file || !bank) return
    setBusy(true); setError(''); setNotice('')
    try {
      const body = new FormData(); body.append('file', file); body.append('bankName', bank)
      const result = await apiFetch('/api/pos-serials/import', token, { method: 'POST', body })
      setNotice(`${result.imported || 0} POS rows saved for ${bank}${result.skipped ? `; ${result.skipped} skipped because the serial belongs to another bank` : ''}. Search a TID or serial to review updates.`)
      setPage(1); setQuery(''); await Promise.all([loadRows(bank, '', 1), loadBanks()])
    } catch (e) { setError(e.message || 'Import failed') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  async function addBank(e) {
    e.preventDefault(); const name = newBank.trim(); if (!name) return
    setBusy(true); setError('')
    try {
      await apiFetch('/api/pos-serials/bank-master', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      setNewBank(''); setNotice(`${name} added.`); await loadBanks(name)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function renameBank(e) {
    e.preventDefault(); const name = rename.trim(); if (!name || !bank || name === bank) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/pos-serials/bank-master/${encodeURIComponent(bank)}`, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      setRename(''); setNotice(`Bank renamed to ${name}.`); await loadBanks(name)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove(row) {
    if (!confirm(`Delete POS serial ${row.serialNumber}?`)) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/pos-serials/${row.id}`, token, { method: 'DELETE' })
      setNotice('POS record deleted.'); await Promise.all([loadRows(bank, query.trim(), page), loadBanks()])
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function removeSelected(all = false) {
    const count = all ? (banks.find((item) => item.name === bank)?.posCount || 0) : selected.length
    if (!count || !confirm(`Delete ${all ? 'all' : 'selected'} ${count} POS records in ${bank}?`)) return
    setBusy(true); setError('')
    try {
      await apiFetch('/api/pos-serials/bulk', token, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankName: bank, ids: selected, all }) })
      setNotice(`${count} POS records deleted.`); setPage(1); await Promise.all([loadRows(bank, query.trim(), 1), loadBanks()])
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function deleteBank() {
    if (!bank || !confirm(`Delete ${bank}? This can also delete its POS records.`)) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/pos-serials/bank-master/${encodeURIComponent(bank)}`, token, { method: 'DELETE' })
      setNotice(`${bank} deleted.`); chooseBank(''); await loadBanks()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!canManage) return <Layout><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">You do not have permission to manage POS records.</div></Layout>
  return <Layout><main className="mx-auto max-w-7xl space-y-4 text-slate-900">
    <header className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h1 className="text-2xl font-semibold">POS records</h1><p className="mt-1 text-sm text-slate-600">Search by POS SL No, TID, MID, DBN, Telco or SIM EI. Open a row to update its details.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(180px,260px)_1fr_auto] sm:items-end">
        <label className="block text-sm font-medium">Bank<select value={bank} onChange={(e) => chooseBank(e.target.value)} disabled={isBank} className={`${inputClass} disabled:bg-slate-100`}><option value="">Select bank</option>{banks.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Find a record<input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="POS SL No, TID, MID, DBN, Telco or SIM EI" className={inputClass} /></label>
        <button type="button" disabled={!bank} onClick={() => { setEditing(null); setForm(blank); setShowForm(true); setError('') }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add POS</button>
      </div>
      {bank && <p className="mt-3 text-xs text-slate-500">{total} matching records in {bank}</p>}
    </section>
    {showForm && <form onSubmit={save} className="rounded-xl border border-slate-300 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{editing ? 'Edit POS record' : 'Add POS record'}</h2><p className="text-sm text-slate-500">{bank}</p></div><button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-600">Close</button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label]) => <label key={key} className={`block text-sm font-medium ${key === 'merchantAddress' || key === 'remarks' ? 'sm:col-span-2' : ''}`}>{label}<input value={form[key]} required={key === 'serialNumber'} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className={inputClass} /></label>)}</div>
      <div className="mt-4 flex gap-2"><button disabled={busy} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save record'}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button></div>
    </form>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="font-semibold">{bank || 'Select a bank'}</h2><button type="button" onClick={() => loadRows(bank, query.trim(), page).catch((e) => setError(e.message))} disabled={!bank} className="text-sm text-slate-600 disabled:opacity-50">Refresh</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-600"><tr>{isAdmin && <th className="w-8 p-3"><input type="checkbox" aria-label="Select all visible rows" checked={rows.length > 0 && rows.every((row) => selected.includes(row.id))} onChange={(e) => setSelected(e.target.checked ? rows.map((row) => row.id) : [])} /></th>}<th className="p-3">TID</th><th className="p-3">MID</th><th className="p-3">DBN</th><th className="p-3">Address</th><th className="p-3">POS SL No</th><th className="p-3">Telco</th><th className="p-3">SIM EI</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="hover:bg-slate-50">{isAdmin && <td className="p-3"><input type="checkbox" aria-label={`Select ${row.serialNumber}`} checked={selected.includes(row.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></td>}<td className="p-3">{row.tidNumber || '—'}</td><td className="p-3">{row.midNumber || '—'}</td><td className="max-w-[180px] p-3 font-medium">{row.merchantName || '—'}</td><td className="max-w-[220px] p-3"><div className="truncate" title={row.merchantAddress || ''}>{row.merchantAddress || '—'}</div></td><td className="p-3 font-mono">{row.serialNumber}</td><td className="p-3">{row.operator || '—'}</td><td className="p-3">{row.simNumber || '—'}</td><td className="p-3">{row.merchantStatus || '—'}</td><td className="p-3"><button type="button" onClick={() => openEdit(row)} className="font-medium text-blue-700">Edit</button>{isAdmin && <button type="button" onClick={() => remove(row)} className="ml-3 text-red-700">Delete</button>}</td></tr>)}</tbody>
      </table>{bank && !rows.length && <p className="p-8 text-center text-sm text-slate-500">No records found. Try another search or add a POS record.</p>}</div>
      {total > 0 && <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm"><span>Page {page} of {pages} · {total} records</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Next</button></div></div>}
    </section>
    <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-medium">Bulk upload POS serials</summary><p className="mt-3 text-sm text-slate-600">Select the bank first, then upload Excel, CSV or PDF. Matching serials in this bank are updated; PDF imports use detected POS serials.</p><input ref={fileRef} type="file" accept=".xlsx,.csv,.pdf" onChange={upload} disabled={!bank || busy} className="mt-3 block w-full text-sm disabled:opacity-50" /></details>
    {isAdmin && <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-medium">Bank settings and bulk actions</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><form onSubmit={addBank} className="space-y-2"><label className="block text-sm font-medium">New bank<input value={newBank} onChange={(e) => setNewBank(e.target.value)} className={inputClass} /></label><button disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Add bank</button></form><form onSubmit={renameBank} className="space-y-2"><label className="block text-sm font-medium">Rename selected bank<input value={rename} onChange={(e) => setRename(e.target.value)} placeholder={bank || 'Select bank first'} className={inputClass} /></label><button disabled={!bank || busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Rename bank</button></form></div><div className="mt-5 flex flex-wrap gap-2 border-t pt-4 text-sm"><button type="button" onClick={() => removeSelected(false)} disabled={!selected.length || busy} className="rounded-lg border border-red-200 px-3 py-2 text-red-700 disabled:opacity-40">Delete selected ({selected.length})</button><button type="button" onClick={() => removeSelected(true)} disabled={!bank || busy || !banks.find((item) => item.name === bank)?.posCount} className="rounded-lg border border-red-200 px-3 py-2 text-red-700 disabled:opacity-40">Delete all POS in bank</button><button type="button" onClick={deleteBank} disabled={!bank || busy} className="rounded-lg border border-red-200 px-3 py-2 text-red-700 disabled:opacity-40">Delete bank</button></div></details>}
  </main></Layout>
}
