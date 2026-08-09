import React from 'react'
import { htmlToPlainText } from '../lib/plainText'

export default function AnnouncementsList({ announcements = [] }) {

  return (
    <div className="space-y-3">
      {announcements.map((a) => {
        const counts = (a.reactions || []).reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc }, {})
        return (
          <div key={a.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{a.title}</h3>
                <div className="muted">By {a.author?.name} • {new Date(a.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex items-center space-x-2">
                {/* reactions removed */}
              </div>
              </div>
            </div>

            <div className="mt-2 whitespace-pre-wrap">{htmlToPlainText(a.content)}</div>

            <div className="mt-2 flex items-center space-x-2">
              {(a.reactions || []).slice(0, 20).map((r) => (
                <span key={r.id} className="px-2 py-1 bg-gray-100 rounded">{r.emoji}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
