"use client"
import React from 'react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import ProtectedRoute from './ProtectedRoute'
import { usePathname } from 'next/navigation'

export default function Layout({ children, protect = true }){
  const pathname = usePathname()
  const isChatPage = pathname === '/chat'
  const content = (
    <div className="min-h-screen hero-glow">
      <Navbar />
      <div className={isChatPage ? 'mx-auto flex max-w-[1800px] gap-0 px-0 py-0 md:px-4' : 'container flex flex-col gap-0 py-4 md:flex-row md:gap-6 md:py-8'}>
        <Sidebar />
        <main className={isChatPage ? 'min-w-0 flex-1 py-0' : 'min-w-0 flex-1'}>{children}</main>
      </div>
    </div>
  )
  if (protect) return <ProtectedRoute>{content}</ProtectedRoute>
  return content
}
