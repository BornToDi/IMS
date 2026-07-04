import { useAuthStore } from '../store/useAuthStore'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''
export const SOCKET_BASE_URL = API_BASE_URL || undefined

export function authHeaders(token, extra = {}) {
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

export async function apiFetch(path, token, options = {}) {
  async function request(accessToken) {
    return fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...options,
      headers: authHeaders(accessToken, options.headers || {})
    })
  }

  let res = await request(token)
  if (res.status === 401) {
    const nextToken = await useAuthStore.getState().refreshAccessToken()
    if (nextToken) res = await request(nextToken)
  }

  if (!res.ok) {
    let body = {}
    try { body = await res.json() } catch (e) {}
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function dateInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

export function formatShortDate(value) {
  if (!value) return 'No due date'
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}
