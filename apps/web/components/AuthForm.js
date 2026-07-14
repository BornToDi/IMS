import React, { useMemo, useState } from 'react'

function FieldIcon({ type }) {
  const path = type === 'user'
    ? 'M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z M4.5 20.25c0-3.037 3.582-5.25 7.5-5.25s7.5 2.213 7.5 5.25'
    : type === 'mail'
      ? 'M21.75 8.25v7.5a2.25 2.25 0 01-2.25 2.25H4.5A2.25 2.25 0 012.25 15.75v-7.5 M3 7.125l8.25 5.25a2.25 2.25 0 002.25 0L21 7.125'
      : 'M16.5 10.5V7.5a4.5 4.5 0 00-9 0v3m-.75 0h10.5A1.5 1.5 0 0118.75 12v6.75a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V12a1.5 1.5 0 011.5-1.5z'
  return (
    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      {path.split(' M').map((d, idx) => <path key={idx} strokeLinecap="round" strokeLinejoin="round" d={idx ? 'M' + d : d} />)}
    </svg>
  )
}

export default function AuthForm({ mode = 'login', onSubmit, fixedRole = null, defaultRole = 'EMPLOYEE', bankOptions = [] }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bankName, setBankName] = useState('')
  const [userRole, setUserRole] = useState(fixedRole || defaultRole)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const banks = useMemo(() => Array.from(new Set((bankOptions || []).map((b) => String(b || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [bankOptions])
  const registeringBank = mode === 'register' && (fixedRole === 'BANK' || userRole === 'BANK')

  function validate() {
    const errors = {}
    if (mode === 'register' && !name.trim()) errors.name = 'Name is required'
    if (!email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email'
    if (!password) errors.password = 'Password is required'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'
    if (registeringBank && !bankName.trim()) errors.bankName = 'Select bank name'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setLoading(true)
    try {
      if (mode === 'login') await onSubmit(email, password)
      else await onSubmit(name, email, password, fixedRole || userRole, bankName)
    } catch (err) {
      setError(err.message || 'Unable to continue')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-semibold text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-4 focus:ring-slate-100'
  const selectClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-black outline-none transition focus:border-black focus:ring-4 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400'
  const labelClass = 'mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-slate-600'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'register' && (
        <>
          <div>
            <label className={labelClass} htmlFor="name">Name</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><FieldIcon type="user" /></span>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Full name" autoComplete="name" />
            </div>
            {fieldErrors.name && <p className="mt-1 text-xs font-bold text-red-600">{fieldErrors.name}</p>}
          </div>
          {!fixedRole && (
            <div>
              <label className={labelClass} htmlFor="userRole">Role</label>
              <select id="userRole" value={userRole} onChange={(e) => { setUserRole(e.target.value); if (e.target.value !== 'BANK') setBankName('') }} className={selectClass}>
                <option value="BANK">Bank user</option>
                <option value="ADMIN">Admin / Sir</option>
                <option value="ASSISTANT">Assistant (Admin without POS access)</option>
                <option value="EMPLOYEE">Employee / Engineer</option>
              </select>
            </div>
          )}
          {fixedRole && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-black">Registering as: {fixedRole === 'BANK' ? 'Bank user' : fixedRole}</div>
          )}

          {registeringBank && (
            <div>
              <label className={labelClass} htmlFor="bankName">Bank name</label>
              <select id="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} className={selectClass} required disabled={!banks.length}>
                <option value="">{banks.length ? 'Select bank' : 'No bank found. Admin must add/import POS serials first.'}</option>
                {banks.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {fieldErrors.bankName && <p className="mt-1 text-xs font-bold text-red-600">{fieldErrors.bankName}</p>}
              {!banks.length && <p className="mt-1 text-xs font-bold text-amber-700">Bank list comes from Admin POS Serial Management. Because apparently data needs a birthplace.</p>}
            </div>
          )}
        </>
      )}

      <div>
        <label className={labelClass} htmlFor="email">Email</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><FieldIcon type="mail" /></span>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@company.com" autoComplete="email" />
        </div>
        {fieldErrors.email && <p className="mt-1 text-xs font-bold text-red-600">{fieldErrors.email}</p>}
      </div>

      <div>
        <label className={labelClass} htmlFor="password">Password</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><FieldIcon type="lock" /></span>
          <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 pr-16 text-sm font-semibold text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-4 focus:ring-slate-100" placeholder="Minimum 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-600 hover:text-black">{showPassword ? 'Hide' : 'Show'}</button>
        </div>
        {fieldErrors.password && <p className="mt-1 text-xs font-bold text-red-600">{fieldErrors.password}</p>}
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <button disabled={loading} className="w-full rounded-2xl bg-black px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  )
}
