"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch } from '../../lib/api'

function niceDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
function statusClass(status) {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (status === 'IN_PROGRESS') return 'bg-blue-50 text-blue-800 border-blue-200'
  return 'bg-amber-50 text-amber-800 border-amber-200'
}
function reportTime(task) {
  const latest = task?.taskUpdates?.[0]
  return latest?.createdAt || task?.completedAt || task?.startedAt || task?.createdAt || ''
}
function completedWorkRemark(task) {
  const updates = Array.isArray(task?.taskUpdates) ? [...task.taskUpdates] : []
  const completed = updates.find((u) => u?.status === 'COMPLETED' && String(u?.serviceType || '').trim())
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
  const csv = [columns, ...body].map((row) => row.map(escapeCsv).join(',')).join('\n')
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

export default function DashboardPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [tasks, setTasks] = useState([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [employeeFilter, setEmployeeFilter] = useState('ALL')
  const [dateFilter, setDateFilter] = useState('30')
  const [showEmployeeReport, setShowEmployeeReport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadTasks({ silent = false } = {}) {
    if (!accessToken) return
    try {
      if (!silent) setLoading(true)
      const data = await apiFetch('/api/workspaces', accessToken)
      setTasks(Array.isArray(data) ? data : [])
      setError('')
    } catch (e) {
      setError(e.message || 'Failed to load task report')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
    const timer = setInterval(() => loadTasks({ silent: true }), 45000)
    return () => clearInterval(timer)
  }, [accessToken])

  const employees = useMemo(() => {
    const map = new Map()
    tasks.forEach((task) => {
      const emp = task.assignedEmployee
      if (emp?.id) map.set(emp.id, emp.name || emp.email)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((task) => {
      const statusOk = statusFilter === 'ALL' || task.taskStatus === statusFilter || (statusFilter === 'IMPORTANT' && task.isImportant)
      const employeeOk = employeeFilter === 'ALL' || task.assignedEmployeeId === employeeFilter
      const dateOk = inDateRange(task, dateFilter)
      const haystack = [task.tidNumber, task.posSerial, task.zoneName, task.serviceType, task.merchantAddress, task.assignedEmployee?.name, task.assignedEmployee?.email, task.taskUpdates?.[0]?.serviceType, task.taskUpdates?.[0]?.remarks].join(' ').toLowerCase()
      return statusOk && employeeOk && dateOk && (!q || haystack.includes(q))
    }).sort((a, b) => Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)) || new Date(b.createdAt) - new Date(a.createdAt))
  }, [tasks, query, statusFilter, employeeFilter, dateFilter])

  const stats = useMemo(() => ({
    total: filtered.length,
    pending: filtered.filter((t) => t.taskStatus === 'PENDING').length,
    progress: filtered.filter((t) => t.taskStatus === 'IN_PROGRESS').length,
    done: filtered.filter((t) => t.taskStatus === 'COMPLETED').length,
    important: filtered.filter((t) => t.isImportant).length,
  }), [filtered])

  const employeeReport = useMemo(() => {
    const map = new Map()
    filtered.forEach((task) => {
      const emp = task.assignedEmployee
      const key = emp?.id || 'unassigned'
      if (!map.has(key)) map.set(key, { id: key, name: emp?.name || emp?.email || 'Unassigned', total: 0, pending: 0, progress: 0, done: 0 })
      const row = map.get(key)
      row.total += 1
      if (task.taskStatus === 'PENDING') row.pending += 1
      if (task.taskStatus === 'IN_PROGRESS') row.progress += 1
      if (task.taskStatus === 'COMPLETED') row.done += 1
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filtered])

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-5 text-black">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/55">Admin task dashboard</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">Field work report</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-black/60">Daily task status, employee progress and report export.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/workspaces" className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-black text-white">Create / manage task</Link>
              <button type="button" onClick={() => loadTasks()} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Refresh</button>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[[ 'Total', stats.total ], [ 'Important', stats.important ], [ 'Pending', stats.pending ], [ 'In progress', stats.progress ], [ 'Done', stats.done ]].map(([label, count]) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-3xl font-black text-black">{loading ? '…' : count}</div>
              <div className="mt-1 text-sm font-black text-black/65">{label}</div>
            </div>
          ))}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_170px_190px_190px_auto_auto]">
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black" placeholder="Search TID, POS, zone, employee..." />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black">
              <option value="7">Last 7 days</option><option value="15">Last 15 days</option><option value="30">Last 30 days</option><option value="MONTH">This month</option><option value="YEAR">This year</option><option value="ALL">All time</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black">
              <option value="ALL">All status</option><option value="IMPORTANT">Important</option><option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option>
            </select>
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black">
              <option value="ALL">All engineers</option>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
            <button type="button" onClick={() => { setQuery(''); setDateFilter('30'); setStatusFilter('ALL'); setEmployeeFilter('ALL') }} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Reset</button>
            <button type="button" onClick={() => downloadCsvReport(filtered)} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white">Export Excel</button>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-2xl font-black text-black">Task list</h2><p className="text-sm font-semibold text-black/55">{filtered.length} visible task(s)</p></div>
            <button type="button" onClick={() => setShowEmployeeReport((v) => !v)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-black">{showEmployeeReport ? 'Hide employee report' : 'Show employee report'}</button>
          </div>
          {showEmployeeReport && (
            <div className="border-b border-slate-200 p-5">
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-black/55"><tr><th className="p-3">Engineer</th><th className="p-3">Total</th><th className="p-3">Pending</th><th className="p-3">Progress</th><th className="p-3">Done</th></tr></thead>
                  <tbody>{employeeReport.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="p-3 font-black text-black">{r.name}</td><td className="p-3">{r.total}</td><td className="p-3">{r.pending}</td><td className="p-3">{r.progress}</td><td className="p-3">{r.done}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          <div className="max-h-[68vh] overflow-y-auto divide-y divide-slate-100">
            {filtered.map((task) => {
              const latest = task.taskUpdates?.[0]
              return (
                <Link href={`/workspaces/${task.id}`} key={task.id} className={`grid gap-2 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[110px_1fr_150px_120px] xl:items-center ${task.isImportant ? 'bg-amber-50/40' : ''}`}>
                  <div><div className="flex items-center gap-1 text-sm font-black text-black">{task.isImportant && <span title="High important">★</span>}{task.tidNumber || task.name}</div><div className="text-xs font-bold text-black/55">POS {task.posSerial || 'N/A'}</div></div>
                  <div className="min-w-0"><div className="truncate text-sm font-black text-black">{task.serviceType || 'Service'} · {task.zoneName || 'No zone'}</div><div className="truncate text-xs font-semibold text-black/60">{task.merchantAddress || 'No merchant address'}</div>{latest && <div className="mt-1 truncate text-xs font-bold text-black/70">Latest: {latest.serviceType || latest.remarks || latest.status}</div>}</div>
                  <div className="text-sm font-bold text-black">{task.assignedEmployee?.name || task.assignedEmployee?.email || 'Unassigned'}</div>
                  <div><span className={`rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(task.taskStatus)}`}>{task.taskStatus?.replace('_', ' ') || 'PENDING'}</span></div>
                </Link>
              )
            })}
            {filtered.length === 0 && <div className="p-10 text-center text-sm font-bold text-black/55">No task found.</div>}
          </div>
        </section>
      </div>
    </Layout>
  )
}
