"use client"
import React, { useState } from 'react'

export default function CommentsList({ comments = [], onAdd }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!text) return
    setLoading(true)
    try {
      await onAdd(text)
      setText('')
    } catch (e) {}
    setLoading(false)
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {comments.map(c => (
          <div key={c.id} className="p-2 border rounded">
            <div className="text-sm font-medium">{c.user?.name || 'Unknown'}</div>
            <div className="text-sm">{c.content}</div>
            <div className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-start space-x-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment..." className="flex-1 border p-2" />
        <button className="bg-blue-600 text-white px-3 py-1 rounded" disabled={loading}>{loading ? 'Posting...' : 'Post'}</button>
      </form>
    </div>
  )
}
