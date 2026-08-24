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
    <div className="space-y-3">
      <div className="space-y-2">
        {comments.map(c => (
          <div key={c.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs font-semibold text-slate-700">{c.user?.name || 'Unknown'}</div>
            <div className="mt-0.5 break-words text-sm text-slate-600">{c.content}</div>
            <div className="mt-1 text-[11px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
        <button className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60" disabled={loading}>{loading ? 'Posting...' : 'Post'}</button>
      </form>
    </div>
  )
}
