"use client"
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '../store/useAuthStore'

export default function ProtectedRoute({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuth = useAuthStore((s) => s.setAuth)
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      if (user && accessToken) {
        setLoading(false)
        // Restore workspace from localStorage
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('activeWorkspace')
          if (saved) setActiveWorkspace(saved)
        }
        return
      }
      // Try refresh
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include'
        })
        if (!res.ok) throw new Error('No session')
        const data = await res.json()
        // fetch me
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${data.accessToken}` }
        })
        if (!meRes.ok) throw new Error('Could not fetch user')
        const me = await meRes.json()
        setAuth(me.user, data.accessToken)
        // Restore workspace from localStorage
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('activeWorkspace')
          if (saved) setActiveWorkspace(saved)
        }
        setLoading(false)
      } catch (err) {
        router.push('/login')
      }
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessToken])

  useEffect(() => {
    if (!user || loading) return
    const role = String(user.userRole || '').toUpperCase()
    const bankBlockedPaths = ['/dashboard', '/workspaces', '/meetings', '/announcements', '/chat', '/goals', '/action-items']
    const blocked = role === 'BANK' && bankBlockedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    if (blocked) router.replace('/tickets')
  }, [user, loading, pathname, router])

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>
  return children
}
