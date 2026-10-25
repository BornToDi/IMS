import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePlaceName, getCurrentLocationWithPlace } from './location.js'

test('deployed location lookup uses the website origin, retries failures and preserves current coordinates', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalClock = Date.now
  const originalApi = process.env.NEXT_PUBLIC_API_URL
  let clock = Date.now()
  let calls = 0
  let fail = true
  const cached = new Map()
  globalThis.window = { isSecureContext: true, localStorage: { getItem: key => cached.get(key), setItem: (key, value) => cached.set(key, value) } }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en', geolocation: { getCurrentPosition: (success, error, options) => {
    assert.equal(options.maximumAge, 0)
    success({ coords: { latitude: 23.8103, longitude: 90.4125 } })
  } } } })
  Date.now = () => clock
  process.env.NEXT_PUBLIC_API_URL = 'http://old-deployment.invalid'
  globalThis.fetch = async url => {
    assert.ok(url.startsWith('/api/location/reverse?'))
    calls++
    return fail ? new Response('{}', { status: 503, headers: { 'Retry-After': '60' } }) : new Response(JSON.stringify({ name: 'Joar Sahara' }))
  }
  try {
    assert.equal(await resolvePlaceName(23.8103, 90.4125), 'Tap to view exact location')
    assert.equal(await resolvePlaceName(23.8103, 90.4125), 'Tap to view exact location')
    assert.equal(calls, 1)
    assert.equal(cached.size, 0)
    clock += 61000
    fail = false
    assert.deepEqual(await getCurrentLocationWithPlace({ maximumAge: 0 }), { latitude: 23.8103, longitude: 90.4125, locationLabel: 'Joar Sahara' })
    assert.equal(calls, 2)
    assert.equal(await resolvePlaceName(23.8103, 90.4125), 'Joar Sahara')
    assert.equal(calls, 2)
    window.isSecureContext = false
    await assert.rejects(getCurrentLocationWithPlace(), /HTTPS/)
    window.isSecureContext = true
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      assert.equal(options.enableHighAccuracy, true)
      assert.equal(options.maximumAge, 0)
      assert.equal(options.timeout, 12000)
      error({ message: 'Location permission denied' })
    }
    await assert.rejects(getCurrentLocationWithPlace({ maximumAge: 0 }), /permission denied/)
    navigator.geolocation.getCurrentPosition = (success, error) => error({ message: 'Location request timed out' })
    await assert.rejects(getCurrentLocationWithPlace({ maximumAge: 0 }), /timed out/)
    navigator.geolocation.getCurrentPosition = success => success({ coords: { latitude: 23.76, longitude: 90.36 } })
    fail = true
    assert.deepEqual(await getCurrentLocationWithPlace({ maximumAge: 0 }), {
      latitude: 23.76, longitude: 90.36, locationLabel: 'Tap to view exact location'
    })
    navigator.geolocation = undefined
    await assert.rejects(getCurrentLocationWithPlace(), /not supported/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
    Date.now = originalClock
    if (originalApi === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = originalApi
  }
})
