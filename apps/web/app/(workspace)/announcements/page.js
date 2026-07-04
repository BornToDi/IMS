"use client"
import React, { useEffect, useState } from 'react'
import Layout from '../../../components/Layout'
import AnnouncementEditor from '../../../components/AnnouncementEditor'
import CommentsList from '../../../components/CommentsList'
import { useAuthStore } from '../../../store/useAuthStore'
import { htmlToPlainText } from '../../../lib/plainText'

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([])
  const [showEditor, setShowEditor] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [announcementDraft, setAnnouncementDraft] = useState({ title: '', content: '' })
  const [announcementState, setAnnouncementState] = useState({})
  const auth = useAuthStore()

  useEffect(() => {
    if (auth.accessToken) {
      fetchAnnouncements()
    }
  }, [auth.accessToken])

  async function fetchAnnouncements() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/announcements`, {
      headers: auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
      credentials: 'include'
    })
    if (res.ok) {
      const data = await res.json()
      setAnnouncements(data)
    }
  }

  function startEditAnnouncement(announcement) {
    setEditingAnnouncementId(announcement.id)
    setAnnouncementDraft({ title: announcement.title || '', content: announcement.content || '' })
  }

  async function saveAnnouncement(id) {
    setAnnouncementState((current) => ({ ...current, [id]: 'saving' }))
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify(announcementDraft)
      })
      if (!res.ok) throw new Error('Failed to update announcement')
      setEditingAnnouncementId(null)
      await fetchAnnouncements()
      setAnnouncementState((current) => ({ ...current, [id]: 'saved' }))
    } catch (error) {
      setAnnouncementState((current) => ({ ...current, [id]: 'error' }))
    }
    setTimeout(() => setAnnouncementState((current) => ({ ...current, [id]: 'idle' })), 1500)
  }

  async function deleteAnnouncement(id) {
    if (!window.confirm('Delete this announcement?')) return
    setAnnouncementState((current) => ({ ...current, [id]: 'deleting' }))
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to delete announcement')
      if (editingAnnouncementId === id) setEditingAnnouncementId(null)
      await fetchAnnouncements()
    } catch (error) {
      setAnnouncementState((current) => ({ ...current, [id]: 'error' }))
    }
  }

  async function handleReact(id, emoji) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/announcements/${id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ emoji })
      })
      if (res.ok) await fetchAnnouncements()
    } catch (e) { console.error(e) }
  }

  async function handleAddComment(id, content) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/announcements/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ content })
      })
      if (res.ok) await fetchAnnouncements()
    } catch (e) { console.error(e) }
  }

  async function handleCreate() {
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required')
      return
    }
    
    const payload = { title, content }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok) {
        setTitle('')
        setContent('')
        setShowEditor(false)
        fetchAnnouncements()
      } else {
        console.error('Failed to create:', data)
        alert(`Error: ${data.error || 'Failed to create announcement'}`)
      }
    } catch (error) {
      console.error('Error creating announcement:', error)
      alert('Failed to create announcement')
    }
  }

  return (
    <Layout>
      <div className="container">
        <div className="flex items-center justify-between py-4">
          <h2 className="text-2xl font-semibold">Announcements</h2>
          <button className="btn" onClick={() => setShowEditor((s) => !s)}>New Announcement</button>
        </div>

        {showEditor && (
          <div className="card mb-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input mb-2" />
            <AnnouncementEditor initialContent={content} onChange={setContent} />
            <div className="flex justify-end mt-2">
              <button className="btn mr-2" onClick={() => setShowEditor(false)}>Cancel</button>
              <button className="btn" onClick={handleCreate}>Publish</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="card">
              {editingAnnouncementId === a.id ? (
                <div className="space-y-3">
                  <input value={announcementDraft.title} onChange={(e) => setAnnouncementDraft((current) => ({ ...current, title: e.target.value }))} className="input" placeholder="Title" />
                  <AnnouncementEditor initialContent={announcementDraft.content} onChange={(value) => setAnnouncementDraft((current) => ({ ...current, content: value }))} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn" onClick={() => saveAnnouncement(a.id)}>Save</button>
                    <button type="button" className="btn bg-gray-200 text-gray-700 hover:bg-gray-300" onClick={() => setEditingAnnouncementId(null)}>Cancel</button>
                    <button type="button" className="btn bg-red-600 hover:bg-red-700" onClick={() => deleteAnnouncement(a.id)}>Delete</button>
                    {announcementState[a.id] === 'saving' && <span className="text-sm text-gray-500 self-center">Saving...</span>}
                    {announcementState[a.id] === 'saved' && <span className="text-sm text-green-600 self-center">Saved</span>}
                    {announcementState[a.id] === 'error' && <span className="text-sm text-red-600 self-center">Failed</span>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{a.title}</h3>
                      <div className="muted">By {a.author?.name} • {new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap justify-end">
                      <button className="btn" onClick={() => handleReact(a.id, '👍')}>👍</button>
                      <button className="btn" onClick={() => handleReact(a.id, '❤️')}>❤️</button>
                      <button className="btn" onClick={() => startEditAnnouncement(a)}>Edit</button>
                      <button className="btn bg-red-600 hover:bg-red-700" onClick={() => deleteAnnouncement(a.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap">{htmlToPlainText(a.content)}</div>
                  <div className="mt-2 flex items-center space-x-2">
                    {a.reactions?.map((r) => (
                      <span key={r.id} className="px-2 py-1 bg-gray-100 rounded">{r.emoji}</span>
                    ))}
                  </div>
                  <div className="mt-3">
                    <CommentsList comments={a.comments || []} onAdd={(c) => handleAddComment(a.id, c)} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

      </div>
    </Layout>
  )
}
