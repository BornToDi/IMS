"use client"
import React from 'react'
import { useAuthStore } from '../store/useAuthStore'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (e) {}

    clearAuth()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-700/60 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white shadow-[0_12px_30px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
            <span className="text-sm font-bold tracking-wide">TH</span>
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">Collaborative Team Hub</div>
            {/* <div className="text-xs text-slate-300">Workspaces, goals, messages, and notifications</div> */}
          </div>
        </div>

        <div />

        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <>
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium text-slate-100">{user.name}</div>
                <div className="text-xs text-slate-300">{user.userRole || 'EMPLOYEE'}</div>
              </div>
              <NotificationBell />
              <button
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 hover:text-white"
              >
                Logout
              </button>
            </>
          ) : (
            <a
              href="/login"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 hover:text-white"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
