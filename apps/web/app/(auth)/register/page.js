"use client"
import React from 'react'
import Link from 'next/link'
import AuthForm from '../../../components/AuthForm'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/useAuthStore'

export default function RegisterPage() {
  const router = useRouter()
  const register = useAuthStore((s) => s.register)

  async function handleRegister(name, email, password, userRole) {
    await register(name, email, password, userRole)
    router.push('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-black">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-lg font-black text-white">FC</div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Field Control</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-black">Create account</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Join the field task workspace.</p>
        </div>
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <AuthForm mode="register" onSubmit={handleRegister} />
          <p className="mt-5 text-center text-sm font-semibold text-slate-600">
            Already registered? <Link href="/login" className="font-black text-black underline underline-offset-4">Sign in</Link> · <Link href="/bank-register" className="font-black text-black underline underline-offset-4">Bank registration</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
