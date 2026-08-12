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
  const [editingUpdateId, setEditingUpdateId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [proofFile, setProofFile] = useState(null)
  const [proofPreviewUrl, setProofPreviewUrl] = useState('')
  const [proofUploading, setProofUploading] = useState(false)
  const [proofMessage, setProofMessage] = useState('')
  const [proofError, setProofError] = useState('')
  const proofInputRef = useRef(null)
  const [placeNames, setPlaceNames] = useState({})

  const isCreator = workspace?.ownerId === user?.id
  const isAssigned = workspace?.assignedEmployeeId === user?.id
  const isAdmin = ['ADMIN', 'MANAGEMENT', 'ASSISTANT'].includes(String(user?.userRole || '').toUpperCase())
  const canUpdate = isAssigned || isCreator || isAdmin

  async function load({ silent = false } = {}) {
    if (!id || !accessToken) return
    try {
      if (!silent) setLoading(true)
      const w = await apiFetch(`/api/workspaces/${id}`, accessToken)
      setWorkspace(w)
      setUpdates(Array.isArray(w.taskUpdates) ? w.taskUpdates : [])
      setFiles(Array.isArray(w.files) ? w.files : [])
    } catch (e) {
      setError(e.message || 'Failed to load task')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { load() }, [id, accessToken])

  useEffect(() => {
    return () => {
      if (proofPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(proofPreviewUrl)
      }
    }
  }, [proofPreviewUrl])

  useEffect(() => {
    updates.forEach((update) => {
      if (!update?.latitude || !update?.longitude) return
      const key = `${update.latitude},${update.longitude}`
      if (placeNames[key]) return
      if (!isGenericLocationLabel(update.locationLabel)) {
        setPlaceNames((current) => current[key] ? current : { ...current, [key]: update.locationLabel })
        return
      }
      resolvePlaceName(update.latitude, update.longitude).then((place) => {
        setPlaceNames((current) => current[key] ? current : { ...current, [key]: place })
      })
    })
  }, [updates, placeNames])

  useEffect(() => {
    if (!accessToken || !id) return
    const socket = io(SOCKET_BASE_URL, {
      auth: { token: accessToken }
    })
    socket.on('connect', () => socket.emit('join-workspace', id))
    socket.on('workspace:task:updated', (payload) => {
      if (payload?.id === id) {
        setWorkspace(payload)
        setUpdates(Array.isArray(payload.taskUpdates) ? payload.taskUpdates : [])
        setFiles(Array.isArray(payload.files) ? payload.files : [])
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

  const proofFiles = useMemo(() => files.filter((file) => isImage(file.type, file.url)), [files])

  async function submitUpdate(e) {
    e.preventDefault()
    if (!workUpdate.trim() && !remarks.trim() && !finalDone) return setError('Write remarks or mark the task completed')
    setBusy(true)
    setError('')
    try {
      const loc = await getLocation()
      const hasLocation = Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
      if (!hasLocation) {
        setError(loc.error || 'Location is required for every work update')
        setBusy(false)
        return
      }
      let update = null
      if (workUpdate.trim() || remarks.trim() || finalDone) {
        update = await apiFetch(editingUpdateId ? `/api/workspaces/${id}/task-updates/${editingUpdateId}` : `/api/workspaces/${id}/task-updates`, accessToken, {
          method: editingUpdateId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceType: workUpdate.trim() || (finalDone ? 'Task completed' : ''),
            remarks: remarks.trim(),
            status: finalDone ? 'COMPLETED' : 'IN_PROGRESS',
            ...(hasLocation ? loc : {})
          })
        })
      }
      setRemarks('')
      setWorkUpdate('')
      setFinalDone(false)
      setEditingUpdateId(null)
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

  async function deleteProof(file) {
    if (!confirm(`Delete proof image ${file.name}?`)) return
    setProofError('')
    try {
      await apiFetch(`/api/workspaces/${id}/files/${file.id}`, accessToken, { method: 'DELETE' })
      if (lightbox === fileUrl(file.url)) setLightbox(null)
      setProofMessage('Proof image deleted.')
      await load({ silent: true })
    } catch (e) {
      setProofError(e.message || 'Failed to delete proof image')
    }
  }

  function cancelEditUpdate() {
    setEditingUpdateId(null)
    setWorkUpdate('')
    setRemarks('')
    setFinalDone(false)
  }

  function handleProofChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setProofError('')
    setProofMessage('')
    if (!file.type.startsWith('image/')) {
      setProofError('Please choose an image file.')
      e.target.value = ''
      return
    }

    if (proofPreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(proofPreviewUrl)
    }

    const nextPreviewUrl = URL.createObjectURL(file)
    setProofPreviewUrl(nextPreviewUrl)
    setProofFile(file)
  }

  async function uploadProofImage(fileToUpload = proofFile) {
    if (!fileToUpload || !accessToken) return
    setProofUploading(true)
    setProofMessage('')
    setProofError('')
    try {
      const formData = new FormData()
      formData.append('file', fileToUpload)
      await apiFetch(`/api/workspaces/${id}/files`, accessToken, {
        method: 'POST',
        body: formData
      })
      setProofMessage('Image uploaded.')
      if (proofInputRef.current) proofInputRef.current.value = ''
      if (proofPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(proofPreviewUrl)
      }
      setProofPreviewUrl('')
      setProofFile(null)
      await load({ silent: true })
    } catch (e) {
      setProofError(e.message || 'Failed to upload proof image')
    } finally {
      setProofUploading(false)
    }
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
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Info label="POS Serial" value={workspace?.posSerial || 'N/A'} />
              <Info label="Zone" value={workspace?.zoneName || 'N/A'} />
              <Info label="Assigned service" value={workspace?.serviceType || 'N/A'} />
              <Info label="Created" value={niceDate(workspace?.createdAt)} />
              <Info label="Assigned employee" value={workspace?.assignedEmployee?.name || workspace?.assignedEmployee?.email || 'Unassigned'} />
              <Info label="Started" value={niceDate(workspace?.startedAt)} />
              <div className="col-span-2"><Info label="Merchant address" value={workspace?.merchantAddress || 'No address'} /></div>
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
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-black">
                  <input type="checkbox" checked={finalDone} onChange={(e) => setFinalDone(e.target.checked)} /> Mark task completed
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {editingUpdateId && <button type="button" onClick={cancelEditUpdate} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-black">Cancel edit</button>}
                  <button type="submit" disabled={busy} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? 'Submitting...' : editingUpdateId ? 'Save update' : 'Submit update'}</button>
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
                        {(u.employeeId === user?.id || isCreator || isAdmin) && (
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
                        <div className="mt-1 break-words text-[11px] font-semibold leading-4 text-black/55">{placeNames[`${u.latitude},${u.longitude}`] || (isGenericLocationLabel(u.locationLabel) ? 'Finding place name…' : u.locationLabel)}</div>
                        <a href={`https://www.google.com/maps?q=${u.latitude},${u.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-full bg-black px-3 py-2 text-xs font-black text-white">Open live location</a>
                      </div>
                    )}
                    {u.attachments?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-3">{u.attachments.map((f) => <Attachment key={f.id} file={f} onOpen={setLightbox} />)}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-black">Uploaded proof</h2>
                  <p className="text-sm text-black/60">Upload an image and keep the proof gallery attached to this task.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-black">{proofFiles.length}</span>
              </div>
              <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <input ref={proofInputRef} type="file" accept="image/*" onChange={handleProofChange} className="hidden" />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => proofInputRef.current?.click()} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-black">
                    Choose image
                  </button>
                  <div className="min-w-0 flex-1 text-sm font-bold text-black/60">
                    {proofUploading ? 'Uploading image...' : (proofFile ? proofFile.name : 'PNG, JPG, WEBP or GIF')}
                  </div>
                  <button type="button" onClick={uploadProofImage} disabled={!proofFile || proofUploading} className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                    {proofUploading ? 'Uploading...' : 'Upload image'}
                  </button>
                </div>
                {proofPreviewUrl && (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <img src={proofPreviewUrl} alt="Selected proof preview" className="h-40 w-full rounded-2xl object-cover" />
                    <div className="mt-2 text-xs font-black text-black/60">Selected image: {proofFile?.name || 'Preview'}</div>
                  </div>
                )}
                {proofError && <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{proofError}</div>}
                {proofMessage && <div className="mt-3 text-sm font-bold text-emerald-700">{proofMessage}</div>}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {proofFiles.map((f) => <Attachment key={f.id} file={f} onOpen={setLightbox} onDelete={canUpdate ? deleteProof : null} large />)}
              </div>
              {proofFiles.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-black/60">No image uploaded yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

function Info({ label, value }) {
  return <div className="h-full min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-3 sm:p-4"><div className="text-[10px] font-black uppercase tracking-wide text-black/50 sm:text-[11px] sm:tracking-wider">{label}</div><div className="mt-1 break-all text-xs font-black text-black sm:break-words sm:text-sm">{value}</div></div>
}

function Attachment({ file, onOpen, onDelete = null, large = false }) {
  const img = isImage(file.type, file.url)
  const content = img ? <img src={fileUrl(file.url)} alt={file.name} className={`${large ? 'h-44' : 'h-24'} w-full rounded-2xl object-cover`} /> : <div className={`${large ? 'h-44' : 'h-24'} grid place-items-center rounded-2xl bg-white text-3xl`}>📎</div>
  return <div className="rounded-3xl border border-slate-200 bg-slate-50 p-2 text-left hover:bg-white">
    <button type="button" onClick={() => img ? onOpen(fileUrl(file.url)) : window.open(fileUrl(file.url), '_blank')} className="w-full text-left">
      {content}
      <div className="mt-2 truncate px-1 text-xs font-black text-black">{file.name}</div>
      <div className="px-1 text-[11px] font-semibold text-black/50">{niceDate(file.createdAt || file.uploadedAt)}</div>
    </button>
    {onDelete && <button type="button" onClick={() => onDelete(file)} className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700">Delete proof</button>}
  </div>
}
