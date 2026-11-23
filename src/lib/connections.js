// Kopplade konton (t.ex. förälder ↔ barn) — online-only via RPC:er, se
// supabase/migrations/20261123010000_kando_connections.sql.
import { supabase } from './supabaseClient'

const PENDING_INVITE_KEY = 'kando-pending-invite'

export function inviteUrl(token) {
  return `${window.location.origin}/?koppla=${token}`
}

export function inviteMessage(token, fromName) {
  return [
    `Hej! ${fromName ? `${fromName} har` : 'Jag har'} bjudit in dig till KanDo — en app som hjälper dig planera pluggandet och påminner dig inför varje pass.`,
    '',
    `Öppna länken och logga in med din e-post: ${inviteUrl(token)}`,
    '',
    `Kod (om länken inte fungerar): ${token}`,
  ].join('\n')
}

// Inbjudningskoden från länken sparas tills den inbjudna loggat in —
// inloggningslänken i mejlet tar inte med ?koppla= tillbaka till appen.
export function rememberPendingInvite(token) {
  try { localStorage.setItem(PENDING_INVITE_KEY, token.trim().toUpperCase()) } catch { /* privat läge */ }
}

export function readPendingInvite() {
  try { return localStorage.getItem(PENDING_INVITE_KEY) } catch { return null }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(PENDING_INVITE_KEY) } catch { /* privat läge */ }
}

function fail(error) {
  // Felmeddelanden från RPC:erna är redan på svenska (raise exception).
  throw new Error(error.message || 'Något gick fel')
}

export async function createInvite(label) {
  const { data, error } = await supabase.rpc('create_connection_invite', { p_label: label })
  if (error) fail(error)
  return data?.[0]
}

export async function getInvite(token) {
  const { data, error } = await supabase.rpc('get_connection_invite', { p_token: token })
  if (error) fail(error)
  return data?.[0] ?? { status: 'unknown' }
}

export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc('accept_connection_invite', { p_token: token })
  if (error) fail(error)
  return data?.[0]
}

export async function listConnections() {
  const { data, error } = await supabase.rpc('list_my_connections')
  if (error) fail(error)
  return data ?? []
}

export async function removeConnection(id) {
  const { error } = await supabase.from('kando_connections').delete().eq('id', id)
  if (error) fail(error)
}
