import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const NAME_KEY = 'kando_shared_name'

// Public page, no login — opened via a "?dela=TOKEN" link created in
// ShareListManager. Several people can open the SAME link and each claim a
// different item off it (like drawing a card off a board) — "Jag tar den
// här" writes their name onto the real item so it shows in the owner's own
// app too, everyone else sees it's spoken for, and clicking a card opens
// the whole thing (description, tags, subtasks) read-only. All three
// actions go through narrow SECURITY DEFINER RPCs, never direct table
// access — see the per_item_claim migration.
export default function SharedListPage({ token }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [myName, setMyName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
  })
  const [busyItemId, setBusyItemId] = useState(null)
  const [detailItemId, setDetailItemId] = useState(null)

  async function load() {
    const { data, error: err } = await supabase.rpc('get_shared_list', { p_token: token })
    if (err || !data || data.length === 0) {
      setError(true)
      setRows([])
      return
    }
    setRows(data)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function rememberName(name) {
    setMyName(name)
    try { localStorage.setItem(NAME_KEY, name) } catch { /* private mode etc. — just won't persist */ }
  }

  async function claim(itemId, name) {
    setBusyItemId(itemId)
    await supabase.rpc('claim_shared_item', { p_token: token, p_item_id: itemId, p_name: name })
    await load()
    setBusyItemId(null)
  }

  async function toggleDone(itemId, currentlyDone) {
    setBusyItemId(itemId)
    await supabase.rpc('complete_shared_item', { p_token: token, p_item_id: itemId, p_done: !currentlyDone })
    await load()
    setBusyItemId(null)
  }

  if (rows === null) {
    return <PageShell><p style={{ color: theme.colors.textMuted }}>Laddar…</p></PageShell>
  }
  if (error) {
    return <PageShell><p style={{ color: theme.colors.textMuted }}>Den här länken är ogiltig eller har tagits bort.</p></PageShell>
  }

  const title = rows[0]?.list_title || 'Delad lista'
  const doneCount = rows.filter((r) => r.item_status === 'klar').length

  return (
    <PageShell>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', color: theme.colors.primaryDark }}>{title}</h1>
      <p style={{ margin: '0 0 1rem', color: theme.colors.textMuted, fontSize: '0.9rem' }}>
        {doneCount} av {rows.length} klara
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map((row) => (
          <SharedRow
            key={row.item_id}
            row={row}
            myName={myName}
            busy={busyItemId === row.item_id}
            onClaim={(name) => claim(row.item_id, name)}
            onRelease={() => claim(row.item_id, '')}
            onToggleDone={() => toggleDone(row.item_id, row.item_status === 'klar')}
            onOpenDetail={() => setDetailItemId(row.item_id)}
            onNameChange={rememberName}
          />
        ))}
      </div>

      {detailItemId && (
        <SharedItemDetailModal token={token} itemId={detailItemId} onClose={() => setDetailItemId(null)} />
      )}
    </PageShell>
  )
}

