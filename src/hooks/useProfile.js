import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Profile is server-only (no offline path) — registration inherently
// requires connectivity anyway, same as the magic-link login it follows.
export function useProfile(session) {
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = none yet
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setProfile(undefined)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setProfile(data ?? null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [session])

  async function saveProfile({ alias, phone }) {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: session.user.id, alias, phone: phone || null })
      .select()
      .single()
    if (!error) setProfile(data)
    return { error }
  }

  return { profile, loading, saveProfile }
}
