'use client'
import Layout from '../../components/Layout'
import { Suspense } from 'react'
import BankTeam from '../../components/BankTeam'
export default function BankTeamPage() { return <Layout><Suspense fallback={<p role="status" className="p-6">Opening bank workspace…</p>}><BankTeam /></Suspense></Layout> }
