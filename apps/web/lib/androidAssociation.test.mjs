import test from 'node:test'
import assert from 'node:assert/strict'
import { androidAssociation } from './androidAssociation.mjs'

const hash = Array(32).fill('AB').join(':')
test('Android association requires an explicit valid package and signing certificate', () => {
  for (const [name, value] of [[undefined, undefined], ['com.example.app', ''], ['bad/package', hash], ['com.example.app', 'AB:CD'], ['com.example.app', hash + ',invalid']]) assert.equal(androidAssociation(name, value), null)
})
test('Android association supports Play and debug certificates without duplicate entries', () => {
  const other = Array(32).fill('CD').join(':')
  const result = androidAssociation('com.trackfield.app', `${hash.toLowerCase()}, ${other},${hash}`)
  assert.equal(result[0].target.package_name, 'com.trackfield.app')
  assert.deepEqual(result[0].target.sha256_cert_fingerprints, [hash, other])
  assert.deepEqual(result[0].relation, ['delegate_permission/common.handle_all_urls'])
})
