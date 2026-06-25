"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function Notifications({ workspaceId }) {
  const [notes, setNotes] = useState([])
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    async function load() {
      if (!workspaceId) return
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/notifications`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
      if (!res.ok) return
      const data = await res.json()
      setNotes(data)
    }
    load()
  }, [workspaceId, accessToken])

  async function markRead(id) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/notifications/${id}/read`, { method: 'PATCH', credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
      setNotes((s) => s.map(n => n.id === id ? { ...n, isRead: true } : n))
    } catch (e) {}
  }

  if (!workspaceId) return null

  return (
    <div className="max-h-96 overflow-y-auto bg-white rounded-lg shadow-lg p-3 border border-gray-200">
      {notes.length === 0 && <div className="text-sm text-gray-500">No notifications</div>}
      {notes.map(n => (
        <div key={n.id} className={`p-3 border-b last:border-b-0 text-sm transition-colors ${n.isRead ? 'bg-white text-gray-600' : 'bg-blue-50 text-blue-900 font-medium'}`}>
          <div className="flex justify-between items-start gap-2">
            <div>{n.message}</div>
            {!n.isRead && <button className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap font-semibold" onClick={() => markRead(n.id)}>✓</button>}
          </div>
          <div className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  )
}
