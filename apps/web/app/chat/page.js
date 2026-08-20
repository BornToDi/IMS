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

function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
function messagePreview(message) {
  const text = String(message?.content || message?.attachmentName || 'Message').trim()
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}
function renderMessageContent(content, users) {
  const names = users
    .map((candidate) => String(candidate?.name || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (!names.length) return content

  const escapedNames = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(@(?:${escapedNames.join('|')}))`, 'i')

  return String(content).split(pattern).map((part, index) => (
    pattern.test(part)
      ? <strong key={`${part}-${index}`} className="font-bold text-cyan-300">{part}</strong>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ))
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
  const [selectedDate, setSelectedDate] = useState('')
  const [connectionState, setConnectionState] = useState('connecting')
  const [mobileContactsOpen, setMobileContactsOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [locationStatus, setLocationStatus] = useState('')
  const [stickerTrayOpen, setStickerTrayOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [placeNames, setPlaceNames] = useState({})
  const [replyingTo, setReplyingTo] = useState(null)
  const [mentionUsers, setMentionUsers] = useState([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const messageInputRef = useRef(null)

  // Initialize Socket.IO connection and load initial messages
  useEffect(() => {
    if (!accessToken || !user) return
    setConnectionState('connecting')

    let cancelled = false

    // Load initial messages from API
    async function loadInitialMessages() {
      try {
        const pageSize = 200
        let offset = 0
        let history = []

        while (!cancelled) {
          const r = await fetch(`${API_BASE_URL}/api/chat?limit=${pageSize}&offset=${offset}`, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include' })
          if (!r.ok) throw new Error('Failed to load chat history')
          const page = await r.json()
          if (!Array.isArray(page)) throw new Error('Invalid chat history response')
          history = [...page, ...history]
          if (page.length < pageSize) break
          offset += pageSize
        }

        if (!cancelled) {
          setMessages((current) => {
            const byId = new Map([...history, ...current].map((message) => [message.id, message]))
            return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          })
        }
      } catch (err) {
        console.error('Failed to load initial messages:', err)
      } finally {
        if (!cancelled) setLoading(false)
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
    return () => {
      cancelled = true
      newSocket.disconnect()
    }
  }, [accessToken, user])

  useEffect(() => {
    if (!accessToken) return
    fetch(`${API_BASE_URL}/api/auth/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include'
    })
      .then((response) => response.ok ? response.json() : [])
      .then((users) => {
        const candidates = Array.isArray(users) ? users : []
        setMentionUsers(user ? [user, ...candidates.filter((candidate) => candidate.id !== user.id)] : candidates)
      })
      .catch(() => setMentionUsers([]))
  }, [accessToken, user])

  useEffect(() => {
    const input = messageInputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`
  }, [newMessage])

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

  const visibleMessages = useMemo(() => {
    if (!selectedDate) return messages
    return messages.filter((message) => localDateKey(message.createdAt) === selectedDate)
  }, [messages, selectedDate])

  const groupedMessages = useMemo(() => {
    const groups = []

    visibleMessages.forEach((message) => {
      const label = formatDateLabel(message.createdAt)
      const lastGroup = groups[groups.length - 1]

      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [message] })
        return
      }

      lastGroup.items.push(message)
    })

    return groups
  }, [visibleMessages])

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages])

  useEffect(() => {
    messages.forEach((message) => {
      if (!hasLocation(message)) return
      const key = locationKey(message)
      if (placeNames[key]) return
      if (!isGenericLocationLabel(message.locationLabel)) {
        setPlaceNames((current) => current[key] ? current : { ...current, [key]: message.locationLabel })
        return
      }
      resolvePlaceName(Number(message.latitude), Number(message.longitude)).then((place) => {
        setPlaceNames((current) => current[key] ? current : { ...current, [key]: place })
      })
    })
  }, [messages, placeNames])

  async function buildLocationPayload() {
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
    if (!newMessage.trim() || !user) return

    const content = newMessage
    setNewMessage('')
    const locationPayload = await buildLocationPayload()

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ content, replyToId: replyingTo?.id || null, ...locationPayload })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to send message')
      }

      const message = await response.json()
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
      setReplyingTo(null)
    } catch (error) {
      setNewMessage(content)
      setLocationStatus(error.message || 'Failed to send message')
      setTimeout(() => setLocationStatus(''), 3000)
    }
  }

  const filteredMentionUsers = mentionUsers
    .filter((candidate) => candidate.id !== user?.id)
    .filter((candidate) => {
      const query = mentionQuery.trim().toLowerCase()
      if (!query) return true
      return String(candidate.name || '').toLowerCase().includes(query) ||
        String(candidate.email || '').toLowerCase().includes(query)
    })
    .slice(0, 8)

  function handleMessageChange(event) {
    const value = event.target.value
    const cursor = event.target.selectionStart ?? value.length
    const match = value.slice(0, cursor).match(/@([^@\s]*)$/)
    setNewMessage(value)
    setMentionOpen(Boolean(match))
    setMentionQuery(match?.[1] || '')
  }

  function selectMention(candidate) {
    const input = messageInputRef.current
    const cursor = input?.selectionStart ?? newMessage.length
    const before = newMessage.slice(0, cursor)
    const match = before.match(/@([^@\s]*)$/)
    const start = match ? cursor - match[0].length : cursor
    const mention = `@${candidate.name || candidate.email} `
    const next = `${newMessage.slice(0, start)}${mention}${newMessage.slice(cursor)}`
    setNewMessage(next)
    setMentionOpen(false)
    setMentionQuery('')
    requestAnimationFrame(() => {
      const position = start + mention.length
      input?.focus()
      input?.setSelectionRange(position, position)
    })
  }

  function handleMessageKeyDown(event) {
    if (mentionOpen && event.key === 'Escape') {
      setMentionOpen(false)
      return
    }
    if (mentionOpen && event.key === 'Enter' && filteredMentionUsers[0]) {
      event.preventDefault()
      selectMention(filteredMentionUsers[0])
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !mentionOpen) {
      event.preventDefault()
      handleSend(event)
    }
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
      replyToId: replyingTo?.id || null,
      ...locationPayload
    })

    setStickerTrayOpen(false)
    setMobileContactsOpen(false)
    setReplyingTo(null)
  }

  async function uploadSelectedFile(file) {
    if (!file || !user) return

    const formData = new FormData()
    formData.append('file', file)
    if (newMessage.trim()) formData.append('content', newMessage.trim())
    if (replyingTo?.id) formData.append('replyToId', replyingTo.id)
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
        setReplyingTo(null)
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

          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-white/10 bg-[#111b21] px-3 py-2 sm:px-6">
            <label htmlFor="chat-date-filter" className="text-xs font-semibold text-slate-300">Show chat from date</label>
            <input
              id="chat-date-filter"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-white/15 bg-[#202c33] px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
            />
            {selectedDate ? (
              <>
                <span className="text-xs text-slate-400">{visibleMessages.length} message(s)</span>
                <button type="button" onClick={() => setSelectedDate('')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15">
                  Show all dates
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">All {messages.length} messages</span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto chat-scroll chat-wallpaper px-3 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:gap-4">
              {loading ? (
                <div className="mx-auto mt-10 rounded-3xl border border-white/10 bg-black/20 px-5 py-4 text-sm text-slate-300 backdrop-blur">
                  Loading complete chat history...
                </div>
              ) : null}

              {!loading && visibleMessages.length === 0 ? (
                <div className="mx-auto mt-10 max-w-md rounded-3xl border border-white/10 bg-black/20 px-5 py-7 text-center text-slate-300 backdrop-blur sm:mt-16 sm:px-6 sm:py-8">
                  <p className="text-base font-semibold text-white sm:text-lg">{selectedDate ? 'No messages on this date' : 'No messages yet'}</p>
                  <p className="mt-2 text-sm text-slate-400">{selectedDate ? 'Choose another date or show all dates.' : 'Start the conversation and the feed will appear here in the same style as WhatsApp.'}</p>
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
                      <div id={`message-${message.id}`} key={message.id} className={`flex scroll-mt-24 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`${stickerMessage ? 'max-w-[6rem] rounded-2xl bg-transparent px-0 py-0 text-white shadow-none' : `max-w-[86%] rounded-2xl px-3 py-2.5 text-white shadow-lg sm:max-w-[70%] sm:px-3.5 sm:py-3 ${isMine ? 'bg-[#005c4b] rounded-br-sm' : 'bg-[#202c33] rounded-bl-sm'}`}`}>
                          {!isMine && !stickerMessage ? (
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">{message.author?.name || 'Unknown'}</p>
                          ) : null}
                          {message.replyTo ? (
                            <button
                              type="button"
                              onClick={() => document.getElementById(`message-${message.replyTo.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                              className={`mb-2 block w-full border-l-4 px-3 py-2 text-left ${isMine ? 'border-emerald-300 bg-black/15' : 'border-emerald-400 bg-black/20'}`}
                            >
                              <span className="block text-[11px] font-bold text-white">{message.replyTo.author?.name || 'Unknown'}</span>
                              <span className="mt-0.5 block truncate text-xs text-white">{messagePreview(message.replyTo)}</span>
                            </button>
                          ) : null}
                          {stickerMessage ? (
                            <div className="flex justify-center text-[3.25rem] leading-none drop-shadow-lg sm:text-[4rem]">
                              {message.content}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-[13px] leading-5 sm:text-sm sm:leading-6">{renderMessageContent(message.content, mentionUsers)}</p>
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
                                  <p className="truncate text-xs text-white">
                                    {message.attachmentType || 'File'}
                                    {message.attachmentSize ? ` • ${(message.attachmentSize / 1024).toFixed(1)} KB` : ''}
                                  </p>
                                </div>
                                <span className="text-xs font-medium text-white">Open</span>
                              </a>
                            </div>
                          ) : null}
                          {hasLocation(message) ? (
                            <a href={mapUrl(message)} target="_blank" rel="noreferrer" className={`mt-2 block rounded-2xl px-3 py-2 text-white ${isMine ? 'bg-white/10' : 'bg-black/20'}`}>
                              <div className="text-xs font-black">📍 Live location</div>
                              <div className="mt-0.5 break-words text-[11px] font-semibold leading-4 opacity-80">{placeNames[locationKey(message)] || (isGenericLocationLabel(message.locationLabel) ? 'Finding place name…' : message.locationLabel)}</div>
                            </a>
                          ) : null}
                          <div className="mt-1.5 flex items-center justify-end gap-3 text-[11px] text-white">
                            <button type="button" onClick={() => setReplyingTo(message)} className="font-semibold text-white hover:text-white" title="Reply to message">Reply</button>
                            <span>{formatMessageTime(message.createdAt)}</span>
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

              {replyingTo ? (
                <div className="mb-2 flex items-center gap-3 border-l-4 border-emerald-400 bg-[#111b21] px-3 py-2 text-left text-white">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white">Replying to {replyingTo.author?.name || 'Unknown'}</p>
                    <p className="mt-0.5 truncate text-xs text-white">{messagePreview(replyingTo)}</p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-lg hover:bg-white/10" title="Cancel reply">&times;</button>
                </div>
              ) : null}

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
                <div className="relative flex min-w-0 flex-1 items-end gap-2 rounded-[20px] border border-white/10 bg-[#111b21] px-3 py-2 sm:rounded-[24px] sm:px-4 sm:py-2.5">
                  {mentionOpen ? (
                    <div className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-30 max-h-64 overflow-y-auto border border-white/10 bg-[#111b21] py-1 shadow-2xl chat-scroll">
                      {filteredMentionUsers.length ? filteredMentionUsers.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => selectMention(candidate)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-white hover:bg-white/10"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-xs font-bold">{getInitials(candidate.name || candidate.email)}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{candidate.name || candidate.email}</span>
                            <span className="block truncate text-xs text-white/70">{candidate.email}</span>
                          </span>
                        </button>
                      )) : <p className="px-3 py-4 text-sm text-white/70">No matching user</p>}
                    </div>
                  ) : null}
                  <textarea
                    ref={messageInputRef}
                    rows={1}
                    value={newMessage}
                    onChange={handleMessageChange}
                    onKeyDown={handleMessageKeyDown}
                    placeholder="Type a message"
                    className="max-h-[120px] min-h-9 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[13px] leading-5 text-white outline-none placeholder:text-slate-400 sm:text-sm"
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
