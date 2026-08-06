"use client"

import React, { useEffect, useState } from 'react'
import Layout from '../../components/Layout'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/useAuthStore'

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const setAuth = useAuthStore((state) => state.setAuth)

  const [name, setName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setName(user?.name || '')
  }, [user?.name])

  async function saveProfile(event) {
    event.preventDefault()
    if (newPassword || confirmPassword || currentPassword) {
      if (newPassword !== confirmPassword) {
        setError('New password and confirmation must match')
        return
      }
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        name
      }
      if (newPassword) {
        payload.currentPassword = currentPassword
        payload.newPassword = newPassword
      }
      const data = await apiFetch('/api/auth/profile', accessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      setAuth(data.user, accessToken)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice('Profile updated successfully.')
    } catch (saveError) {
      setError(saveError.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8 text-black">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/55">Personal settings</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">My profile</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-black/60">Keep your name current and change your password here. This screen works on desktop, tablet, and mobile.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-black/45">Account</div>
                <div className="mt-1 text-sm font-bold text-black">{user?.email || 'Unknown email'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-black/45">Role</div>
                <div className="mt-1 text-sm font-bold text-black">{user?.userRole || 'EMPLOYEE'}</div>
              </div>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</div>}

        <form onSubmit={saveProfile} className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-2xl font-black text-black">Profile details</h2>
              <p className="text-sm font-semibold text-black/55">Update the display name attached to your account.</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-black/45">Current name</div>
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-black" placeholder="Your name" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-black/45">Bank</div>
                <div className="mt-1 text-sm font-bold text-black">{user?.bankName || 'Not assigned'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-black/45">Name updated</div>
                <div className="mt-1 text-sm font-bold text-black">{user?.updatedAt ? new Date(user.updatedAt).toLocaleString() : 'Unknown'}</div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-2xl font-black text-black">Change password</h2>
              <p className="text-sm font-semibold text-black/55">Enter your current password and a new password to secure the account.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-black/45">Current password</label>
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black" placeholder="Current password" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-black/45">New password</label>
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black" placeholder="New password" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-black/45">Confirm new password</label>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black" placeholder="Confirm new password" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={saving || !name.trim()} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Save profile</button>
              <button type="button" onClick={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setError(''); setNotice('') }} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Clear password fields</button>
            </div>
          </section>
        </form>
      </div>
    </Layout>
  )
}