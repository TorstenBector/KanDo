// Planeringsförslag mellan kopplade konton — online-only via RPC:er, se
// supabase/migrations/20261123020000_plugg_suggestions.sql.
import { supabase } from './supabaseClient'

function fail(error) {
  throw new Error(error.message || 'Något gick fel')
}

export async function sendSuggestion(toUserId, activity, message) {
  const { data, error } = await supabase.rpc('send_plugg_suggestion', {
    p_to: toUserId,
    p_title: activity.title,
    p_description: activity.description ?? '',
    p_end_date: activity.end_date || null,
    p_schedule: activity.schedule ?? [],
    p_message: message ?? '',
  })
  if (error) fail(error)
  // Pushnotis till mottagaren — best-effort, förslaget är redan skickat.
  supabase.functions.invoke('plugg-push', { body: { action: 'suggestion', suggestionId: data } }).catch(() => {})
  return data
}

export async function listSuggestions() {
  const { data, error } = await supabase.rpc('list_plugg_suggestions')
  if (error) fail(error)
  return data ?? []
}

export async function respondSuggestion(id, accept) {
  const { error } = await supabase.rpc('respond_plugg_suggestion', { p_id: id, p_accept: accept })
  if (error) fail(error)
}

export async function withdrawSuggestion(id) {
  const { error } = await supabase.from('plugg_suggestions').delete().eq('id', id)
  if (error) fail(error)
}
