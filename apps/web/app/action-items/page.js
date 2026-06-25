"use client"
import React, { useEffect, useMemo, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import { apiFetch, dateInputValue, formatShortDate } from '../../lib/api'

const statuses = ['TODO', 'INPROGRESS', 'DONE']
const priorities = ['LOW', 'MEDIUM', 'HIGH']
const labels = { TODO: 'To do', INPROGRESS: 'In progress', DONE: 'Done', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }

export default function ActionItemsPage() {
  const { accessToken, activeWorkspace } = useAuthStore()
  const [items, setItems] = useState([])
  const [members, setMembers] = useState([])
  const [goals, setGoals] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ title: '', description: '', assigneeId: '', goalId: '', priority: 'MEDIUM', dueDate: '', status: 'TODO' })

  async function load() {
    if (!activeWorkspace || !accessToken) return
    try {
      const [itemData, memberData, goalData] = await Promise.all([
        apiFetch(`/api/workspaces/${activeWorkspace}/action-items`, accessToken),
        apiFetch(`/api/workspaces/${activeWorkspace}/members`, accessToken).catch(() => []),
        apiFetch(`/api/workspaces/${activeWorkspace}/goals`, accessToken).catch(() => [])
      ])
      setItems(itemData)
      setMembers(memberData)
      setGoals(goalData)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { load() }, [activeWorkspace, accessToken])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => (filter === 'ALL' || i.status === filter) && (!q || `${i.title} ${i.description || ''} ${i.assignee?.name || ''}`.toLowerCase().includes(q)))
  }, [items, filter, query])

  const summary = useMemo(() => ({
    total: items.length,
    open: items.filter(i => i.status !== 'DONE').length,
    high: items.filter(i => i.priority === 'HIGH' && i.status !== 'DONE').length,
    overdue: items.filter(i => i.dueDate && new Date(i.dueDate) < new Date() && i.status !== 'DONE').length
  }), [items])

  function newItem() {
    setEditingId(null)
    setDraft({ title: '', description: '', assigneeId: '', goalId: '', priority: 'MEDIUM', dueDate: '', status: 'TODO' })
    setOpen(true)
  }

  function editItem(item) {
    setEditingId(item.id)
    setDraft({ title: item.title || '', description: item.description || '', assigneeId: item.assigneeId || '', goalId: item.goalId || '', priority: item.priority || 'MEDIUM', dueDate: dateInputValue(item.dueDate), status: item.status || 'TODO' })
    setOpen(true)
  }

  async function save(e) {
    e.preventDefault()
    if (!draft.title.trim()) return setError('Task title is required')
    const payload = { ...draft, assigneeId: draft.assigneeId || null, goalId: draft.goalId || null, dueDate: draft.dueDate || null }
    try {
      if (editingId) {
        await apiFetch(`/api/workspaces/${activeWorkspace}/action-items/${editingId}`, accessToken, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        await apiFetch(`/api/workspaces/${activeWorkspace}/action-items/${editingId}/status`, accessToken, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: draft.status }) })
      } else {
        const created = await apiFetch(`/api/workspaces/${activeWorkspace}/action-items`, accessToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (draft.status !== 'TODO') await apiFetch(`/api/workspaces/${activeWorkspace}/action-items/${created.id}/status`, accessToken, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: draft.status }) })
      }
      setOpen(false)
      setEditingId(null)
      await load()
    } catch (e) { setError(e.message) }
  }

  async function move(item, status) {
    try { await apiFetch(`/api/workspaces/${activeWorkspace}/action-items/${item.id}/status`, accessToken, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); await load() } catch (e) { setError(e.message) }
  }

  async function remove(id) {
    if (!confirm('Delete this action item?')) return
    try { await apiFetch(`/api/workspaces/${activeWorkspace}/action-items/${id}`, accessToken, { method: 'DELETE' }); await load() } catch (e) { setError(e.message) }
  }

  return <Layout><div className="space-y-6">
    <section className="shell-panel p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="section-title">Execution board</div><h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Action items that connect to goals</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Assign tasks, connect them to goals, track priority, due dates and status. Finally, the spreadsheet cult can rest. ✅</p></div><button onClick={newItem} className="btn h-11">+ New task</button></div>{!activeWorkspace && <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Select a workspace first.</div>}{error && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Total', summary.total], ['Open', summary.open], ['High priority', summary.high], ['Overdue', summary.overdue]].map(([l, v]) => <div key={l} className="rounded-3xl bg-white/80 p-4"><div className="text-xs font-black uppercase tracking-widest text-slate-400">{l}</div><div className="mt-1 text-3xl font-black text-slate-950">{v}</div></div>)}</div><div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]"><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search action item, assignee..." /><div className="flex flex-wrap gap-2">{['ALL', ...statuses].map(s => <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === s ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'}`}>{s === 'ALL' ? 'All' : labels[s]}</button>)}</div></div></section>

    {open && <form onSubmit={save} className="card space-y-4"><div className="flex justify-between"><h2 className="text-xl font-black">{editingId ? 'Edit action item' : 'Create action item'}</h2><button type="button" onClick={() => setOpen(false)} className="text-sm font-bold text-slate-500">Close</button></div><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Task title" /><textarea className="input min-h-[100px]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Clear instruction, acceptance criteria, blockers..." /><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><select className="input" value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}><option value="">Unassigned</option>{members.map(m => <option key={m.id} value={m.userId}>{m.user?.name || m.user?.email}</option>)}</select><select className="input" value={draft.goalId} onChange={(e) => setDraft({ ...draft, goalId: e.target.value })}><option value="">No linked goal</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select><select className="input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{priorities.map(p => <option key={p}>{p}</option>)}</select><select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{statuses.map(s => <option key={s} value={s}>{labels[s]}</option>)}</select><input className="input" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></div><button className="btn">Save task</button></form>}

    <div className="grid gap-4 xl:grid-cols-3">{statuses.map(status => <section key={status} className="rounded-3xl border border-white/70 bg-white/65 p-4 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-slate-900">{labels[status]}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{filtered.filter(i => i.status === status).length}</span></div><div className="space-y-3">{filtered.filter(i => i.status === status).map(item => <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{item.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.description || 'No details.'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${item.priority === 'HIGH' ? 'bg-red-50 text-red-700' : item.priority === 'MEDIUM' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{labels[item.priority]}</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500"><span>👤 {item.assignee?.name || 'Unassigned'}</span><span>📅 {formatShortDate(item.dueDate)}</span></div><div className="mt-4 flex flex-wrap gap-2">{statuses.filter(s => s !== status).map(s => <button key={s} onClick={() => move(item, s)} className="rounded-full border px-3 py-1 text-xs font-bold">Move to {labels[s]}</button>)}<button onClick={() => editItem(item)} className="rounded-full border px-3 py-1 text-xs font-bold">Edit</button><button onClick={() => remove(item.id)} className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Delete</button></div></article>)}</div></section>)}</div>
  </div></Layout>
}
