import test from 'node:test'
import assert from 'node:assert/strict'
import { readApiJson } from './apiJson.mjs'

test('HTML responses give actionable errors instead of JSON syntax errors', async () => {
  for (const [status, message] of [[404, /Update and restart/], [502, /unavailable/], [503, /unavailable/], [504, /unavailable/], [200, /proxy/]]) {
    await assert.rejects(readApiJson(new Response('<!DOCTYPE html><html>Error</html>', { status })), message)
  }
})
test('preserves JSON data and API validation errors', async () => {
  assert.deepEqual(await readApiJson(Response.json({ latest: null })), { latest: null })
  await assert.rejects(readApiJson(Response.json({ error: 'Location required', mapping: { serial: 'POS' } }, { status: 400 })), error => error.message === 'Location required' && error.status === 400 && error.mapping.serial === 'POS')
})
