"use client"
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'

const allItems = [
  { href: '/dashboard', label: 'Dashboard', hint: 'Overview', icon: '⌁', roles: ['ADMIN', 'MANAGEMENT', 'EMPLOYEE'] },
  { href: '/tickets', label: 'Bank Tickets', hint: 'Client requests', icon: '▣', roles: ['BANK', 'ADMIN', 'MANAGEMENT'] },
  { href: '/workspaces', label: 'Field Tasks', hint: 'POS jobs', icon: '▦', roles: ['ADMIN', 'MANAGEMENT', 'EMPLOYEE'] },
  { href: '/pos-serials', label: 'POS Serials', hint: 'Master list', icon: '▤', roles: ['ADMIN', 'MANAGEMENT'] },
  { href: '/hardware', label: 'Hardware', hint: 'POS repair', icon: '▧', roles: ['BANK', 'ADMIN', 'MANAGEMENT', 'EMPLOYEE'] },
  { href: '/meetings', label: 'Meetings', hint: 'Schedule', icon: '◷', roles: ['ADMIN', 'MANAGEMENT', 'EMPLOYEE'] },
  { href: '/announcements', label: 'Announcements', hint: 'Updates', icon: '✦', roles: ['ADMIN', 'MANAGEMENT', 'EMPLOYEE'] },
  { href: '/chat', label: 'Company Chat', hint: 'Global room', icon: '◉', roles: ['ADMIN', 'MANAGEMENT', 'EMPLOYEE'] }
]

export default function Sidebar(){
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const role = String(user?.userRole || 'EMPLOYEE').toUpperCase()
  const items = allItems.filter((item) => item.roles.includes(role))
  return (
    <>
      <nav className="md:hidden -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2 chat-scroll">
        {items.map((i) => {
          const active = pathname === i.href || pathname.startsWith(`${i.href}/`)
          return <Link key={i.href} href={i.href} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${active ? 'bg-slate-950 text-white' : 'bg-white/80 text-slate-700 shadow-sm'}`}>{i.icon} {i.label}</Link>
        })}
      </nav>
      <aside className="hidden w-full max-w-[260px] md:block">
        <div className="shell-panel sticky top-24 p-3">
          <div className="px-3 py-2">
            <div className="section-title">Navigation</div>
            <div className="mt-1 text-sm text-slate-500">Full delivery workflow</div>
          </div>
          {items.map(i=> {
            const active = pathname === i.href || pathname.startsWith(`${i.href}/`)
            return <Link key={i.href} href={i.href} className={`mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'bg-white/60 text-slate-700 hover:bg-white hover:text-slate-950'}`}><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-sm">{i.icon}</span><span><span className="block text-sm font-semibold">{i.label}</span><span className={`block text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>{i.hint}</span></span></Link>
          })}
        </div>
      </aside>
    </>
  )
}
