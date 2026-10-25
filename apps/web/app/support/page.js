'use client'

import { Suspense } from 'react'
import Layout from '../../components/Layout'
import SupportInbox from '../../components/SupportInbox'

export default function SupportPage() {
  return <Layout><Suspense fallback={<p role="status" className="p-6">Opening your inbox…</p>}><SupportInbox /></Suspense></Layout>
}
