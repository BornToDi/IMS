'use client'
import React, { useState } from 'react'

export default function AddActivityForm({ onSubmit, isSubmitting = false }) {
  const [activityText, setActivityText] = useState('')
  const [focused, setFocused] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!activityText.trim()) return
    onSubmit(activityText)
    setActivityText('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className={`flex gap-2 items-stretch rounded-lg border transition-all ${
        focused 
          ? 'border-blue-500 ring-1 ring-blue-500' 
          : 'border-slate-200'
      }`}>
        <input
          type="text"
          value={activityText}
          onChange={(e) => setActivityText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Share an update... (completed a milestone, blocked, etc.)"
          className="flex-1 px-4 py-2 bg-white text-sm font-medium text-slate-900 placeholder-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!activityText.trim() || isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-r-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </form>
  )
}
