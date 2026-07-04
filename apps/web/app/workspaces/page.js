"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

const emptyForm = {
  bankName: '',
  tidNumber: '',
  posSerial: '',
  zoneName: '',
  serviceType: '',
  merchantAddress: '',
  assignedEmployeeId: '',
  description: '',
  isImportant: false
}

function statusClass(status) {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (status === 'IN_PROGRESS') return 'bg-blue-50 text-blue-800 border-blue-200'
  return 'bg-amber-50 text-amber-800 border-amber-200'
}

function niceDate(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet'
}

function reportTime(task) {
  const latest = task?.taskUpdates?.[0]
  return latest?.createdAt || task?.completedAt || task?.startedAt || task?.createdAt || ''
}

function completedWorkRemark(task) {
  const completed = (task?.taskUpdates || []).find(
    (u) => u?.status === 'COMPLETED' && String(u?.serviceType || '').trim()
  )
  return completed?.serviceType || ''
}

function escapeCsv(value) {
  const v = String(value ?? '')
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function downloadCsvReport(rows) {
 const columns = [
  'Bank Ticket Raise Time',
  'Admin Assign Time',
  'Work Finish Time',
  'Bank Name',
  'Zone',
  'Engineer Name',
  'TID',
  'POS Serial',
  'Merchant Address',
  'Service Type',
  'Remarks'
]
const body = rows.map((task) => {
  const assignedUpdate = (task.taskUpdates || []).find(
    (u) => u.status === 'ASSIGNED'
  )

  const completedUpdate = (task.taskUpdates || []).find(
    (u) => u.status === 'COMPLETED'
  )

  return [
    niceDate(task.createdAt),                              // Bank Raise Time
    niceDate(assignedUpdate?.createdAt || task.startedAt), // Admin Assign Time
    niceDate(completedUpdate?.createdAt || task.completedAt), // Finish Time
    task.bankName || '',                                   // Bank Name
    task.zoneName || '',
    task.assignedEmployee?.name ||
      task.assignedEmployee?.email ||
      '',
    task.tidNumber || '',
    task.posSerial || '',
    task.merchantAddress || '',
    task.serviceType || '',
    completedWorkRemark(task)
  ]
})
  const csv = [columns, ...body].map((r) => r.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `field-task-report-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function inDateRange(task, range) {
  if (range === 'ALL') return true
  const t = new Date(reportTime(task) || task.createdAt).getTime()
  const now = new Date()
  if (range === '7') return t >= now.getTime() - 7 * 86400000
  if (range === '15') return t >= now.getTime() - 15 * 86400000
  if (range === '30') return t >= now.getTime() - 30 * 86400000
  if (range === 'MONTH') return new Date(t).getMonth() === now.getMonth() && new Date(t).getFullYear() === now.getFullYear()
  if (range === 'YEAR') return new Date(t).getFullYear() === now.getFullYear()
  return true
}

export default function WorkspacesPage() {
  const { accessToken, user } = useAuthStore()
  const [workspaces, setWorkspaces] = useState([])
  const [employees, setEmployees] = useState([])
  const [bankOptions, setBankOptions] = useState([])
  const [serviceTypeOptions, setServiceTypeOptions] = useState([])
  const [posSerialOptions, setPosSerialOptions] = useState([])
  const [posDropdownOpen, setPosDropdownOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [dateFilter, setDateFilter] = useState('30')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function searchPos(bankName = form.bankName, q = form.posSerial) {
    if (!accessToken || !bankName) {
      setPosSerialOptions([])
      return
    }

    try {
      const params = new URLSearchParams({ bankName, take: '100' })
      if (String(q || '').trim()) params.set('q', String(q).trim())

      const rows = await apiFetch(`/api/pos-serials?${params.toString()}`, accessToken)
      setPosSerialOptions(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setPosSerialOptions([])
    }
  }

  async function load() {
    if (!accessToken) return

    try {
      const [tasks, users, opts] = await Promise.all([
        apiFetch('/api/workspaces', accessToken),
        apiFetch('/api/workspaces/employees', accessToken).catch(() => []),
        apiFetch('/api/tickets/options', accessToken).catch(() => ({ banks: [] }))
      ])

      setWorkspaces(Array.isArray(tasks) ? tasks : [])

      setEmployees(
        Array.isArray(users)
          ? users.filter((u) => ['EMPLOYEE', 'FIELD_EMPLOYEE'].includes(String(u.userRole || u.role || '').toUpperCase()))
          : []
      )

      setBankOptions(Array.isArray(opts?.banks) ? opts.banks : [])
      setServiceTypeOptions(Array.isArray(opts?.serviceTypes) ? opts.serviceTypes : [])
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to load field tasks')
    }
  }

  useEffect(() => {
    load()
  }, [accessToken])

  useEffect(() => {
    const t = setTimeout(() => {
      searchPos(form.bankName, form.posSerial)
    }, 250)

    return () => clearTimeout(t)
  }, [form.bankName, form.posSerial, accessToken])

  const stats = useMemo(() => ({
    total: workspaces.length,
    important: workspaces.filter((w) => w.isImportant).length,
    pending: workspaces.filter((w) => w.taskStatus === 'PENDING').length,
    progress: workspaces.filter((w) => w.taskStatus === 'IN_PROGRESS').length,
    done: workspaces.filter((w) => w.taskStatus === 'COMPLETED').length
  }), [workspaces])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    return workspaces
      .filter((w) => {
        const statusOk =
          filter === 'ALL' ||
          w.taskStatus === filter ||
          (filter === 'IMPORTANT' && w.isImportant) ||
          (filter === 'MINE' && w.assignedEmployeeId === user?.id)

        const dateOk = inDateRange(w, dateFilter)

        const text = `${w.name || ''} ${w.bankName || ''} ${w.tidNumber || ''} ${w.posSerial || ''} ${w.zoneName || ''} ${w.serviceType || ''} ${w.merchantAddress || ''} ${w.assignedEmployee?.name || ''} ${w.assignedEmployee?.email || ''}`.toLowerCase()

        return statusOk && dateOk && (!q || text.includes(q))
      })
      .sort((a, b) =>
        Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)) ||
        new Date(b.createdAt) - new Date(a.createdAt)
      )
  }, [workspaces, query, filter, dateFilter, user?.id])

  const visiblePosOptions = useMemo(() => {
    const q = String(form.posSerial || '').toLowerCase().trim()

    return posSerialOptions
      .filter((pos) => {
        const text = [pos.serialNumber, pos.model, pos.location].join(' ').toLowerCase()
        return !q || text.includes(q)
      })
      .slice(0, 100)
  }, [posSerialOptions, form.posSerial])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setPosSerialOptions([])
    setPosDropdownOpen(false)
    setFormOpen(true)
    setError('')
  }

  function startEdit(task) {
    setEditingId(task.id)
    setForm({
      bankName: task.bankName || '',
      tidNumber: task.tidNumber || '',
      posSerial: task.posSerial || '',
      zoneName: task.zoneName || '',
      serviceType: task.serviceType || '',
      merchantAddress: task.merchantAddress || '',
      assignedEmployeeId: task.assignedEmployeeId || '',
      description: task.description || '',
      isImportant: Boolean(task.isImportant)
    })
    setPosDropdownOpen(false)
    setFormOpen(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveTask(e) {
    e.preventDefault()
    setError('')

    if (!form.tidNumber.trim()) return setError('TID number is required')
    if (!form.assignedEmployeeId) return setError('Select an employee')
    if (!form.posSerial.trim()) return setError('Select POS serial')

    setBusy(true)

    try {
      const payload = {
        ...form,
        name: `${form.tidNumber.trim()}${form.serviceType ? ` • ${form.serviceType}` : ''}`,
        accentColor: '#111827'
      }

      await apiFetch(editingId ? `/api/workspaces/${editingId}` : '/api/workspaces', accessToken, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      setForm(emptyForm)
      setPosSerialOptions([])
      setPosDropdownOpen(false)
      setFormOpen(false)
      setEditingId(null)
      await load()
    } catch (e) {
      setError(e.message || 'Failed to save task')
    } finally {
      setBusy(false)
    }
  }

  async function deleteTask(task) {
    if (!confirm(`Delete task ${task.tidNumber || task.name}?`)) return

    setBusy(true)

    try {
      await apiFetch(`/api/workspaces/${task.id}`, accessToken, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e.message || 'Failed to delete task')
    } finally {
      setBusy(false)
    }
  }

  async function toggleImportant(task) {
    setBusy(true)

    try {
      await apiFetch(`/api/workspaces/${task.id}`, accessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...task,
          isImportant: !task.isImportant,
          assignedEmployeeId: task.assignedEmployeeId || ''
        })
      })

      await load()
    } catch (e) {
      setError(e.message || 'Failed to update importance')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-4 text-black">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/50">Field task workspace</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-black sm:text-3xl">POS job control</h1>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {[
                ['Total', stats.total],
                ['Important', stats.important],
                ['Pending', stats.pending],
                ['Running', stats.progress],
                ['Done', stats.done]
              ].map(([label, count]) => (
                <div key={label} className="rounded-2xl border border-slate-200 px-4 py-2 text-center">
                  <div className="text-lg font-black">{count}</div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-black/45">{label}</div>
                </div>
              ))}

              <button onClick={startCreate} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white sm:min-w-44">
                + New task
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {formOpen && (
          <form onSubmit={saveTask} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-black">{editingId ? 'Edit task' : 'Create task'}</h2>

              <button
                type="button"
                onClick={() => {
                  setFormOpen(false)
                  setEditingId(null)
                  setForm(emptyForm)
                  setPosSerialOptions([])
                  setPosDropdownOpen(false)
                }}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-black"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <select
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black"
                value={form.bankName}
                onChange={(e) => {
                  update('bankName', e.target.value)
                  update('posSerial', '')
                  setPosSerialOptions([])
                  setPosDropdownOpen(false)
                }}
              >
                <option value="">Select bank *</option>
                {bankOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <input
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black"
                value={form.tidNumber}
                onChange={(e) => update('tidNumber', e.target.value)}
                placeholder="TID number *"
              />

              <div className="relative">
                <input
                  required
                  value={form.posSerial}
                  onFocus={() => setPosDropdownOpen(true)}
                  onChange={(e) => {
                    update('posSerial', e.target.value)
                    setPosDropdownOpen(true)
                  }}
                  disabled={!form.bankName}
                  placeholder={form.bankName ? 'Search / Select POS Serial *' : 'Select Bank First'}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm font-semibold text-black outline-none transition-all focus:border-black focus:ring-4 focus:ring-black/5 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  disabled={!form.bankName}
                  onClick={() => setPosDropdownOpen((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 text-sm font-black text-slate-400 disabled:opacity-40"
                >
                  ▾
                </button>

                {posDropdownOpen && form.bankName && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    {visiblePosOptions.map((pos) => (
                      <button
                        key={pos.id || pos.serialNumber}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          update('posSerial', pos.serialNumber)
                          setPosDropdownOpen(false)
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold text-black hover:bg-slate-100"
                      >
                        <span>{pos.serialNumber}</span>

                        <span className="truncate text-xs font-semibold text-slate-500">
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
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black"
                value={form.zoneName}
                onChange={(e) => update('zoneName', e.target.value)}
                placeholder="Zone name"
              />

              <select
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black"
                value={form.serviceType}
                onChange={(e) => update('serviceType', e.target.value)}
              >
                <option value="">Select service type *</option>
                {serviceTypeOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black"
                value={form.assignedEmployeeId}
                onChange={(e) => update('assignedEmployeeId', e.target.value)}
              >
                <option value="">Assign employee *</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>
                ))}
              </select>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-black">
                <input
                  type="checkbox"
                  checked={form.isImportant}
                  onChange={(e) => update('isImportant', e.target.checked)}
                  className="h-4 w-4"
                />
                High important
              </label>

              <input
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black md:col-span-2 xl:col-span-3"
                value={form.merchantAddress}
                onChange={(e) => update('merchantAddress', e.target.value)}
                placeholder="Merchant address"
              />

              <textarea
                className="min-h-20 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black md:col-span-2 xl:col-span-3"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Internal note / instruction"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                {editingId ? 'Save changes' : 'Create task'}
              </button>
            </div>
          </form>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="workspace-filters" className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white lg:hidden">
            <span>Filter{query || filter !== 'ALL' || dateFilter !== '30' ? ' (active)' : ''}</span>
            <span aria-hidden="true">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          <div id="workspace-filters" className={`${filtersOpen ? 'grid' : 'hidden'} mt-2 gap-2 lg:mt-0 lg:grid lg:grid-cols-[1fr_150px_150px_150px_auto_auto]`}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black"
              placeholder="Search TID, POS, zone, engineer..."
            />

            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black">
              <option value="7">7 days</option>
              <option value="15">15 days</option>
              <option value="30">30 days</option>
              <option value="MONTH">This month</option>
              <option value="YEAR">This year</option>
              <option value="ALL">All time</option>
            </select>

            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black">
              <option value="ALL">All</option>
              <option value="IMPORTANT">Important</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">Running</option>
              <option value="COMPLETED">Done</option>
              <option value="MINE">My task</option>
            </select>

            <button type="button" onClick={() => { setQuery(''); setFilter('ALL'); setDateFilter('30') }} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-black">
              Reset
            </button>

            <button type="button" onClick={() => downloadCsvReport(filtered)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-black">
              Export
            </button>

            <button type="button" onClick={load} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">
              Refresh
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-lg font-black">Tasks</h2>
            <span className="text-xs font-black text-black/50">{filtered.length} visible</span>
          </div>

          <div className="max-h-[68vh] overflow-y-auto divide-y divide-slate-100">
            {filtered.map((task) => {
              const latest = task.taskUpdates?.[0]

              return (
                <div key={task.id} className={`grid gap-2 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[110px_90px_90px_1fr_150px_120px_96px] xl:items-center ${task.isImportant ? 'bg-amber-50/40' : ''}`}>
                  <div className="truncate text-xs font-black text-black">
                    <div>{task.bankName || 'No bank'}</div>
                    <div className="text-[11px] font-bold text-black/50">Bank</div>
                  </div>

                  <Link href={`/workspaces/${task.id}`} className="min-w-0">
                    <div className="flex items-center gap-1 text-sm font-black text-black">
                      {task.isImportant && <span title="High important">★</span>}
                      {task.tidNumber || task.name}
                    </div>
                    <div className="text-[11px] font-bold text-black/50">TID</div>
                  </Link>

                  <div className="text-xs font-bold text-black/75">
                    <div className="truncate">{task.posSerial || 'N/A'}</div>
                    <div className="text-[11px] text-black/45">POS</div>
                  </div>

                  <Link href={`/workspaces/${task.id}`} className="min-w-0">
                    <div className="truncate text-sm font-black text-black">
                      {task.serviceType || 'Service'} · {task.zoneName || 'No zone'}
                    </div>
                    <div className="truncate text-xs font-semibold text-black/55">
                      {task.merchantAddress || 'No merchant address'}
                      {latest ? ` · Latest: ${latest.serviceType || latest.remarks || latest.status}` : ''}
                    </div>
                  </Link>

                  <div className="truncate text-xs font-bold text-black">
                    {task.assignedEmployee?.name || task.assignedEmployee?.email || 'Unassigned'}
                  </div>

                  <div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusClass(task.taskStatus)}`}>
                      {task.taskStatus?.replace('_', ' ') || 'PENDING'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => toggleImportant(task)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-black text-black" title="Mark important">★</button>
                    <button type="button" onClick={() => startEdit(task)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-black text-black" title="Edit">✎</button>
                    <button type="button" onClick={() => deleteTask(task)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-black text-red-700" title="Delete">⌫</button>
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm font-bold text-black/55">
                No task found.
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}
