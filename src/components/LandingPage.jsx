import { useState } from 'react'
import { theme } from '../theme'

const PITCH = `Har du någonsin öppnat en att-göra-app, känt press att välja rätt lista och rätt
prioritet direkt — och stängt appen igen utan att skriva något alls? KanDo löser det:
skriv ner tanken på några sekunder, klart. Allt — jobb, hem, ett projekt, en present du
ska komma ihåg — landar i en enda backlog. Varje morgon visar Dagens Fokus vad som
faktiskt behöver hända idag, och missar du en dag frågar appen dig igenom det du
hoppade över istället för att det bara försvinner i mängden.

Inget konto krävs för att börja. Allt sparas på din enhet direkt — logga in bara den
dagen du vill synka mellan flera.`

const PRINCIPLES = [
  {
    title: 'Global Life Backlog',
    text: 'Allt hamnar i samma backlog — jobb, privat, fritid, projekt, idéer. Ingen uppdelning på datanivå. Filter och vyer visar det som är relevant just nu.',
  },
  {
    title: 'Offline First',
    text: 'Fungerar direkt, utan konto och utan uppkoppling. Primär lagring är lokal. Inloggning behövs bara den dagen du vill synka.',
  },
  {
    title: 'AI On Demand',
    text: 'AI föreslår — kategori, förtydligande, spec, prioritet. Du bestämmer. AI flyttar aldrig kort, ändrar aldrig status, planerar aldrig din kalender själv.',
  },
]

export default function LandingPage() {
  const [showPitch, setShowPitch] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg }}>
      <header
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          padding: '1rem 1.25rem',
        }}
      >
        <strong style={{ fontSize: '1.2rem' }}>KanDo</strong>
      </header>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2.5rem 1.25rem 4rem' }}>
        <h1 style={{ color: theme.colors.text, fontSize: '2rem', margin: '0 0 0.5rem', lineHeight: 1.15 }}>
          Capture First. Organize Later.
        </h1>
        <p style={{ color: theme.colors.textMuted, fontSize: '1.05rem', lineHeight: 1.5, margin: '0 0 2rem' }}>
          Ett personligt planerings- och prioriteringssystem för dig som får många idéer och
          behöver ett enkelt sätt att fånga, strukturera och genomföra dem — utan att först
          behöva bestämma kategori, prioritet eller struktur.
        </p>

        <button
          type="button"
          onClick={() => setShowPitch((v) => !v)}
          aria-expanded={showPitch}
          style={{
            display: 'block',
            background: 'transparent',
            border: 'none',
            color: theme.colors.primary,
            fontWeight: 600,
            fontSize: '0.95rem',
            padding: 0,
            marginBottom: '1.25rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {showPitch ? '– Dölj' : 'Läs mer om vad KanDo är →'}
        </button>

        {showPitch && (
          <div
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              padding: '1.1rem 1.25rem',
              marginBottom: '1.75rem',
              boxShadow: theme.shadow.sm,
            }}
          >
            {PITCH.split('\n\n').map((para, i) => (
              <p
                key={i}
                style={{
                  color: theme.colors.text,
                  lineHeight: 1.55,
                  margin: i === 0 ? '0 0 0.9rem' : 0,
                }}
              >
                {para}
              </p>
            ))}
          </div>
        )}

        <a
          href="https://app.kando.nu"
          style={{
            display: 'inline-block',
            background: theme.colors.primary,
            color: theme.colors.textOnPrimary,
            textDecoration: 'none',
            fontWeight: 600,
            padding: '0.75rem 1.5rem',
            borderRadius: theme.radius.md,
            boxShadow: theme.shadow.md,
            marginBottom: '3rem',
          }}
        >
          Öppna appen →
        </a>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {PRINCIPLES.map((p) => (
            <div
              key={p.title}
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.md,
                padding: '1.1rem 1.25rem',
                boxShadow: theme.shadow.sm,
              }}
            >
              <h2 style={{ color: theme.colors.text, fontSize: '1.05rem', margin: '0 0 0.4rem' }}>
                {p.title}
              </h2>
              <p style={{ color: theme.colors.textMuted, margin: 0, lineHeight: 1.45 }}>
                {p.text}
              </p>
            </div>
          ))}
        </div>

        <p style={{ color: theme.colors.textMuted, fontSize: '0.85rem', marginTop: '3rem', textAlign: 'center' }}>
          Idé → Backlog → Prioriterad → Planerad → Pågår → Klar
        </p>
      </main>
    </div>
  )
}
