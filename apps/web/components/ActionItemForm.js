"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function ActionItemForm({ workspaceId, onSuccess }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [goalId, setGoalId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [members, setMembers] = useState([])
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    async function loadMembers() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/members`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
        if (!res.ok) return
        const data = await res.json()
        setMembers(data)
      } catch (e) {}
    }
    async function loadGoals() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/goals`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
        if (!res.ok) return
        const data = await res.json()
        setGoals(data)
      } catch (e) {}
    }
    if (workspaceId) loadMembers()
    if (workspaceId) loadGoals()
  }, [workspaceId, accessToken])

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!title) return setError('Title is required')
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/action-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ title, description, assigneeId: assigneeId || null, priority, dueDate: dueDate || null, goalId: goalId || null })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Create failed')
      }
      setTitle('')
      setDescription('')
      setAssigneeId('')
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 border rounded space-y-2">
      <div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="w-full border p-2" />
      </div>
      <div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full border p-2" />
      </div>
      <div className="grid grid-cols-2 gap-2 items-center">
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="border p-2">
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.userId}>{m.user?.email || m.user?.name || m.userId}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="border p-2">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="border p-2">
          <option value="">No goal</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border p-2" />
        <div />
        <button className="bg-green-600 text-white px-3 py-1 rounded" disabled={loading}>{loading ? 'Creating...' : 'Create'}</button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
    </form>
  )
}
