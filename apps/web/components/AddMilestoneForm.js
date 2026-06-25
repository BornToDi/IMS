'use client'
import React, { useState } from 'react'

export default function AddMilestoneForm({ onSubmit, isSubmitting = false }) {
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [focused, setFocused] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!milestoneTitle.trim()) return
    onSubmit(milestoneTitle)
    setMilestoneTitle('')
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <div className={`flex gap-2 items-stretch rounded-lg border transition-all ${
        focused 
          ? 'border-blue-500 ring-1 ring-blue-500' 
          : 'border-slate-200'
      }`}>
        <input
          type="text"
          value={milestoneTitle}
          onChange={(e) => setMilestoneTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a new milestone (e.g., Complete backend setup)"
          className="flex-1 px-4 py-2 bg-white text-sm font-medium text-slate-900 placeholder-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!milestoneTitle.trim() || isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-r-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Milestones help break down your goal into manageable steps</p>
    </form>
  )
}
