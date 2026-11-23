import { useCallback, useEffect, useState } from 'react'
import { checkIn, createChallenge, inviteToChallenge, leaveChallenge, loadStreaks, respondInvite, bestStreak, currentStreak, describeWeekdays, isScheduled, lastNDays } from '../lib/streak'
import { listConnections } from '../lib/connections'
import { addDaysISO, parseLocalDateISO, todayISO } from '../lib/date'
import { WEEKDAYS } from '../lib/plugg'
import { useSyncStore } from '../store/syncStore'
import { useBodyScrollLock, useVisualViewport } from '../hooks/useVisualViewport'
import PushSettings from './PushSettings'
import { theme } from '../theme'

const EMOJIS = ['🔥', '📚', '💪', '🏃', '🎸', '🧘', '💧', '🥦', '😴', '📵']

// Fliken Streak: utmaningar man bockar av varje dag (eller valda dagar),
// ensam eller med kopplade vänner. Online-only.
export default function StreakView() {
  const session = useSyncStore((s) => s.session)
  const [challenges, setChallenges] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [inviteFor, setInviteFor] = useState(null)

  const reload = useCallback(async () => {
    try {
      setChallenges(await loadStreaks())
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined
    let alive = true
    const refresh = () => loadStreaks().then(
      (list) => { if (alive) { setChallenges(list); setError(null) } },
      (err) => { if (alive) setError(err.message) },
    )
    refresh()
    // Vännernas avbockningar ska synas när man kommer tillbaka till appen.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session])

  if (!session) {
    return (
      <div style={{ padding: '1rem' }}>
        <p style={muted}>Logga in för att skapa streak-utmaningar — ensam eller tillsammans med en vän.</p>
      </div>
    )
  }

  const invites = (challenges ?? []).filter((c) => c.my_status === 'invited')
  const active = (challenges ?? []).filter((c) => c.my_status === 'active')

  // Optimistisk avbockning: uppdatera direkt, rätta från servern efteråt.
  async function toggle(challenge, day, done) {
    setChallenges((list) => list.map((c) => c.id !== challenge.id ? c : {
      ...c,
      members: c.members.map((m) => !m.is_me ? m : { ...m, days: done ? [day, ...m.days] : m.days.filter((d) => d !== day) }),
    }))
    try {
      await checkIn(challenge.id, day, done)
    } catch (err) {
      setError(err.message)
    }
    reload()
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '720px' }}>
      <button onClick={() => setCreating(true)} style={newBtn}>+ Ny utmaning</button>
      {error && <div style={{ color: theme.colors.danger, fontSize: '0.85rem' }}>⚠ {error}</div>}

      {invites.map((c) => (
        <div key={c.id} style={{ ...card, border: `2px solid ${theme.colors.orange}` }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.orange, textTransform: 'uppercase' }}>
            {c.emoji} {c.invited_by_name ?? c.owner_name} utmanar dig
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{c.title}</div>
          <div style={muted}>{describeWeekdays(c.weekdays)} · {c.members.filter((m) => m.status === 'active').map((m) => m.name).join(', ')} är med</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={async () => { try { await respondInvite(c.id, true) } catch (err) { setError(err.message) } reload() }} style={primaryBtn}>
              🔥 Anta utmaningen
            </button>
            <button onClick={async () => { try { await respondInvite(c.id, false) } catch (err) { setError(err.message) } reload() }} style={linkBtn}>
              Nej tack
            </button>
          </div>
        </div>
      ))}

      {challenges && active.length === 0 && invites.length === 0 && (
        <div style={{ ...card, gap: '0.4rem' }}>
          <div style={{ fontWeight: 700 }}>🔥 Bygg en vana, en dag i taget</div>
          <div style={muted}>
            Skapa en utmaning, t.ex. "Plugga 15 min" eller "Träna", och bocka av varje dag du gör den. Utmana en vän så ser ni
            varandras streaks och får en notis när den andra har gjort dagens.
          </div>
        </div>
      )}

      {active.map((c) => (
        <ChallengeCard key={c.id} challenge={c} onToggle={toggle} onInvite={() => setInviteFor(c)} onLeave={async () => {
          const msg = c.is_owner ? `Avsluta "${c.title}" för alla?` : `Lämna "${c.title}"?`
          if (!window.confirm(msg)) return
          try { await leaveChallenge(c.id) } catch (err) { setError(err.message) }
          reload()
        }} />
      ))}

      <PushSettings />

      {creating && <CreateChallenge onClose={() => setCreating(false)} onCreated={reload} />}
      {inviteFor && <InviteFriends challenge={inviteFor} onClose={() => { setInviteFor(null); reload() }} />}
    </div>
  )
}

