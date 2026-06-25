import { create } from 'zustand'
import { useEffect } from 'react'

export const useAuthStore = create((set, get) => ({
  user: null,
  activeWorkspace: null,
  accessToken: null,
  refreshAccessToken: async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      })
      if (!res.ok) {
        set({ user: null, accessToken: null })
        return null
      }
      const data = await res.json()
      set({ accessToken: data.accessToken })
      return data.accessToken
    } catch (e) {
      set({ user: null, accessToken: null })
      return null
    }
  },
  setAuth: (user, token) => {
    set({ user, accessToken: token })
    // Try to restore workspace selection
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('activeWorkspace')
      if (saved) set({ activeWorkspace: saved })
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
    set({ user: null, accessToken: null, activeWorkspace: null })
    if (typeof window !== 'undefined') {
      localStorage.removeItem('activeWorkspace')
    }
  },
  login: async (email, password) => {
    const res = await fetch('/api/auth/login', {
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
    set({ user: data.user, accessToken: data.accessToken })
    return data.user
  },
  register: async (name, email, password, userRole = 'EMPLOYEE', bankName = '') => {
    const res = await fetch('/api/auth/register', {
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
    set({ user: data.user, accessToken: data.accessToken })
    return data.user
  }
}))
