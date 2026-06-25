"use client"
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Layout from '../../../../../components/Layout'
import { useAuthStore } from '../../../../../store/useAuthStore'
import MilestoneCard from '../../../../../components/MilestoneCard'
import ActivityFeed from '../../../../../components/ActivityFeed'
import AddMilestoneForm from '../../../../../components/AddMilestoneForm'
import AddActivityForm from '../../../../../components/AddActivityForm'

function statusLabel(status) {
  if (status === 'INPROGRESS') return 'In Progress'
  if (status === 'DONE') return 'Done'
  return 'To Do'
}

export default function GoalDetailPage() {
  const params = useParams()
  const workspaceId = params?.id
  const goalId = params?.goalId
  const auth = useAuthStore()
  const [goal, setGoal] = useState(null)
  const [milestoneDrafts, setMilestoneDrafts] = useState({})
  const [milestoneSaveState, setMilestoneSaveState] = useState({})
  const [milestoneTitleDrafts, setMilestoneTitleDrafts] = useState({})
  const [editingMilestones, setEditingMilestones] = useState({})
  const [milestoneManageState, setMilestoneManageState] = useState({})
  const [loading, setLoading] = useState(true)
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [addingActivity, setAddingActivity] = useState(false)

  const milestoneCompletion = useMemo(() => {
    const items = goal?.milestones || []
    if (items.length === 0) return 0
    const completed = items.filter((m) => Number(m.progress) >= 100).length
    return Math.round((completed / items.length) * 100)
  }, [goal])

  async function authFetch(url, options = {}) {
    const firstRes = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.headers || {}),
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {})
      }
    })

    if (firstRes.status !== 401) return firstRes

    const nextToken = await auth.refreshAccessToken?.()
    if (!nextToken) return firstRes

    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${nextToken}`
      }
    })
  }

  useEffect(() => {
    if (!workspaceId || !goalId || !auth.accessToken) return

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}`)
        if (!cancelled && res.ok) {
          const loadedGoal = await res.json()
          setGoal(loadedGoal)
          setMilestoneDrafts(
            (loadedGoal.milestones || []).reduce((acc, milestone) => {
              acc[milestone.id] = milestone.progress ?? 0
              return acc
            }, {})
          )
          setMilestoneTitleDrafts(
            (loadedGoal.milestones || []).reduce((acc, milestone) => {
              acc[milestone.id] = milestone.title || ''
              return acc
            }, {})
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [workspaceId, goalId, auth.accessToken])

  async function refreshGoal() {
    const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}`)
    if (res.ok) {
      const nextGoal = await res.json()
      setGoal(nextGoal)
      setMilestoneDrafts(
        (nextGoal.milestones || []).reduce((acc, milestone) => {
          acc[milestone.id] = milestone.progress ?? 0
          return acc
        }, {})
      )
      setMilestoneTitleDrafts(
        (nextGoal.milestones || []).reduce((acc, milestone) => {
          acc[milestone.id] = milestone.title || ''
          return acc
        }, {})
      )
    }
  }

  async function updateStatus(nextStatus) {
    const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: goal.title,
        description: goal.description,
        ownerId: goal.ownerId,
        dueDate: goal.dueDate,
        status: nextStatus
      })
    })
    if (res.ok) await refreshGoal()
  }

  async function addMilestone(milestoneTitle) {
    if (!milestoneTitle.trim()) return
    setAddingMilestone(true)
    const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}/milestones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: milestoneTitle })
    })
    if (res.ok) {
      await refreshGoal()
    }
    setAddingMilestone(false)
  }

  async function updateMilestoneProgress(milestoneId) {
    setMilestoneSaveState((current) => ({ ...current, [milestoneId]: 'saving' }))
    const progress = Number(milestoneDrafts[milestoneId] ?? 0)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ progress })
      })
      if (res.ok) {
        await refreshGoal()
        setMilestoneSaveState((current) => ({ ...current, [milestoneId]: 'saved' }))
      } else {
        setMilestoneSaveState((current) => ({ ...current, [milestoneId]: 'error' }))
      }
    } catch (error) {
      setMilestoneSaveState((current) => ({ ...current, [milestoneId]: 'error' }))
    }
    setTimeout(() => {
      setMilestoneSaveState((current) => ({ ...current, [milestoneId]: 'idle' }))
    }, 1500)
  }

  async function updateMilestoneTitle(milestoneId) {
    const title = String(milestoneTitleDrafts[milestoneId] || '').trim()
    if (!title) {
      setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'error' }))
      return
    }

    setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'saving' }))
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      })
      if (res.ok) {
        await refreshGoal()
        setEditingMilestones((current) => ({ ...current, [milestoneId]: false }))
        setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'saved' }))
      } else {
        setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'error' }))
      }
    } catch (error) {
      setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'error' }))
    }

    setTimeout(() => {
      setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'idle' }))
    }, 1500)
  }

  async function deleteMilestone(milestoneId) {
    const confirmed = window.confirm('Delete this milestone?')
    if (!confirmed) return

    setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'deleting' }))
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await refreshGoal()
      } else {
        setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'error' }))
      }
    } catch (error) {
      setMilestoneManageState((current) => ({ ...current, [milestoneId]: 'error' }))
    }
  }

  async function addActivity(activityText) {
    if (!activityText.trim()) return
    setAddingActivity(true)
    const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals/${goalId}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: activityText })
    })
    if (res.ok) {
      await refreshGoal()
    }
    setAddingActivity(false)
  }

  if (loading) {
    return <Layout><div className="p-6">Loading goal...</div></Layout>
  }

  if (!goal) {
    return <Layout><div className="p-6">Goal not found.</div></Layout>
  }

  return (
    <Layout>
      <div className="max-w-6xl space-y-6">
        {/* Header Section */}
        <div className="border-b border-slate-200 pb-6">
          <Link href={`/workspaces/${workspaceId}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            ← Back to workspace
          </Link>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950">{goal.title}</h1>
              <p className="mt-2 text-sm text-slate-600">
                {goal.description || 'No description'}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span>By {goal.owner?.name || 'Unknown'}</span>
                <span>•</span>
                <span>{goal.dueDate ? new Date(goal.dueDate).toLocaleDateString() : 'No due date'}</span>
              </div>
            </div>
            <select
              value={goal.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TODO">📋 To Do</option>
              <option value="INPROGRESS">⚡ In Progress</option>
              <option value="DONE">✓ Done</option>
            </select>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Milestones and Activity - Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Milestones Section */}
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-950">Roadmap</h2>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-slate-600">
                    {(goal.milestones || []).length === 0
                      ? 'No milestones yet. Add your first one to get started.'
                      : `${milestoneCompletion}% complete — ${(goal.milestones || []).filter(m => Number(m.progress) >= 100).length} of ${(goal.milestones || []).length} milestones done`}
                  </p>
                  <span className="text-xs font-semibold text-slate-500">{(goal.milestones || []).length} milestones</span>
                </div>
              </div>

              {/* Overall Progress Bar */}
              {(goal.milestones || []).length > 0 && (
                <div className="mb-6">
                  <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500 ease-out"
                      style={{ width: `${milestoneCompletion}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Milestones List */}
              <div className="space-y-3 mb-6">
                {(goal.milestones || []).map((milestone) => {
                  const draftValue = milestoneDrafts[milestone.id] ?? milestone.progress ?? 0
                  const saveState = milestoneSaveState[milestone.id] || 'idle'
                  const manageState = milestoneManageState[milestone.id] || 'idle'
                  const isEditing = Boolean(editingMilestones[milestone.id])

                  return (
                    <MilestoneCard
                      key={milestone.id}
                      milestone={{ ...milestone, progress: draftValue }}
                      onProgressChange={(val) => {
                        setMilestoneDrafts((current) => ({ ...current, [milestone.id]: val }))
                        setMilestoneSaveState((current) => ({ ...current, [milestone.id]: 'idle' }))
                      }}
                      onSave={() => updateMilestoneProgress(milestone.id)}
                      onDelete={() => deleteMilestone(milestone.id)}
                      onEdit={() => setEditingMilestones((current) => ({ ...current, [milestone.id]: true }))}
                      isEditing={isEditing}
                      draftTitle={milestoneTitleDrafts[milestone.id]}
                      onTitleChange={(val) => setMilestoneTitleDrafts((current) => ({ ...current, [milestone.id]: val }))}
                      onUpdate={() => updateMilestoneTitle(milestone.id)}
                      onCancel={() => {
                        setEditingMilestones((current) => ({ ...current, [milestone.id]: false }))
                        setMilestoneTitleDrafts((current) => ({ ...current, [milestone.id]: milestone.title || '' }))
                      }}
                      saveState={saveState}
                      manageState={manageState}
                    />
                  )
                })}

                {(goal.milestones || []).length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center">
                    <p className="text-slate-500 text-sm">
                      <span className="block text-2xl mb-2">🎯</span>
                      No milestones yet. Add one to start tracking progress.
                    </p>
                  </div>
                )}
              </div>

              {/* Add Milestone Form */}
              <AddMilestoneForm
                onSubmit={addMilestone}
                isSubmitting={addingMilestone}
              />
            </section>

            {/* Activity Section */}
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-950">Activity Feed</h2>
                <p className="mt-2 text-sm text-slate-600">Updates and progress notes from team members</p>
              </div>

              <ActivityFeed activities={goal.activities || []} />

              {/* Add Activity Form */}
              <div className="mt-6">
                <AddActivityForm
                  onSubmit={addActivity}
                  isSubmitting={addingActivity}
                />
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Goal Details Card */}
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-sm font-bold text-slate-950 mb-4">Goal Details</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</p>
                  <p className="mt-1 text-slate-900">{goal.owner?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Workspace</p>
                  <p className="mt-1 text-slate-900">{goal.workspace?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</p>
                  <p className="mt-1 text-slate-900">{new Date(goal.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</p>
                  <p className="mt-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      {statusLabel(goal.status)}
                    </span>
                  </p>
                </div>
              </div>
            </section>

            {/* Linked Tasks Card */}
            {(goal.actionItems || []).length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-sm font-bold text-slate-950 mb-4">Linked Tasks</h3>
                <div className="space-y-2">
                  {(goal.actionItems || []).map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition-colors">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.status}
                        {item.assignee?.name && ` • ${item.assignee.name}`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}