function SharedRow({ row, myName, busy, onClaim, onRelease, onToggleDone, onOpenDetail, onNameChange }) {
  const [nameDraft, setNameDraft] = useState(myName)
  const done = row.item_status === 'klar'
  const claimedByMe = row.claimed_by && row.claimed_by === myName

  return (
    <div
      style={{
        background: done ? theme.colors.surfaceGreen : theme.colors.surface,
        border: `1px solid ${done ? theme.colors.success : theme.colors.border}`,
        borderRadius: theme.radius.sm,
        padding: '0.6rem 0.8rem',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <button
          onClick={onToggleDone}
          disabled={busy}
          title={done ? 'Ångra' : 'Markera som klar'}
          style={{
            border: `1.5px solid ${theme.colors.success}`,
            background: done ? theme.colors.success : theme.colors.bg,
            borderRadius: '50%',
            width: '1.3rem',
            height: '1.3rem',
            flexShrink: 0,
            cursor: 'pointer',
            padding: 0,
            color: done ? '#fff' : theme.colors.success,
            fontSize: '0.8rem',
            fontWeight: 700,
          }}
        >
          ✓
        </button>
        <div onClick={onOpenDetail} style={{ flex: 1, cursor: 'pointer' }}>
          <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
            {TYPE_LABEL[row.item_type]}
          </div>
          <div
            style={{
              color: done ? theme.colors.textMuted : theme.colors.text,
              fontWeight: 500,
              textDecoration: done ? 'line-through' : 'none',
            }}
          >
            {row.item_title}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {row.claimed_by ? (
          <>
            <span style={{ fontSize: '0.8rem', color: theme.colors.text }}>
              🙋 Tagen av <strong>{row.claimed_by}</strong>
            </span>
            {claimedByMe && (
              <button onClick={onRelease} disabled={busy} style={miniBtn}>Släpp</button>
            )}
          </>
        ) : (
          <>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Ditt namn"
              style={{
                fontSize: '0.8rem',
                padding: '0.25rem 0.5rem',
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.border}`,
                width: '110px',
              }}
            />
            <button
              onClick={() => { onNameChange(nameDraft.trim()); onClaim(nameDraft.trim() || 'Någon') }}
              disabled={busy || !nameDraft.trim()}
              style={{ ...miniBtn, background: theme.colors.primary, color: theme.colors.textOnPrimary, borderColor: theme.colors.primary }}
            >
              🙋 Ta den här
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SharedItemDetailModal({ token, itemId, onClose }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_shared_item_detail', { p_token: token, p_item_id: itemId }).then(({ data }) => {
      if (!cancelled) setDetail(data?.[0] ?? null)
    })
    return () => { cancelled = true }
  }, [token, itemId])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(26,58,26,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg,
          borderRadius: `${theme.radius.lg} ${theme.radius.lg} 0 0`,
          padding: '1rem',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: theme.shadow.md,
          boxSizing: 'border-box',
        }}
      >
        {!detail ? (
          <p style={{ color: theme.colors.textMuted }}>Laddar…</p>
        ) : (
          <>
            <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted, textTransform: 'uppercase' }}>
              {TYPE_LABEL[detail.item_type]}
            </div>
            <h2 style={{ margin: '0.2rem 0 0.6rem', fontSize: '1.15rem', color: theme.colors.text }}>
              {detail.item_title}
            </h2>

            {detail.claimed_by && (
              <p style={{ fontSize: '0.85rem', color: theme.colors.text, margin: '0 0 0.6rem' }}>
                🙋 Tagen av <strong>{detail.claimed_by}</strong>
              </p>
            )}

            {detail.item_description && (
              <p style={{ fontSize: '0.9rem', color: theme.colors.text, whiteSpace: 'pre-wrap', margin: '0 0 0.75rem' }}>
                {detail.item_description}
              </p>
            )}

            {detail.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {detail.tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                      background: tag.kind === 'context' ? theme.colors.accentSoft : theme.colors.surfaceGreen,
                      color: theme.colors.text,
                    }}
                  >
                    {tag.kind === 'context' ? '📍 ' : '🏷 '}{tag.name}
                  </span>
                ))}
              </div>
            )}

            {detail.children?.length > 0 && (
              <>
                <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted, fontWeight: 600, margin: '0 0 0.3rem' }}>
                  Deluppgifter
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                  {detail.children.map((child, i) => {
                    const childDone = child.status === 'klar'
                    return (
                      <div
                        key={i}
                        style={{
                          fontSize: '0.85rem',
                          color: childDone ? theme.colors.textMuted : theme.colors.text,
                          textDecoration: childDone ? 'line-through' : 'none',
                        }}
                      >
                        {childDone ? '✓' : '○'} {child.title}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <button onClick={onClose} style={{ ...primaryBtn, marginTop: '0.5rem' }}>Stäng</button>
          </>
        )}
      </div>
    </div>
  )
}

function PageShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg, padding: '1.5rem 1rem' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted, marginBottom: '0.5rem' }}>
          🔗 Delad från KanDo
        </div>
        {children}
      </div>
    </div>
  )
}

const miniBtn = {
  fontSize: '0.75rem',
  border: `1px solid ${theme.colors.border}`,
  background: 'transparent',
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  padding: '0.25rem 0.6rem',
  cursor: 'pointer',
}

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontWeight: 600,
  width: '100%',
}
