"use client"
import React, { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL, apiFetch } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'

export default function MeetingForm({ workspaceId, onSuccess, onCancel }) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState([])
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    location: '',
    meetingLink: '',
    reminderMinutes: 15,
    inviteeIds: []
  })

  useEffect(() => {
    async function loadEmployees() {
      if (!accessToken) return
      try {
        const data = await apiFetch('/api/auth/users', accessToken)
        setEmployees(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Failed to load registered employees:', error)
      }
    }
    loadEmployees()
  }, [accessToken])

  const filteredEmployees = useMemo(() => {
    const q = employeeFilter.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((employee) =>
      `${employee.name || ''} ${employee.email || ''} ${employee.userRole || ''}`.toLowerCase().includes(q)
    )
  }, [employees, employeeFilter])

  const selectedEmployees = employees.filter((employee) => formData.inviteeIds.includes(employee.id))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title || !formData.startTime || !formData.endTime) {
      alert('Please fill in all required fields')
      return
    }

    if (new Date(formData.endTime) <= new Date(formData.startTime)) {
      alert('End time must be after start time')
      return
    }

    setLoading(true)
    try {
      const meeting = await apiFetch(`/api/workspaces/${workspaceId}/meetings`, accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      alert('Meeting created successfully. Invited employees got notifications.')
      onSuccess?.(meeting)
      setFormData({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        location: '',
        meetingLink: '',
        reminderMinutes: 15,
        inviteeIds: []
      })
      setEmployeeFilter('')
    } catch (error) {
      console.error('Failed to create meeting:', error)
      alert(`Failed to create meeting: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleInvitee = (userId) => {
    setFormData((prev) => ({
      ...prev,
      inviteeIds: prev.inviteeIds.includes(userId)
        ? prev.inviteeIds.filter((id) => id !== userId)
        : [...prev.inviteeIds, userId]
    }))
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-black">Schedule a Meeting</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-black">Meeting Title *</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="input mt-1 text-black"
            placeholder="Team Standup"
            required
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="input mt-1 resize-none text-black"
            placeholder="Meeting details..."
            rows="3"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-black">Start Time *</label>
            <input
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              className="input mt-1 text-black"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-black">End Time *</label>
            <input
              type="datetime-local"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              className="input mt-1 text-black"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-black">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="input mt-1 text-black"
              placeholder="Conference Room A"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-black">Meeting Link</label>
            <input
              type="url"
              value={formData.meetingLink}
              onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
              className="input mt-1 text-black"
              placeholder="https://meet.google.com/..."
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-black">Reminder</label>
          <select
            value={formData.reminderMinutes}
            onChange={(e) => setFormData({ ...formData, reminderMinutes: Number(e.target.value) })}
            className="input mt-1 text-black"
          >
            <option value={5}>5 minutes before</option>
            <option value={15}>15 minutes before</option>
            <option value={30}>30 minutes before</option>
            <option value={60}>1 hour before</option>
          </select>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="block text-sm font-bold text-black">Invite registered employees</label>
              <p className="text-xs text-black/70">Select any registered employee. They will receive a notification.</p>
            </div>
            <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold text-black">
              {formData.inviteeIds.length} selected
            </span>
          </div>

          <input
            type="search"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="input mt-3 text-black"
            placeholder="Search employee by name, email, or role"
          />

          {selectedEmployees.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedEmployees.map((employee) => (
                <button
                  type="button"
                  key={employee.id}
                  onClick={() => toggleInvitee(employee.id)}
                  className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white"
                >
                  {employee.name} ×
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-black/10">
            {filteredEmployees.length === 0 ? (
              <div className="p-4 text-sm font-medium text-black/70">No registered employee found.</div>
            ) : filteredEmployees.map((employee) => (
              <label key={employee.id} className="flex cursor-pointer items-center gap-3 border-b border-black/5 p-3 last:border-b-0 hover:bg-black/[0.03]">
                <input
                  type="checkbox"
                  checked={formData.inviteeIds.includes(employee.id)}
                  onChange={() => toggleInvitee(employee.id)}
                  className="h-4 w-4 rounded border-black/30"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-black">{employee.name || 'Unnamed employee'}</span>
                  <span className="block truncate text-xs text-black/70">{employee.email}</span>
                </span>
                <span className="rounded-full bg-black/[0.06] px-2 py-1 text-[11px] font-bold text-black">{employee.userRole}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-black px-4 py-2 font-bold text-white transition hover:bg-black/80 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Meeting'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-black/20 px-4 py-2 font-bold text-black transition hover:bg-black/[0.04]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
