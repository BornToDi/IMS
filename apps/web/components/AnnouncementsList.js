import React from 'react'

export default function AnnouncementsList({ announcements = [], onReact }) {
  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <div key={a.id} className="card">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">{a.title}</h3>
              <div className="muted">By {a.author?.name} • {new Date(a.createdAt).toLocaleString()}</div>
            </div>
            <div>
              <button className="btn" onClick={() => onReact && onReact(a.id, '👍')}>👍</button>
            </div>
          </div>

          <div className="mt-2" dangerouslySetInnerHTML={{ __html: a.content }} />

          <div className="mt-2 flex items-center space-x-2">
            {a.reactions?.map((r) => (
              <span key={r.id} className="px-2 py-1 bg-gray-100 rounded">{r.emoji}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
