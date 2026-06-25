"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

const emptyForm = { serialNumber: '', model: '', location: '' }
function clean(v) { return String(v || '').trim() }

export default function PosSerialsPage() {
  const token = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const role = String(user?.userRole || '').toUpperCase()
  const isAdmin = role === 'ADMIN' || role === 'MANAGEMENT'
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

  async function loadRows(bank = activeBank) {
    if (!token || !bank) { setRows([]); return }
    try {
      const params = new URLSearchParams({ take: '500', bankName: bank })
      if (q.trim()) params.set('q', q.trim())
      const data = await apiFetch(`/api/pos-serials?${params.toString()}`, token)
      setRows(Array.isArray(data) ? data : [])
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to load POS serials')
    }
  }

  useEffect(() => { loadBanks() }, [token])
  useEffect(() => {
    const t = setTimeout(() => loadRows(activeBank), 250)
    return () => clearTimeout(t)
  }, [token, activeBank, q])

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
      setNotice('POS serial saved under selected bank.')
      await loadRows(bankName)
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to save POS serial')
    } finally {
      setBusy(false)
    }
  }

  async function uploadCsv(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(''); setNotice('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await apiFetch('/api/pos-serials/import', token, { method: 'POST', body: fd })
      setNotice(`Imported ${result.imported || result.processed || 0} POS serial row(s). Banks were auto-created from CSV.`)
      if (fileRef.current) fileRef.current.value = ''
      await loadBanks()
      await loadRows()
    } catch (e) {
      setError(e.message || 'Failed to import CSV')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row) {
    if (!confirm(`Delete POS serial ${row.serialNumber}?`)) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/pos-serials/${row.id}`, token, { method: 'DELETE' })
      await loadRows()
      await loadBanks()
    } catch (e) {
      setError(e.message || 'Failed to delete POS serial')
    } finally {
      setBusy(false)
    }
  }

  const selectedBank = useMemo(() => banks.find((b) => b.name === activeBank), [banks, activeBank])
  const sampleCsv = useMemo(() => 'bankName,serialNumber,model,location\nAB Bank,AB001,PAX A920,Uttora\nEBL,EBL001,Verifone VX520,Gulshan', [])

  if (!isAdmin) {
    return <Layout><div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">Only admin can manage POS serials.</div></Layout>
  }

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-4 text-black">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-black/45">Admin only</p>
          <h1 className="text-3xl font-black">Bank & POS Serial Management</h1>
          <p className="text-sm font-semibold text-black/55">First create a bank, then open that bank and add POS serials. Revolutionary order, apparently.</p>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div>}

        <section className="grid gap-4 xl:grid-cols-[430px_1fr]">
          <div className="space-y-4">
            <form onSubmit={createBank} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-xl font-black">Create bank</h2>
              <div className="flex gap-2">
                <input value={newBankName} onChange={(e) => setNewBankName(e.target.value)} className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Bank name, e.g. Uttara Bank" />
                <button disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">Add</button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-xl font-black">Bulk CSV import</h2>
              <p className="text-sm font-semibold text-black/55">CSV columns: bankName, serialNumber, model, location. Import will auto-create missing banks.</p>
              <pre className="mt-3 overflow-auto rounded-2xl bg-slate-50 p-3 text-xs font-bold text-black/65">{sampleCsv}</pre>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={uploadCsv} className="mt-3 w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold" />
            </div>
          </div>

          <div className="space-y-4">
            <form onSubmit={save} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-xl font-black">Add POS under bank</h2>
              <p className="mb-4 text-sm font-bold text-black/50">Selected bank: {activeBank || 'None'}</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr]">
                <input readOnly value={activeBank} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold" placeholder="Select bank from left" required />
                <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="POS serial number *" required />
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Model" />
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Location, e.g. Uttora" />
                <button disabled={busy || !activeBank} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60 md:col-span-2 xl:col-span-4">Save POS serial</button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-2 border-b border-slate-100 p-3 md:grid-cols-[240px_1fr_auto]">
                <select value={activeBank} onChange={(e) => setActiveBank(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black">
                  <option value="">Select bank</option>
                  {banks.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black" placeholder="Search POS serial / model / location" />
                <button type="button" onClick={() => loadRows()} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">Refresh</button>
              </div>

              <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {rows.map((row) => (
                  <div key={row.id} className="grid gap-2 px-4 py-3 md:grid-cols-[180px_1fr_150px_150px_80px] md:items-center">
                    <div className="text-sm font-black">{row.bankName}</div>
                    <div className="font-mono text-sm font-black">{row.serialNumber}</div>
                    <div className="text-xs font-bold text-black/55">{row.model || 'No model'}</div>
                    <div className="text-xs font-bold text-black/55">{row.location || 'No location'}</div>
                    <button type="button" onClick={() => remove(row)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-700">Delete</button>
                  </div>
                ))}
                {activeBank && !rows.length && <div className="p-10 text-center text-sm font-bold text-black/55">No POS serial found under {activeBank}.</div>}
                {!activeBank && <div className="p-10 text-center text-sm font-bold text-black/55">Select a bank to see POS serials.</div>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}
