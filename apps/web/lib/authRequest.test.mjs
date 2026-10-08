import test from 'node:test'
import assert from 'node:assert/strict'
import { authRequest } from './authRequest.mjs'

test('refreshes expired tokens and preserves attendance POST and upload bodies', async () => {
  for (const body of ['{"attendanceAction":"out"}', new FormData()]) {
    const calls = []
    const response = await authRequest('/api/chat', 'expired', { method: 'POST', body }, {
      refreshAccessToken: async () => 'renewed',
      fetcher: async (url, options) => { calls.push(options); return new Response('{}', { status: calls.length === 1 ? 401 : 201 }) }
    })
    assert.equal(response.status, 201)
    assert.equal(calls.length, 2)
    assert.equal(calls[1].headers.Authorization, 'Bearer renewed')
    assert.equal(calls[1].body, body)
    assert.equal(calls[1].method, 'POST')
    assert.equal(calls[1].credentials, 'include')
  }
})

test('does not repeat failed writes or retry endlessly', async () => {
  for (const status of [401, 500, 503]) {
    let calls = 0
    const response = await authRequest('/api/chat', 'old', {}, {
      refreshAccessToken: async () => 'new',
      fetcher: async () => { calls++; return new Response('{}', { status }) }
    })
    assert.equal(response.status, status)
    assert.equal(calls, status === 401 ? 2 : 1)
  }
})

test('aborted requests are not resubmitted after refreshing', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(authRequest('/api/chat', 'old', { signal: controller.signal }, {
    refreshAccessToken: async () => { controller.abort(); return 'new' },
    fetcher: async () => { calls++; return new Response('{}', { status: 401 }) }
  }), { name: 'AbortError' })
  assert.equal(calls, 1)
})
