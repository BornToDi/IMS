import { create } from 'zustand'
import { requestSession } from '../lib/session.mjs'

let refreshPromise = null
const API_BASE_URL = ''

export const useAuthStore = create((set, get) => ({
  user: null,
  activeWorkspace: null,
  accessToken: null,
  sessionError: '',
  sessionExpired: false,
  refreshAccessToken: async () => {
    if (refreshPromise) return refreshPromise
    refreshPromise = (async () => {
      try {
        const data = await requestSession()
        set({ user: data.user, accessToken: data.accessToken, sessionError: '', sessionExpired: false })
        return data.accessToken
      } catch (e) {
        if (e.unauthenticated) set({ user: null, accessToken: null, sessionExpired: true, sessionError: '' })
        else set({ sessionError: e.message || 'Connection interrupted. Please retry.', sessionExpired: false })
        return null
      } finally {
        refreshPromise = null
      }
    })()
    return refreshPromise
  },
  setAuth: (user, token) => {
    set({ user, accessToken: token, sessionError: '', sessionExpired: false })
    // Try to restore workspace selection
    if (typeof window !== 'undefined') {
      try { const saved = localStorage.getItem('activeWorkspace'); if (saved) set({ activeWorkspace: saved }) } catch {}
    }
  },
  setActiveWorkspace: (id) => {
    set({ activeWorkspace: id })
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('activeWorkspace', id)
      } else {
        localStorage.removeItem('activeWorkspace')
      }
    }
  },
  clearAuth: () => {
    set({ user: null, accessToken: null, activeWorkspace: null, sessionError: '', sessionExpired: true })
    if (typeof window !== 'undefined') {
      localStorage.removeItem('activeWorkspace')
    }
  },
  login: async (email, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    })
    if (!res.ok) {
      let body = null
      try { body = await res.json() } catch (e) {}
      throw new Error(body && body.error ? body.error : 'Login failed')
    }
    const data = await res.json()
    set({ user: data.user, accessToken: data.accessToken, sessionError: '', sessionExpired: false })
    return data.user
  },
  register: async (name, email, password, userRole = 'EMPLOYEE', bankName = '') => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, userRole, bankName }),
      credentials: 'include'
    })
    if (!res.ok) {
      let body = null
      try { body = await res.json() } catch (e) {}
      throw new Error(body && body.error ? body.error : 'Registration failed')
    }
    const data = await res.json()
    set({ user: data.user, accessToken: data.accessToken, sessionError: '', sessionExpired: false })
    return data.user
  }
}))
