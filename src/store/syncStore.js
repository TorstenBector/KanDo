import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'
import { claimLocalData, runFullSync, pushPendingChanges } from '../lib/sync'

export const useSyncStore = create((set, get) => ({
  isOnline: navigator.onLine,
  session: null,
  syncing: false,
  lastSyncedAt: null,
  pendingCount: 0,
  authMessage: null,

  setOnline: (isOnline) => set({ isOnline }),

  async init() {
    const { data } = await supabase.auth.getSession()
    set({ session: data.session })
    if (data.session) get().sync()

    supabase.auth.onAuthStateChange(async (_event, session) => {
      const wasLoggedOut = !get().session
      set({ session })
      if (session && wasLoggedOut) {
        await claimLocalData(session.user.id)
      }
      if (session) get().sync()
    })
  },

  async sendMagicLink(email) {
    set({ authMessage: null })
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    set({ authMessage: error ? `Fel: ${error.message}` : 'Kolla din mail för inloggningslänken.' })
    return !error
  },

  async signOut() {
    await supabase.auth.signOut()
    set({ session: null })
  },

  async sync() {
    const { session, isOnline, syncing } = get()
    if (!session || !isOnline || syncing) return
    set({ syncing: true })
    try {
      await runFullSync(session.user.id)
      set({ lastSyncedAt: new Date().toISOString() })
    } finally {
      set({ syncing: false })
    }
  },

  async pushOnly() {
    const { session, isOnline } = get()
    if (!session || !isOnline) return
    await pushPendingChanges(session.user.id)
  },
}))

window.addEventListener('online', () => {
  useSyncStore.getState().setOnline(true)
  useSyncStore.getState().sync()
})
window.addEventListener('offline', () => useSyncStore.getState().setOnline(false))
