import { create } from 'zustand'
import { supabase } from '../lib/supabaseClient'
import { claimLocalData, runFullSync, pushPendingChanges } from '../lib/sync'

export const useSyncStore = create((set, get) => ({
  isOnline: navigator.onLine,
  session: null,
  syncing: false,
  lastSyncedAt: null,
  syncError: null,
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

  // Same persisted-session mechanism as magic link (Supabase client keeps
  // both logged in the same way) — the point of a password is skipping the
  // email round-trip on a *new* device, not "staying logged in" itself.
  async signInWithPassword(email, password) {
    set({ authMessage: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) set({ authMessage: `Fel: ${error.message}` })
    return !error
  },

  async setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  },

  async signOut() {
    await supabase.auth.signOut()
    set({ session: null })
  },

  // Deliberately NOT gated on `isOnline` — that flag comes from
  // navigator.onLine, which is known to misreport (especially on mobile:
  // can say "offline" while genuinely connected). A silent no-op there
  // is exactly what looked like "sync button does nothing". Let the real
  // network call decide; if it fails, surface why instead of staying quiet.
  async sync() {
    const { session, syncing } = get()
    if (!session || syncing) return
    set({ syncing: true, syncError: null })
    try {
      await runFullSync(session.user.id)
      set({ lastSyncedAt: new Date().toISOString() })
    } catch (err) {
      set({ syncError: err?.message || 'Okänt fel vid synk' })
    } finally {
      set({ syncing: false })
    }
  },

  async pushOnly() {
    const { session } = get()
    if (!session) return
    try {
      await pushPendingChanges(session.user.id)
      set({ syncError: null })
    } catch (err) {
      set({ syncError: err?.message || 'Okänt fel vid synk' })
    }
  },
}))

window.addEventListener('online', () => {
  useSyncStore.getState().setOnline(true)
  useSyncStore.getState().sync()
})
window.addEventListener('offline', () => useSyncStore.getState().setOnline(false))