function ChallengeCard({ challenge: c, onToggle, onInvite, onLeave }) {
  const today = todayISO()
  const yesterday = addDaysISO(today, -1)
  const me = c.members.find((m) => m.is_me)
  const myDays = me?.days ?? []
  const doneToday = myDays.includes(today)
  const scheduledToday = isScheduled(today, c.weekdays)
  const streak = currentStreak(myDays, c.weekdays, today)
  const best = bestStreak(myDays, c.weekdays, today)
  const missedYesterday = isScheduled(yesterday, c.weekdays) && !myDays.includes(yesterday)
  const week = lastNDays(today, 7)
  const friends = c.members.filter((m) => !m.is_me)

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{c.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{c.title}</div>
          <div style={muted}>{describeWeekdays(c.weekdays)}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: streak > 0 ? theme.colors.orange : theme.colors.textMuted, lineHeight: 1 }}>
            🔥 {streak}
          </div>
          <div style={{ fontSize: '0.7rem', color: theme.colors.textMuted }}>{streak === 1 ? 'dag' : 'dagar'} · bäst {best}</div>
        </div>
      </div>

      {scheduledToday ? (
        <button
          onClick={() => onToggle(c, today, !doneToday)}
          style={{
            ...bigBtn,
            background: doneToday ? theme.colors.surfaceGreen : theme.colors.primary,
            color: doneToday ? theme.colors.success : theme.colors.textOnPrimary,
            border: doneToday ? `2px solid ${theme.colors.success}` : 'none',
          }}
        >
          {doneToday ? '✓ Gjort idag — snyggt! (tryck för att ångra)' : '✓ Jag har gjort det idag'}
        </button>
      ) : (
        <div style={{ ...muted, textAlign: 'center', padding: '0.4rem' }}>Vilodag idag 😌</div>
      )}

      {missedYesterday && (
        <button onClick={() => onToggle(c, yesterday, true)} style={{ ...linkBtn, alignSelf: 'flex-start' }}>
          Glömde du bocka av igår? Tryck här
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <DayRow name="Du" days={myDays} week={week} weekdays={c.weekdays} streak={streak} highlight />
        {friends.map((m) => (
          <DayRow
            key={m.user_id}
            name={m.name}
            days={m.days}
            week={week}
            weekdays={c.weekdays}
            streak={currentStreak(m.days, c.weekdays, today)}
            pending={m.status === 'invited'}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
        <button onClick={onInvite} style={linkBtn}>+ Utmana en vän</button>
        <button onClick={onLeave} style={{ ...linkBtn, color: theme.colors.textMuted }}>{c.is_owner ? 'Avsluta utmaningen' : 'Lämna'}</button>
      </div>
    </div>
  )
}

function DayRow({ name, days, week, weekdays, streak, highlight, pending }) {
  const done = new Set(days)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
      <span style={{ width: '4.6rem', flexShrink: 0, fontWeight: highlight ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      {pending ? (
        <span style={{ color: theme.colors.textMuted, fontStyle: 'italic' }}>inbjuden — har inte svarat än</span>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            {week.map((d) => {
              const scheduled = isScheduled(d, weekdays)
              const ok = done.has(d)
              return (
                <span
                  key={d}
                  title={d}
                  style={{
                    width: '1.4rem', height: '1.4rem', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 700,
                    background: ok ? theme.colors.orange : scheduled ? theme.colors.bg : 'transparent',
                    color: ok ? '#fff' : theme.colors.textMuted,
                    border: `1px solid ${ok ? theme.colors.orange : theme.colors.border}`,
                    opacity: scheduled || ok ? 1 : 0.4,
                  }}
                >
                  {dayLetter(d)}
                </span>
              )
            })}
          </div>
          <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 700, color: streak > 0 ? theme.colors.orange : theme.colors.textMuted }}>🔥 {streak}</span>
        </>
      )}
    </div>
  )
}

function dayLetter(iso) {
  return ['S', 'M', 'T', 'O', 'T', 'F', 'L'][parseLocalDateISO(iso).getDay()]
}

function Panel({ title, onClose, children }) {
  const viewport = useVisualViewport()
  useBodyScrollLock(true)
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', left: 0, right: 0, top: viewport.offsetTop, height: viewport.height, background: 'rgba(26,58,26,0.45)',
        zIndex: 300, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bg, width: '100%', maxWidth: '480px', maxHeight: '100%', overflowY: 'auto',
          borderRadius: `0 0 ${theme.radius.lg} ${theme.radius.lg}`, boxShadow: theme.shadow.md, padding: '1rem',
          display: 'flex', flexDirection: 'column', gap: '0.8rem',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: theme.colors.primary }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

function CreateChallenge({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🔥')
  const [everyDay, setEveryDay] = useState(true)
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5])
  const [connections, setConnections] = useState([])
  const [inviteIds, setInviteIds] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    listConnections().then((list) => { if (alive) setConnections(list.filter((c) => c.accepted_at)) }, () => {})
    return () => { alive = false }
  }, [])

  async function save() {
    if (!title.trim() || (!everyDay && weekdays.length === 0)) return
    setBusy(true)
    setError(null)
    try {
      const id = await createChallenge({ title, emoji, weekdays: everyDay ? [] : weekdays })
      for (const userId of inviteIds) await inviteToChallenge(id, userId)
      await onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Panel title="🔥 Ny utmaning" onClose={onClose}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="T.ex. Plugga 15 min, Träna, Läsa"
        style={input}
      />
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e} style={{ ...emojiBtn, borderColor: emoji === e ? theme.colors.primary : theme.colors.border, background: emoji === e ? theme.colors.surfaceGreen : theme.colors.bg }}>
            {e}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={label}>Hur ofta</div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={() => setEveryDay(true)} style={everyDay ? chipOn : chipOff}>Varje dag</button>
          <button onClick={() => setEveryDay(false)} style={!everyDay ? chipOn : chipOff}>Valda dagar</button>
        </div>
        {!everyDay && (
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {WEEKDAYS.map((w) => {
              const on = weekdays.includes(w.iso)
              return (
                <button key={w.iso} onClick={() => setWeekdays((d) => on ? d.filter((x) => x !== w.iso) : [...d, w.iso].sort())} style={on ? chipOn : chipOff}>
                  {w.short}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={label}>Utmana en vän (valfritt)</div>
        {connections.length === 0 ? (
          <div style={muted}>Inga kopplade konton än — bjud in under Plugg → Kopplade konton. Du kan utmana någon senare också.</div>
        ) : connections.map((c) => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={inviteIds.includes(c.other_user_id)}
              onChange={(e) => setInviteIds((ids) => e.target.checked ? [...ids, c.other_user_id] : ids.filter((x) => x !== c.other_user_id))}
            />
            {c.other_name}
          </label>
        ))}
      </div>

      {error && <div style={{ color: theme.colors.danger, fontSize: '0.85rem' }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button disabled={busy || !title.trim()} onClick={save} style={{ ...primaryBtn, opacity: title.trim() ? 1 : 0.5 }}>
          {busy ? 'Skapar…' : inviteIds.length ? 'Skapa och utmana' : 'Skapa'}
        </button>
        <button onClick={onClose} style={linkBtn}>Avbryt</button>
      </div>
    </Panel>
  )
}

function InviteFriends({ challenge, onClose }) {
  const [connections, setConnections] = useState(null)
  const [sent, setSent] = useState([])
  const [error, setError] = useState(null)
  const already = new Set(challenge.members.map((m) => m.user_id))

  useEffect(() => {
    let alive = true
    listConnections().then((list) => { if (alive) setConnections(list.filter((c) => c.accepted_at)) }, (err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [])

  async function invite(c) {
    try {
      await inviteToChallenge(challenge.id, c.other_user_id)
      setSent((s) => [...s, c.other_user_id])
    } catch (err) {
      setError(err.message)
    }
  }

  const candidates = (connections ?? []).filter((c) => !already.has(c.other_user_id))
  return (
    <Panel title={`${challenge.emoji} Utmana en vän`} onClose={onClose}>
      {connections && candidates.length === 0 && (
        <div style={muted}>Alla dina kopplade konton är redan med — eller så har du inga än (bjud in under Plugg → Kopplade konton).</div>
      )}
      {candidates.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ flex: 1 }}>{c.other_name}</span>
          {sent.includes(c.other_user_id)
            ? <span style={{ color: theme.colors.success, fontWeight: 700 }}>✓ Utmanad</span>
            : <button onClick={() => invite(c)} style={primaryBtn}>🔥 Utmana</button>}
        </div>
      ))}
      {error && <div style={{ color: theme.colors.danger, fontSize: '0.85rem' }}>⚠ {error}</div>}
      <button onClick={onClose} style={{ ...linkBtn, alignSelf: 'flex-start' }}>Klar</button>
    </Panel>
  )
}

const muted = { color: theme.colors.textMuted, fontSize: '0.85rem', lineHeight: 1.4 }
const label = { fontSize: '0.8rem', fontWeight: 700, color: theme.colors.textMuted, textTransform: 'uppercase' }
const card = {
  background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '0.85rem',
  boxShadow: theme.shadow.sm, display: 'flex', flexDirection: 'column', gap: '0.7rem', color: theme.colors.text,
}
const newBtn = {
  border: 'none', background: theme.colors.primary, color: theme.colors.textOnPrimary, borderRadius: theme.radius.md,
  padding: '0.75rem 1rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', boxShadow: theme.shadow.sm, alignSelf: 'flex-start',
}
const bigBtn = { borderRadius: theme.radius.md, padding: '0.8rem 1rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', width: '100%' }
const primaryBtn = {
  border: 'none', background: theme.colors.primary, color: theme.colors.textOnPrimary, borderRadius: theme.radius.sm,
  padding: '0.5rem 0.9rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
}
const linkBtn = {
  border: 'none', background: 'transparent', color: theme.colors.primary, fontSize: '0.85rem', fontWeight: 600,
  cursor: 'pointer', padding: 0, textDecoration: 'underline',
}
const input = {
  border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, color: theme.colors.text,
  borderRadius: theme.radius.sm, padding: '0.6rem 0.7rem', fontSize: '16px', fontWeight: 600,
}
const emojiBtn = { border: '2px solid', borderRadius: theme.radius.sm, fontSize: '1.3rem', padding: '0.2rem 0.4rem', cursor: 'pointer' }
const chipBase = { border: '1px solid', borderRadius: '999px', padding: '0.3rem 0.7rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }
const chipOn = { ...chipBase, background: theme.colors.primary, color: theme.colors.textOnPrimary, borderColor: theme.colors.primary }
const chipOff = { ...chipBase, background: theme.colors.bg, color: theme.colors.text, borderColor: theme.colors.border }
