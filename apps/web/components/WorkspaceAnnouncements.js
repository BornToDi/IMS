"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function WorkspaceAnnouncements({ workspaceId }) {
  const [announcements, setAnnouncements] = useState([])
  const [showEditor, setShowEditor] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [announcementDraft, setAnnouncementDraft] = useState({ title: '', content: '' })
  const [announcementState, setAnnouncementState] = useState({})
  const { accessToken } = useAuthStore()

  useEffect(() => {
    if (workspaceId) {
      fetchAnnouncements()
    }
  }, [workspaceId])

  async function fetchAnnouncements() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/announcements`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: 'include'
      })
      if (res.ok) {
        const data = await res.json()
        setAnnouncements(data)
      }
    } catch (error) {
      console.error('Failed to fetch workspace announcements:', error)
    }
  }

  async function handleCreate() {
    const payload = { title, content }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workspaces/${workspaceId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        setTitle('')
        setContent('')
        setShowEditor(false)
        fetchAnnouncements()
      } else {
        console.error('Failed to create announcement')
      }
    } catch (error) {
      console.error('Failed to create announcement:', error)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Announcements</h3>

      {showEditor && (
        <div className="card mb-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input mb-2" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" className="input mb-2 min-h-[100px]" />
          <div className="flex justify-end gap-2">
            <button className="btn bg-gray-200 text-gray-700 hover:bg-gray-300" onClick={() => setShowEditor(false)}>Cancel</button>
            <button className="btn" onClick={handleCreate}>Publish</button>
          </div>
        </div>
      )}

      {!showEditor && (
        <button className="btn" onClick={() => setShowEditor(true)}>New Announcement</button>
      )}

      <div className="space-y-3">
        {announcements.length === 0 && <p className="text-sm text-slate-500">No announcements yet</p>}
        {announcements.map((a) => (
          <div key={a.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold">{a.title}</h4>
                <div className="text-xs text-slate-500">By {a.author?.name} • {new Date(a.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div className="mt-2 text-sm" dangerouslySetInnerHTML={{ __html: a.content }} />
            {a.reactions?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {a.reactions.map((r) => (
                  <span key={r.id} className="text-xs bg-gray-100 px-2 py-1 rounded">{r.emoji}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
