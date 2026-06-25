"use client"
import React, { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'

export default function MeetingReminder() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadUpcomingMeetings() {
      try {
        setLoading(true)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/meetings/upcoming`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          credentials: 'include'
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setMeetings(data)
        }
      } catch (error) {
        console.error('Failed to load meetings:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (accessToken) {
      loadUpcomingMeetings()
      const interval = setInterval(loadUpcomingMeetings, 60000) // Refresh every minute
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }
  }, [accessToken])

  const handleRespond = async (meetingId, status) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/meetings/meeting/${meetingId}/invite/respond`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify({ meetingId, status })
      })
      if (res.ok) {
        // Reload meetings
        const meetsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/meetings/upcoming`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include'
        })
        if (meetsRes.ok) {
          setMeetings(await meetsRes.json())
        }
      }
    } catch (error) {
      console.error('Failed to update invite status:', error)
    }
  }

  if (loading || meetings.length === 0) {
    return null
  }

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => {
        const userInvite = meeting.invitees.find(inv => inv.userId === useAuthStore.getState().user?.id)
        const status = userInvite?.status || 'PENDING'
        
        return (
          <div key={meeting.id} className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{meeting.title}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  📅 {formatDate(meeting.startTime)} at {formatTime(meeting.startTime)}
                </p>
                {meeting.location && (
                  <p className="text-sm text-slate-600">📍 {meeting.location}</p>
                )}
                {meeting.meetingLink && (
                  <p className="text-sm text-slate-600">
                    🔗 <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="text-blue-700 underline">Join meeting</a>
                  </p>
                )}
                {meeting.description && (
                  <p className="mt-2 text-sm text-slate-600">{meeting.description}</p>
                )}
                
                {/* Invitees list */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-600">Attendees:</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {meeting.invitees.map((invite) => (
                      <div key={invite.id} className="flex items-center gap-1">
                        <span className="text-xs text-slate-700">{invite.user.name}</span>
                        <span className={`inline-block h-2 w-2 rounded-full ${
                          invite.status === 'ACCEPTED' ? 'bg-green-500' : 
                          invite.status === 'DECLINED' ? 'bg-red-500' : 
                          'bg-yellow-500'
                        }`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Response buttons */}
              {status !== 'ACCEPTED' && status !== 'DECLINED' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(meeting.id, 'ACCEPTED')}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700"
                  >
                    ✓ Accept
                  </button>
                  <button
                    onClick={() => handleRespond(meeting.id, 'DECLINED')}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
                  >
                    ✕ Decline
                  </button>
                </div>
              )}
              {status === 'ACCEPTED' && (
                <div className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800">
                  ✓ Accepted
                </div>
              )}
              {status === 'DECLINED' && (
                <div className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800">
                  ✕ Declined
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
