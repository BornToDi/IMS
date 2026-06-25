"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import InviteMemberForm from './InviteMemberForm'
import Link from 'next/link'

export default function WorkspaceList({ showChat = false }) {
  const [workspaces, setWorkspaces] = useState([])
  const [showInvite, setShowInvite] = useState(null)
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null)
  const [workspaceDraft, setWorkspaceDraft] = useState({ name: '', description: '' })
  const [actionState, setActionState] = useState({})
  const accessToken = useAuthStore((s) => s.accessToken)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)

  useEffect(() => {
    async function load() {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces`, { headers, credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setWorkspaces(data)
    }
    load()
  }, [accessToken])

  return (
    <div className="space-y-4">
      {workspaces.length === 0 && <div className="text-sm text-slate-500">No workspaces yet. Create one to start organizing goals and work.</div>}
      {workspaces.map((w) => (
        <div key={w.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div style={{ width: 14, height: 14, background: w.accentColor || '#60a5fa' }} className="rounded-full ring-4 ring-slate-100" />
                <div className="truncate text-base font-semibold text-slate-950">{w.name}</div>
              </div>
              {w.description && <div className="mt-2 text-sm leading-6 text-slate-600">{w.description}</div>}
              <div className="mt-3 text-xs text-slate-400">Owner workspace • open the hub or jump into a module directly</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href={`/workspaces/${w.id}`} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700">Messege</Link>
              <Link href={`/workspaces/${w.id}/goals`} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Goals</Link>
            </div>
          </div>
            <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50" onClick={() => { setActiveWorkspace(w.id); setShowInvite(w.id); }}>Invite members</button>
            <button className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50" onClick={() => { setEditingWorkspaceId(w.id); setWorkspaceDraft({ name: w.name, description: w.description || '' }); }}>Edit</button>
            <button className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100" onClick={() => handleDeleteWorkspace(w.id)}>Delete</button>
          </div>
            {showChat && (
              <div className="mt-4 border-t pt-3">
                <WorkspaceCardChat workspaceId={w.id} accessToken={accessToken} />
              </div>
            )}
          {showInvite === w.id && (
            <div className="mt-4">
              <InviteMemberForm workspaceId={w.id} onSuccess={() => { setShowInvite(null); }} />
            </div>
          )}
          {editingWorkspaceId === w.id && (
            <div className="mt-4">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <input value={workspaceDraft.name} onChange={(e) => setWorkspaceDraft((current) => ({ ...current, name: e.target.value }))} className="input" placeholder="Workspace name" />
                <textarea value={workspaceDraft.description} onChange={(e) => setWorkspaceDraft((current) => ({ ...current, description: e.target.value }))} className="input min-h-[100px]" placeholder="Workspace description" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => saveWorkspace(w.id)} className="btn bg-blue-600 hover:bg-blue-700">Save</button>
                  <button type="button" onClick={() => setEditingWorkspaceId(null)} className="btn bg-gray-200 text-gray-700 hover:bg-gray-300">Cancel</button>
                </div>
                {actionState[w.id] && actionState[w.id] !== 'idle' && <div className="text-sm text-gray-600">{actionState[w.id] === 'saving' && 'Saving...'}{actionState[w.id] === 'saved' && '✓ Saved'}{actionState[w.id] === 'error' && 'Failed to save'}</div>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )

  async function saveWorkspace(workspaceId) {
    setActionState((current) => ({ ...current, [workspaceId]: 'saving' }))
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(workspaceDraft)
      })
      if (!res.ok) throw new Error('Failed to save')
      setEditingWorkspaceId(null)
      setActionState((current) => ({ ...current, [workspaceId]: 'saved' }))
      setTimeout(() => {
        setActionState((current) => ({ ...current, [workspaceId]: 'idle' }))
        location.reload()
      }, 1500)
    } catch (error) {
      setActionState((current) => ({ ...current, [workspaceId]: 'error' }))
      setTimeout(() => setActionState((current) => ({ ...current, [workspaceId]: 'idle' })), 1500)
    }
  }

  async function handleDeleteWorkspace(workspaceId) {
    if (!confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) return
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to delete')
      location.reload()
    } catch (error) {
      alert('Failed to delete workspace')
    }
  }
}

function WorkspaceCardChat({ workspaceId, accessToken }) {
  const [messages, setMessages] = React.useState([])
  const [text, setText] = React.useState('')
  const [pendingFile, setPendingFile] = React.useState(null)
  const [selectedFileName, setSelectedFileName] = React.useState('')
  const fileRef = React.useRef(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/messages?limit=5`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          credentials: 'include'
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setMessages(data)
      } catch (e) { console.error(e) }
    }
    load()
    return () => { cancelled = true }
  }, [workspaceId, accessToken])

  async function sendMessage() {
    if (!text.trim() && !pendingFile) return
    try {
      if (pendingFile) {
        const formData = new FormData()
        formData.append('file', pendingFile)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/files`, {
          method: 'POST',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          body: formData,
          credentials: 'include'
        })
        if (res.ok) {
          setPendingFile(null)
          setSelectedFileName('')
          if (fileRef.current) fileRef.current.value = ''
          // refresh messages after upload
        }
      }

      if (text.trim()) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/messages`, {
          method: 'POST',
          headers: accessToken ? { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` } : { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: text })
        })
        if (res.ok) {
          const msg = await res.json()
          setMessages((s) => [...s.slice(-4), msg])
          setText('')
        }
      }
    } catch (e) {
      console.error('Failed to send message', e)
    }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setPendingFile(f)
    setSelectedFileName(f.name)
  }

  return (
    <div>
      <div className="space-y-2">
        {messages.length === 0 ? <div className="text-sm text-gray-500">No messages</div> : messages.map(m => (
          <div key={m.id} className="text-sm">
            <div className="font-medium text-slate-800">{m.author?.name || 'Unknown'}</div>
            <div className="text-xs text-slate-600 truncate">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <div className="flex gap-2">
          <input ref={fileRef} type="file" onChange={onFileChange} className="hidden" />
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Message workspace..." className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm" />
          <button onClick={() => fileRef.current?.click()} className="px-2 py-1 bg-gray-200 rounded-md">📎</button>
          <button onClick={sendMessage} className="px-3 py-1 bg-blue-600 text-white rounded-md">Send</button>
        </div>
        {selectedFileName && <div className="mt-1 text-xs text-gray-600 truncate" title={selectedFileName}>{selectedFileName}</div>}
      </div>
    </div>
  )
}
