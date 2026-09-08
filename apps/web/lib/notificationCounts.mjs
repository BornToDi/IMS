export function notificationCounts(notes) {
  const unread = notes.filter(note => !note.isRead)
  const chat = Number(unread.some(note => note.type === 'GLOBAL_CHAT'))
  const announcements = unread.filter(note => note.type === 'ANNOUNCEMENT').length
  return { chat, announcements, total: chat + unread.filter(note => note.type !== 'GLOBAL_CHAT').length }
}
