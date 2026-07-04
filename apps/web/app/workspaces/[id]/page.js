"use client"
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Layout from '../../../components/Layout'
import { useAuthStore } from '../../../store/useAuthStore'
import { API_BASE_URL, SOCKET_BASE_URL, apiFetch } from '../../../lib/api'
import { getCurrentLocationWithPlace, isGenericLocationLabel, resolvePlaceName } from '../../../lib/location'

function fileUrl(url) {
  if (!url) return '#'
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url
  return `${API_BASE_URL}${url}`
}
function isImage(type, url = '') {
  return (type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url)
}
function niceDate(value) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
function statusClass(status) {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-800 border-blue-200'
  return 'bg-yellow-100 text-yellow-800 border-yellow-200'
}
async function getLocation() {
  try {
    return await getCurrentLocationWithPlace()
  } catch {
    return { error: 'Location permission is required to submit work update' }
  }
}

export default function WorkspaceDetailPage() {
  const { id } = useParams()
  const { user, accessToken } = useAuthStore()
  const [workspace, setWorkspace] = useState(null)
  const [updates, setUpdates] = useState([])
  const [files, setFiles] = useState([])
  const [workUpdate, setWorkUpdate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [finalDone, setFinalDone] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [editingUpdateId, setEditingUpdateId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [placeNames, setPlaceNames] = useState({})
  const fileRef = useRef(null)

  const isCreator = workspace?.ownerId === user?.id
  const isAssigned = workspace?.assignedEmployeeId === user?.id
  const canUpdate = isAssigned || isCreator

  async function load({ silent = false } = {}) {
    if (!id || !accessToken) return
    try {
      if (!silent) setLoading(true)
      const w = await apiFetch(`/api/workspaces/${id}`, accessToken)
      setWorkspace(w)
      setUpdates(Array.isArray(w.taskUpdates) ? w.taskUpdates : [])
      setFiles(Array.isArray(w.taskAttachments) ? w.taskAttachments : [])
    } catch (e) {
      setError(e.message || 'Failed to load task')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { load() }, [id, accessToken])

  useEffect(() => {
    updates.forEach((update) => {
      if (!update?.latitude || !update?.longitude) return
      const key = `${update.latitude},${update.longitude}`
      if (placeNames[key]) return
      resolvePlaceName(update.latitude, update.longitude).then((place) => {
        setPlaceNames((current) => current[key] ? current : { ...current, [key]: place })
      })
    })
  }, [updates, placeNames])

  useEffect(() => {
    if (!accessToken || !id) return
    const socket = io(SOCKET_BASE_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling']
    })
    socket.on('connect', () => socket.emit('join-workspace', id))
    socket.on('workspace:task:updated', (payload) => {
      if (payload?.id === id) {
        setWorkspace(payload)
        setUpdates(Array.isArray(payload.taskUpdates) ? payload.taskUpdates : [])
        setFiles(Array.isArray(payload.taskAttachments) ? payload.taskAttachments : [])
      } else {
        load({ silent: true })
      }
    })
    return () => socket.disconnect()
  }, [accessToken, id])

  const progress = useMemo(() => {
    if (workspace?.taskStatus === 'COMPLETED') return 100
    if (workspace?.taskStatus === 'IN_PROGRESS') return 55
    return 12
  }, [workspace?.taskStatus])

  async function submitUpdate(e) {
    e.preventDefault()
    if (!workUpdate.trim() && !remarks.trim() && selectedFiles.length === 0) return setError('Write remarks or upload at least one image/file')
    setBusy(true)
    setError('')
    try {
      const loc = await getLocation()
      if (!loc.latitude || !loc.longitude) {
        setError(loc.error || 'Location is required for every work update')
        setBusy(false)
        return
      }
      let update = null
      if (workUpdate.trim() || remarks.trim() || selectedFiles.length) {
        update = await apiFetch(editingUpdateId ? `/api/workspaces/${id}/task-updates/${editingUpdateId}` : `/api/workspaces/${id}/task-updates`, accessToken, {
          method: editingUpdateId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceType: workUpdate.trim() || (selectedFiles.length ? 'Proof file uploaded' : ''),
            remarks: remarks.trim(),
            status: finalDone ? 'COMPLETED' : 'IN_PROGRESS',
            ...loc
          })
        })
      }
      if (selectedFiles.length) {
        const fd = new FormData()
        selectedFiles.forEach((file) => fd.append('files', file))
        if (update?.id) fd.append('updateId', update.id)
        await apiFetch(`/api/workspaces/${id}/task-attachments`, accessToken, { method: 'POST', body: fd })
      }
      setRemarks('')
      setWorkUpdate('')
      setSelectedFiles([])
      setFinalDone(false)
      setEditingUpdateId(null)
      if (fileRef.current) fileRef.current.value = ''
      await load({ silent: true })
    } catch (e) {
      setError(e.message || 'Failed to submit update')
    } finally {
      setBusy(false)
    }
  }


  function startEditUpdate(update) {
    setEditingUpdateId(update.id)
    setWorkUpdate(update.serviceType || '')
    setRemarks(update.remarks || '')
    setFinalDone(update.status === 'COMPLETED')
    setSelectedFiles([])
    if (fileRef.current) fileRef.current.value = ''
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteUpdate(update) {
    if (!confirm('Delete this work update?')) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/workspaces/${id}/task-updates/${update.id}`, accessToken, { method: 'DELETE' })
      await load({ silent: true })
    } catch (e) {
      setError(e.message || 'Failed to delete work update')
    } finally {
      setBusy(false)
    }
  }

  function cancelEditUpdate() {
    setEditingUpdateId(null)
    setWorkUpdate('')
    setRemarks('')
    setFinalDone(false)
    setSelectedFiles([])
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) return <Layout><div className="rounded-3xl border border-slate-200 bg-white p-6 text-black">Loading field task...</div></Layout>
  if (error && !workspace) return <Layout><div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div></Layout>

  return (
    <Layout>
      {lightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-black text-black">Close</button>
          <img src={lightbox} alt="Preview" className="max-h-[94vh] max-w-[98vw] rounded-2xl object-contain" />
        </div>
      )}

      <div className="mx-auto max-w-[1700px] space-y-5 text-black">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/workspaces" className="text-sm font-black text-black underline">← Back to field tasks</Link>
          
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr] lg:p-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(workspace?.taskStatus)}`}>{workspace?.taskStatus?.replace('_', ' ') || 'PENDING'}</span>
                {isCreator && <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-black">Created by you</span>}
                {isAssigned && <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">Assigned to you</span>}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-black sm:text-4xl">TID {workspace?.tidNumber || workspace?.name}</h1>
              <p className="mt-2 text-sm leading-6 text-black/70">{workspace?.description || ''}</p>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-black" style={{ width: `${progress}%` }} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="POS Serial" value={workspace?.posSerial || 'N/A'} />
              <Info label="Zone" value={workspace?.zoneName || 'N/A'} />
              <Info label="Assigned service" value={workspace?.serviceType || 'N/A'} />
              <Info label="Created" value={niceDate(workspace?.createdAt)} />
              <Info label="Assigned employee" value={workspace?.assignedEmployee?.name || workspace?.assignedEmployee?.email || 'Unassigned'} />
              <Info label="Started" value={niceDate(workspace?.startedAt)} />
              <div className="sm:col-span-2"><Info label="Merchant address" value={workspace?.merchantAddress || 'No address'} /></div>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

        <div className="grid gap-5 xl:grid-cols-[440px_1fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24 xl:h-fit">
            <h2 className="text-2xl font-black text-black">{editingUpdateId ? 'Edit work update' : 'Employee work update'}</h2>
            <p className="mt-1 text-sm text-black/60">Submit work notes, location, time and proof files.</p>

            {canUpdate ? (
              <form onSubmit={submitUpdate} className="mt-4 space-y-3">
                <input
                  value={workUpdate}
                  onChange={(e) => setWorkUpdate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black outline-none focus:border-black"
                  placeholder="Work update, example: Deployment done / SIM active / Merchant signed"
                />
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-black outline-none focus:border-black" placeholder="Additional remarks, issues, or merchant feedback" />
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))} className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-black" />
                {selectedFiles.length > 0 && <div className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-black">{selectedFiles.length} file(s) selected</div>}
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black">
                  <input type="checkbox" checked={finalDone} onChange={(e) => setFinalDone(e.target.checked)} /> Mark task completed
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {editingUpdateId && <button type="button" onClick={cancelEditUpdate} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Cancel edit</button>}
                  <button disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? 'Submitting...' : editingUpdateId ? 'Save update' : 'Submit update'}</button>
                </div>
              </form>
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-black/60">Only the assigned employee or creator can update this task.</div>
            )}
          </section>

          <section className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-2xl font-black text-black">Real-time work timeline</h2><p className="text-sm text-black/60">Status, remarks and time history.</p></div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-black">{updates.length} update(s)</span>
              </div>
              <div className="mt-5 space-y-3">
                {updates.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-black/60">No work update submitted yet.</div>}
                {updates.map((u) => (
                  <div key={u.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-black text-black">{u.employee?.name || u.employee?.email || 'Employee'}</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/75">{u.serviceType || u.remarks || 'Work update submitted'}</div>
                        {u.remarks && u.serviceType && <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/70">{u.remarks}</div>}
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <div className="text-xs font-black text-black/50">{niceDate(u.createdAt)}</div>
                        {(u.employeeId === user?.id || isCreator) && (
                          <div className="flex gap-2">
                            <button type="button" title="Edit update" onClick={() => startEditUpdate(u)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-black">✎ Edit</button>
                            <button type="button" title="Delete update" onClick={() => deleteUpdate(u)} className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-black text-red-700">🗑 Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {(u.latitude && u.longitude) && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="text-xs font-black text-black">📍 Update location</div>
                        <div className="mt-1 text-[11px] font-semibold text-black/55">{placeNames[`${u.latitude},${u.longitude}`] || (isGenericLocationLabel(u.locationLabel) ? 'Finding place name…' : u.locationLabel)}</div>
                        <a href={`https://www.google.com/maps?q=${u.latitude},${u.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-full bg-black px-3 py-2 text-xs font-black text-white">Open live location</a>
                      </div>
                    )}
                    {u.attachments?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-3">{u.attachments.map((f) => <Attachment key={f.id} file={f} onOpen={setLightbox} />)}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-black text-black">Uploaded proof</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-black">{files.length}</span></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {files.map((f) => <Attachment key={f.id} file={f} onOpen={setLightbox} large />)}
              </div>
              {files.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-black/60">No image uploaded yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

function Info({ label, value }) {
  return <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4"><div className="text-[11px] font-black uppercase tracking-wider text-black/50">{label}</div><div className="mt-1 break-words text-sm font-black text-black">{value}</div></div>
}

function Attachment({ file, onOpen, large = false }) {
  const img = isImage(file.type, file.url)
  const content = img ? <img src={fileUrl(file.url)} alt={file.name} className={`${large ? 'h-44' : 'h-24'} w-full rounded-2xl object-cover`} /> : <div className={`${large ? 'h-44' : 'h-24'} grid place-items-center rounded-2xl bg-white text-3xl`}>📎</div>
  return <button type="button" onClick={() => img ? onOpen(fileUrl(file.url)) : window.open(fileUrl(file.url), '_blank')} className="rounded-3xl border border-slate-200 bg-slate-50 p-2 text-left hover:bg-white">
    {content}
    <div className="mt-2 truncate px-1 text-xs font-black text-black">{file.name}</div>
    <div className="px-1 text-[11px] font-semibold text-black/50">{niceDate(file.createdAt)}</div>
  </button>
}
