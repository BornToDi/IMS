import { create } from 'zustand'

export const useNotificationStore = create((set) => ({
  notes: [],
  setNotes: (update) => set(state => ({ notes: typeof update === 'function' ? update(state.notes) : update }))
}))
