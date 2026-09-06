import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchChatHistoryPage } from './chatHistory.mjs'
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status })
test('refreshes expired token and retries with credentials', async () => {
  const requests = []
  let refreshes = 0
  const page = await fetchChatHistoryPage('/api/chat', 'expired', {
    refreshAccessToken: async () => { refreshes++; return 'renewed' },
    fetcher: async (url, options) => { requests.push(options); return requests.length === 1 ? reply({ error: 'Invalid token' }, 401) : reply([{ id: 'message' }]) }
  })
  assert.equal(refreshes, 1)
  assert.equal(requests[1].headers.Authorization, 'Bearer renewed')
  assert.equal(requests[1].credentials, 'include')
  assert.equal(page[0].id, 'message')
})
test('does not loop when refresh fails or retry is unauthorized', async () => {
  for (const renewed of [null, 'still-invalid']) {
    let requests = 0
    await assert.rejects(fetchChatHistoryPage('/api/chat', 'expired', { refreshAccessToken: async () => renewed, fetcher: async () => { requests++; return reply({}, 401) } }), /session has expired/)
    assert.equal(requests, renewed ? 2 : 1)
  }
})
test('reports server failures and invalid payloads without treating them as empty history', async () => {
  for (const [response, expected] of [[reply({}, 503), /temporarily unavailable/], [reply({ error: 'Database error' }, 500), /500.*Database error/], [reply({}), /invalid response/]]) {
    await assert.rejects(fetchChatHistoryPage('/api/chat', 'valid', { refreshAccessToken: async () => assert.fail('Must not refresh'), fetcher: async () => response }), expected)
  }
})
test('does not retry an abandoned request after refresh', async () => {
  const controller = new AbortController()
  let requests = 0
  await assert.rejects(fetchChatHistoryPage('/api/chat', 'expired', { signal: controller.signal, refreshAccessToken: async () => { controller.abort(); return 'new' }, fetcher: async () => { requests++; return reply({}, 401) } }), { name: 'AbortError' })
  assert.equal(requests, 1)
})
