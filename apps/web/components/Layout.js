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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const syncNavigation = () => {
      let desktopOpen = true
      setIsMobile(media.matches)
      try { desktopOpen = window.localStorage.getItem('navigationOpen') !== 'false' } catch {}
      setNavigationOpen(media.matches ? false : desktopOpen)
    }
    syncNavigation()
    media.addEventListener('change', syncNavigation)
    return () => media.removeEventListener('change', syncNavigation)
  }, [])

  useEffect(() => { if (window.matchMedia('(max-width: 767px)').matches) setNavigationOpen(false) }, [pathname])

  useEffect(() => {
    if (!navigationOpen || !isMobile) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNavigationOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [navigationOpen, isMobile])

  function toggleNavigation() {
    setNavigationOpen((open) => {
      if (!window.matchMedia('(max-width: 767px)').matches) {
        try { window.localStorage.setItem('navigationOpen', String(!open)) } catch {}
      }
      return !open
    })
  }

  const content = (
    <div className="app-shell min-h-screen hero-glow">
      <Navbar navigationOpen={navigationOpen} onToggleNavigation={toggleNavigation} />
      <div className={isChatPage ? 'mx-auto flex max-w-[1800px] gap-0 px-0 py-0 md:px-4' : 'app-content container flex flex-col gap-0 py-4 md:flex-row md:gap-6 md:py-8'}>
        <Sidebar open={navigationOpen} mobile={isMobile} onClose={() => setNavigationOpen(false)} />
        <main id="main-content" tabIndex={-1} className={isChatPage ? 'min-w-0 flex-1 py-0' : 'min-w-0 flex-1'}>{children}</main>
      </div>
    </div>
  )
  if (protect) return <ProtectedRoute>{content}</ProtectedRoute>
  return content
}
