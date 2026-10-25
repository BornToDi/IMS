'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { apiFetch, SOCKET_BASE_URL } from '../lib/api'
import { Icon } from './inventory/shared'
import { isNearChatBottom } from '../lib/chatHistory.mjs'
import PrivateAttachment, { fileSize } from './PrivateAttachment'
import s from './SupportInbox.module.css'

const merge = (current, incoming) => [...new Map([...current, ...incoming].map(message => [message.id, message])).values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id))
const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()
const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const date = value => new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

export default function SupportInbox() {
  const token = useAuthStore(state => state.accessToken)
  const user = useAuthStore(state => state.user)
  const params = useSearchParams()
  const contactParam = params.get('contact') || ''
  const ticketId = params.get('ticket') || ''
  const allowed = ['BANK', 'ADMIN'].includes(user?.userRole)
  const isBank = user?.userRole === 'BANK'
  const [contacts, setContacts] = useState([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState([])
  const [drafts, setDrafts] = useState({})
  const [files, setFiles] = useState({})
  const [preview, setPreview] = useState('')
  const fileInput = useRef(null)
  const [ticket, setTicket] = useState(null)
  const [query, setQuery] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [connection, setConnection] = useState('Connecting')
  const scroll = useRef(null)
  const follow = useRef(true)
  const initial = useRef(true)
  const anchor = useRef(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const sendLock = useRef(false)
  const olderLock = useRef(false)
  const readMessage = useRef('')
  const contact = contacts.find(item => item.id === selected)
  const draft = drafts[selected] || ''
  const file = files[selected] || null
  useEffect(() => {
    if (fileInput.current) fileInput.current.value = ''
    if (!file || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, selected])

  const loadContacts = useCallback(async () => {
    if (!token || !allowed) return
    return apiFetch('/api/direct-messages/contacts', token).then(rows => { setContacts(rows); return rows })
  }, [token, allowed])

  useEffect(() => {
    if (!token || !allowed) return
    let active = true
    const load = async () => {
      try {
        const rows = await apiFetch('/api/direct-messages/contacts', token)
        if (active) { setContacts(rows); setLoadingContacts(false) }
      } catch (err) { if (active) { setError(err.message); setLoadingContacts(false) } }
    }
    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [token, allowed, retry])

  useEffect(() => { if (contactParam) setSelected(contactParam) }, [contactParam])
  useEffect(() => {
    if (!ticketId || !token || !allowed) { setTicket(null); return }
    let active = true
    apiFetch(`/api/tickets/${encodeURIComponent(ticketId)}`, token).then(row => { if (active) setTicket(row) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [ticketId, token, allowed])

  useEffect(() => {
    if (!selected || !token || !allowed) return
    let active = true
    let pending = false
    initial.current = true
    follow.current = true
    anchor.current = null
    readMessage.current = ''
    setMessages([]); setHasMore(false); setLoading(true); setError('')
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const data = await apiFetch(`/api/direct-messages/${encodeURIComponent(selected)}`, useAuthStore.getState().accessToken)
        if (active) {
          setMessages(current => merge(current, data.messages))
          setHasMore(current => initial.current ? data.hasMore : current)
          setLoading(false)
        }
      } catch (err) { if (active) { setError(err.message); setLoading(false) } }
      finally { pending = false }
    }
    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 8000)
    return () => { active = false; clearInterval(timer) }
  }, [selected, Boolean(token), allowed, retry])

  useEffect(() => {
    if (!token || !allowed) return
    const socket = io(SOCKET_BASE_URL, { auth: callback => callback({ token: useAuthStore.getState().accessToken }) })
    socket.on('connect', () => setConnection('Connected'))
    socket.on('disconnect', () => setConnection('Reconnecting · auto-refresh active'))
    socket.on('connect_error', () => setConnection('Auto-refresh active'))
    socket.on('direct-message:new', message => {
      const peer = message.senderId === user.id ? message.recipientId : message.senderId
      if (peer === selectedRef.current) setMessages(current => merge(current, [message]))
      loadContacts().catch(() => {})
    })
    socket.on('direct-message:read', ({ readerId, throughId, throughTime, readAt }) => {
      if (readerId === selectedRef.current) setMessages(current => current.map(message => message.senderId === user.id && (new Date(message.createdAt) < new Date(throughTime) || (message.createdAt === throughTime && message.id <= throughId)) ? { ...message, readAt: message.readAt || readAt } : message))
    })
    return () => socket.disconnect()
  }, [token, allowed, user?.id, loadContacts])

  useLayoutEffect(() => {
    const container = scroll.current
    if (!container || loading) return
    if (anchor.current) {
      const element = document.getElementById(anchor.current.id)
      if (element) container.scrollTop += element.getBoundingClientRect().top - anchor.current.top
      anchor.current = null
    } else if (initial.current || follow.current) container.scrollTop = container.scrollHeight
    initial.current = false
  }, [messages, loading])

  useEffect(() => {
    const latest = messages.at(-1)
    if (!latest || loading || !selected || !token) return
    const mark = () => {
      if (document.visibilityState !== 'visible' || !scroll.current || !isNearChatBottom(scroll.current) || readMessage.current === latest.id) return
      readMessage.current = latest.id
      apiFetch(`/api/direct-messages/${encodeURIComponent(selected)}/read`, token, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: latest.id }) })
        .then(() => loadContacts()).then(rows => {
          if (rows?.find(item => item.id === selected)?.unread === 0) {
            const target = `/support?contact=${encodeURIComponent(selected)}`
            useNotificationStore.getState().setNotes(current => current.map(note => note.type === 'DIRECT_MESSAGE' && note.targetUrl === target ? { ...note, isRead: true } : note))
          }
        }).catch(() => { readMessage.current = '' })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    const container = scroll.current
    container?.addEventListener('scroll', mark)
    return () => { document.removeEventListener('visibilitychange', mark); container?.removeEventListener('scroll', mark) }
  }, [messages, loading, selected, token, loadContacts])

  async function send(event) {
    event.preventDefault()
    const content = draft.trim()
    if ((!content && !file) || sendLock.current || !contact) return
    const peer = selected
    sendLock.current = true; setSending(true); setError('')
    try {
      const data = new FormData()
      if (file) { data.append('file', file); data.append('content', content) }
      const message = await apiFetch(`/api/direct-messages/${encodeURIComponent(peer)}${file ? '/attachments' : ''}`, token, file ? { method: 'POST', body: data } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
      setDrafts(current => ({ ...current, [peer]: current[peer] === draft ? '' : current[peer] }))
      if (file) setFiles(current => ({ ...current, [peer]: current[peer] === file ? null : current[peer] }))
      if (selectedRef.current === peer) { follow.current = true; setMessages(current => merge(current, [message])) }
      loadContacts().catch(() => {})
    } catch (err) { setError(err.message) }
    finally { sendLock.current = false; setSending(false) }
  }

  async function loadOlder() {
    if (olderLock.current || !hasMore || !messages.length) return
    olderLock.current = true; setLoadingOlder(true)
    const peer = selected
    try {
      const data = await apiFetch(`/api/direct-messages/${encodeURIComponent(peer)}?before=${encodeURIComponent(messages[0].id)}`, token)
      if (selectedRef.current !== peer) return
      const container = scroll.current
      const visible = container && [...container.querySelectorAll('[data-message]')].find(element => element.getBoundingClientRect().bottom >= container.getBoundingClientRect().top)
      if (visible) anchor.current = { id: visible.id, top: visible.getBoundingClientRect().top }
      follow.current = false
      setMessages(current => merge(current, data.messages)); setHasMore(data.hasMore)
    } catch (err) { setError(err.message) }
    finally { olderLock.current = false; setLoadingOlder(false) }
  }

  if (!allowed) return <div role="alert" className={s.empty}><h1>Private bank support</h1><p>This inbox is available to bank users and admins.</p><Link href="/dashboard">Back to dashboard</Link></div>
  const visibleContacts = contacts.filter(item => [item.name, item.bankName].join(' ').toLowerCase().includes(query.toLowerCase()))
  const unread = contacts.reduce((total, item) => total + item.unread, 0)

  return <div className={s.page}>
    <header className={s.hero}><div><span className={s.eyebrow}>BANK SUPPORT</span><h1>Your direct line to {isBank ? 'admin' : 'bank users'}</h1><p>Private conversations. Clear updates. Faster follow-ups.</p></div><Link href="/tickets?new=1" className={s.primary}><Icon name="plus" size={17}/>New ticket</Link></header>
    {error && <div role="alert" className={s.error}>{error}<button type="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Retry</button></div>}
    <section className={`${s.inbox} ${selected ? s.hasSelection : ''}`} aria-label="Private support inbox">
      <aside className={s.contacts}>
        <div className={s.contactHeader}><div><h2>{isBank ? 'Admin team' : 'Bank contacts'}</h2><p>{contacts.length} contacts · {unread} unread</p></div><span className={s.secure}>Private</span></div>
        <label className={s.search}><Icon name="search" size={18}/><input type="search" placeholder="Search a name or bank" aria-label="Search contacts" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className={s.contactList}>{visibleContacts.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} className={`${s.contact} ${selected === item.id ? s.active : ''}`} onClick={() => setSelected(item.id)}><span className={s.avatar}>{initials(item.name)}</span><span className={s.contactText}><span className={s.nameRow}><strong>{item.name}</strong>{item.latest && <time>{time(item.latest.createdAt)}</time>}</span><span className={s.bank}>{item.bankName || 'Administrator'}</span><span className={s.preview}>{item.latest ? `${item.latest.senderId === user.id ? 'You: ' : ''}${item.latest.content || item.latest.attachmentName || 'Attachment'}` : 'Start a private conversation'}</span></span>{item.unread > 0 && <span className={s.unread}>{item.unread}</span>}</button>)}
          {!visibleContacts.length && <div className={s.empty}><Icon name="search" size={26}/><p>{loadingContacts ? 'Loading contacts…' : query ? 'No matching contacts.' : isBank ? 'No admin is available yet. You can still create a ticket.' : 'Bank users will appear here after they register.'}</p></div>}
        </div>
      </aside>
      <div className={s.conversation}>
        {selected ? <><header className={s.threadHeader}><button type="button" className={s.back} onClick={() => setSelected('')} aria-label="Back to contacts">←</button><span className={s.avatar}>{initials(contact?.name)}</span><div><h2>{contact?.name || 'Opening conversation…'}</h2><p>{contact?.bankName || 'Administrator'} <span>· {connection}</span></p></div><span className={s.privateLabel}>Only you and this contact</span></header>
          {ticket && <div className={s.ticketContext}><Link href={`/tickets/${ticket.id}`}><Icon name="file" size={16}/>{ticket.ticketNo} · {ticket.title}</Link><button type="button" onClick={() => setDrafts(current => ({ ...current, [selected]: `${current[selected] || ''}${current[selected] ? '\n' : ''}Regarding ticket ${ticket.ticketNo}: ${ticket.title}\n` }))}>Add ticket reference</button></div>}
          <div ref={scroll} className={s.messages} onScroll={event => { follow.current = isNearChatBottom(event.currentTarget) }} aria-busy={loading}>
            {hasMore && <button type="button" className={s.older} disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? 'Loading…' : 'Load older messages'}</button>}
            {loading ? <p role="status" className={s.empty}>Loading conversation…</p> : !messages.length ? <div className={s.empty}><span className={s.emptyIcon}>↗</span><h3>Say hello to {contact?.name || 'your contact'}</h3><p>{isBank ? 'Ask a question or follow up on a service request.' : 'Share an update or help with a bank request.'}</p><span className={s.privacyNote}>Messages are visible only to the two participants.</span></div> : messages.map((message, index) => { const own = message.senderId === user.id; const newDay = !index || date(messages[index - 1].createdAt) !== date(message.createdAt); return <div key={message.id}>{newDay && <div className={s.date}><span>{date(message.createdAt)}</span></div>}<article id={`dm-${message.id}`} data-message className={`${s.messageRow} ${own ? s.own : ''}`}><div className={s.bubble}>{message.attachmentName && <PrivateAttachment message={message} token={token} onImageLoad={() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }}/>}{message.content && <p>{message.content}</p>}<footer><time dateTime={message.createdAt}>{time(message.createdAt)}</time>{own && <span title={message.readAt ? 'Read by recipient' : 'Saved and sent'}>{message.readAt ? 'Read' : 'Sent'}</span>}</footer></div></article></div> })}
          </div>
          <form className={s.composer} onSubmit={send}>
            <input ref={fileInput} type="file" aria-label="Choose file or image" className={s.srOnly} disabled={sending} onChange={event => { const chosen = event.target.files?.[0]; if (!chosen) return; if (chosen.size > 20 * 1024 * 1024) { setError('Files must be 20 MB or smaller'); event.target.value = ''; return } if (!chosen.size) { setError('Empty files cannot be uploaded'); event.target.value = ''; return } setError(''); setFiles(current => ({ ...current, [selected]: chosen })) }}/>
            {file && <div className={s.selectedFile}>{preview ? <img src={preview} alt="Selected image preview"/> : <span className={s.fileSymbol}>↧</span>}<div><strong>{file.name}</strong><small>{fileSize(file.size)} · {sending ? 'Uploading…' : 'Ready to send'}</small></div><button type="button" aria-label="Remove attachment" disabled={sending} onClick={() => setFiles(current => ({ ...current, [selected]: null }))}>×</button></div>}
            <button type="button" className={s.attachButton} aria-label="Attach file or image" title="Attach a file or image (up to 20 MB)" disabled={!contact || sending} onClick={() => fileInput.current?.click()}>＋</button><label className={s.composeField}><span className={s.srOnly}>Message {contact?.name}</span><textarea rows={2} maxLength={4000} value={draft} disabled={!contact} placeholder="Write a private message…" onChange={event => setDrafts(current => ({ ...current, [selected]: event.target.value }))}/><span>{draft.length}/4,000</span></label><button className={s.send} disabled={sending || (!draft.trim() && !file) || !contact} type="submit"><span>{sending ? file ? 'Uploading…' : 'Sending…' : 'Send'}</span><Icon name="arrow" size={18}/></button><p>Images and files up to 20 MB. Only you and this contact can access attachments.</p></form>
        </> : <div className={s.welcome}><span className={s.emptyIcon}>↗</span><span className={s.eyebrow}>A LITTLE CLOSER TO A SOLUTION</span><h2>Support starts with<br/>a conversation.</h2><p>Choose {isBank ? 'an admin' : 'a bank contact'} to send a private message.<br/>Your company chat stays separate.</p><div className={s.welcomeSteps}><span><b>01</b>Choose a contact</span><span><b>02</b>Share your question</span><span><b>03</b>Keep work moving</span></div><Link href="/tickets?new=1" className={s.textLink}>Need an engineer? Create a ticket <Icon name="arrow" size={16}/></Link></div>}
      </div>
    </section>
  </div>
}
