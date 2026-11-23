import { useCallback, useEffect, useState } from 'react'
import { acceptInvite, createInvite, inviteMessage, inviteUrl, listConnections, removeConnection } from '../lib/connections'
import { useSyncStore } from '../store/syncStore'
import { useProfile } from '../hooks/useProfile'
import SmsSendModal from './SmsSendModal'
import { theme } from '../theme'

// Kopplade konton i Plugg: bjud in (länk + kod), se vilka som är kopplade,
// och ange en kod man fått. Grunden för delning och utmaningar.
export default function ConnectionsPanel() {
  const session = useSyncStore((s) => s.session)
  const { profile } = useProfile(session)
  const [connections, setConnections] = useState(null)
  const [error, setError] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [label, setLabel] = useState('')
  const [shareFor, setShareFor] = useState(null) // { token, name }
  const [code, setCode] = useState('')
  const [codeMessage, setCodeMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setConnections(await listConnections())
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined
    let alive = true
    listConnections().then(
      (list) => { if (alive) setConnections(list) },
      (err) => { if (alive) setError(err.message) },
    )
    return () => { alive = false }
  }, [session])

  if (!session) {
    return (
      <div style={box}>
        <div style={heading}>👨‍👦 Kopplade konton</div>
        <div style={muted}>Logga in för att bjuda in någon, t.ex. ditt barn eller en förälder.</div>
      </div>
    )
  }

  async function create() {
    setBusy(true)
    try {
      const invite = await createInvite(label)
      setShareFor({ token: invite.token, name: label.trim() || 'den inbjudna' })
      setInviting(false)
      setLabel('')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function redeemCode() {
    if (!code.trim()) return
    setBusy(true)
    setCodeMessage(null)
    try {
      const res = await acceptInvite(code)
      setCodeMessage(`✓ Du är nu kopplad till ${res?.inviter_alias ?? 'den som bjöd in dig'}.`)
      setCode('')
      await reload()
    } catch (err) {
      setCodeMessage(`⚠ ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(c) {
    const what = c.accepted_at ? `kopplingen till ${c.other_name}` : `inbjudan till ${c.other_name}`
    if (!window.confirm(`Ta bort ${what}?`)) return
    try {
      await removeConnection(c.id)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const accepted = (connections ?? []).filter((c) => c.accepted_at)
  const pending = (connections ?? []).filter((c) => !c.accepted_at && c.i_invited)

  return (
    <div style={box}>
      <div style={heading}>👨‍👦 Kopplade konton</div>

      {error && <div style={{ color: theme.colors.danger, fontSize: '0.85rem' }}>⚠ {error}</div>}

      {accepted.length === 0 && pending.length === 0 && connections && (
        <div style={muted}>Bjud in ditt barn (eller en förälder) så kan ni dela pluggplaner och utmana varandra.</div>
      )}

      {accepted.map((c) => (
        <div key={c.id} style={row}>
          <span style={{ flex: 1 }}>✓ <strong>{c.other_name}</strong></span>
          <button onClick={() => remove(c)} style={linkBtn}>Ta bort</button>
        </div>
      ))}

      {pending.map((c) => (
        <div key={c.id} style={row}>
          <span style={{ flex: 1, minWidth: 0 }}>
            ⏳ <strong>{c.other_name}</strong>{' '}
            <span style={muted}>
              {new Date(c.expires_at) < new Date() ? '· inbjudan har gått ut' : `· väntar · kod ${c.token}`}
            </span>
          </span>
          {new Date(c.expires_at) >= new Date() && (
            <button onClick={() => setShareFor({ token: c.token, name: c.other_name })} style={smallBtn}>Skicka igen</button>
          )}
          <button onClick={() => remove(c)} style={linkBtn}>Ta bort</button>
        </div>
      ))}

      {inviting ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            placeholder="Namn, t.ex. Viktor"
            style={{ ...input, flex: 1 }}
          />
          <button disabled={busy} onClick={create} style={primaryBtn}>Skapa inbjudan</button>
          <button onClick={() => setInviting(false)} style={linkBtn}>Avbryt</button>
        </div>
      ) : (
        <button onClick={() => setInviting(true)} style={{ ...primaryBtn, alignSelf: 'flex-start' }}>+ Bjud in</button>
      )}

      {shareFor && (
        <InviteShare token={shareFor.token} name={shareFor.name} fromName={profile?.alias} onClose={() => setShareFor(null)} />
      )}

      <details style={{ fontSize: '0.85rem' }}>
        <summary style={{ cursor: 'pointer', color: theme.colors.textMuted }}>Har du fått en inbjudningskod?</summary>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Kod, t.ex. K7PQ2MXR4T"
            style={{ ...input, flex: 1, letterSpacing: '0.05em' }}
          />
          <button disabled={busy || !code.trim()} onClick={redeemCode} style={primaryBtn}>Koppla ihop</button>
        </div>
        {codeMessage && <div style={{ marginTop: '0.4rem' }}>{codeMessage}</div>}
      </details>
    </div>
  )
}

function InviteShare({ token, name, fromName, onClose }) {
  const [copied, setCopied] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const message = inviteMessage(token, fromName)
  const canShare = typeof navigator.share === 'function'

  async function share() {
    try {
      await navigator.share({ title: 'Inbjudan till KanDo', text: message })
    } catch { /* avbrutet */ }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      window.prompt('Kopiera inbjudan:', inviteUrl(token))
    }
  }

  return (
    <div style={{ ...box, background: theme.colors.bg, gap: '0.5rem' }}>
      <div style={{ fontWeight: 700 }}>Inbjudan till {name} är klar</div>
      <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted }}>
        Skicka länken. {name} öppnar den, loggar in med sin e-post och trycker <em>Koppla ihop</em>. Inbjudan gäller i 14 dagar.
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', background: theme.colors.surface, padding: '0.5rem', borderRadius: theme.radius.sm }}>
        {inviteUrl(token)}
        <div style={{ marginTop: '0.25rem' }}>Kod: <strong>{token}</strong></div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {canShare && <button onClick={share} style={primaryBtn}>📤 Dela…</button>}
        <button onClick={() => setSmsOpen(true)} style={canShare ? smallBtn : primaryBtn}>📱 Skicka SMS</button>
        <button onClick={copy} style={smallBtn}>{copied ? '✓ Kopierad' : '📋 Kopiera'}</button>
        <button onClick={onClose} style={{ ...linkBtn, marginLeft: 'auto' }}>Stäng</button>
      </div>
      {smsOpen && <SmsSendModal initialMessage={message} onClose={() => setSmsOpen(false)} />}
    </div>
  )
}

const box = {
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  padding: '0.75rem 0.85rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  fontSize: '0.9rem',
  color: theme.colors.text,
}

const heading = { fontWeight: 700, fontSize: '0.95rem' }
const muted = { color: theme.colors.textMuted, fontSize: '0.85rem' }
const row = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }

const input = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.bg,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  padding: '0.45rem 0.6rem',
  fontSize: '16px',
  minWidth: '8rem',
}

const primaryBtn = {
  border: 'none',
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
  borderRadius: theme.radius.sm,
  padding: '0.45rem 0.9rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const smallBtn = {
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.bg,
  color: theme.colors.text,
  borderRadius: theme.radius.sm,
  padding: '0.4rem 0.75rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: theme.colors.textMuted,
  fontSize: '0.8rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
}
