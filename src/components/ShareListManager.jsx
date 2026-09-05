import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useTags } from '../hooks/useTags'
import { useSyncStore } from '../store/syncStore'
import { supabase } from '../lib/supabaseClient'
import { theme } from '../theme'

// Sharing is online-only by design (unlike the rest of the app) — a share
// is meaningless until it exists server-side for someone else to open, so
// this talks to Supabase directly instead of going through the local-first
// Dexie/sync plumbing used everywhere else.
export default function ShareListManager() {
  const session = useSyncStore((s) => s.session)
  const categoryTags = useTags('category') ?? []
  const contextTags = useTags('context') ?? []
  const allTags = [...categoryTags, ...contextTags]
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyTagId, setBusyTagId] = useState(null)
  const [copiedToken, setCopiedToken] = useState(null)

  // How many items with this tag are already claimed — read straight from
  // Dexie (local-first) rather than a network round-trip, since claiming
  // syncs back into the same items table this app already watches.
  const claimSummaryByTag = useLiveQuery(async () => {
    const links = await db.item_tags.toArray()
    const byTag = new Map()
    for (const link of links) {
      if (!byTag.has(link.tag_id)) byTag.set(link.tag_id, [])
      byTag.get(link.tag_id).push(link.item_id)
    }
    const result = new Map()
    for (const [tagId, itemIds] of byTag) {
      const items = (await db.items.bulkGet(itemIds)).filter(Boolean)
      result.set(tagId, { total: items.length, claimed: items.filter((i) => i.claimed_by).length })
    }
    return result
  }, []) ?? new Map()

  async function loadShares() {
    if (!session) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('shared_lists').select('*').order('created_at', { ascending: false })
    setShares(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadShares()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  function shareUrlFor(token) {
    return `${window.location.origin}${window.location.pathname}?dela=${token}`
  }

  async function createShare(tag) {
    setBusyTagId(tag.id)
    const token = crypto.randomUUID().replace(/-/g, '')
    await supabase.from('shared_lists').insert({
      user_id: session.user.id,
      tag_id: tag.id,
      token,
      title: tag.name,
    })
    await loadShares()
    setBusyTagId(null)
  }

  async function deleteShare(id) {
    if (!window.confirm('Ta bort den delade länken? Den slutar fungera direkt.')) return
    setBusyTagId(id)
    await supabase.from('shared_lists').delete().eq('id', id)
    await loadShares()
    setBusyTagId(null)
  }

  async function copyLink(token) {
    try {
      await navigator.clipboard.writeText(shareUrlFor(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the link
      // is still shown as selectable text below, so nothing is lost.
    }
  }

  if (!session) {
    return (
      <div style={{ padding: '1rem' }}>
        <p style={{ color: theme.colors.textMuted }}>
          Du behöver vara inloggad för att dela listor — mottagaren behöver inget konto, men länken skapas mot ditt.
        </p>
      </div>
    )
  }

  if (loading) return <div style={{ padding: '1rem' }} />

  return (
    <div style={{ padding: '1rem' }}>
      <p style={{ color: theme.colors.textMuted, fontSize: '0.9rem', margin: '0 0 1rem' }}>
        Dela allt som har en viss tagg som en offentlig länk. Flera personer kan öppna samma länk och var och en
        plockar sin egen KanDo — vem som tagit vad syns direkt i din egen app.
      </p>

      {allTags.length === 0 && (
        <p style={{ color: theme.colors.textMuted }}>Inga taggar än — lägg en tagg på några KanDo's först.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {allTags.map((tag) => {
          const share = shares.find((s) => s.tag_id === tag.id)
          const busy = busyTagId === tag.id || busyTagId === share?.id
          const summary = claimSummaryByTag.get(tag.id)
          return (
            <div
              key={tag.id}
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.sm,
                padding: '0.7rem 0.9rem',
                boxShadow: theme.shadow.sm,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: share ? '0.5rem' : 0 }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '999px',
                    background: tag.kind === 'context' ? theme.colors.accentSoft : theme.colors.surfaceGreen,
                    color: theme.colors.text,
                  }}
                >
                  {tag.kind === 'context' ? '📍 ' : ''}{tag.name}
                </span>
                {!share && (
                  <button onClick={() => createShare(tag)} disabled={busy} style={{ ...secondaryBtn, marginLeft: 'auto' }}>
                    {busy ? 'Skapar…' : '🔗 Skapa delad länk'}
                  </button>
                )}
                {share && (
                  <button
                    onClick={() => deleteShare(share.id)}
                    disabled={busy}
                    style={{ ...secondaryBtn, marginLeft: 'auto', color: theme.colors.danger, borderColor: theme.colors.danger }}
                  >
                    Ta bort delning
                  </button>
                )}
              </div>

              {share && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      readOnly
                      value={shareUrlFor(share.token)}
                      onFocus={(e) => e.target.select()}
                      style={{
                        flex: 1,
                        minWidth: '200px',
                        fontSize: '0.8rem',
                        padding: '0.35rem 0.5rem',
                        borderRadius: theme.radius.sm,
                        border: `1px solid ${theme.colors.border}`,
                        background: theme.colors.bg,
                        color: theme.colors.textMuted,
                      }}
                    />
                    <button onClick={() => copyLink(share.token)} style={secondaryBtn}>
                      {copiedToken === share.token ? '✓ Kopierad' : 'Kopiera länk'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: theme.colors.textMuted }}>
                    {summary && summary.total > 0
                      ? `🙋 ${summary.claimed} av ${summary.total} KanDo${summary.total === 1 ? '' : 's'} tagna`
                      : 'Inga KanDo’s med den här taggen ännu.'}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.35rem 0.7rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  flexShrink: 0,
}
