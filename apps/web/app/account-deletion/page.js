import Link from 'next/link'

export const metadata = { title: 'Request account deletion | TrackField' }

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-500">TrackField</p>
        <h1 className="text-3xl font-bold">Request account deletion</h1>
        <p>To request deletion of your TrackField account and associated data, email our support team from the email address associated with your account. Include the account email and your request. Do not send your password.</p>
        <p><a className="font-bold text-blue-700 underline" href="mailto:sw-zihadul@networld-bd.com?subject=TrackField%20account%20deletion%20request">sw-zihadul@networld-bd.com</a></p>
        <p>Support may need to verify your identity and review records associated with your account before completing the request. Contact support if you cannot access your account email.</p>
        <Link className="inline-block font-semibold text-blue-700 underline" href="/login">Back to sign in</Link>
      </div>
    </main>
  )
}
