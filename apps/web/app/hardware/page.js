"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

const PROBLEM_OPTIONS = [
  'Power issue',
  'Display not working',
  'Keypad not working',
  'Printer not working',
  'SIM/network issue',
  'Battery problem',
  'Charging port issue',
  'Card reader issue',
  'Software hang',
  'Physical damage'
]

const emptyItem = { serialNumber: '', problem: '', note: '' }
const empty = { bankName: '', ticketId: '', assignedToId: '', totalQuantity: '', note: '', items: Array.from({ length: 1 }, () => ({ ...emptyItem })) }

function dt(v) { return v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '' }
function badge(s) {
  if (s === 'COMPLETED') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (s === 'REPAIRING') return 'bg-blue-50 text-blue-800 border-blue-200'
  if (s === 'PARTIALLY_RETURNED') return 'bg-indigo-50 text-indigo-800 border-indigo-200'
  return 'bg-amber-50 text-amber-800 border-amber-200'
}
function clean(v) { return String(v || '').trim() }

export default function HardwarePage() {
  const token = useAuthStore(s => s.accessToken)
  const user = useAuthStore(s => s.user)
  const role = String(user?.userRole || '').toUpperCase()
  const isAdmin = ['ADMIN', 'MANAGEMENT'].includes(role)
  const isBank = role === 'BANK'
  const canCreate = isAdmin || isBank
  const userBankName = clean(user?.bankName) || (isBank ? clean(user?.name) : '')

  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [tickets, setTickets] = useState([])
  const [posBanks, setPosBanks] = useState([])
  const [posSerials, setPosSerials] = useState([])
  const [serialsLoading, setSerialsLoading] = useState(false)
  const [form, setForm] = useState(empty)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  function updateItem(index, field, value) {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }))
  }

  function setBankName(bankName) {
    setForm(prev => ({
      ...prev,
      bankName,
      items: prev.items.map(item => ({ ...item, serialNumber: '' }))
    }))
  }

  function resetFormForUser() {
    setForm({ ...empty, bankName: isBank ? userBankName : '' })
  }

  async function loadPosBanks() {
    if (!token || !canCreate) return
    try {
      if (isBank) {
        setPosBanks(userBankName ? [userBankName] : [])
        if (userBankName) setForm(prev => prev.bankName === userBankName ? prev : { ...prev, bankName: userBankName, items: prev.items.map(item => ({ ...item, serialNumber: '' })) })
      } else {
        const data = await apiFetch('/api/pos-serials/banks', token)
        setPosBanks(Array.isArray(data?.banks) ? data.banks : [])
      }
    } catch (e) {
      setPosBanks([])
    }
  }

  async function loadPosSerials(bankName) {
    if (!token || !canCreate) return
    const bank = isBank ? userBankName : clean(bankName)
    if (!bank) { setPosSerials([]); return }
    setSerialsLoading(true)
    try {
      const params = new URLSearchParams({ take: '500', bankName: bank })
      const data = await apiFetch(`/api/pos-serials?${params.toString()}`, token)
      setPosSerials(Array.isArray(data) ? data : [])
    } catch (e) {
      setPosSerials([])
    } finally {
      setSerialsLoading(false)
    }
  }

  function addItemRow() {
    setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }))
  }

  function removeItemRow(index) {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))
  }

  async function load() {
    if (!token) return
    try {
      setRows(await apiFetch('/api/hardware', token))
      if (canCreate) {
        const allUsers = await apiFetch('/api/auth/users', token)
        setUsers(allUsers.filter(u => isBank ? ['ADMIN', 'MANAGEMENT'].includes(String(u.userRole).toUpperCase()) : String(u.userRole).toUpperCase() !== 'BANK'))
        setTickets(await apiFetch('/api/tickets', token))
        await loadPosBanks()
      }
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [token, role])

  useEffect(() => {
    if (canCreate) loadPosSerials(isBank ? userBankName : form.bankName)
  }, [token, role, form.bankName, userBankName])

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    const items = form.items
      .map(item => ({ serialNumber: clean(item.serialNumber), problem: clean(item.problem), note: clean(item.note) }))
      .filter(item => item.serialNumber || item.problem || item.note)

    const effectiveBankName = isBank ? userBankName : clean(form.bankName)

    if (!effectiveBankName) {
      setBusy(false)
      return setError(isBank ? 'Your bank account has no bank assigned. Register/select bank first.' : 'Please select bank name')
    }

    if (!items.length) {
      setBusy(false)
      return setError('Minimum one POS serial and problem is required')
    }
    if (items.some(item => !item.serialNumber || !item.problem)) {
      setBusy(false)
      return setError('Every POS row needs serial number and problem')
    }

    try {
      await apiFetch('/api/hardware', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bankName: effectiveBankName, totalQuantity: items.length, items })
      })
      resetFormForUser()
      setOpen(false)
      setSuccess(isBank ? 'Hardware batch sent to admin successfully.' : 'Hardware batch created successfully.')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const filledItems = useMemo(() => form.items.filter(item => clean(item.serialNumber) || clean(item.problem) || clean(item.note)).length, [form.items])
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return rows.filter(r =>
      (status === 'ALL' || r.status === status) &&
      (!q || [r.batchNo, r.bankName, r.ticket?.ticketNo, r.assignedTo?.name, r.note, ...(r.items || []).map(i => `${i.serialNumber} ${i.problem}`)].join(' ').toLowerCase().includes(q))
    )
  }, [rows, query, status])
  const stats = useMemo(() => ({ total: rows.length, sent: rows.filter(r => r.status === 'SENT').length, repairing: rows.filter(r => r.status === 'REPAIRING').length, done: rows.filter(r => r.status === 'COMPLETED').length }), [rows])
  const effectiveBankName = isBank ? userBankName : form.bankName

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-4 text-black">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/45">Hardware movement</p>
              <h1 className="text-3xl font-black">POS repair batches</h1>
              <p className="text-sm font-semibold text-black/55">Track POS serial, problem, repair and return status.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats).map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 px-4 py-2 text-center"><div className="text-lg font-black">{v}</div><div className="text-[10px] font-black uppercase text-black/45">{k}</div></div>)}
              {canCreate && <button onClick={() => { if (!open) resetFormForUser(); setOpen(!open) }} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white">+ New batch</button>}
            </div>
          </div>
        </section>

        {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{success}</div>}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

        {open && (
          <form onSubmit={create} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">{isBank ? 'Send POS hardware batch to admin' : 'Create hardware batch'}</h2>
                <p className="text-xs font-bold text-black/50">Filled POS rows: {filledItems}. Total quantity auto hobe filled row count diye.</p>
              </div>
              <button type="button" onClick={addItemRow} className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-black">+ Add row</button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {isBank ? (
                <input readOnly value={userBankName} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold" placeholder="Your registered bank" />
              ) : (
                <select value={form.bankName} onChange={e => setBankName(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold">
                  <option value="">Select bank name</option>
                  {posBanks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <input readOnly value={filledItems || ''} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold" placeholder="Total POS quantity auto" />
              <select value={form.assignedToId} onChange={e => setForm({ ...form, assignedToId: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold">
                <option value="">{isBank ? 'Assign to admin' : 'Assign hardware person'}</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
              <select value={form.ticketId} onChange={e => setForm({ ...form, ticketId: e.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold md:col-span-2 xl:col-span-3">
                <option value="">Link ticket optional</option>
                {tickets.map(t => <option key={t.id} value={t.id}>{t.ticketNo} · {t.title}</option>)}
              </select>
            </div>

            <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-200">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[60px_1fr_1fr_1fr_60px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-black uppercase text-black/45">
                  <div>SL</div><div>POS serial</div><div>Problem</div><div>Note</div><div></div>
                </div>
                <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                  {form.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-[60px_1fr_1fr_1fr_60px] gap-2 px-3 py-2">
                      <div className="py-3 text-sm font-black text-black/50">{index + 1}</div>
                      <select value={item.serialNumber} onChange={e => updateItem(index, 'serialNumber', e.target.value)} disabled={!effectiveBankName || serialsLoading} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:bg-slate-50 disabled:text-black/40">
                        <option value="">{serialsLoading ? 'Loading serials...' : effectiveBankName ? 'Select POS serial' : (isBank ? 'No bank assigned' : 'Select bank first')}</option>
                        {posSerials.map(pos => {
                          const selectedElsewhere = form.items.some((row, rowIndex) => rowIndex !== index && row.serialNumber === pos.serialNumber)
                          const details = [pos.model, pos.location, pos.place].filter(Boolean).join(' · ')
                          return <option key={pos.id || pos.serialNumber} value={pos.serialNumber} disabled={selectedElsewhere}>{pos.serialNumber}{details ? ` · ${details}` : ''}</option>
                        })}
                      </select>
                      <select value={item.problem} onChange={e => updateItem(index, 'problem', e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold">
                        <option value="">Select problem</option>
                        {PROBLEM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <input value={item.note} onChange={e => updateItem(index, 'note', e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="Optional note" />
                      <button type="button" onClick={() => removeItemRow(index)} className="rounded-xl border border-red-200 text-xs font-black text-red-700">⌫</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="mt-3 min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="Batch note, e.g. 20 POS sent to repair team" />
            <div className="mt-4 flex justify-end"><button disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">Create batch</button></div>
          </form>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setFiltersOpen(current => !current)}
            aria-expanded={filtersOpen}
            aria-controls="hardware-filters"
            className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white md:hidden"
          >
            <span>Filter{query || status !== 'ALL' ? ' (active)' : ''}</span>
            <span aria-hidden="true">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          <div id="hardware-filters" className={`${filtersOpen ? 'grid' : 'hidden'} mt-2 gap-2 md:mt-0 md:grid md:grid-cols-[1fr_180px_auto]`}>
            <input value={query} onChange={e => setQuery(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="Search batch, bank, ticket, person, POS serial, problem..." />
            <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"><option value="ALL">All status</option><option value="SENT">Sent</option><option value="RECEIVED">Received</option><option value="REPAIRING">Repairing</option><option value="PARTIALLY_RETURNED">Partially returned</option><option value="COMPLETED">Completed</option></select>
            <button onClick={load} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">Refresh</button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {filtered.map(b => <Link key={b.id} href={`/hardware/${b.id}`} className="grid gap-2 px-4 py-3 hover:bg-slate-50 xl:grid-cols-[150px_1fr_140px_180px_120px] xl:items-center"><div><div className="text-sm font-black">{b.batchNo}</div><div className="text-[11px] font-bold text-black/45">{dt(b.createdAt)}</div></div><div><div className="truncate text-sm font-black">{b.bankName || b.ticket?.ticketNo || 'Hardware batch'}</div><div className="truncate text-xs font-semibold text-black/55">Total {b.totalQuantity} · Items {(b.items || []).length} · {((b.items || [])[0]?.serialNumber) || 'No serial preview'}</div></div><div className="text-xs font-bold">Pending {b.pendingQuantity}</div><div className="truncate text-xs font-bold">{b.assignedTo?.name || 'Unassigned'}</div><div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${badge(b.status)}`}>{b.status}</span></div></Link>)}
            {!filtered.length && <div className="p-10 text-center text-sm font-bold text-black/50">No hardware batch found.</div>}
          </div>
        </section>
      </div>
    </Layout>
  )
}
