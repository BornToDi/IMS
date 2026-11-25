import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function worker({ fetcher = async () => new Response('online'), badge = async () => {} } = {}) {
  const handlers = {}, notifications = [], opened = [], saved = [], deleted = []
  const context = {
    URL, Response, fetch: fetcher,
    caches: { open: async () => ({ add: async url => saved.push(url) }), match: async () => new Response('offline'), keys: async () => ['trackfield-offline-v0', 'trackfield-offline-v1', 'other-app-cache'], delete: async key => deleted.push(key) },
    self: { location: { origin: 'https://app.test' }, navigator: { setAppBadge: badge },
      addEventListener: (name, handler) => { handlers[name] = handler },
      registration: { showNotification: async (...args) => notifications.push(args) },
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async url => opened.push(url) },
    },
  }
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context)
  return { handlers, notifications, opened, saved, deleted }
}
test('worker caches only the public offline page and cleans only its previous cache', async () => {
  const w = worker(); let task
  w.handlers.install({ waitUntil: p => { task = p } }); await task
  w.handlers.activate({ waitUntil: p => { task = p } }); await task
  assert.deepEqual(w.saved, ['/offline.html']); assert.deepEqual(w.deleted, ['trackfield-offline-v0'])
})
test('offline navigation falls back without intercepting API, uploads or mutations', async () => {
  const w = worker({ fetcher: async () => { throw new Error('offline') } }); let response
  for (const [url, mode, method] of [['/api/auth/me', 'navigate', 'GET'], ['/uploads/private.pdf', 'navigate', 'GET'], ['/dashboard', 'cors', 'GET'], ['/tickets', 'navigate', 'POST'], ['https://other.test/', 'navigate', 'GET']]) {
    w.handlers.fetch({ request: { url: new URL(url, 'https://app.test').href, mode, method }, respondWith: () => assert.fail('Unexpected interception') })
  }
  w.handlers.fetch({ request: { url: 'https://app.test/dashboard', mode: 'navigate', method: 'GET' }, respondWith: p => { response = p } })
  assert.equal(await (await response).text(), 'offline')
})
test('malformed push data and unavailable badges do not suppress notifications', async () => {
  const w = worker({ badge: async () => { throw new Error('unsupported') } }); let task
  w.handlers.push({ data: { json: () => { throw new Error('text') }, text: () => 'New message' }, waitUntil: p => { task = p } }); await task
  assert.equal(w.notifications[0][1].body, 'New message')
})
test('notification click accepts only same-origin destinations', async () => {
  const w = worker(); let task
  for (const url of ['https://evil.test/', 'javascript:alert(1)', '/tickets/123']) {
    w.handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: p => { task = p } }); await task
  }
  assert.deepEqual(w.opened, ['https://app.test/', 'https://app.test/', 'https://app.test/tickets/123'])
})
