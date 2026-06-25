"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthForm from '../../components/AuthForm'
import { useAuthStore } from '../../store/useAuthStore'

export default function BankRegisterPage(){
  const router = useRouter()
  const register = useAuthStore((state)=>state.register)
  const [bankOptions, setBankOptions] = useState([])
  const [bankLoadError, setBankLoadError] = useState('')

  useEffect(() => {
    async function loadBanks() {
      try {
        const res = await fetch('/api/pos-serials/banks')
        if (!res.ok) throw new Error('Failed to load bank list')
        const data = await res.json()
        setBankOptions(Array.isArray(data?.banks) ? data.banks : [])
      } catch (e) {
        setBankLoadError(e.message || 'Failed to load bank list')
      }
    }
    loadBanks()
  }, [])

  async function handleRegister(name,email,password,userRole,bankName){
    await register(name,email,password,userRole,bankName)
    router.push('/tickets')
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl lg:grid-cols-[1fr_460px]">
          <section className="hidden bg-slate-950 p-10 text-white lg:block">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-white/50">Bank portal</p>
            <h1 className="mt-4 text-4xl font-black leading-tight">Create tickets and watch every update live.</h1>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/65">Bank users can submit POS issues, see admin assignment, engineer progress, hardware movement and completion timeline.</p>
          </section>
          <section className="p-6 sm:p-10">
            <div className="mb-6">
              <h2 className="text-2xl font-black">Bank registration</h2>
              <p className="mt-1 text-sm font-semibold text-black/55">For bank/client users only. Bank name comes from admin POS serial records.</p>
            </div>
            {bankLoadError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{bankLoadError}</div>}
            <AuthForm mode="register" onSubmit={handleRegister} fixedRole="BANK" bankOptions={bankOptions}/>
            <p className="mt-5 text-center text-sm font-semibold text-black/55">Already registered? <Link href="/login" className="font-black text-black underline">Sign in</Link></p>
          </section>
        </div>
      </div>
    </main>
  )
}
