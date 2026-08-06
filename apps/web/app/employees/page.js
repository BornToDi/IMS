"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../store/useAuthStore'

function roleTone(role) {
  const value = String(role || '').toUpperCase()
  if (value === 'ADMIN') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (value === 'MANAGEMENT') return 'bg-sky-50 text-sky-700 border-sky-200'
  if (value === 'BANK') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (value === 'ASSISTANT') return 'bg-violet-50 text-violet-700 border-violet-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function employeeScopeLabel(employee, currentId) {
  return employee?.id === currentId ? 'You' : 'Employee'
}

export default function EmployeesPage() {
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const isAdmin = ['ADMIN', 'MANAGEMENT'].includes(String(user?.userRole || '').toUpperCase())

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadEmployees({ silent = false } = {}) {
    if (!accessToken || !isAdmin) return
    try {
      if (!silent) setLoading(true)
      const data = await apiFetch('/api/auth/admin/users', accessToken)
      const list = Array.isArray(data) ? data : []
      setEmployees(list)
      setError('')
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
        setNameDraft(list[0].name || '')
        setPasswordDraft('')
      }
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load employees')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAdmin])

  const filteredEmployees = useMemo(() => {
    const term = query.trim().toLowerCase()
    return employees.filter((employee) => {
      const role = String(employee.userRole || '').toUpperCase()
      const matchesRole = roleFilter === 'ALL' || role === roleFilter
      const matchesText = !term || [employee.name, employee.email, employee.userRole, employee.bankName].join(' ').toLowerCase().includes(term)
      return matchesRole && matchesText
    })
  }, [employees, query, roleFilter])

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedId('')
      return
    }
    if (!filteredEmployees.some((employee) => employee.id === selectedId)) {
      setSelectedId(filteredEmployees[0].id)
    }
  }, [filteredEmployees, selectedId])

  const selectedEmployee = useMemo(() => {
    return employees.find((employee) => employee.id === selectedId) || filteredEmployees[0] || null
  }, [employees, filteredEmployees, selectedId])

  useEffect(() => {
    if (!selectedEmployee) return
    setNameDraft(selectedEmployee.name || '')
    setPasswordDraft('')
  }, [selectedEmployee?.id])

  const stats = useMemo(() => {
    const counts = employees.reduce((accumulator, employee) => {
      const role = String(employee.userRole || 'EMPLOYEE').toUpperCase()
      accumulator.total += 1
      accumulator[role] = (accumulator[role] || 0) + 1
      return accumulator
    }, { total: 0, ADMIN: 0, MANAGEMENT: 0, ASSISTANT: 0, EMPLOYEE: 0, BANK: 0 })
    return counts
  }, [employees])

  function selectEmployee(employee) {
    setSelectedId(employee.id)
    setNameDraft(employee.name || '')
    setPasswordDraft('')
    setNotice('')
    setError('')
  }

  async function saveName() {
    if (!selectedEmployee) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`/api/auth/admin/users/${selectedEmployee.id}`, accessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameDraft })
      })
      setNotice('Employee name updated.')
      await loadEmployees({ silent: true })
    } catch (updateError) {
      setError(updateError.message || 'Failed to update employee')
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword() {
    if (!selectedEmployee) return
    if (passwordDraft.trim().length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`/api/auth/admin/users/${selectedEmployee.id}/password`, accessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordDraft })
      })
      setPasswordDraft('')
      setNotice('Password reset successfully.')
    } catch (resetError) {
      setError(resetError.message || 'Failed to reset password')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEmployee() {
    if (!selectedEmployee) return
    const confirmed = window.confirm(`Delete ${selectedEmployee.name || selectedEmployee.email}? This removes the account and reassigns linked records.`)
    if (!confirmed) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`/api/auth/admin/users/${selectedEmployee.id}`, accessToken, {
        method: 'DELETE'
      })
      setNotice('Employee deleted.')
      setSelectedId('')
      await loadEmployees({ silent: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete employee')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-black/55">Restricted area</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-black">Employee management</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold text-black/60">Only admins and management can view the employee directory, edit names, reset passwords, or delete accounts.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/profile" className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white">Open my profile</Link>
              <Link href="/dashboard" className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Go to dashboard</Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto max-w-[1680px] space-y-5 text-black">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black/55">Admin employee control</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">Employee directory</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-black/60">Edit names, reset passwords, and delete employees from one responsive management screen.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => loadEmployees()} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Refresh</button>
              <Link href="/profile" className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-black text-white">My profile</Link>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total', stats.total],
            ['Admin', stats.ADMIN],
            ['Management', stats.MANAGEMENT],
            ['Employee', stats.EMPLOYEE],
            ['Bank', stats.BANK]
          ].map(([label, count]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-3xl font-black leading-none text-black">{loading ? '…' : count}</div>
              <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-black/55">{label}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-black text-black">Employees</h2>
                <p className="text-sm font-semibold text-black/55">{filteredEmployees.length} visible {filteredEmployees.length === 1 ? 'person' : 'people'}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:w-[440px]">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, role, bank" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black" />
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black">
                  <option value="ALL">All roles</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGEMENT">Management</option>
                  <option value="ASSISTANT">Assistant</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="BANK">Bank</option>
                </select>
              </div>
            </div>

            <div className="md:hidden space-y-3">
              {filteredEmployees.map((employee) => {
                const active = employee.id === selectedId
                return (
                  <button key={employee.id} type="button" onClick={() => selectEmployee(employee)} className={`w-full rounded-3xl border p-4 text-left transition ${active ? 'border-black bg-slate-950 text-white shadow-lg' : 'border-slate-200 bg-slate-50 text-black hover:bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-black">{employee.name || 'Unnamed employee'}</div>
                        <div className={`mt-1 truncate text-sm font-semibold ${active ? 'text-slate-300' : 'text-black/55'}`}>{employee.email}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${active ? 'border-white/20 bg-white/10 text-white' : roleTone(employee.userRole)}`}>{employee.userRole || 'EMPLOYEE'}</span>
                    </div>
                    <div className={`mt-3 text-xs font-bold ${active ? 'text-slate-300' : 'text-black/55'}`}>{employee.bankName || employeeScopeLabel(employee, user?.id)}</div>
                  </button>
                )
              })}
              {!loading && filteredEmployees.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-black/50">No employees found.</div>}
            </div>

            <div className="hidden overflow-hidden rounded-[24px] border border-slate-200 md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-black/55">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Bank</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map((employee) => {
                    const active = employee.id === selectedId
                    return (
                      <tr key={employee.id} onClick={() => selectEmployee(employee)} className={`cursor-pointer transition hover:bg-slate-50 ${active ? 'bg-slate-950 text-white hover:bg-slate-950' : 'bg-white'}`}>
                        <td className="px-4 py-4">
                          <div className="font-black">{employee.name || 'Unnamed employee'}</div>
                          <div className={`text-xs font-semibold ${active ? 'text-slate-300' : 'text-black/55'}`}>{employee.email}</div>
                        </td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${active ? 'border-white/20 bg-white/10 text-white' : roleTone(employee.userRole)}`}>{employee.userRole || 'EMPLOYEE'}</span></td>
                        <td className="px-4 py-4 text-sm font-semibold">{employee.bankName || '—'}</td>
                        <td className="px-4 py-4 text-sm font-semibold">{employee.updatedAt ? new Date(employee.updatedAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!loading && filteredEmployees.length === 0 && <div className="p-8 text-center text-sm font-bold text-black/50">No employees found.</div>}
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div>
              <h2 className="text-2xl font-black text-black">Manage employee</h2>
              <p className="text-sm font-semibold text-black/55">Choose someone from the list to edit their name or reset their password.</p>
            </div>

            {selectedEmployee ? (
              <>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-black/55">Selected account</div>
                      <div className="mt-1 text-2xl font-black text-black">{selectedEmployee.name || 'Unnamed employee'}</div>
                      <div className="mt-1 text-sm font-semibold text-black/60">{selectedEmployee.email}</div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${roleTone(selectedEmployee.userRole)}`}>{selectedEmployee.userRole || 'EMPLOYEE'}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-black/45">Bank</div>
                      <div className="mt-1 text-sm font-bold text-black">{selectedEmployee.bankName || 'Not assigned'}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-black/45">Updated</div>
                      <div className="mt-1 text-sm font-bold text-black">{selectedEmployee.updatedAt ? new Date(selectedEmployee.updatedAt).toLocaleString() : '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-[24px] border border-slate-200 p-4">
                  <div>
                    <h3 className="text-lg font-black text-black">Edit name</h3>
                    <p className="text-sm font-semibold text-black/55">Change the display name for this employee account.</p>
                  </div>
                  <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black" placeholder="Employee name" />
                  <button type="button" onClick={saveName} disabled={saving || !nameDraft.trim()} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Save name</button>
                </div>

                <div className="space-y-4 rounded-[24px] border border-slate-200 p-4">
                  <div>
                    <h3 className="text-lg font-black text-black">Reset password</h3>
                    <p className="text-sm font-semibold text-black/55">Generate a new password for the account. The employee can change it later in profile.</p>
                  </div>
                  <input type="password" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-black" placeholder="New password" />
                  <button type="button" onClick={resetPassword} disabled={saving || passwordDraft.trim().length < 8} className="rounded-2xl border border-black px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50">Reset password</button>
                </div>

                <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4">
                  <div>
                    <h3 className="text-lg font-black text-rose-800">Delete employee</h3>
                    <p className="text-sm font-semibold text-rose-700/80">This removes the account and transfers linked records to the acting admin where required.</p>
                  </div>
                  <button type="button" onClick={deleteEmployee} disabled={saving || selectedEmployee.id === user?.id} className="mt-4 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Delete account</button>
                </div>
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-black/50">Select an employee to manage.</div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  )
}