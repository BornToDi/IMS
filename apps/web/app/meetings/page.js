"use client"
import React, { useEffect, useMemo, useState } from 'react'
import Layout from '../../components/Layout'
import MeetingForm from '../../components/MeetingForm'
import { API_BASE_URL, apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/useAuthStore'

export default function MeetingsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [inviteOpenFor, setInviteOpenFor] = useState(null)
  const [inviteSelections, setInviteSelections] = useState({})
  const [inviteFilters, setInviteFilters] = useState({})
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    async function loadWorkspaces() {
      if (!accessToken) return
      try {
        const data = await apiFetch('/api/workspaces', accessToken)
        setWorkspaces(Array.isArray(data) ? data : [])
        if (Array.isArray(data) && data.length > 0) setSelectedWorkspace(data[0])
      } catch (error) {
        console.error('Failed to load workspaces:', error)
      }
    }
    loadWorkspaces()
  }, [accessToken])

  useEffect(() => {
    async function loadEmployees() {
      if (!accessToken) return
      try {
        const data = await apiFetch('/api/auth/users', accessToken)
        setEmployees(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Failed to load employees:', error)
      }
    }
    loadEmployees()
  }, [accessToken])

  async function loadMeetings() {
    if (!selectedWorkspace || !accessToken) return
    try {
      setLoading(true)
      const data = await apiFetch(`/api/workspaces/${selectedWorkspace.id}/meetings`, accessToken)
      setMeetings(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load meetings:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMeetings()
  }, [selectedWorkspace, accessToken])

  const handleDeleteMeeting = async (meetingId) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return

    try {
      await apiFetch(`/api/meetings/meeting/${meetingId}`, accessToken, { method: 'DELETE' })
      setMeetings((current) => current.filter((meeting) => meeting.id !== meetingId))
      alert('Meeting deleted successfully')
    } catch (error) {
      console.error('Failed to delete meeting:', error)
      alert(`Failed to delete meeting: ${error.message}`)
    }
  }

  const toggleInviteSelection = (meetingId, employeeId) => {
    setInviteSelections((current) => {
      const selected = current[meetingId] || []
      return {
        ...current,
        [meetingId]: selected.includes(employeeId)
          ? selected.filter((id) => id !== employeeId)
          : [...selected, employeeId]
      }
    })
  }

  const inviteEmployees = async (meetingId) => {
    const inviteeIds = inviteSelections[meetingId] || []
    if (!inviteeIds.length) {
      alert('Select at least one employee')
      return
    }

    setInviteLoading(true)
    try {
      const updated = await apiFetch(`/api/meetings/meeting/${meetingId}/invite`, accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeIds })
      })
      setMeetings((current) => current.map((meeting) => meeting.id === meetingId ? updated : meeting))
      setInviteSelections((current) => ({ ...current, [meetingId]: [] }))
      setInviteFilters((current) => ({ ...current, [meetingId]: '' }))
      setInviteOpenFor(null)
      alert('Invite sent. Employee notification created.')
    } catch (error) {
      console.error('Failed to invite employees:', error)
      alert(`Failed to invite employees: ${error.message}`)
    } finally {
      setInviteLoading(false)
    }
  }

  const formatDateTime = (date) => new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const meetingSummary = useMemo(() => {
    const upcoming = meetings.filter((meeting) => new Date(meeting.startTime) >= new Date()).length
    return { total: meetings.length, upcoming }
  }, [meetings])

  return (
    <Layout>
      <div className="w-full space-y-6 text-black">
        <div className="shell-panel overflow-hidden">
          <div className="p-6 lg:p-8">
            <div className="section-title">Meetings</div>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-black">Schedule & manage meetings</h1>
                <p className="mt-4 max-w-3xl text-base font-medium leading-7 text-black/75">
                  Create meetings, invite any registered employee, and send notification instantly. Revolutionary, apparently.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:min-w-72">
                <div className="rounded-2xl border border-black/10 bg-white p-4 text-center">
                  <div className="text-2xl font-black text-black">{meetingSummary.total}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-black/60">Total</div>
                </div>
                <div className="rounded-2xl border border-black/10 bg-white p-4 text-center">
                  <div className="text-2xl font-black text-black">{meetingSummary.upcoming}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-black/60">Upcoming</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {workspaces.length > 1 && (
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <label className="mb-2 block text-sm font-bold text-black">Workspace</label>
            <select
              value={selectedWorkspace?.id || ''}
              onChange={(event) => setSelectedWorkspace(workspaces.find((workspace) => workspace.id === event.target.value) || null)}
              className="input text-black"
            >
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </div>
        )}

        {selectedWorkspace ? (
          <>
            {showForm ? (
              <MeetingForm
                workspaceId={selectedWorkspace.id}
                onSuccess={() => {
                  setShowForm(false)
                  loadMeetings()
                }}
                onCancel={() => setShowForm(false)}
              />
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="rounded-lg bg-black px-5 py-3 font-bold text-white transition hover:bg-black/80"
              >
                + Schedule New Meeting
              </button>
            )}

            {loading ? (
              <div className="rounded-2xl border border-black/10 bg-white p-8 text-center font-bold text-black">Loading meetings...</div>
            ) : meetings.length === 0 ? (
              <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
                <p className="font-bold text-black">No meetings scheduled yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {meetings.map((meeting) => {
                  const invitedIds = new Set((meeting.invitees || []).map((invite) => invite.userId))
                  const filter = (inviteFilters[meeting.id] || '').toLowerCase()
                  const availableEmployees = employees.filter((employee) => {
                    if (employee.id === user?.id || invitedIds.has(employee.id)) return false
                    if (!filter) return true
                    return `${employee.name || ''} ${employee.email || ''} ${employee.userRole || ''}`.toLowerCase().includes(filter)
                  })
                  const selected = inviteSelections[meeting.id] || []
                  const isOrganizer = meeting.organizerId === user?.id

                  return (
                    <div key={meeting.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-black text-black">{meeting.title}</h3>
                          <p className="mt-1 text-sm font-semibold text-black/75">
                            📅 {formatDateTime(meeting.startTime)} - {new Date(meeting.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {meeting.location && <p className="text-sm font-semibold text-black/75">📍 {meeting.location}</p>}
                          {meeting.meetingLink && (
                            <p className="text-sm font-semibold text-black/75">
                              🔗 <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="font-black text-black underline">Join meeting</a>
                            </p>
                          )}
                          {meeting.description && <p className="mt-2 text-sm font-medium text-black/75">{meeting.description}</p>}

                          <div className="mt-4">
                            <p className="text-xs font-black uppercase tracking-wider text-black/60">Attendees ({meeting.invitees?.length || 0})</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(meeting.invitees || []).map((invite) => (
                                <span
                                  key={invite.id}
                                  className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                                    invite.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-900' :
                                    invite.status === 'DECLINED' ? 'bg-rose-100 text-rose-900' :
                                    'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {invite.user.name} ({invite.status.toLowerCase()})
                                </span>
                              ))}
                              {(!meeting.invitees || meeting.invitees.length === 0) && <span className="text-sm font-semibold text-black/60">No invitees yet</span>}
                            </div>
                          </div>

                          <p className="mt-4 text-xs font-bold text-black/60">Organized by {meeting.organizer.name}</p>
                        </div>

                        <div className="flex flex-col gap-2 xl:min-w-72">
                          {isOrganizer && (
                            <>
                              <button
                                onClick={() => setInviteOpenFor(inviteOpenFor === meeting.id ? null : meeting.id)}
                                className="rounded-lg border border-black/20 bg-white px-4 py-2 text-sm font-black text-black transition hover:bg-black/[0.04]"
                              >
                                Invite in meeting
                              </button>
                              <button
                                onClick={() => handleDeleteMeeting(meeting.id)}
                                className="rounded-lg bg-rose-100 px-4 py-2 text-sm font-black text-rose-800 transition hover:bg-rose-200"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isOrganizer && inviteOpenFor === meeting.id && (
                        <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-black text-black">Invite registered employee</p>
                              <p className="text-xs font-semibold text-black/60">Already invited employees are hidden. Humanity survives one dropdown at a time.</p>
                            </div>
                            <span className="rounded-full bg-black px-3 py-1 text-xs font-black text-white">{selected.length} selected</span>
                          </div>

                          <input
                            type="search"
                            value={inviteFilters[meeting.id] || ''}
                            onChange={(event) => setInviteFilters((current) => ({ ...current, [meeting.id]: event.target.value }))}
                            className="input mt-3 text-black"
                            placeholder="Search employee"
                          />

                          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-black/10">
                            {availableEmployees.length === 0 ? (
                              <div className="p-4 text-sm font-bold text-black/60">No employee available to invite.</div>
                            ) : availableEmployees.map((employee) => (
                              <label key={employee.id} className="flex cursor-pointer items-center gap-3 border-b border-black/5 p-3 last:border-b-0 hover:bg-black/[0.03]">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(employee.id)}
                                  onChange={() => toggleInviteSelection(meeting.id, employee.id)}
                                  className="h-4 w-4 rounded border-black/30"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-black text-black">{employee.name || 'Unnamed employee'}</span>
                                  <span className="block truncate text-xs font-semibold text-black/60">{employee.email}</span>
                                </span>
                              </label>
                            ))}
                          </div>

                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              onClick={() => setInviteOpenFor(null)}
                              className="rounded-lg border border-black/20 px-4 py-2 text-sm font-black text-black hover:bg-black/[0.04]"
                            >
                              Close
                            </button>
                            <button
                              onClick={() => inviteEmployees(meeting.id)}
                              disabled={inviteLoading || selected.length === 0}
                              className="rounded-lg bg-black px-4 py-2 text-sm font-black text-white hover:bg-black/80 disabled:opacity-50"
                            >
                              {inviteLoading ? 'Sending...' : 'Send invite'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-8 text-center font-bold text-black">No workspace found.</div>
        )}
      </div>
    </Layout>
  )
}
