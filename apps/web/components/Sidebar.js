"use client"
import React from 'react'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'
import { apiFetch, SOCKET_BASE_URL } from '../lib/api'
import { io } from 'socket.io-client'

const allItems = [
  { href: '/profile', label: 'My Profile', hint: 'Edit name and password', icon: '◌', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE', 'BANK'] },
  { href: '/dashboard', label: 'Dashboard', hint: 'Overview', icon: '⌁', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/tickets', label: 'Bank Tickets', hint: 'Client requests', icon: '▣', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT'] },
  { href: '/employees', label: 'Employees', hint: 'Admin team control', icon: '◫', roles: ['ADMIN', 'MANAGEMENT'] },
  { href: '/workspaces', label: 'Field Tasks', hint: 'POS jobs', icon: '▦', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/pos-serials', label: 'POS Serials', hint: 'Master list', icon: '▤', roles: ['ADMIN', 'MANAGEMENT'] },
  { href: '/hardware', label: 'Hardware', hint: 'POS repair', icon: '▧', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/meetings', label: 'Meetings', hint: 'Schedule', icon: '◷', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/announcements', label: 'Announcements', hint: 'Updates', icon: '✦', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/chat', label: 'Company Chat', hint: 'Global room', icon: '◉', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/pdf-to-png', label: 'PDF to PNG', hint: 'Transparent 500 × 500', icon: '⇩', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] }
]

export default function Sidebar({ open = true, onClose }){
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const [chatCount, setChatCount] = useState(0)
  const [showChatBadge, setShowChatBadge] = useState(false)
  // chatTotalRef: total messages known; lastSeenRef: last seen total persisted per user
  const chatTotalRef = useRef(0)
  const lastSeenRef = useRef(0)
  const role = String(user?.userRole || 'EMPLOYEE').toUpperCase()
  const items = allItems.filter((item) => item.roles.includes(role))
  useEffect(() => {
    let mounted = true
    async function load() {
      // wait for authenticated user so we can read/write per-user last-seen
      if (!accessToken || !user) return
      try {
        const data = await apiFetch('/api/chat', accessToken)
        if (!mounted) return
        if (Array.isArray(data)) {
            const total = data.length
            // load last seen from localStorage (per-user)
            const userKey = `chat:lastSeen:${user?.id || user?.email || 'anon'}`
            const persisted = parseInt(localStorage.getItem(userKey) || '0', 10) || 0
            lastSeenRef.current = persisted
            chatTotalRef.current = total
            const unseen = Math.max(0, total - persisted)
            if (unseen > 0) setShowChatBadge(true)
            setChatCount(unseen)
        }
      } catch (e) {
        // ignore
      }
    }
    load()
    const t = setInterval(load, 30000)

    // real-time updates via socket
    let socket = null
    try {
      socket = io(SOCKET_BASE_URL || undefined, {
        auth: { token: accessToken },
        extraHeaders: { Authorization: `Bearer ${accessToken}` }
      })
      socket.on('connect', () => {
        if (!accessToken) return
        socket.emit('join-global-chat')
      })
      socket.on('new-global-message', (message) => {
        if (!mounted) return
        // increment total and compute unseen relative to lastSeenRef
        chatTotalRef.current = (chatTotalRef.current || 0) + 1
        const unseen = Math.max(0, chatTotalRef.current - (lastSeenRef.current || 0))
        setChatCount(unseen)
        if (unseen > 0) setShowChatBadge(true)
      })
    } catch (err) {
      // socket optional
    }

    return () => { mounted = false; clearInterval(t); if (socket) socket.disconnect() }
  }, [accessToken, user])

  // clear badge when user opens chat
  useEffect(() => {
    if (pathname && pathname.includes('/chat')) {
      // mark all as seen
      lastSeenRef.current = chatTotalRef.current || 0
      const userKey = `chat:lastSeen:${user?.id || user?.email || 'anon'}`
      try { localStorage.setItem(userKey, String(lastSeenRef.current)) } catch (e) {}
      setShowChatBadge(false)
      setChatCount(0)
    }
  }, [pathname])

  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 top-16 z-30 bg-slate-950/45 backdrop-blur-sm md:hidden" onClick={onClose} aria-hidden="true" />
      <nav className="fixed bottom-0 left-0 top-16 z-30 w-[min(82vw,320px)] overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl md:hidden" aria-label="Main navigation">
        <div className="mb-3 px-2 py-2">
          <div className="section-title">Navigation</div>
          <div className="mt-1 text-sm text-slate-500">Full delivery workflow</div>
        </div>
        {items.map((i) => { 
          const active = pathname === i.href || pathname.startsWith(`${i.href}/`)
          return (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => {
                  if (onClose) onClose()
                  if (i.href === '/chat') {
                    // mark seen immediately on click
                    lastSeenRef.current = chatTotalRef.current || 0
                    const userKey = `chat:lastSeen:${user?.id || user?.email || 'anon'}`
                    try { localStorage.setItem(userKey, String(lastSeenRef.current)) } catch (err) {}
                    setShowChatBadge(false)
                    setChatCount(0)
                }
              }}
              className={`relative mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-700 hover:bg-slate-100'}`}>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-black/5 text-sm">{i.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{i.label}</span>
                <span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span>
              </span>
              {/* badge removed per request: no corner color */}
            </Link>
          )
        })}
      </nav>
      <aside className="hidden w-full max-w-[260px] md:block md:self-start">
        <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 scrollbar-none">
          <div className="shell-panel p-3">
            <div className="px-3 py-2">
              <div className="section-title">Navigation</div>
              <div className="mt-1 text-sm text-slate-500">Full delivery workflow</div>
            </div>
            {items.map(i=> {
              const active = pathname === i.href || pathname.startsWith(`${i.href}/`)
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => {
                    if (i.href === '/chat') {
                      // mark seen immediately on click
                      lastSeenRef.current = chatTotalRef.current || 0
                      const userKey = `chat:lastSeen:${user?.id || user?.email || 'anon'}`
                      try { localStorage.setItem(userKey, String(lastSeenRef.current)) } catch (err) {}
                      setShowChatBadge(false)
                      setChatCount(0)
                    }
                  }}
                  className={`relative mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'bg-white/60 text-slate-700 hover:bg-white hover:text-slate-950'}`}>
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-sm">{i.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold">{i.label}</span>
                    <span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span>
                  </span>
                  {/* badge removed per request: no corner color */}
                </Link>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
