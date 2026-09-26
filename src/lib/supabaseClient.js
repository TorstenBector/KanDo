import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Utan tidsgräns kan en enda förfrågan som fastnar på ett segt mobilnät
// hänga i evighet — och eftersom sync() inte startar om medan en synk
// pågår satt appen då fast i "Synkar…", där varken "Synka nu" eller en
// omladdning hjälpte. Efter 30 s avbryts förfrågan och blir ett vanligt
// synkfel som nästa synk försöker om.
const REQUEST_TIMEOUT_MS = 30_000

function fetchWithTimeout(input, init = {}) {
  if (typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return fetch(input, init)
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = init.signal && AbortSignal.any ? AbortSignal.any([init.signal, timeout]) : (init.signal ?? timeout)
  return fetch(input, { ...init, signal })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
})
