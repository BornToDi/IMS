"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Layout from '../../../components/Layout'
import { useAuthStore } from '../../../store/useAuthStore'
import { apiFetch } from '../../../lib/api'

function dt(v){ return v ? new Date(v).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : '' }
function statusClass(s){ if(s==='COMPLETED') return 'bg-emerald-50 text-emerald-800 border-emerald-200'; if(s==='IN_PROGRESS') return 'bg-blue-50 text-blue-800 border-blue-200'; if(s==='ASSIGNED') return 'bg-indigo-50 text-indigo-800 border-indigo-200'; return 'bg-amber-50 text-amber-800 border-amber-200' }

export default function TicketDetail(){
  const { id } = useParams()
  const token = useAuthStore(s=>s.accessToken)
  const user = useAuthStore(s=>s.user)
  const isAdmin = ['ADMIN','MANAGEMENT','ASSISTANT'].includes(String(user?.userRole||'').toUpperCase())
  const [ticket,setTicket]=useState(null)
  const [employees,setEmployees]=useState([])
  const [assign,setAssign]=useState({employeeId:'', serviceType:'', note:'', isImportant:false})
  const [message,setMessage]=useState('')
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function load(){ if(!token) return; try{ const data=await apiFetch(`/api/tickets/${id}`,token); setTicket(data); if(isAdmin){ const emp=await apiFetch('/api/workspaces/employees',token); setEmployees(emp.filter(u=>String(u.userRole).toUpperCase()!=='BANK')); } setError('') }catch(e){ setError(e.message) } }
  useEffect(()=>{ load(); const t=setInterval(load,30000); return()=>clearInterval(t) },[token,id,isAdmin])
  async function submitAssign(e){ e.preventDefault(); setBusy(true); setError(''); setNotice(''); try{ await apiFetch(`/api/tickets/${id}/assign`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(assign)}); setAssign({employeeId:'', serviceType:'', note:'', isImportant:false}); setNotice('Assigned successfully. Employee and bank user have been notified.'); await load() }catch(e){ setError(e.message) }finally{ setBusy(false) } }
  async function addComment(e){ e.preventDefault(); if(!message.trim()) return; setBusy(true); try{ await apiFetch(`/api/tickets/${id}/updates`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})}); setMessage(''); await load() }catch(e){ setError(e.message) }finally{ setBusy(false) } }
  if(!ticket) return <Layout><div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-black">{error||'Loading ticket...'}</div></Layout>
  return <Layout><div className="mx-auto max-w-[1500px] space-y-4 text-black">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><Link href="/tickets" className="text-xs font-black uppercase tracking-wider text-black/45">← Tickets</Link><h1 className="mt-1 text-3xl font-black">{ticket.ticketNo}</h1><p className="text-sm font-semibold text-black/60">{ticket.title}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${statusClass(ticket.status)}`}>{ticket.status}</span>{ticket.workspace&&<Link className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white" href={`/workspaces/${ticket.workspace.id}`}>Open field task</Link>}</div></div></section>
    {notice&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{notice}</div>}
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]"><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-black">Ticket details</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[['Bank',ticket.bankName||ticket.bankUser?.bankName||ticket.bankUser?.name||ticket.bankUser?.email],['Raised by',ticket.bankUser?.name||ticket.bankUser?.email],['TID',ticket.tidNumber],['POS serial',ticket.posSerial],['Zone',ticket.zoneName],['Service type',ticket.serviceType],['Priority',ticket.priority],['Merchant address',ticket.merchantAddress],['Created',dt(ticket.createdAt)],['Engineer',ticket.workspace?.assignedEmployee?.name||'Unassigned']].map(([k,v])=><div key={k} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"><div className="text-[10px] font-black uppercase text-black/40">{k}</div><div className="mt-1 text-sm font-black">{v||'—'}</div></div>)}</div>{ticket.description&&<p className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-semibold text-black/70">{ticket.description}</p>}</section>
    <aside className="space-y-4">{isAdmin&&<form onSubmit={submitAssign} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-black">Assign engineer</h2><div className="space-y-3"><select value={assign.employeeId} onChange={e=>setAssign({...assign,employeeId:e.target.value})} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"><option value="">Select employee</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.name||emp.email}</option>)}</select><input value={assign.serviceType} onChange={e=>setAssign({...assign,serviceType:e.target.value})} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="Service type / assigned work"/><textarea value={assign.note} onChange={e=>setAssign({...assign,note:e.target.value})} className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="Instruction note"/><label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={assign.isImportant} onChange={e=>setAssign({...assign,isImportant:e.target.checked})}/> High important</label><button disabled={busy} className="w-full rounded-2xl bg-black px-5 py-3 text-sm font-black text-white">Assign</button></div></form>}
    <form onSubmit={addComment} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-black">Comment</h2><textarea value={message} onChange={e=>setMessage(e.target.value)} className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="Write update for this ticket"/><button disabled={busy} className="mt-3 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">Post update</button></form></aside></div>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-black">Live timeline</h2><div className="space-y-3">{ticket.updates?.map(u=><div key={u.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm sm:max-w-[760px]"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-black">{u.user?.name||u.user?.email}</div><div className="text-xs font-bold text-black/45">{dt(u.createdAt)}</div></div><div className="mt-1 text-xs font-black uppercase text-black/45">{u.type}</div><p className="mt-2 whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm font-semibold leading-6 text-black/75">{u.message}</p></div>)}</div></section>
  </div></Layout>
}
