export function androidAssociation(packageName, fingerprints = '') {
  const name = String(packageName || '').trim()
  const hashes = String(fingerprints).split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(name) || !hashes.length || hashes.some(hash => !/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(hash))) return null
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: {
    namespace: 'android_app', package_name: name, sha256_cert_fingerprints: [...new Set(hashes)],
  } }]
}
