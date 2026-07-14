"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

const SERVICE_OTHERS = 'Others'

const empty = {
  title: '',
  bankName: '',
  tidNumber: '',
  posSerial: '',
  zoneName: '',
  serviceType: '',
  customServiceType: '',
  merchantAddress: '',
  priority: 'NORMAL',
  description: ''
}

function badge(status) {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (status === 'IN_PROGRESS') return 'bg-blue-50 text-blue-800 border-blue-200'
  if (status === 'ASSIGNED') return 'bg-indigo-50 text-indigo-800 border-indigo-200'
  return 'bg-amber-50 text-amber-800 border-amber-200'
}

function dt(v) {
  return v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

function clean(v) {
  return String(v || '').trim()
}

export default function TicketsPage() {
  const token = useAuthStore(s => s.accessToken)
  const user = useAuthStore(s => s.user)
  const role = String(user?.userRole || '').toUpperCase()
  const canCreate = role === 'BANK' || role === 'ADMIN' || role === 'MANAGEMENT' || role === 'ASSISTANT'

  const [tickets, setTickets] = useState([])
  const [options, setOptions] = useState({ banks: [], posSerials: [], serviceTypes: [] })
  const [form, setForm] = useState(empty)
  const [posSerialOptions, setPosSerialOptions] = useState([])
  const [posDropdownOpen, setPosDropdownOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const bankName = clean(user?.bankName) || (role === 'BANK' ? clean(user?.name) : '')

  async function searchPos(bank = role === 'BANK' ? bankName : form.bankName, q = form.posSerial) {
    if (!token || !bank) {
      setPosSerialOptions([])
      return
    }

    try {
      const params = new URLSearchParams({ bankName: bank, take: '80' })
      if (clean(q)) params.set('q', clean(q))

      const rows = await apiFetch(`/api/pos-serials?${params.toString()}`, token)
      setPosSerialOptions(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setPosSerialOptions([])
    }
  }

  async function load() {
    if (!token) return

    try {
      const [rows, opts] = await Promise.all([
        apiFetch('/api/tickets', token),
        apiFetch('/api/tickets/options', token).catch(() => ({
          banks: [],
          posSerials: [],
          serviceTypes: []
        }))
      ])

      setTickets(Array.isArray(rows) ? rows : [])
      setOptions(opts || { banks: [], posSerials: [], serviceTypes: [] })

      if (role === 'BANK' && bankName) {
        setForm(s => ({ ...s, bankName }))
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
  }, [token])

  useEffect(() => {
    const t = setTimeout(() => {
      searchPos(role === 'BANK' ? bankName : form.bankName, form.posSerial)
    }, 250)

    return () => clearTimeout(t)
  }, [token, form.bankName, bankName, form.posSerial, role])

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    const serviceType = form.serviceType === SERVICE_OTHERS ? form.customServiceType : form.serviceType
    const payload = {
      ...form,
      serviceType,
      bankName: role === 'BANK' ? bankName : form.bankName
    }

    delete payload.customServiceType

    try {
      await apiFetch('/api/tickets', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      setForm({ ...empty, bankName: role === 'BANK' ? bankName : '' })
      setPosSerialOptions([])
      setPosDropdownOpen(false)
      setOpen(false)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()

    return tickets.filter(t =>
      (status === 'ALL' || t.status === status) &&
      (!q || [
        t.ticketNo,
        t.title,
        t.bankName,
        t.tidNumber,
        t.posSerial,
        t.zoneName,
        t.serviceType,
        t.merchantAddress,
        t.bankUser?.name
      ].join(' ').toLowerCase().includes(q))
    )
  }, [tickets, query, status])

  const stats = useMemo(() => ({
    total: tickets.length,
    submitted: tickets.filter(t => t.status === 'SUBMITTED').length,
    assigned: tickets.filter(t => t.status === 'ASSIGNED').length,
    running: tickets.filter(t => t.status === 'IN_PROGRESS').length,
    done: tickets.filter(t => t.status === 'COMPLETED').length
  }), [tickets])

  const visiblePosOptions = posSerialOptions
    .filter(pos => {
      const text = [pos.serialNumber, pos.model, pos.location].join(' ').toLowerCase()
      const q = String(form.posSerial || '').toLowerCase().trim()
      return !q || text.includes(q)
    })
    .slice(0, 80)

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-4 text-black">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/45">Bank ticket desk</p>
              <h1 className="text-3xl font-black">Tickets</h1>
              <p className="text-sm font-semibold text-black/55">
                Bank raises issue, admin assigns engineer, everyone tracks progress.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-slate-200 px-4 py-2 text-center">
                  <div className="text-lg font-black">{v}</div>
                  <div className="text-[10px] font-black uppercase text-black/45">{k}</div>
                </div>
              ))}

              {canCreate && (
                <button
                  onClick={() => setOpen(!open)}
                  className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white"
                >
                  + New ticket
                </button>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {open && (
          <form onSubmit={create} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-black">Create bank ticket</h2>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
                placeholder="Issue title"
              />

              <select
                required
                value={role === 'BANK' ? bankName : form.bankName}
                disabled={role === 'BANK'}
                onChange={e => {
                  setForm({ ...form, bankName: e.target.value, posSerial: '' })
                  setPosDropdownOpen(false)
                  setPosSerialOptions([])
                }}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black disabled:bg-slate-50"
              >
                <option value="">Select bank *</option>
                {role === 'BANK' && bankName && <option value={bankName}>{bankName}</option>}
                {(options.banks || []).filter(b => b !== bankName).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <input
                value={form.tidNumber}
                onChange={e => setForm({ ...form, tidNumber: e.target.value })}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
                placeholder="TID number"
              />

              <div className="relative">
                <input
                  required
                  value={form.posSerial}
                  onFocus={() => setPosDropdownOpen(true)}
                  onChange={e => {
                    setForm({ ...form, posSerial: e.target.value })
                    setPosDropdownOpen(true)
                  }}
                  disabled={!(role === 'BANK' ? bankName : form.bankName)}
                  placeholder={(role === 'BANK' ? bankName : form.bankName) ? 'Search / select POS serial *' : 'Select bank first'}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm font-bold text-black outline-none transition-all focus:border-black focus:ring-4 focus:ring-black/5 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  disabled={!(role === 'BANK' ? bankName : form.bankName)}
                  onClick={() => setPosDropdownOpen(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 text-sm font-black text-slate-400 disabled:opacity-40"
                >
                  ▾
                </button>

                {posDropdownOpen && (role === 'BANK' ? bankName : form.bankName) && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                    {visiblePosOptions.map(pos => (
                      <button
                        type="button"
                        key={pos.id || pos.serialNumber}
                        onMouseDown={e => {
                          e.preventDefault()
                          setForm({ ...form, posSerial: pos.serialNumber })
                          setPosDropdownOpen(false)
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold text-black hover:bg-slate-100"
                      >
                        <span>{pos.serialNumber}</span>
                        <span className="truncate text-xs font-semibold text-black/45">
                          {[pos.model, pos.location, pos.place].filter(Boolean).join(' · ') || 'No details'}
                        </span>
                      </button>
                    ))}

                    {visiblePosOptions.length === 0 && (
                      <div className="px-3 py-4 text-center text-sm font-bold text-black/45">
                        No POS serial found
                      </div>
                    )}
                  </div>
                )}
              </div>

              <input
                value={form.zoneName}
                onChange={e => setForm({ ...form, zoneName: e.target.value })}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
                placeholder="Zone name"
              />

              <select
                value={form.serviceType}
                onChange={e => setForm({
                  ...form,
                  serviceType: e.target.value,
                  customServiceType: e.target.value === SERVICE_OTHERS ? form.customServiceType : ''
                })}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
              >
                <option value="">Select service type</option>
                {(options.serviceTypes || []).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {form.serviceType === SERVICE_OTHERS && (
                <input
                  value={form.customServiceType}
                  onChange={e => setForm({ ...form, customServiceType: e.target.value })}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
                  placeholder="Type other service"
                />
              )}

              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
              >
                <option>NORMAL</option>
                <option>HIGH</option>
                <option>URGENT</option>
              </select>

              <input
                value={form.merchantAddress}
                onChange={e => setForm({ ...form, merchantAddress: e.target.value })}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black md:col-span-2 xl:col-span-3"
                placeholder="Merchant address"
              />

              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black md:col-span-2 xl:col-span-3"
                placeholder="Problem details"
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white">
                Submit ticket
              </button>
            </div>
          </form>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="ticket-filters" className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white md:hidden">
            <span>Filter{query || status !== 'ALL' ? ' (active)' : ''}</span>
            <span aria-hidden="true">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          <div id="ticket-filters" className={`${filtersOpen ? 'grid' : 'hidden'} mt-2 gap-2 md:mt-0 md:grid md:grid-cols-[1fr_180px_auto]`}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
              placeholder="Search ticket, bank, TID, POS, zone..."
            />

            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black"
            >
              <option value="ALL">All status</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>

            <button onClick={load} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">
              Refresh
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {filtered.map(t => (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="grid gap-2 px-4 py-3 hover:bg-slate-50 xl:grid-cols-[130px_1fr_140px_150px_150px_120px] xl:items-center"
              >
                <div>
                  <div className="text-sm font-black">{t.ticketNo}</div>
                  <div className="text-[11px] font-bold text-black/45">{dt(t.createdAt)}</div>
                </div>

                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{t.title}</div>
                  <div className="truncate text-xs font-semibold text-black/55">
                    {t.tidNumber || 'No TID'} · {t.posSerial || 'No POS'} · {t.zoneName || 'No zone'} · {t.serviceType || 'No service'}
                  </div>
                </div>

                <div className="truncate text-xs font-bold">{t.bankName || t.bankUser?.bankName || t.bankUser?.name}</div>
                <div className="truncate text-xs font-bold">{t.bankUser?.name || t.bankUser?.email}</div>
                <div className="truncate text-xs font-bold">{t.workspace?.assignedEmployee?.name || 'Unassigned'}</div>

                <div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${badge(t.status)}`}>
                    {t.status}
                  </span>
                </div>
              </Link>
            ))}

            {!filtered.length && (
              <div className="p-10 text-center text-sm font-bold text-black/50">
                No ticket found.
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}
