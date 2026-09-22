"use client"
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'

export default function ProtectedRoute({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken)
  const sessionError = useAuthStore((s) => s.sessionError)
  const [attempt, setAttempt] = useState(0)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)
  const [loading, setLoading] = useState(() => {
    const session = useAuthStore.getState()
    return !(session.user && session.accessToken)
  })

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (user && accessToken) {
        setLoading(false)
        try {
          const saved = localStorage.getItem('activeWorkspace')
          if (saved) setActiveWorkspace(saved)
        } catch {}
        return
      }
      setLoading(true)
      await refreshAccessToken()
      if (cancelled) return
      const session = useAuthStore.getState()
      if (session.sessionExpired) router.replace('/login')
      else setLoading(false)
    }
    check()
    return () => { cancelled = true }
  }, [user, accessToken, attempt, refreshAccessToken, setActiveWorkspace, router])

  useEffect(() => {
    if (!user || !accessToken) return undefined
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') refreshAccessToken()
    }
    const intervalId = window.setInterval(() => {
      refreshAccessToken()
    }, 5 * 60 * 1000)
    window.addEventListener('focus', refreshWhenActive)
    document.addEventListener('visibilitychange', refreshWhenActive)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshWhenActive)
      document.removeEventListener('visibilitychange', refreshWhenActive)
    }
  }, [user, accessToken, refreshAccessToken])

  useEffect(() => {
    if (!user || loading) return
    const role = String(user.userRole || '').toUpperCase()
    const bankBlockedPaths = ['/dashboard', '/workspaces', '/meetings', '/announcements', '/chat', '/goals', '/action-items']
    const blocked = role === 'BANK' && bankBlockedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    if (blocked) router.replace('/tickets')
  }, [user, loading, pathname, router])

  if (loading) return <div role="status" className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">Restoring your session…</div>
  if (!user || !accessToken) return <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-slate-200"><p>{sessionError || 'Restoring your session…'}</p>{sessionError && <button type="button" onClick={() => setAttempt(value => value + 1)} className="rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-emerald-950">Retry connection</button>}</div>
  return children
}
