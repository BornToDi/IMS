'use client'

import { memo, useEffect, useState } from 'react'
import { apiResponse } from '../lib/api'
import s from './SupportInbox.module.css'

export const fileSize = size => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`

export default memo(function PrivateAttachment({ message, token, onImageLoad }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(message.attachmentType)
  const endpoint = `/api/direct-messages/attachments/${encodeURIComponent(message.id)}`
  useEffect(() => {
    if (!image) return
    const controller = new AbortController()
    let objectUrl
    setUrl(''); setError('')
    apiResponse(endpoint, token, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Image unavailable. Retry to load it.')
      const blob = await response.blob()
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [endpoint, token, image, retry])

  async function download() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await apiResponse(endpoint, token)
      if (!response.ok) throw new Error('Could not download this file. Please retry.')
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = objectUrl; link.download = message.attachmentName; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className={s.attachment}>
    {image && (url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${message.attachmentName}`}><img src={url} alt={message.attachmentName} className={s.attachmentImage} onLoad={onImageLoad}/></a> : <div className={s.imagePlaceholder}>{error ? 'Preview unavailable' : 'Loading image…'}</div>)}
    <div className={s.fileCard}><span className={s.fileSymbol}>{image ? '▧' : '↧'}</span><div><strong>{message.attachmentName}</strong><small>{fileSize(message.attachmentSize || 0)}</small></div><button type="button" disabled={busy} onClick={download} aria-label={`Download ${message.attachmentName}`}>{busy ? 'Loading…' : 'Download'}</button></div>
    {error && <div role="alert" className={s.fileError}>{error}{image && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry preview</button>}</div>}
  </div>
})
