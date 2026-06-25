"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import Link from 'next/link'

export default function MeetingCard() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/meetings/upcoming`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          credentials: 'include'
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setMeeting(data[0] || null)
      } catch (err) {
        console.error('Failed to load upcoming meeting', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (accessToken) load()
    return () => { cancelled = true }
  }, [accessToken])

  if (loading) return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">Loading next meeting…</div>
    </div>
  )

  if (!meeting) return (
    <div className="card p-6">
      <div className="text-sm font-semibold text-slate-900">No upcoming meetings</div>
      <p className="mt-2 text-sm text-slate-600">Schedule a meeting to remind your team.</p>
      <div className="mt-4">
        <Link href="/meetings" className="btn">Schedule meeting</Link>
      </div>
    </div>
  )

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs text-slate-500">Next meeting</div>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{meeting.title}</h3>
          <p className="mt-2 text-sm text-slate-600">{new Date(meeting.startTime).toLocaleString()}</p>
          {meeting.meetingLink && (
            <p className="mt-2 text-sm"><a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="text-blue-700 underline">Join meeting</a></p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/meetings`} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">View all</Link>
          <Link href="/meetings" className="text-sm text-slate-500">Manage</Link>
        </div>
      </div>
    </div>
  )
}
