"use client"
import React, { useEffect, useMemo, useState } from 'react'
import Layout from '../../../components/Layout'
import AnnouncementEditor from '../../../components/AnnouncementEditor'
import CommentsList from '../../../components/CommentsList'
import { htmlToPlainText } from '../../../lib/plainText'
import { useAuthStore } from '../../../store/useAuthStore'

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([])
  const [showEditor, setShowEditor] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [announcementDraft, setAnnouncementDraft] = useState({ title: '', content: '' })
  const [announcementState, setAnnouncementState] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState(null)
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

  const filterOptions = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 7)

    const matchesDate = (announcement, filter) => {
      const createdAt = new Date(announcement.createdAt)
      if (Number.isNaN(createdAt.getTime())) return filter === 'all'
      if (filter === 'recent') return createdAt >= sevenDaysAgo
      if (filter === 'month') return createdAt >= startOfMonth
      if (filter === 'past') return createdAt < startOfMonth
      return true
    }

    return [
      { id: 'all', label: 'All', description: 'Every update' },
      { id: 'recent', label: 'Recent', description: 'Last 7 days' },
      { id: 'month', label: 'This Month', description: now.toLocaleDateString([], { month: 'long' }) },
      { id: 'past', label: 'Past', description: 'Before this month' }
    ].map((option) => ({
      ...option,
      count: announcements.filter((announcement) => matchesDate(announcement, option.id)).length,
      matchesDate
    }))
  }, [announcements])

  const visibleAnnouncements = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const selectedFilter = filterOptions.find((option) => option.id === dateFilter)
    return announcements.filter((announcement) => {
      const searchableText = `${announcement.title || ''} ${htmlToPlainText(announcement.content || '')} ${announcement.author?.name || ''}`.toLowerCase()
      return selectedFilter?.matchesDate(announcement, dateFilter) && (!query || searchableText.includes(query))
    })
  }, [announcements, dateFilter, filterOptions, searchQuery])

  const expandedAnnouncement = announcements.find((announcement) => announcement.id === expandedAnnouncementId)

  return (
    <Layout>
      <div className="container py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Announcements</h2>
            <p className="mt-1 text-sm text-slate-500">Company news, notices, and team updates in one place.</p>
          </div>
          <button className="btn shrink-0" onClick={() => setShowEditor((s) => !s)}>{showEditor ? 'Close Editor' : 'New Announcement'}</button>
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

        <section className="my-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="Announcement filters">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_2fr] lg:items-center">
            <label className="relative block">
              <span className="sr-only">Search announcements</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">⌕</span>
              <input className="input w-full pl-9" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search title, update, or author..." />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {filterOptions.map((option) => {
                const isActive = dateFilter === option.id
                return (
                  <button key={option.id} type="button" onClick={() => setDateFilter(option.id)} aria-pressed={isActive} className={`rounded-xl border px-3 py-2 text-left transition ${isActive ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isActive ? 'bg-white/20' : 'bg-white text-slate-600'}`}>{option.count}</span>
                    </span>
                    <span className={`mt-0.5 block text-xs ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>{option.description}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">Showing {visibleAnnouncements.length} {visibleAnnouncements.length === 1 ? 'announcement' : 'announcements'}</p>
          {(searchQuery || dateFilter !== 'all') && <button type="button" className="text-sm font-semibold text-blue-600 hover:text-blue-700" onClick={() => { setSearchQuery(''); setDateFilter('all') }}>Clear filters</button>}
        </div>

        {visibleAnnouncements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <div className="text-3xl" aria-hidden="true">◇</div>
            <h3 className="mt-2 font-semibold text-slate-800">No announcements found</h3>
            <p className="mt-1 text-sm text-slate-500">Try another search or date filter.</p>
          </div>
        ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleAnnouncements.map((a) => {
            const isExpanded = expandedAnnouncementId === a.id
            return (
            <article
              key={a.id}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onClick={() => setExpandedAnnouncementId(isExpanded ? null : a.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setExpandedAnnouncementId(isExpanded ? null : a.id)
                }
              }}
              className={`${editingAnnouncementId === a.id ? 'min-h-[240px] sm:col-span-2 xl:col-span-3 2xl:col-span-4' : 'h-[240px] cursor-pointer'} overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition ${isExpanded ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'}`}
            >
              {editingAnnouncementId === a.id ? (
                <div className="space-y-3" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
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
                  <div className="mb-3 flex min-h-7 items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Announcement</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" onClick={(event) => { event.stopPropagation(); setExpandedAnnouncementId(a.id) }}>View</button>
                      {auth.user?.id === a.author?.id && (
                        <>
                          <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" onClick={(event) => { event.stopPropagation(); setExpandedAnnouncementId(a.id); startEditAnnouncement(a) }}>Edit</button>
                          <button className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100" onClick={(event) => { event.stopPropagation(); deleteAnnouncement(a.id) }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                  <header>
                    <h3 className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-900">{a.title}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                      <span>By <span className="font-medium text-slate-700">{a.author?.name || 'Unknown'}</span></span>
                      <span aria-hidden="true">•</span>
                      <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                    </div>
                  </header>
                  <div className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{htmlToPlainText(a.content)}</div>
                </>
              )}
            </article>
            )
          })}
        </div>
        )}

        {expandedAnnouncement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="announcement-modal-title" onClick={() => setExpandedAnnouncementId(null)}>
            <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">Announcement</span>
                <div className="flex items-center gap-2">
                  {auth.user?.id === expandedAnnouncement.author?.id && (
                    <>
                      <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setExpandedAnnouncementId(null); startEditAnnouncement(expandedAnnouncement) }}>Edit</button>
                      <button type="button" className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100" onClick={() => deleteAnnouncement(expandedAnnouncement.id)}>Delete</button>
                    </>
                  )}
                  <button type="button" aria-label="Close announcement" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200" onClick={() => setExpandedAnnouncementId(null)}>×</button>
                </div>
              </div>
              <div className="overflow-y-auto px-5 py-5 sm:px-6">
                <h3 id="announcement-modal-title" className="break-words text-xl font-bold leading-7 text-slate-900">{expandedAnnouncement.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  <span>By <span className="font-semibold text-slate-700">{expandedAnnouncement.author?.name || 'Unknown'}</span></span>
                  <span aria-hidden="true">•</span>
                  <time dateTime={expandedAnnouncement.createdAt}>{new Date(expandedAnnouncement.createdAt).toLocaleString()}</time>
                </div>
                <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{htmlToPlainText(expandedAnnouncement.content)}</div>
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Comments</h4>
                  <CommentsList comments={expandedAnnouncement.comments || []} onAdd={(comment) => handleAddComment(expandedAnnouncement.id, comment)} />
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  )
}
