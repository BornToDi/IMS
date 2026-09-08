import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationCounts } from './notificationCounts.mjs'

test('one or ten unread chat messages count as one; announcements count individually', () => {
  for (const size of [1, 10]) {
    const chat = Array.from({ length: size }, (_, id) => ({ id, type: 'GLOBAL_CHAT', isRead: false }))
    assert.deepEqual(notificationCounts(chat), { chat: 1, announcements: 0, total: 1 })
    for (const count of [1, 2]) {
      const notes = [...chat, ...Array.from({ length: count }, () => ({ type: 'ANNOUNCEMENT', isRead: false }))]
      assert.deepEqual(notificationCounts(notes), { chat: 1, announcements: count, total: count + 1 })
    }
  }
})

test('read notifications do not contribute; other notification types retain their counts', () => {
  assert.deepEqual(notificationCounts([{ type: 'GLOBAL_CHAT', isRead: true }, { type: 'ANNOUNCEMENT', isRead: true }, { type: 'TICKET', isRead: false }]), { chat: 0, announcements: 0, total: 1 })
  assert.deepEqual(notificationCounts([]), { chat: 0, announcements: 0, total: 0 })
})
