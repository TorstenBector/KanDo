import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }

// Public page, no login — opened via a "?dela=TOKEN" link created in
// ShareListManager. Anyone with the link can accept the list and check
// items off; both actions write back to the real KanDo through narrow
// SECURITY DEFINER RPCs (get_shared_list / accept_shared_list /
// complete_shared_item) rather than any direct table access.
export default function SharedListPage({ token }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)
  const [name, setName] = useState('')
  const [busyItemId, setBusyItemId] = useState(null)
  const [accepting, setAccepting] = useState(false)

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

  async function handleAccept() {
    setAccepting(true)
    await supabase.rpc('accept_shared_list', { p_token: token, p_name: name.trim() || 'Någon' })
    await load()
    setAccepting(false)
  }

  async function toggleItem(itemId, currentlyDone) {
    setBusyItemId(itemId)
    await supabase.rpc('complete_shared_item', { p_token: token, p_item_id: itemId, p_done: !currentlyDone })
    await load()
    setBusyItemId(null)
  }

  if (rows === null) {
    return <PageShell><p style={{ color: theme.colors.textMuted }}>Laddar…</p></PageShell>
  }

  if (error) {
    return (
      <PageShell>
        <p style={{ color: theme.colors.textMuted }}>
          Den här länken är ogiltig eller har tagits bort.
        </p>
      </PageShell>
    )
  }

  const { list_title: title, accepted_by: acceptedBy, accepted_at: acceptedAt } = rows[0]
  const doneCount = rows.filter((r) => r.item_status === 'klar').length

  return (
    <PageShell>
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', color: theme.colors.primaryDark }}>
        {title || 'Delad lista'}
      </h1>
      <p style={{ margin: '0 0 1rem', color: theme.colors.textMuted, fontSize: '0.9rem' }}>
        {doneCount} av {rows.length} klara
      </p>

      {acceptedBy ? (
        <div
          style={{
            background: theme.colors.surfaceGreen,
            border: `1px solid ${theme.colors.success}`,
            borderRadius: theme.radius.sm,
            padding: '0.6rem 0.8rem',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            color: theme.colors.text,
          }}
        >
          ✓ Åtagen av <strong>{acceptedBy}</strong> ({new Date(acceptedAt).toLocaleDateString('sv-SE')})
        </div>
      ) : (
        <div
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            padding: '0.7rem 0.9rem',
            marginBottom: '1rem',
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ditt namn (valfritt)"
            style={{
              flex: 1,
              minWidth: '140px',
              padding: '0.4rem 0.6rem',
              borderRadius: theme.radius.sm,
              border: `1px solid ${theme.colors.border}`,
              fontSize: '0.9rem',
            }}
          />
          <button onClick={handleAccept} disabled={accepting} style={primaryBtn}>
            {accepting ? 'Åtar…' : 'Jag tar den här listan ✓'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map((row) => {
          const done = row.item_status === 'klar'
          const busy = busyItemId === row.item_id
          return (
            <div
              key={row.item_id}
              style={{
                background: done ? theme.colors.surfaceGreen : theme.colors.surface,
                border: `1px solid ${done ? theme.colors.success : theme.colors.border}`,
                borderRadius: theme.radius.sm,
                padding: '0.6rem 0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                opacity: busy ? 0.6 : 1,
              }}
            >
              <button
                onClick={() => toggleItem(row.item_id, done)}
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
              <div style={{ flex: 1 }}>
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
          )
        })}
      </div>
    </PageShell>
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

const primaryBtn = {
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  border: 'none',
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontWeight: 600,
  flexShrink: 0,
}
