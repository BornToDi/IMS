"use client"
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { notificationCounts } from '../lib/notificationCounts.mjs'
import { apiFetch } from '../lib/api'
import { InstallAppButton } from './AppRuntime'

const allItems = [
  { href: '/bank-team', label: 'Bank Team & Targets', hint: 'People, POS and progress', icon: '▦', roles: ['BANK', 'ADMIN'] },
  { href: '/support', label: 'Private Messages', hint: 'Bank and admin inbox', icon: '↗', roles: ['BANK', 'ADMIN'] },
  { href: '/profile', label: 'My Profile', hint: 'Edit name and password', icon: '◌', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE', 'BANK'] },
  { href: '/dashboard', label: 'Dashboard', hint: 'Overview', icon: '⌁', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/tickets', label: 'Bank Tickets', hint: 'Client requests', icon: '▣', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT'] },
  { href: '/employees', label: 'Employees', hint: 'Admin team control', icon: '◫', roles: ['ADMIN', 'MANAGEMENT'] },
  { href: '/workspaces', label: 'Field Tasks', hint: 'POS jobs', icon: '▦', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/hardware', label: 'Hardware', hint: 'POS inventory', icon: '▧', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/meetings', label: 'Meetings', hint: 'Schedule', icon: '◷', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/announcements', label: 'Announcements', hint: 'Updates', icon: '✦', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/chat', label: 'Company Chat', hint: 'Global room', icon: '◉', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/pdf-to-png', label: 'PDF to PNG', hint: 'Transparent 500 × 500', icon: '⇩', roles: ['ADMIN', 'MANAGEMENT', 'ASSISTANT', 'EMPLOYEE'] },
  { href: '/receipts', label: 'Receipt', hint: 'POS transactions', icon: '▤', roles: ['ADMIN'] }
]

export default function Sidebar({ open = true, mobile = false, onClose }){
  const navigationRef = useRef(null)
  useEffect(() => {
    if (!open || !mobile) return
    const previousFocus = document.activeElement
    const nav = navigationRef.current
    const focusable = () => [...nav.querySelectorAll('a[href], button:not(:disabled)')]
    focusable()[0]?.focus()
    const trapFocus = event => {
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    nav.addEventListener('keydown', trapFocus)
    return () => { nav.removeEventListener('keydown', trapFocus); if (previousFocus?.isConnected) previousFocus.focus() }
  }, [open, mobile])
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const notes = useNotificationStore(state => state.notes)
  const setNotes = useNotificationStore(state => state.setNotes)
  const accessToken = useAuthStore(state => state.accessToken)
  const counts = notificationCounts(notes)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [pendingBankId, setPendingBankId] = useState('')
  useEffect(() => {
    const canApprove = user?.userRole === 'ADMIN' || (user?.userRole === 'BANK' && user?.bankRole === 'ADMIN' && user?.bankStatus === 'APPROVED')
    if (!canApprove || !accessToken) { setPendingApprovals(0); return }
    let active = true
    const refresh = () => apiFetch('/api/bank-team/pending-count', accessToken).then(data => { if (active) { setPendingApprovals(data.pending || 0); setPendingBankId(data.bankId || '') } }).catch(() => {})
    refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 15000)
    window.addEventListener('bank-team:updated', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('bank-team:updated', refresh) }
  }, [accessToken, user?.id, user?.userRole, user?.bankRole, user?.bankStatus, notes])
  const bankUpdates = notes.filter(note => !note.isRead && ['BANK_TEAM', 'BANK_ASSIGNMENT', 'BANK_TARGET'].includes(note.type)).length
  const bankTeamHref = pendingApprovals ? `/bank-team?${new URLSearchParams({ tab: 'members', ...(pendingBankId ? { bankId: pendingBankId } : {}) })}` : '/bank-team'
  const badgeFor = href => href === '/bank-team' ? pendingApprovals + bankUpdates : href === '/support' ? notes.filter(note => !note.isRead && note.type === 'DIRECT_MESSAGE').length : href === '/chat' ? counts.chat : href === '/announcements' ? counts.announcements : 0
  const role = String(user?.userRole || 'EMPLOYEE').toUpperCase()
  const items = allItems.filter((item) => item.roles.includes(role) && !(role === 'BANK' && user?.bankStatus && user.bankStatus !== 'APPROVED' && item.href !== '/bank-team'))
  async function openItem(href) {
    if (window.matchMedia('(max-width: 767px)').matches) onClose?.()
    if (href === '/bank-team' && accessToken) {
      const updates = notes.filter(note => !note.isRead && ['BANK_TEAM', 'BANK_ASSIGNMENT', 'BANK_TARGET'].includes(note.type))
      await Promise.all(updates.map(async note => {
        try {
          await apiFetch(`/api/notifications/${note.id}/read`, accessToken, { method: 'PATCH' })
          setNotes(current => current.map(item => item.id === note.id ? { ...item, isRead: true } : item))
        } catch (error) { console.error('Failed to mark bank update as read:', error) }
      }))
      return
    }
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
      <div className="app-navigation fixed inset-0 top-16 z-30 bg-slate-950/45 backdrop-blur-sm md:hidden" onClick={onClose} aria-hidden="true" />
      <nav id="mobile-navigation" ref={navigationRef} className="app-navigation fixed bottom-0 left-0 top-16 z-30 w-[min(82vw,320px)] overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl md:hidden" aria-label="Main navigation">
        <button type="button" onClick={onClose} className="mb-2 w-full rounded-xl border p-2 text-sm font-semibold" aria-label="Close navigation">Close menu</button>
        <div className="mb-3 px-2 py-2">
          <div className="section-title">Navigation</div>
          <div className="mt-1 text-sm text-slate-500">Full delivery workflow</div>
        </div>
        {items.map((i) => { 
          const active = pathname === i.href || pathname.startsWith(`${i.href}/`)
          return (
            <Link
              key={i.href}
              href={i.href === '/bank-team' ? bankTeamHref : i.href}
              onClick={() => openItem(i.href)}
                  className={`relative mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${active ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-700 hover:bg-slate-100'}`}>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-black/5 text-sm">{i.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{i.label}</span>
                <span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span>
              </span>
              {badgeFor(i.href) > 0 && <span aria-label={`${badgeFor(i.href)} unread`} className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{badgeFor(i.href)}</span>}
            </Link>
          )
        })}
        <InstallAppButton />
      </nav>
      <aside className="hidden w-full max-w-[260px] md:sticky md:top-24 md:block md:w-52 md:shrink-0 md:self-start lg:w-[260px]">
        <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1 scrollbar-none">
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
                  href={i.href === '/bank-team' ? bankTeamHref : i.href}
                  onClick={() => openItem(i.href)}
                  className={`relative mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${active ? 'bg-slate-900 text-white shadow-lg' : 'bg-white/60 text-slate-700 hover:bg-white hover:text-slate-950'}`}>
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-sm">{i.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold">{i.label}</span>
                    <span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span>
                  </span>
                  {badgeFor(i.href) > 0 && <span aria-label={`${badgeFor(i.href)} unread`} className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{badgeFor(i.href)}</span>}
                </Link>
              )
            })}
            <InstallAppButton />
          </div>
        </div>
      </aside>
    </>
  )
}
