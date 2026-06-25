"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState([])
  const accessToken = useAuthStore((s) => s.accessToken)
  const activeWorkspace = useAuthStore((s) => s.activeWorkspace)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
        if (!res.ok) return
        const data = await res.json()
        setWorkspaces(data)
      } catch (e) {}
    }
    load()
  }, [accessToken])

  return (
    <div className="relative">
      <select value={activeWorkspace || ''} onChange={(e) => setActiveWorkspace(e.target.value)} className="bg-slate-700 text-white text-sm font-medium border border-slate-600 rounded-lg px-3 py-2 hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
        <option value="">Select workspace</option>
        {workspaces.map(w => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </div>
  )
}
