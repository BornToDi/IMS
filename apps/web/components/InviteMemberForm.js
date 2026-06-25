"use client"
import React, { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function InviteMemberForm({ workspaceId, onSuccess }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('MEMBER')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const accessToken = useAuthStore((s) => s.accessToken)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!email) return setError('Email is required')
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ email, role })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Invite failed')
      }
      setEmail('')
      setRole('MEMBER')
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 border rounded">
      <div className="flex items-center space-x-2">
        <input className="border p-2 flex-1" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="border p-2" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" disabled={loading}>{loading ? 'Inviting...' : 'Invite'}</button>
      </div>
      {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
    </form>
  )
}
