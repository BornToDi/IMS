import { readApiJson } from './apiJson.mjs'

export async function requestSession(fetcher = fetch) {
  const response = await fetcher('/api/auth/refresh', { method: 'POST', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Please sign in again.' : 'Cannot reach the session service. Please retry.'), { unauthenticated: response.status === 401 })
  const data = await readApiJson(response)
  if (!data.accessToken) throw new Error('The session service returned an invalid response. Please retry.')
  // Compatibility while the frontend and backend are being restarted separately.
  if (!data.user) {
    const me = await fetcher('/api/auth/me', { headers: { Authorization: `Bearer ${data.accessToken}` }, credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!me.ok) throw Object.assign(new Error('Could not restore your profile. Please retry.'), { unauthenticated: me.status === 401 })
    data.user = (await readApiJson(me)).user
  }
  if (!data.user?.id) throw new Error('Could not restore your profile. Please retry.')
  return data
}
