"use client"
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { notificationCounts } from '../lib/notificationCounts.mjs'
import { apiFetch } from '../lib/api'

const allItems = [
  { href: '/profile', label: 'My Profile', hint: 'Edit name and password', icon: '◌', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE', 'BANK'] },
  { href: '/dashboard', label: 'Dashboard', hint: 'Overview', icon: '⌁', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/tickets', label: 'Bank Tickets', hint: 'Client requests', icon: '▣', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT'] },
  { href: '/employees', label: 'Employees', hint: 'Admin team control', icon: '◫', roles: ['ADMIN', 'MANAGEMENT'] },
  { href: '/workspaces', label: 'Field Tasks', hint: 'POS jobs', icon: '▦', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/pos-serials', label: 'POS Serials', hint: 'Master list', icon: '▤', roles: ['ADMIN', 'MANAGEMENT'] },
  { href: '/hardware', label: 'Hardware', hint: 'POS inventory', icon: '▧', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/meetings', label: 'Meetings', hint: 'Schedule', icon: '◷', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/announcements', label: 'Announcements', hint: 'Updates', icon: '✦', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/chat', label: 'Company Chat', hint: 'Global room', icon: '◉', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/pdf-to-png', label: 'PDF to PNG', hint: 'Transparent 500 × 500', icon: '⇩', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] }
]

export default function Sidebar({ open = true, onClose }){
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const notes = useNotificationStore(state => state.notes)
  const setNotes = useNotificationStore(state => state.setNotes)
  const accessToken = useAuthStore(state => state.accessToken)
  const counts = notificationCounts(notes)
  const badgeFor = href => href === '/chat' ? counts.chat : href === '/announcements' ? counts.announcements : 0
  const role = String(user?.userRole || 'EMPLOYEE').toUpperCase()
  const items = allItems.filter((item) => item.roles.includes(role))
  async function openItem(href) {
    onClose?.()
    const type = href === '/chat' ? 'GLOBAL_CHAT' : href === '/announcements' ? 'ANNOUNCEMENT' : null
    if (!type || !accessToken) return
    const unread = notes.filter(note => !note.isRead && note.type === type)
    const targets = type === 'GLOBAL_CHAT' ? unread.slice(0, 1) : unread
    await Promise.all(targets.map(async note => {
      try {
        await apiFetch(`/api/notifications/${note.id}/read`, accessToken, { method: 'PATCH' })
        setNotes(current => current.map(item => item.id === note.id || (type === 'GLOBAL_CHAT' && item.type === type) ? { ...item, isRead: true } : item))
      } catch (error) { console.error('Failed to mark navigation notifications as read:', error) }
    }))
  }
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
              onClick={() => openItem(i.href)}
              className={`relative mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-700 hover:bg-slate-100'}`}>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-black/5 text-sm">{i.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{i.label}</span>
                <span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span>
              </span>
              {badgeFor(i.href) > 0 && <span aria-label={`${badgeFor(i.href)} unread`} className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{badgeFor(i.href)}</span>}
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
                  onClick={() => openItem(i.href)}
                  className={`relative mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'bg-white/60 text-slate-700 hover:bg-white hover:text-slate-950'}`}>
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-sm">{i.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold">{i.label}</span>
                    <span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span>
                  </span>
                  {badgeFor(i.href) > 0 && <span aria-label={`${badgeFor(i.href)} unread`} className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{badgeFor(i.href)}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
