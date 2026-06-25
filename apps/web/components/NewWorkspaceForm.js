"use client"
import React, { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function NewWorkspaceForm({ accessToken, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [accentColor, setAccentColor] = useState('#60a5fa')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)

  async function submit(e) {
    e.preventDefault()
    if (!name) return setError('Name required')
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({ name, description, accentColor })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Create failed')
      }
      setName('')
      setDescription('')
      setAccentColor('#60a5fa')
      // set newly created workspace as active
      const created = await res.json()
      if (created && created.id) setActiveWorkspace(created.id)
      if (onCreated) onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-center space-x-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" className="flex-1 border p-2" />
        <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} title="Accent color" className="w-12 h-10 p-0 border" />
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full border p-2" />
      <div className="flex justify-end">
        <button className="btn" disabled={loading}>{loading ? 'Creating...' : 'Create Workspace'}</button>
      </div>
      {error && <div className="text-red-600">{error}</div>}
    </form>
  )
}
