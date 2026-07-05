"use client"
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { io } from 'socket.io-client'
import { getCurrentLocationWithPlace, isGenericLocationLabel, resolvePlaceName } from '../../lib/location'
import Layout from '../../components/Layout'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateLabel(value) {
  const date = new Date(value)
  const today = new Date()
  const startOfDay = (input) => new Date(input.getFullYear(), input.getMonth(), input.getDate())
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

function getAttachmentUrl(message) {
  if (!message?.attachmentUrl) return ''
  if (
    message.attachmentUrl.startsWith('http://') ||
    message.attachmentUrl.startsWith('https://') ||
    message.attachmentUrl.startsWith('data:') ||
    message.attachmentUrl.startsWith('blob:')
  ) {
    return message.attachmentUrl
  }
  return `${API_BASE_URL}${message.attachmentUrl}`
}

function isImageAttachment(message) {
  return Boolean(message?.attachmentType && message.attachmentType.startsWith('image/'))
}

function isStickerMessage(message) {
  return message?.attachmentType === 'sticker'
}
function hasLocation(message) {
  return message?.latitude !== null && message?.latitude !== undefined && message?.latitude !== '' &&
    message?.longitude !== null && message?.longitude !== undefined && message?.longitude !== '' &&
    Number.isFinite(Number(message.latitude)) && Number.isFinite(Number(message.longitude))
}
function locationKey(message) {
  return `${Number(message.latitude)},${Number(message.longitude)}`
}
function mapUrl(message) {
  return `https://www.google.com/maps?q=${Number(message.latitude)},${Number(message.longitude)}`
}
async function requestCurrentLocation() {
  return getCurrentLocationWithPlace()
}

const STICKERS = [
  { id: 'smile', emoji: '😀', label: 'Smile' },
  { id: 'grin', emoji: '😁', label: 'Grin' },
  { id: 'joy', emoji: '😂', label: 'Joy' },
  { id: 'party', emoji: '🥳', label: 'Party' },
  { id: 'love', emoji: '😍', label: 'Love' },
  { id: 'thumbs', emoji: '👍', label: 'Nice' },
  { id: 'clap', emoji: '👏', label: 'Clap' },
  { id: 'hug', emoji: '🤗', label: 'Hug' }
]

export default function CompanyChat() {
  const { user, accessToken } = useAuthStore()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [socket, setSocket] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [connectionState, setConnectionState] = useState('connecting')
  const [mobileContactsOpen, setMobileContactsOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(false)
  const [locationStatus, setLocationStatus] = useState('')
  const [stickerTrayOpen, setStickerTrayOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [placeNames, setPlaceNames] = useState({})
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // Initialize Socket.IO connection and load initial messages
  useEffect(() => {
    if (!accessToken || !user) return
    setConnectionState('connecting')

    let cancelled = false

    // Load initial messages from API
    async function loadInitialMessages() {
      try {
        const r = await fetch(`${API_BASE_URL}/api/chat`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include' })
        if (r.ok) {
          const data = await r.json()
          if (!cancelled) setMessages(data)
        }
      } catch (err) {
        console.error('Failed to load initial messages:', err)
      }
    }

    loadInitialMessages()

    // Initialize Socket.IO
    const newSocket = io(API_BASE_URL || undefined, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      auth: { token: accessToken },
      extraHeaders: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    newSocket.on('connect', () => {
      console.log('[socket] connected:', newSocket.id)
      setConnectionState('online')
      newSocket.emit('join-global-chat', { userId: user.id })
    })

    newSocket.on('new-global-message', (message) => {
      if (!cancelled) {
        setMessages(prev => prev.some((m) => m.id === message.id) ? prev : [...prev, message])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    })

    newSocket.on('disconnect', () => {
      console.log('[socket] disconnected')
      setConnectionState('offline')
    })

    newSocket.on('error', (err) => {
      console.error('[socket] error:', err)
    })

    setSocket(newSocket)
    setLoading(false)

    return () => {
      cancelled = true
      newSocket.disconnect()
    }
  }, [accessToken, user])

  // Ensure the page background is dark while on chat page to avoid light corners
  useEffect(() => {
    const prevBodyBg = document.body.style.background
    const prevBodyBgImage = document.body.style.backgroundImage
    document.body.style.background = '#071014'
    document.body.style.backgroundImage = 'none'
    return () => {
      document.body.style.background = prevBodyBg
      document.body.style.backgroundImage = prevBodyBgImage
    }
  }, [])

  const contacts = useMemo(() => {
    const seen = new Set()
    const items = []

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      const authorId = message.authorId || message.author?.id
      const authorName = message.author?.name || 'Unknown'

      if (!authorId || seen.has(authorId)) continue
      seen.add(authorId)
      items.push({
        id: authorId,
        name: authorName,
        initials: getInitials(authorName),
        lastMessage: message.attachmentName ? `📎 ${message.attachmentName}` : message.content,
        createdAt: message.createdAt,
        isMe: authorId === user?.id
      })
    }

    return items
  }, [messages, user?.id])

  const filteredContacts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return contacts
    return contacts.filter((contact) => (
      contact.name.toLowerCase().includes(term) ||
      contact.lastMessage.toLowerCase().includes(term)
    ))
  }, [contacts, searchTerm])

  const groupedMessages = useMemo(() => {
    const groups = []

    messages.forEach((message) => {
      const label = formatDateLabel(message.createdAt)
      const lastGroup = groups[groups.length - 1]

      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [message] })
        return
      }

      lastGroup.items.push(message)
    })

    return groups
  }, [messages])

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    messages.forEach((message) => {
      if (!hasLocation(message)) return
      const key = locationKey(message)
      if (placeNames[key]) return
      resolvePlaceName(Number(message.latitude), Number(message.longitude)).then((place) => {
        setPlaceNames((current) => current[key] ? current : { ...current, [key]: place })
      })
    })
  }, [messages, placeNames])

  async function buildLocationPayload() {
    if (!locationEnabled) return {}
    try {
      setLocationStatus('Getting location...')
      const loc = await requestCurrentLocation()
      setLocationStatus('Location attached')
      setTimeout(() => setLocationStatus(''), 1800)
      return loc
    } catch (err) {
      setLocationStatus(err.message || 'Location failed')
      setTimeout(() => setLocationStatus(''), 2500)
      return {}
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !socket || !user) return

    const content = newMessage
    setNewMessage('')
    const locationPayload = await buildLocationPayload()

    socket.emit('send-global-message', {
      authorId: user.id,
      content,
      ...locationPayload
    })
  }

  async function sendSticker(sticker) {
    if (!socket || !user) return

    const locationPayload = await buildLocationPayload()

    socket.emit('send-global-message', {
      authorId: user.id,
      content: sticker.emoji,
      attachmentName: sticker.label,
      attachmentType: 'sticker',
      attachmentUrl: '',
      attachmentSize: 0,
      ...locationPayload
    })

    setStickerTrayOpen(false)
    setMobileContactsOpen(false)
  }

  async function uploadSelectedFile(file) {
    if (!file || !user) return

    const formData = new FormData()
    formData.append('file', file)
    if (newMessage.trim()) formData.append('content', newMessage.trim())
    const locationPayload = await buildLocationPayload()
    Object.entries(locationPayload).forEach(([key, value]) => formData.append(key, value))

    try {
      setIsUploading(true)
      const res = await fetch(`${API_BASE_URL}/api/chat/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        if (data?.message) {
          setMessages((prev) => prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message])
        }
        setNewMessage('')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return true
      }
      return false
    } catch (err) {
      console.error('File upload failed', err)
      return false
    } finally {
      setIsUploading(false)
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
  }

  async function handleSend(e) {
    e?.preventDefault?.()

    if (selectedFile) {
      const success = await uploadSelectedFile(selectedFile)
      if (success) {
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      return
    }

    await sendMessage()
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function openStickerTray() {
    setStickerTrayOpen((current) => !current)
  }

  if (!user) return <div className="p-6">Please sign in to view chat.</div>
  if (loading) return <div className="p-6">Loading chat...</div>

  return (
    <Layout>
      <>
      {lightbox ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white">Close</button>
          <img src={lightbox} alt="Preview" className="max-h-[94vh] max-w-[98vw] rounded-2xl object-contain" />
        </div>
      ) : null}
    <div className="relative h-[calc(100dvh-64px)] overflow-hidden rounded-none border border-white/10 bg-[#0b141a] text-white shadow-none md:h-[calc(100dvh-64px)] md:rounded-[28px] md:shadow-[0_30px_90px_rgba(15,23,42,0.45)]">
      {mobileContactsOpen ? (
        <button
          type="button"
          aria-label="Close contacts"
          className="fixed inset-0 z-30 cursor-default bg-black/50 backdrop-blur-[2px] md:hidden"
          onClick={() => setMobileContactsOpen(false)}
        />
      ) : null}
      <div className="flex h-full min-h-0">
        <aside className={`fixed inset-y-0 left-0 z-40 flex h-full min-h-0 w-[88vw] max-w-sm flex-none flex-col overflow-hidden border-r border-white/10 bg-[#111b21] transition-transform duration-300 md:static md:z-auto md:w-[340px] md:translate-x-0 ${mobileContactsOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">Chats</p>
              <h2 className="text-xl font-semibold text-white">Company Chat</h2>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-lg hover:bg-white/10">+</button>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-lg hover:bg-white/10">⋮</button>
            </div>
          </div>

          <div className="flex-none border-b border-white/10 px-4 py-4">
            <div className="flex items-center gap-3 rounded-full bg-[#202c33] px-4 py-3 text-sm text-slate-300">
              <span className="text-slate-400">⌕</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search or start a new chat"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-emerald-200 ring-1 ring-emerald-400/30">All</span>
              <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">Unread 0</span>
              <span className="rounded-full bg-white/5 px-3 py-1.5 text-slate-300">Company</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 chat-scroll">
            <div className="mx-1 mb-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-emerald-200/80">
                <span>Global room</span>
                <span>{connectionState}</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-white">All employees chat together</p>
              <p className="mt-1 text-sm text-emerald-50/80">{messages.length} messages so far</p>
            </div>

            <div className="space-y-2">
              {filteredContacts.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  No matching conversations yet.
                </div>
              ) : filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
                  onClick={() => setMobileContactsOpen(false)}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#202c33] text-sm font-semibold text-emerald-200 ring-1 ring-white/10">
                    {contact.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-white">{contact.isMe ? `${contact.name} (You)` : contact.name}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">{formatMessageTime(contact.createdAt)}</span>
                    </div>
                    <p className="truncate text-sm text-slate-400">{contact.lastMessage}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 min-w-0 flex-col bg-[#0b141a]">
          <div className="flex-none flex items-center justify-between border-b border-white/10 bg-[#202c33] px-3 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/20">
                {getInitials('Company')}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-white sm:text-base">Company Chat</h1>
                <p className="hidden truncate text-sm text-slate-400 sm:block">Everyone in the company can message here</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-lg hover:bg-white/10">⌕</button>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-lg hover:bg-white/10">⋮</button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto chat-scroll chat-wallpaper px-3 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:gap-4">
              {messages.length === 0 ? (
                <div className="mx-auto mt-10 max-w-md rounded-3xl border border-white/10 bg-black/20 px-5 py-7 text-center text-slate-300 backdrop-blur sm:mt-16 sm:px-6 sm:py-8">
                  <p className="text-base font-semibold text-white sm:text-lg">No messages yet</p>
                  <p className="mt-2 text-sm text-slate-400">Start the conversation and the feed will appear here in the same style as WhatsApp.</p>
                </div>
              ) : null}

              {groupedMessages.map((group) => (
                <div key={group.label} className="space-y-3">
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-[#202c33]/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300 ring-1 ring-white/10">
                      {group.label}
                    </span>
                  </div>

                  {group.items.map((message) => {
                    const isMine = message.authorId === user.id
                    const stickerMessage = isStickerMessage(message)
                    return (
                      <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`${stickerMessage ? 'max-w-[6rem] rounded-2xl bg-transparent px-0 py-0 shadow-none' : `max-w-[86%] rounded-2xl px-3 py-2.5 shadow-lg sm:max-w-[70%] sm:px-3.5 sm:py-3 ${isMine ? 'bg-[#005c4b] rounded-br-sm text-white' : 'bg-[#202c33] rounded-bl-sm text-slate-100'}`}`}>
                          {!isMine && !stickerMessage ? (
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">{message.author?.name || 'Unknown'}</p>
                          ) : null}
                          {stickerMessage ? (
                            <div className="flex justify-center text-[3.25rem] leading-none drop-shadow-lg sm:text-[4rem]">
                              {message.content}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-[13px] leading-5 sm:text-sm sm:leading-6">{message.content}</p>
                          )}
                          {message.attachmentUrl ? (
                            <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                              {isImageAttachment(message) ? (
                                <button type="button" onClick={() => setLightbox(getAttachmentUrl(message))} className="block w-full">
                                  <img
                                    src={getAttachmentUrl(message)}
                                    alt={message.attachmentName || 'Uploaded file'}
                                    className="max-h-72 w-full object-cover"
                                  />
                                </button>
                              ) : null}
                              <a
                                href={getAttachmentUrl(message)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 px-3 py-3 text-left transition hover:bg-white/5"
                              >
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-lg text-emerald-200 ring-1 ring-emerald-400/20">
                                  📎
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-white">{message.attachmentName || 'Attachment'}</p>
                                  <p className="truncate text-xs text-slate-400">
                                    {message.attachmentType || 'File'}
                                    {message.attachmentSize ? ` • ${(message.attachmentSize / 1024).toFixed(1)} KB` : ''}
                                  </p>
                                </div>
                                <span className="text-xs font-medium text-emerald-200">Open</span>
                              </a>
                            </div>
                          ) : null}
                          {hasLocation(message) ? (
                            <a href={mapUrl(message)} target="_blank" rel="noreferrer" className={`mt-2 block rounded-2xl px-3 py-2 ${isMine ? 'bg-white/10 text-blue-100' : 'bg-black/20 text-blue-200'}`}>
                              <div className="text-xs font-black">📍 Live location</div>
                              <div className="mt-0.5 truncate text-[11px] font-semibold opacity-80">{placeNames[locationKey(message)] || (isGenericLocationLabel(message.locationLabel) ? 'Finding place name…' : message.locationLabel)}</div>
                            </a>
                          ) : null}
                          <div className={`mt-1.5 flex items-center justify-end text-[11px] ${isMine ? 'text-emerald-100/75' : 'text-slate-400'}`}>
                            {formatMessageTime(message.createdAt)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="sticky bottom-0 z-20 border-t border-white/10 bg-[#202c33] px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-4 sm:pb-3">
            <form onSubmit={handleSend} className="mx-auto w-full max-w-4xl">
              <input ref={fileInputRef} type="file" onChange={handleFileChange} className="sr-only" />

              {stickerTrayOpen ? (
                <div className="mb-2 flex gap-2 overflow-x-auto rounded-[24px] border border-white/10 bg-[#111b21] p-2 chat-scroll">
                  {STICKERS.map((sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      onClick={() => sendSticker(sticker)}
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-2xl transition hover:border-emerald-400/30 hover:bg-white/10"
                      title={sticker.label}
                    >
                      <span aria-hidden="true">{sticker.emoji}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {selectedFile ? (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50">
                  {selectedFile.type?.startsWith('image/') ? <img src={URL.createObjectURL(selectedFile)} alt="selected" className="h-14 w-16 shrink-0 rounded-xl object-cover" /> : <div className="grid h-14 w-16 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">📎</div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-emerald-50/70">Ready to send in chat</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              {locationStatus ? <div className="mb-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100">📍 {locationStatus}</div> : null}
              <div className="flex items-end gap-2 rounded-[24px] border border-white/10 bg-[#2a3942] px-3 py-2 shadow-inner shadow-black/10 sm:rounded-[28px] sm:px-4 sm:py-2.5">
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 text-lg text-slate-200 transition hover:bg-white/10 sm:h-11 sm:w-11"
                  title="Attach file"
                  onClick={openFilePicker}
                >
                  +
                </button>
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 text-lg text-slate-200 transition hover:bg-white/10 sm:h-11 sm:w-11"
                  title="Stickers"
                  onClick={openStickerTray}
                >
                  ✦
                </button>
                <button
                  type="button"
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg transition sm:h-11 sm:w-11 ${locationEnabled ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-200 hover:bg-white/10'}`}
                  title={locationEnabled ? 'Location ON' : 'Location OFF'}
                  onClick={() => setLocationEnabled((current) => !current)}
                >
                  📍
                </button>

                <div className="flex min-w-0 flex-1 items-end gap-2 rounded-[20px] border border-white/10 bg-[#111b21] px-3 py-2 sm:rounded-[24px] sm:px-4 sm:py-2.5">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message"
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-white outline-none placeholder:text-slate-400 sm:py-2 sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={(!newMessage.trim() && !selectedFile) || isUploading}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10"
                    title={selectedFile ? 'Send file' : 'Send message'}
                  >
                    {isUploading ? '…' : '➤'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
      </>
    </Layout>
  )
}
