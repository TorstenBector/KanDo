import { create } from 'zustand'

export const useSyncStore = create((set) => ({
  isOnline: navigator.onLine,
  isAuthenticated: false,
  pendingCount: 0,
  lastSyncedAt: null,
  syncing: false,

  setOnline: (isOnline) => set({ isOnline }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setSyncing: (syncing) => set({ syncing }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}))

window.addEventListener('online', () => useSyncStore.getState().setOnline(true))
window.addEventListener('offline', () => useSyncStore.getState().setOnline(false))
