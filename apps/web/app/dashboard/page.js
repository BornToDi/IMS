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
  const [counts, setCounts] = useState({ tickets: 0, hardware: 0, meetings: 0, announcements: 0 })
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
    loadCounts()
    const timer = setInterval(() => {
      loadTasks({ silent: true })
      loadCounts()
    }, 45000)
    return () => clearInterval(timer)
  }, [accessToken])

  async function loadCounts() {
    if (!accessToken) return
    try {
      const [ticketsRes, hardwareRes, meetingsRes, announcementsRes] = await Promise.allSettled([
        apiFetch('/api/tickets', accessToken),
        apiFetch('/api/hardware', accessToken),
        apiFetch('/api/meetings', accessToken),
        apiFetch('/api/announcements', accessToken)
      ])
      setCounts({
        tickets: Array.isArray(ticketsRes.value) ? ticketsRes.value.length : 0,
        hardware: Array.isArray(hardwareRes.value) ? hardwareRes.value.length : 0,
        meetings: Array.isArray(meetingsRes.value) ? meetingsRes.value.length : 0,
        announcements: Array.isArray(announcementsRes.value) ? announcementsRes.value.length : 0
      })
    } catch (e) {
      // ignore - keep previous counts
    }
  }

  // For the simplified dashboard we show the full task list without filters
  const filtered = useMemo(() => tasks.slice().sort((a, b) => Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)) || new Date(b.createdAt) - new Date(a.createdAt)), [tasks])

  

  return (
    <Layout>
      <div className="mx-auto max-w-[1700px] space-y-5 text-black">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/55">Admin task dashboard</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">Field work report</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-black/60">Daily task status and employee progress.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/workspaces" className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-black text-white">Create / manage task</Link>
              <button type="button" onClick={() => loadTasks()} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Refresh</button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            <Link href="/tickets" className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-xs font-black text-black/55">Field Tasks</div>
              <div className="mt-2 text-2xl font-black text-black">{counts.tickets}</div>
            </Link>
            <Link href="/hardware" className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-xs font-black text-black/55">Hardware</div>
              <div className="mt-2 text-2xl font-black text-black">{counts.hardware}</div>
            </Link>
            <Link href="/meetings" className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-xs font-black text-black/55">Meetings</div>
              <div className="mt-2 text-2xl font-black text-black">{counts.meetings}</div>
            </Link>
            <Link href="/announcements" className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <div className="text-xs font-black text-black/55">Announcements</div>
              <div className="mt-2 text-2xl font-black text-black">{counts.announcements}</div>
            </Link>
          </div>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-black">Task list</h2>
              <p className="text-sm font-semibold text-black/55">{filtered.length} visible task(s)</p>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm font-bold text-black/55">No task found.</div>
            ) : (
              filtered.map((task) => {
                const latest = task.taskUpdates?.[0]
                return (
                  <Link
                    href={`/workspaces/${task.id}`}
                    key={task.id}
                    className={`grid gap-2 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[110px_1fr_150px_120px] xl:items-center ${task.isImportant ? 'bg-amber-50/40' : ''}`}
                  >
                    <div>
                      <div className="flex items-center gap-1 text-sm font-black text-black">
                        {task.isImportant && <span title="High important">★</span>}
                        {task.tidNumber || task.name}
                      </div>
                      <div className="text-xs font-bold text-black/55">POS {task.posSerial || 'N/A'}</div>
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-black">{task.serviceType || 'Service'} · {task.zoneName || 'No zone'}</div>
                      <div className="truncate text-xs font-semibold text-black/60">{task.merchantAddress || 'No merchant address'}</div>
                      {latest && (
                        <div className="mt-1 truncate text-xs font-bold text-black/70">Latest: {latest.serviceType || latest.remarks || latest.status}</div>
                      )}
                    </div>

                    <div className="text-sm font-bold text-black">{task.assignedEmployee?.name || task.assignedEmployee?.email || 'Unassigned'}</div>

                    <div>
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(task.taskStatus)}`}>
                        {task.taskStatus?.replace('_', ' ') || 'PENDING'}
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}
