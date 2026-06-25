'use client'
import React from 'react'

export default function ActivityFeed({ activities }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <div className="text-slate-500 text-sm">
          <p className="font-medium mb-1">No activity yet</p>
          <p className="text-xs">Start by posting an update about goal progress</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const createdDate = new Date(activity.createdAt)
        const isRecent = Date.now() - createdDate.getTime() < 3600000 // Less than 1 hour
        
        return (
          <div
            key={activity.id}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">
                  {activity.user?.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">
                    {activity.user?.name || 'Unknown User'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {isRecent ? '🔥 Just now' : createdDate.toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700 leading-relaxed break-words">
                  {activity.message}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
