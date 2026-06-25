import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen hero-glow">
      <div className="container flex min-h-screen items-center py-10">
        <div className="shell-panel grid gap-10 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-8 lg:p-12">
            <div className="section-title">NetField operations suite</div>
            <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              One place for bank tickets, field tasks, hardware flow, and team discussion.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Built to keep service work moving: register tickets, assign field tasks, track POS hardware, share files, and keep every team member in sync.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className="btn px-5 py-3">
                Open Dashboard
              </Link>
              <Link href="/workspaces" className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Browse Workspaces
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                'Workspace-first structure',
                'Goal detail pages with progress',
                'Notifications and file previews'
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-4 text-sm text-slate-600 shadow-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200/70 bg-white/60 p-8 lg:border-l lg:border-t-0 lg:p-12">
            <div className="section-title">What lives inside</div>
            <div className="mt-4 space-y-4">
              {[
                ['Goals', 'Create roadmap items, track milestones, and update status as work moves.'],
                ['Action Items', 'Assign work, set due dates, and keep execution visible.'],
                ['Announcements', 'Share updates, reactions, comments, and pinned notices.'],
                ['Files', 'Preview documents and images directly inside each workspace.']
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">{title}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-600">{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
