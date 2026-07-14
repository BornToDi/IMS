"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

const emptyForm = { serialNumber: '', model: '', location: '', place: '' }
function clean(v) { return String(v || '').trim() }

export default function PosSerialsPage() {
  const token = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const role = String(user?.userRole || '').toUpperCase()
  const isFullAdmin = role === 'ADMIN' || role === 'MANAGEMENT'
  const fileRef = useRef(null)

  const [banks, setBanks] = useState([])
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [activeBank, setActiveBank] = useState('')
  const [newBankName, setNewBankName] = useState('')
  const [editingBank, setEditingBank] = useState(null)
  const [editingBankName, setEditingBankName] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobilePanel, setMobilePanel] = useState('')
  const [mobileBankMenuOpen, setMobileBankMenuOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [totalRows, setTotalRows] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  async function loadBanks() {
    if (!token) return
    const data = await apiFetch('/api/pos-serials/bank-master', token).catch(() => [])
    const list = Array.isArray(data) ? data : []
    setBanks(list)
    setActiveBank((prev) => {
      if (prev && list.some((b) => b.name === prev)) return prev
      return list[0]?.name || ''
    })
  }

  async function loadRows(bank = activeBank, requestedPage = page) {
    if (!token || !bank) { setRows([]); setTotalRows(0); return }
    try {
      const params = new URLSearchParams({
        take: String(pageSize),
        page: String(requestedPage),
        paginated: 'true',
        bankName: bank
      })
      if (q.trim()) params.set('q', q.trim())
      const data = await apiFetch(`/api/pos-serials?${params.toString()}`, token)
      setRows(Array.isArray(data?.rows) ? data.rows : [])
      setTotalRows(Number(data?.total) || 0)
      setTotalPages(Number(data?.totalPages) || 1)
      setPage(Number(data?.page) || requestedPage)
      setSelectedIds([])
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to load POS serials')
    }
  }

  useEffect(() => { loadBanks() }, [token])
  useEffect(() => {
    const t = setTimeout(() => loadRows(activeBank, page), 250)
    return () => clearTimeout(t)
  }, [token, activeBank, q, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [activeBank, q, pageSize])

  async function createBank(e) {
    e.preventDefault()
    const name = clean(newBankName)
    if (!name) return
    setBusy(true); setError(''); setNotice('')
    try {
      await apiFetch('/api/pos-serials/bank-master', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      setNewBankName('')
      setActiveBank(name)
      setMobilePanel('')
      setNotice('Bank created. Now add POS serials under this bank.')
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to create bank')
    } finally { setBusy(false) }
  }

  async function renameBank(e) {
    e.preventDefault()
    const oldName = clean(editingBank)
    const name = clean(editingBankName)
    if (!oldName || !name) return
    setBusy(true); setError(''); setNotice('')
    try {
      await apiFetch(`/api/pos-serials/bank-master/${encodeURIComponent(oldName)}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      setEditingBank(null)
      setEditingBankName('')
      setActiveBank(name)
      setNotice('Bank renamed everywhere: users, tickets, tasks, hardware and POS serials.')
      await loadBanks()
      await loadRows(name)
    } catch (e) {
      setError(e.message || 'Failed to rename bank')
    } finally { setBusy(false) }
  }

  async function deleteBank(name) {
    if (!confirm(`Delete bank ${name}? Bank with active POS serials or users cannot be deleted.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await apiFetch(`/api/pos-serials/bank-master/${encodeURIComponent(name)}`, token, { method: 'DELETE' })
      setNotice('Bank deleted.')
      setActiveBank('')
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to delete bank')
    } finally { setBusy(false) }
  }

  async function save(e) {
    e.preventDefault()
    const bankName = clean(activeBank)
    if (!bankName) return setError('Create/select a bank first')
    setBusy(true); setError(''); setNotice('')
    try {
      await apiFetch('/api/pos-serials', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bankName })
      })
      setForm(emptyForm)
      setMobilePanel('')
      setNotice('POS serial saved under selected bank.')
      await loadRows(bankName)
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to save POS serial')
    } finally {
      setBusy(false)
    }
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!activeBank) {
      e.target.value = ''
      return setError('Select a bank before uploading Excel')
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bankName', activeBank)
      const result = await apiFetch('/api/pos-serials/import', token, { method: 'POST', body: fd })
      setNotice(`Saved ${result.imported || result.processed || 0} POS serial(s) under ${activeBank}.`)
      setMobilePanel('')
      if (fileRef.current) fileRef.current.value = ''
      await loadBanks()
      setPage(1)
      await loadRows(activeBank, 1)
    } catch (e) {
      setError(e.message || 'Failed to import file')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row) {
    if (!confirm(`Delete POS serial ${row.serialNumber}?`)) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/pos-serials/${row.id}`, token, { method: 'DELETE' })
      await loadRows(activeBank, page)
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to delete POS serial')
    } finally {
      setBusy(false)
    }
  }

  function toggleRow(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  function toggleVisibleRows() {
    const visibleIds = rows.map((row) => row.id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
    setSelectedIds(allVisibleSelected ? [] : visibleIds)
  }

  async function bulkRemove(deleteAll = false) {
    const total = deleteAll ? (selectedBank?.posCount || rows.length) : selectedIds.length
    if (!activeBank || !total) return
    const message = deleteAll
      ? `Delete all ${total} POS serials under ${activeBank}?`
      : `Delete ${total} selected POS serial(s) under ${activeBank}?`
    if (!confirm(message)) return

    setBusy(true); setError(''); setNotice('')
    try {
      const result = await apiFetch('/api/pos-serials/bulk', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName: activeBank, ids: selectedIds, all: deleteAll })
      })
      setSelectedIds([])
      setNotice(`Deleted ${result.deleted || 0} POS serial(s) from ${activeBank}.`)
      const nextPage = deleteAll ? 1 : (page > 1 && rows.length === result.deleted ? page - 1 : page)
      setPage(nextPage)
      await loadRows(activeBank, nextPage)
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to delete POS serials')
    } finally {
      setBusy(false)
    }
  }

  const selectedBank = useMemo(() => banks.find((b) => b.name === activeBank), [banks, activeBank])
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))
  const sampleCsv = useMemo(() => 'bankName,serialNumber,model,location,place\nAB Bank,AB001,PAX A920,Gulshan 1,Uday Tower\nEBL,EBL001,Verifone VX520,Uttara,Rajuk Commercial Complex', [])

  if (!isFullAdmin) {
    return <Layout><div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">Only full admin can manage POS serials.</div></Layout>
  }

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-4 text-black">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-black/45">Admin only</p>
          <h1 className="text-3xl font-black">Bank & POS Serial Management</h1>
          <p className="text-sm font-semibold text-black/55">First create a bank, then open that bank and add POS serials. Revolutionary order, apparently.</p>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div>}

        <section className="sticky top-16 z-20 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:hidden">
          <label htmlFor="mobile-bank-select" className="mb-1.5 block px-1 text-xs font-black uppercase tracking-wide text-black/50">Working bank</label>
          <div className="relative">
            <button
              id="mobile-bank-select"
              type="button"
              onClick={() => setMobileBankMenuOpen((open) => !open)}
              aria-expanded={mobileBankMenuOpen}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3 py-3 text-left shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-base font-black text-white">B</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-slate-950">{activeBank || 'Select a bank'}</span>
                <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{selectedBank ? `${selectedBank.posCount || 0} active POS serials` : 'Choose the bank you want to manage'}</span>
              </span>
              <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs text-slate-600 transition ${mobileBankMenuOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {mobileBankMenuOpen && (
              <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                {banks.map((bank) => {
                  const selected = bank.name === activeBank
                  return (
                    <button
                      key={bank.name}
                      type="button"
                      onClick={() => { setActiveBank(bank.name); setMobileBankMenuOpen(false) }}
                      className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left last:mb-0 ${selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${selected ? 'bg-white/15' : 'bg-slate-100 text-slate-700'}`}>{bank.name.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{bank.name}</span>
                        <span className={`block text-[11px] font-bold ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{bank.posCount || 0} active POS serials</span>
                      </span>
                      {selected && <span className="text-sm" aria-label="Selected">✓</span>}
                    </button>
                  )
                })}
                {!banks.length && <div className="px-3 py-6 text-center text-sm font-bold text-slate-500">No banks available</div>}
              </div>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ['banks', 'Manage banks'],
              ['add', 'Add POS'],
              ['import', 'Import file'],
              ['create', 'New bank']
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setMobilePanel((current) => current === key ? '' : key)} className={`rounded-xl px-3 py-2.5 text-xs font-black ${mobilePanel === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[430px_1fr]">
          <div className="space-y-4">
            <form onSubmit={createBank} className={`${mobilePanel === 'create' ? 'block' : 'hidden'} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:block md:p-5`}>
              <h2 className="mb-4 text-xl font-black">Create bank</h2>
              <div className="flex gap-2">
                <input value={newBankName} onChange={(e) => setNewBankName(e.target.value)} className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Bank name, e.g. Uttara Bank" />
                <button disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">Add</button>
              </div>
            </form>

            <div className={`${mobilePanel === 'banks' ? 'block' : 'hidden'} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:block md:p-5`}>
              <h2 className="mb-4 text-xl font-black">Bank list</h2>
              <div className="max-h-[360px] space-y-2 overflow-y-auto">
                {banks.map((bank) => (
                  <div key={bank.id || bank.name} className={`rounded-2xl border p-3 ${activeBank === bank.name ? 'border-black bg-slate-50' : 'border-slate-200 bg-white'}`}>
                    {editingBank === bank.name ? (
                      <form onSubmit={renameBank} className="flex gap-2">
                        <input value={editingBankName} onChange={(e) => setEditingBankName(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                        <button disabled={busy} className="rounded-xl bg-black px-3 py-2 text-xs font-black text-white">Save</button>
                        <button type="button" onClick={() => { setEditingBank(null); setEditingBankName('') }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Cancel</button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={() => setActiveBank(bank.name)} className="min-w-0 text-left">
                          <div className="truncate text-sm font-black">{bank.name}</div>
                          <div className="text-[11px] font-bold text-black/45">{bank.posCount || 0} active POS serials</div>
                        </button>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => { setEditingBank(bank.name); setEditingBankName(bank.name) }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Edit</button>
                          <button type="button" onClick={() => deleteBank(bank.name)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!banks.length && <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-black/50">No bank found. Create one first.</div>}
              </div>
            </div>

            <div className={`${mobilePanel === 'import' ? 'block' : 'hidden'} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:block md:p-5`}>
              <h2 className="mb-2 text-xl font-black">Bulk Excel import</h2>
              <p className="text-sm font-semibold text-black/55">First select a bank above, then upload an Excel file containing one or more “POS Serial NO” columns.</p>
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-black/65">
                Selected bank: <span className="text-black">{activeBank || 'Select a bank first'}</span>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv" onChange={uploadFile} disabled={busy || !activeBank} className="mt-3 w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" />
              <details className="mt-3 text-xs font-bold text-black/55">
                <summary className="cursor-pointer">CSV format (optional)</summary>
                <pre className="mt-2 overflow-auto rounded-2xl bg-slate-50 p-3 text-xs font-bold text-black/65">{sampleCsv}</pre>
              </details>
            </div>
          </div>

          <div className="space-y-4">
            <form onSubmit={save} className={`${mobilePanel === 'add' ? 'block' : 'hidden'} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:block md:p-5`}>
              <h2 className="mb-1 text-xl font-black">Add POS under bank</h2>
              <p className="mb-4 text-sm font-bold text-black/50">Selected bank: {activeBank || 'None'}</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input readOnly value={activeBank} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold" placeholder="Select bank from left" required />
                <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="POS serial number *" required />
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Model" />
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Location, e.g. Gulshan 1" />
                <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Place, e.g. Uday Tower" />
                <button disabled={busy || !activeBank} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60 md:col-span-2 xl:col-span-5">Save POS serial</button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-2 border-b border-slate-100 p-3 md:grid-cols-[240px_1fr_auto]">
                <select value={activeBank} onChange={(e) => setActiveBank(e.target.value)} className="hidden rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black md:block">
                  <option value="">Select bank</option>
                  {banks.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Search serial, model, location or place" />
                <button type="button" onClick={() => loadRows()} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">Refresh</button>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-black">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleRows} disabled={!rows.length || busy} className="h-4 w-4 accent-black" />
                  Select this page ({rows.length})
                </label>
                <span className="text-xs font-bold text-black/50">{selectedIds.length} selected</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button type="button" onClick={() => bulkRemove(false)} disabled={!selectedIds.length || busy} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">Delete selected</button>
                  <button type="button" onClick={() => bulkRemove(true)} disabled={!activeBank || !(selectedBank?.posCount) || busy} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Delete all in bank ({selectedBank?.posCount || 0})</button>
                </div>
              </div>

              <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {rows.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[36px_45px_130px_1fr_110px_120px_120px_75px] md:gap-2">
                    <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} disabled={busy} className="h-4 w-4 accent-black" aria-label={`Select ${row.serialNumber}`} />
                    <div className="hidden text-sm font-black text-black/45 md:block">{(page - 1) * pageSize + index + 1}</div>
                    <div className="hidden text-sm font-black md:block">{row.bankName}</div>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-black">{row.serialNumber}</div>
                      <div className="mt-1 truncate text-xs font-bold text-black/50 md:hidden">{[row.model, row.location, row.place].filter(Boolean).join(' · ') || 'No details'}</div>
                    </div>
                    <div className="hidden text-xs font-bold text-black/55 md:block">{row.model || 'No model'}</div>
                    <div className="hidden text-xs font-bold text-black/55 md:block">{row.location || 'No location'}</div>
                    <div className="hidden text-xs font-bold text-black/55 md:block">{row.place || 'No place'}</div>
                    <button type="button" onClick={() => remove(row)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button>
                  </div>
                ))}
                {activeBank && !rows.length && <div className="p-10 text-center text-sm font-bold text-black/55">No POS serial found under {activeBank}.</div>}
                {!activeBank && <div className="p-10 text-center text-sm font-bold text-black/55">Select a bank to see POS serials.</div>}
              </div>
              {activeBank && totalRows > 0 && (
                <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="text-xs font-bold text-black/55">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)} of {totalRows}
                  </div>
                  <div className="grid grid-cols-2 items-center gap-2 sm:flex">
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                      <option value={250}>250 / page</option>
                      <option value={500}>500 / page</option>
                    </select>
                    <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page <= 1 || busy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black disabled:opacity-40">← Previous</button>
                    <span className="col-span-2 row-start-1 min-w-20 text-center text-xs font-black sm:col-auto sm:row-auto">Page {page} / {totalPages}</span>
                    <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page >= totalPages || busy} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black disabled:opacity-40">Next →</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}
