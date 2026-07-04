"use client"
import React, { useEffect, useState } from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import ProtectedRoute from './ProtectedRoute'
import { usePathname } from 'next/navigation'

export default function Layout({ children, protect = true }){
  const pathname = usePathname()
  const isChatPage = pathname === '/chat'
  const [navigationOpen, setNavigationOpen] = useState(false)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)').matches
    setNavigationOpen(mobile ? false : window.localStorage.getItem('navigationOpen') !== 'false')
  }, [])

  useEffect(() => {
    if (!navigationOpen || !window.matchMedia('(max-width: 767px)').matches) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNavigationOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [navigationOpen])

  function toggleNavigation() {
    setNavigationOpen((open) => {
      if (!window.matchMedia('(max-width: 767px)').matches) {
        window.localStorage.setItem('navigationOpen', String(!open))
      }
      return !open
    })
  }

  const content = (
    <div className="min-h-screen hero-glow">
      <Navbar navigationOpen={navigationOpen} onToggleNavigation={toggleNavigation} />
      <div className={isChatPage ? 'mx-auto flex max-w-[1800px] gap-0 px-0 py-0 md:px-4' : 'container flex flex-col gap-0 py-4 md:flex-row md:gap-6 md:py-8'}>
        <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />
        <main className={isChatPage ? 'min-w-0 flex-1 py-0' : 'min-w-0 flex-1'}>{children}</main>
      </div>
    </div>
  )
  if (protect) return <ProtectedRoute>{content}</ProtectedRoute>
  return content
}
