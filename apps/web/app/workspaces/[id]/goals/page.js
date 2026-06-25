"use client"
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Layout from '../../../../components/Layout'
import { useAuthStore } from '../../../../store/useAuthStore'

function statusLabel(status) {
  if (status === 'INPROGRESS') return 'In Progress'
  if (status === 'DONE') return 'Done'
  return 'To Do'
}

export default function WorkspaceGoalsPage() {
  const params = useParams()
  const workspaceId = params?.id
  const auth = useAuthStore()
  const [workspace, setWorkspace] = useState(null)
  const [goals, setGoals] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState(null)
  const [goalDraft, setGoalDraft] = useState({ title: '', description: '', dueDate: '', status: 'TODO' })
  const [goalActionState, setGoalActionState] = useState({})

  useEffect(() => {
    if (!workspaceId || !auth.accessToken) return

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [workspaceRes, goalsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
            credentials: 'include'
          }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
            credentials: 'include'
          })
        ])

        if (cancelled) return

        if (workspaceRes.ok) setWorkspace(await workspaceRes.json())
        if (goalsRes.ok) setGoals(await goalsRes.json())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [workspaceId, auth.accessToken])

  async function refreshGoals() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
      credentials: 'include'
    })
    if (res.ok) setGoals(await res.json())
  }

  function startEditGoal(goal) {
    setEditingGoalId(goal.id)
    setGoalDraft({
      title: goal.title || '',
      description: goal.description || '',
      dueDate: goal.dueDate ? String(goal.dueDate).slice(0, 10) : '',
      status: goal.status || 'TODO'
    })
  }

  async function saveGoal(goalId) {
    setGoalActionState((current) => ({ ...current, [goalId]: 'saving' }))
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify(goalDraft)
      })
      if (!res.ok) throw new Error('Failed to update goal')
      setEditingGoalId(null)
      await refreshGoals()
      setGoalActionState((current) => ({ ...current, [goalId]: 'saved' }))
    } catch (error) {
      setGoalActionState((current) => ({ ...current, [goalId]: 'error' }))
    }
    setTimeout(() => setGoalActionState((current) => ({ ...current, [goalId]: 'idle' })), 1500)
  }

  async function deleteGoal(goalId) {
    if (!window.confirm('Delete this goal?')) return
    setGoalActionState((current) => ({ ...current, [goalId]: 'deleting' }))
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to delete goal')
      if (editingGoalId === goalId) setEditingGoalId(null)
      await refreshGoals()
    } catch (error) {
      setGoalActionState((current) => ({ ...current, [goalId]: 'error' }))
    }
  }

  async function createGoal(e) {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || null
        })
      })

      if (res.ok) {
        setTitle('')
        setDescription('')
        setDueDate('')
        await refreshGoals()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="p-6 text-slate-600">Loading workspace goals...</div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl space-y-6">
        {/* Header Section */}
        <div className="border-b border-slate-200 pb-6">
          <Link href={`/workspaces/${workspaceId}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            ← Back to workspace
          </Link>
          <div className="mt-4">
            <h1 className="text-4xl font-black tracking-tight text-slate-950">Goals & Milestones</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Break down workspace objectives into actionable goals with milestones. Track progress and keep your team aligned on what matters.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Goals</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{goals.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">In Progress</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{goals.filter(g => g.status === 'INPROGRESS').length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{goals.filter(g => g.status === 'DONE').length}</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Create New Goal */}
          <div className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-6 h-fit">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-slate-950">Create Goal</h2>
              <p className="mt-1 text-sm text-slate-600">Start a new initiative</p>
            </div>

            <form onSubmit={createGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Goal Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="E.g., Launch mobile app"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What needs to be accomplished?"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Creating...' : '+ Create Goal'}
              </button>
            </form>
          </div>

          {/* Goals List */}
          <div className="lg:col-span-2">
            {goals.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-12 text-center">
                <div className="text-5xl mb-4">🎯</div>
                <h3 className="text-lg font-semibold text-slate-900">No goals yet</h3>
                <p className="mt-1 text-sm text-slate-600">Create your first goal to get started tracking progress</p>
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((goal) => {
                  const statusIcon = goal.status === 'DONE' ? '✓' : goal.status === 'INPROGRESS' ? '⚡' : '○'
                  const statusColor = goal.status === 'DONE' ? 'bg-emerald-100 text-emerald-700' : goal.status === 'INPROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'

                  return (
                    <div
                      key={goal.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors"
                    >
                      {editingGoalId === goal.id ? (
                        <div className="space-y-3">
                          <input
                            value={goalDraft.title}
                            onChange={(e) => setGoalDraft((current) => ({ ...current, title: e.target.value }))}
                            placeholder="Goal title"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500"
                          />
                          <textarea
                            value={goalDraft.description}
                            onChange={(e) => setGoalDraft((current) => ({ ...current, description: e.target.value }))}
                            placeholder="Goal description"
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                          />
                          <div className="grid gap-2 grid-cols-2">
                            <input
                              type="date"
                              value={goalDraft.dueDate}
                              onChange={(e) => setGoalDraft((current) => ({ ...current, dueDate: e.target.value }))}
                              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            />
                            <select
                              value={goalDraft.status}
                              onChange={(e) => setGoalDraft((current) => ({ ...current, status: e.target.value }))}
                              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            >
                              <option value="TODO">📋 To Do</option>
                              <option value="INPROGRESS">⚡ In Progress</option>
                              <option value="DONE">✓ Done</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => saveGoal(goal.id)}
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingGoalId(null)}
                              className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteGoal(goal.id)}
                              className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 transition-colors"
                            >
                              Delete
                            </button>
                            {goalActionState[goal.id] === 'saving' && <span className="text-xs text-slate-500 self-center">Saving...</span>}
                            {goalActionState[goal.id] === 'saved' && <span className="text-xs text-emerald-600 self-center">✓ Saved</span>}
                            {goalActionState[goal.id] === 'error' && <span className="text-xs text-red-600 self-center">Failed</span>}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold ${statusColor}`}>
                                  {statusIcon}
                                </span>
                                <h3 className="text-sm font-semibold text-slate-950 truncate">{goal.title}</h3>
                              </div>
                              {goal.description && (
                                <p className="text-sm text-slate-600 line-clamp-2 mb-2">{goal.description}</p>
                              )}
                              <div className="text-xs text-slate-500">
                                {goal.owner?.name || 'Unknown'} • {goal.dueDate ? new Date(goal.dueDate).toLocaleDateString() : 'No date'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditGoal(goal)}
                                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Edit
                              </button>
                              <Link
                                href={`/workspaces/${workspaceId}/goals/${goal.id}`}
                                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                View
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}