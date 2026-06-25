"use client"
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch, dateInputValue, formatShortDate } from '../../lib/api'

const statuses = ['TODO', 'INPROGRESS', 'DONE']
const statusLabel = { TODO: 'To do', INPROGRESS: 'In progress', DONE: 'Done' }
const kpiTypes = ['GENERAL', 'KPI', 'KR', 'QUALITY', 'REVENUE', 'DELIVERY']

function calcProgress(goal) {
  const milestones = goal.milestones || []
  if (!milestones.length) return goal.status === 'DONE' ? 100 : goal.status === 'INPROGRESS' ? 45 : 0
  return Math.round(milestones.reduce((sum, item) => sum + Number(item.progress || 0), 0) / milestones.length)
}

export default function GoalsPage() {
  const { accessToken, activeWorkspace } = useAuthStore()
  const [goals, setGoals] = useState([])
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState({ title: '', description: '', ownerId: '', dueDate: '', status: 'TODO' })
  const [milestoneDrafts, setMilestoneDrafts] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!activeWorkspace || !accessToken) return
    try {
      const [goalData, memberData] = await Promise.all([
        apiFetch(`/api/workspaces/${activeWorkspace}/goals`, accessToken),
        apiFetch(`/api/workspaces/${activeWorkspace}/members`, accessToken).catch(() => [])
      ])
      setGoals(goalData)
      setMembers(memberData)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { load() }, [activeWorkspace, accessToken])

  const summary = useMemo(() => {
    const total = goals.length
    const done = goals.filter(g => g.status === 'DONE').length
    const avg = total ? Math.round(goals.reduce((s, g) => s + calcProgress(g), 0) / total) : 0
    const overdue = goals.filter(g => g.dueDate && new Date(g.dueDate) < new Date() && g.status !== 'DONE').length
    return { total, done, avg, overdue }
  }, [goals])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return goals.filter((g) => (filter === 'ALL' || g.status === filter) && (!q || `${g.title} ${g.description || ''} ${g.owner?.name || ''}`.toLowerCase().includes(q)))
  }, [goals, filter, query])

  function openNew() {
    setEditingId(null)
    setDraft({ title: '', description: '', ownerId: '', dueDate: '', status: 'TODO' })
    setFormOpen(true)
    setError('')
  }

  function editGoal(g) {
    setEditingId(g.id)
    setDraft({ title: g.title || '', description: g.description || '', ownerId: g.ownerId || g.owner?.id || '', dueDate: dateInputValue(g.dueDate), status: g.status || 'TODO' })
    setFormOpen(true)
  }

  async function saveGoal(e) {
    e.preventDefault()
    if (!activeWorkspace) return setError('Select a workspace first')
    if (!draft.title.trim()) return setError('Goal title is required')
    setBusy(true)
    try {
      const payload = { ...draft, ownerId: draft.ownerId || undefined, dueDate: draft.dueDate || undefined }
      if (editingId) await apiFetch(`/api/workspaces/${activeWorkspace}/goals/${editingId}`, accessToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      else await apiFetch(`/api/workspaces/${activeWorkspace}/goals`, accessToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      setFormOpen(false)
      setEditingId(null)
      await load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function deleteGoal(id) {
    if (!confirm('Delete this goal and all KPI milestones?')) return
    try { await apiFetch(`/api/workspaces/${activeWorkspace}/goals/${id}`, accessToken, { method: 'DELETE' }); await load() } catch (e) { setError(e.message) }
  }

  async function quickStatus(goal, status) {
    try { await apiFetch(`/api/workspaces/${activeWorkspace}/goals/${goal.id}`, accessToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); await load() } catch (e) { setError(e.message) }
  }

  async function addMilestone(goalId) {
    const d = milestoneDrafts[goalId] || { title: '', type: 'KPI', progress: 0 }
    if (!d.title?.trim()) return
    try {
      const milestone = await apiFetch(`/api/workspaces/${activeWorkspace}/goals/${goalId}/milestones`, accessToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: d.title, type: d.type || 'KPI' }) })
      if (Number(d.progress)) await apiFetch(`/api/workspaces/${activeWorkspace}/goals/${goalId}/milestones/${milestone.id}`, accessToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progress: Number(d.progress) }) })
      setMilestoneDrafts({ ...milestoneDrafts, [goalId]: { title: '', type: 'KPI', progress: 0 } })
      await load()
    } catch (e) { setError(e.message) }
  }

  async function updateMilestone(goalId, milestone, patch) {
    try { await apiFetch(`/api/workspaces/${activeWorkspace}/goals/${goalId}/milestones/${milestone.id}`, accessToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); await load() } catch (e) { setError(e.message) }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <section className="shell-panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="section-title">Goals, KPI and delivery rhythm</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Company-grade OKR board</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Every goal has an owner, due date, KPI milestones, progress and action context. Revolutionary idea: accountability with actual numbers. 📈</p>
            </div>
            <button onClick={openNew} className="btn h-11">+ New goal</button>
          </div>
          {!activeWorkspace && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Select or create a workspace first.</div>}
          {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Total goals', summary.total], ['Completed', summary.done], ['Avg progress', `${summary.avg}%`], ['Overdue', summary.overdue]].map(([label, value]) => <div key={label} className="rounded-3xl bg-white/80 p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</div><div className="mt-1 text-3xl font-black text-slate-950">{value}</div></div>)}
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search goal, KPI, owner..." />
            <div className="flex flex-wrap gap-2">{['ALL', ...statuses].map(s => <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === s ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'}`}>{s === 'ALL' ? 'All' : statusLabel[s]}</button>)}</div>
          </div>
        </section>

        {formOpen && <form onSubmit={saveGoal} className="card space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-xl font-black">{editingId ? 'Edit goal' : 'Create goal'}</h2><button type="button" onClick={() => setFormOpen(false)} className="text-sm font-bold text-slate-500">Close</button></div>
          <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Goal title" />
          <textarea className="input min-h-[110px]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Business outcome, success definition, constraints..." />
          <div className="grid gap-3 md:grid-cols-3">
            <select className="input" value={draft.ownerId} onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}><option value="">Owner: me/default</option>{members.map(m => <option key={m.id} value={m.userId}>{m.user?.name || m.user?.email}</option>)}</select>
            <input className="input" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
            <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{statuses.map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}</select>
          </div>
          <button disabled={busy} className="btn">{busy ? 'Saving...' : 'Save goal'}</button>
        </form>}

        <div className="grid gap-4">
          {filtered.map((g) => {
            const progress = calcProgress(g)
            const md = milestoneDrafts[g.id] || { title: '', type: 'KPI', progress: 0 }
            return <article key={g.id} className="card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{statusLabel[g.status] || g.status}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">Owner: {g.owner?.name || 'Unassigned'}</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Due: {formatShortDate(g.dueDate)}</span></div><h2 className="mt-3 text-2xl font-black text-slate-950">{g.title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{g.description || 'No description. Because telepathy has not shipped in npm yet.'}</p></div>
                <div className="w-full lg:w-56"><div className="flex items-center justify-between text-sm font-bold text-slate-700"><span>Progress</span><span>{progress}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-950" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex gap-2"><button onClick={() => editGoal(g)} className="rounded-full border px-3 py-1 text-xs font-bold">Edit</button><button onClick={() => deleteGoal(g.id)} className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Delete</button><Link className="rounded-full border px-3 py-1 text-xs font-bold" href={`/workspaces/${activeWorkspace}/goals/${g.id}`}>View</Link></div></div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">{statuses.map(s => <button key={s} onClick={() => quickStatus(g, s)} className={`rounded-2xl border px-3 py-2 text-sm font-bold ${g.status === s ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{statusLabel[s]}</button>)}</div>
              <div className="mt-5 rounded-3xl bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-slate-900">KPI milestones</h3><span className="text-xs font-bold text-slate-500">{(g.milestones || []).length} items</span></div><div className="space-y-3">{(g.milestones || []).map(m => <div key={m.id} className="grid gap-2 rounded-2xl bg-white p-3 md:grid-cols-[1fr_140px_90px]"><input className="input" defaultValue={m.title} onBlur={(e) => e.target.value !== m.title && updateMilestone(g.id, m, { title: e.target.value })} /><select className="input" defaultValue={m.type || 'KPI'} onChange={(e) => updateMilestone(g.id, m, { type: e.target.value })}>{kpiTypes.map(t => <option key={t}>{t}</option>)}</select><input className="input" type="number" min="0" max="100" defaultValue={m.progress || 0} onBlur={(e) => updateMilestone(g.id, m, { progress: Number(e.target.value) })} /></div>)}</div><div className="mt-3 grid gap-2 md:grid-cols-[1fr_140px_100px_auto]"><input className="input" value={md.title} onChange={(e) => setMilestoneDrafts({ ...milestoneDrafts, [g.id]: { ...md, title: e.target.value } })} placeholder="Add KPI milestone" /><select className="input" value={md.type} onChange={(e) => setMilestoneDrafts({ ...milestoneDrafts, [g.id]: { ...md, type: e.target.value } })}>{kpiTypes.map(t => <option key={t}>{t}</option>)}</select><input className="input" type="number" min="0" max="100" value={md.progress} onChange={(e) => setMilestoneDrafts({ ...milestoneDrafts, [g.id]: { ...md, progress: e.target.value } })} /><button onClick={() => addMilestone(g.id)} className="btn" type="button">Add</button></div></div>
            </article>
          })}
        </div>
      </div>
    </Layout>
  )
}
