'use client'

export default function ChatError({ reset }) {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#071014] p-6 text-slate-200">
    <p role="alert">Chat could not be displayed. Please retry.</p>
    <button type="button" onClick={reset} className="rounded-xl bg-emerald-400 px-5 py-2 font-semibold text-emerald-950">Retry chat</button>
    <a href="/chat" className="text-sm text-emerald-300 underline">Reload chat</a>
  </main>
}
