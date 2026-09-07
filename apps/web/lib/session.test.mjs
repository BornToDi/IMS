import test from 'node:test'
import assert from 'node:assert/strict'
import { requestSession } from './session.mjs'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
test('restores the user and token through same-origin cookie requests', async () => {
  const data = await requestSession(async (url, options) => {
    assert.equal(url, '/api/auth/refresh')
    assert.equal(options.credentials, 'include')
    assert.equal(options.cache, 'no-store')
    return json({ accessToken: 'new-token', user: { id: 'employee' } })
  })
  assert.equal(data.user.id, 'employee')
})
test('uses the same origin for profile lookup with an older running API', async () => {
  const calls = []
  const session = await requestSession(async (url, options) => {
    calls.push(url)
    if (url.endsWith('/refresh')) return json({ accessToken: 'token' })
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.equal(options.credentials, 'include')
    return json({ user: { id: 'employee' } })
  })
  assert.deepEqual(calls, ['/api/auth/refresh', '/api/auth/me'])
  assert.equal(session.user.id, 'employee')
})
test('only an invalid session triggers logout; network and server failures are retryable', async () => {
  await assert.rejects(requestSession(async () => json({}, 401)), error => error.unauthenticated === true)
  for (const status of [403, 429, 500, 502, 503]) {
    await assert.rejects(requestSession(async () => json({}, status)), error => !error.unauthenticated)
  }
  await assert.rejects(requestSession(async () => { throw new TypeError('Failed to fetch') }), error => !error.unauthenticated)
  await assert.rejects(requestSession(async () => json({})), error => !error.unauthenticated)
})
