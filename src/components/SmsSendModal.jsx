import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useSyncStore } from '../store/syncStore'
import { useVisualViewport, useBodyScrollLock } from '../hooks/useVisualViewport'
import { theme } from '../theme'

const MAX_LENGTH = 600
// Contact Picker API finns bara i Chrome på Android — inte iPhone eller dator.
const canPickFromPhone = typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window
const looksLikePhone = (s) => /^\+?[\d\s\-()]{7,}$/.test(s.trim())

// "📱 Skicka SMS" — går via SMSbang-telefonen (edge function send-sms →
// Jaktkolls SMS-kö). Kontakter sparas i kando_sms_contacts och följer med
// mellan dator och mobil; nya nummer sparas automatiskt när man skickar.
export default function SmsSendModal({ initialMessage = '', onClose }) {
  const session = useSyncStore((s) => s.session)
  const viewport = useVisualViewport()
  useBodyScrollLock(true)
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [recipient, setRecipient] = useState(null) // { name, phone }
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState(initialMessage.slice(0, MAX_LENGTH))
  const [status, setStatus] = useState(null) // null | 'sending' | { ok, remaining } | { error }

  useEffect(() => {
    if (!session) return
    supabase.from('kando_sms_contacts').select('id, name, phone, last_used_at')
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('name')
      .then(({ data }) => setContacts(data ?? []))
  }, [session])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/[\s\-()]/g, '')))
    : contacts

  async function pickFromPhone() {
    try {
      const [picked] = await navigator.contacts.select(['name', 'tel'], { multiple: false })
      if (!picked?.tel?.length) return
      setRecipient({ name: picked.name?.[0] || '', phone: picked.tel[0] })
    } catch { /* användaren avbröt */ }
  }

  async function removeContact(id) {
    if (!window.confirm('Ta bort kontakten?')) return
    await supabase.from('kando_sms_contacts').delete().eq('id', id)
    setContacts((cs) => cs.filter((c) => c.id !== id))
  }

  async function send() {
    if (!recipient || !message.trim()) return
    setStatus('sending')
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: { phone: recipient.phone, name: recipient.name, message: message.trim() },
    })
    if (error) {
      let detail = error.message
      try { detail = (await error.context.json()).error || detail } catch { /* ingen JSON-kropp */ }
      setStatus({ error: detail })
      return
    }
    setStatus({ ok: true, remaining: data?.remainingToday })
    setTimeout(onClose, 1800)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', left: 0, right: 0, top: viewport.offsetTop, height: viewport.height,
        boxSizing: 'border-box', background: 'rgba(26,58,26,0.45)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', zIndex: 400,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg, borderRadius: `0 0 ${theme.radius.lg} ${theme.radius.lg}`,
          width: '100%', maxWidth: '520px', maxHeight: '100%', overflowY: 'auto',
          boxSizing: 'border-box', padding: '1rem', boxShadow: theme.shadow.md,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem' }}>
          <strong style={{ color: theme.colors.text, fontSize: '1.05rem' }}>📱 Skicka SMS</strong>
          <button onClick={onClose} style={{ ...secondaryBtn, marginLeft: 'auto' }}>Stäng</button>
        </div>

        {!session ? (
          <p style={{ color: theme.colors.textMuted }}>Du behöver vara inloggad för att skicka SMS.</p>
        ) : (
          <>
            <label style={labelStyle}>Till</label>
            {recipient ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ ...chip, background: theme.colors.surfaceGreen }}>
                  {recipient.name ? `${recipient.name} · ` : ''}{recipient.phone}
                </span>
                <button onClick={() => setRecipient(null)} style={secondaryBtn}>Byt</button>
              </div>
            ) : (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Sök kontakt eller skriv nummer"
                    inputMode="search"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {canPickFromPhone && (
                    <button onClick={pickFromPhone} style={secondaryBtn}>📇 Telefonens kontakter</button>
                  )}
                </div>
                {looksLikePhone(search) && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Namn (sparas som kontakt)"
                      style={{ ...inputStyle, flex: 1, minWidth: '160px' }}
                    />
                    <button onClick={() => setRecipient({ name: newName.trim(), phone: search.trim() })} style={primaryBtn}>
                      Välj {search.trim()}
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '220px', overflowY: 'auto' }}>
                  {filtered.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        onClick={() => setRecipient({ name: c.name, phone: c.phone })}
                        style={{ ...secondaryBtn, flex: 1, textAlign: 'left', fontSize: '0.9rem', padding: '0.5rem 0.7rem' }}
                      >
                        {c.name} <span style={{ color: theme.colors.textMuted }}>· {c.phone}</span>
                      </button>
                      <button onClick={() => removeContact(c.id)} aria-label={`Ta bort ${c.name}`} style={{ ...secondaryBtn, color: theme.colors.danger }}>✕</button>
                    </div>
                  ))}
                  {contacts.length === 0 && !looksLikePhone(search) && (
                    <p style={{ fontSize: '0.8rem', color: theme.colors.textMuted, margin: 0 }}>
                      Inga sparade kontakter än — skriv ett nummer ovan{canPickFromPhone ? ' eller hämta från telefonen' : ''}. Kontakten sparas när du skickar.
                    </p>
                  )}
                </div>
              </div>
            )}

            <label style={labelStyle}>Meddelande</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              rows={5}
              style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{message.length}/{MAX_LENGTH}</span>
              <button
                onClick={send}
                disabled={!recipient || !message.trim() || status === 'sending' || status?.ok}
                style={{ ...primaryBtn, marginLeft: 'auto', opacity: !recipient || !message.trim() ? 0.5 : 1 }}
              >
                {status === 'sending' ? 'Skickar…' : '📤 Skicka SMS'}
              </button>
            </div>
            {status?.ok && (
              <p style={{ color: theme.colors.primary, fontWeight: 600, fontSize: '0.85rem' }}>
                ✅ Skickat! Kommer fram inom ungefär en halv minut.
                {typeof status.remaining === 'number' && ` (${status.remaining} SMS kvar idag)`}
              </p>
            )}
            {status?.error && (
              <p style={{ color: theme.colors.danger, fontWeight: 600, fontSize: '0.85rem' }}>❌ {status.error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.75rem', color: theme.colors.textMuted, fontWeight: 600, marginBottom: '0.25rem' }
const inputStyle = {
  padding: '0.45rem 0.6rem', borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border}`,
  fontSize: '1rem', boxSizing: 'border-box', background: '#fff', color: theme.colors.text,
}
const chip = { fontSize: '0.9rem', padding: '0.3rem 0.7rem', borderRadius: '999px', color: theme.colors.text }
const primaryBtn = {
  background: theme.colors.primary, color: theme.colors.textOnPrimary, border: 'none',
  borderRadius: theme.radius.sm, padding: '0.5rem 1.1rem', cursor: 'pointer', fontWeight: 600,
}
const secondaryBtn = {
  background: 'transparent', color: theme.colors.text, border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm, padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0,
}
