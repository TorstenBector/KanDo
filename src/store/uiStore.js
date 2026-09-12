import { create } from 'zustand'

// Per-device display preference (not synced) — whether the PC/desktop is
// showing this instead of desktop stays a property of the screen you're on,
// not of the account.
const STORAGE_KEY = 'kando_mobile_look'

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const useUiStore = create((set) => ({
  mobileLook: readStored(),
  toggleMobileLook: () =>
    set((s) => {
      const next = !s.mobileLook
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // best-effort; falls back to session-only if storage is unavailable
      }
      return { mobileLook: next }
    }),
}))
