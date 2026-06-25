"use client"
import React, { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useRouter } from 'next/navigation'
import { API_BASE_URL, apiFetch } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'

export default function NotificationBell() {
  const router = useRouter()
  const [notes, setNotes] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [pulse, setPulse] = useState(false)
  const accessToken = useAuthStore((s) => s.accessToken)
  const dropdownRef = useRef(null)
  const unreadCount = notes.filter((note) => !note.isRead).length

  async function load() {
    if (!accessToken) return setNotes([])
    try {
      const data = await apiFetch('/api/notifications', accessToken)
      setNotes(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  useEffect(() => {
    load()
    if (!accessToken) return
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return
    const socket = io(API_BASE_URL || 'http://localhost:5000', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling']
    })
    socket.on('notification:new', (note) => {
      setNotes((current) => [note, ...current.filter((n) => n.id !== note.id)])
      setPulse(true)
      setTimeout(() => setPulse(false), 1200)
    })
    return () => socket.disconnect()
  }, [accessToken])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function targetFor(note) {
    if (note?.targetUrl) return note.targetUrl
    if (note?.workspaceId) return `/workspaces/${note.workspaceId}`
    if (String(note?.type || '').includes('TICKET')) return '/tickets'
    if (String(note?.type || '').includes('HARDWARE')) return '/hardware'
    return null
  }

  async function openNotification(note) {
    await markRead(note.id)
    const url = targetFor(note)
    if (url) { setShowDropdown(false); router.push(url) }
  }

  async function markRead(id) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, accessToken, { method: 'PATCH' })
      setNotes((current) => current.map((note) => (note.id === id ? { ...note, isRead: true } : note)))
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown((current) => !current)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10 hover:text-white ${pulse ? 'scale-110 ring-4 ring-emerald-400/40' : ''}`}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {showDropdown && (
        <div className="absolute right-0 z-50 mt-3 w-[340px] overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-black text-slate-900">Notifications</h3>
            <p className="text-xs text-slate-500">{unreadCount} unread, updates arrive live</p>
          </div>
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {notes.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet</div> : notes.map((note) => (
              <button type="button" key={note.id} onClick={() => openNotification(note)} className={`block w-full px-4 py-3 text-left transition hover:bg-slate-50 ${note.isRead ? 'bg-white' : 'bg-emerald-50/80'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm ${note.isRead ? 'text-slate-700' : 'font-bold text-slate-950'}`}>{note.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(note.createdAt).toLocaleString()}</p>
                  </div>
                  {!note.isRead && <span className="whitespace-nowrap rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-700 shadow-sm">Open</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
