import { theme } from '../theme'

// Static reference page — no live data, nothing to fetch. Mirrors the
// standalone "Fältguiden" manual (published as a Claude artifact) but
// rewritten in the app's own plain inline-style idiom instead of that
// page's custom CSS, so it looks and feels like the rest of KanDo rather
// than an embedded foreign document.

const PIPELINE = [
  { label: 'Backlog', desc: 'Allt som inte är sorterat än. Sköts bara i fliken Backlog — har ingen egen kolumn i Kanban.' },
  { label: 'Prioriterad', desc: 'Du har bestämt att det ska göras. Ordningen här (fliken Prio) styr även vilka 5 som visas automatiskt i Dagens Fokus.' },
  { label: 'Planerad', desc: 'Redo att sätta igång med — nästa i tur.' },
  { label: 'Pågår', desc: 'Du jobbar med det nu.' },
  { label: 'Klar', desc: 'Klart! Hittas sen under fliken Utförda.' },
]

const TOOLS = [
  { icon: '🛒', title: 'Inköpslista', desc: 'Egen samlingslista för allt du märkt med "Inköpslista" — oavsett var det i övrigt ligger i flödet.' },
  { icon: '✅', title: 'Utförda', desc: 'Historik över allt du bockat av. Ångrat dig? Öppna kortet och lägg tillbaka det.' },
  { icon: '🏷️', title: 'Tagghantering', desc: 'Egna taggar för att gruppera och filtrera — även platstaggar (📍) för sånt som hör till en viss plats.' },
  { icon: '🔗', title: 'Dela', desc: 'Skapa en läslänk för allt med en viss tagg — bra för att visa upp eller dela en lista utan att bjuda in någon.' },
  { icon: '🔍', title: 'Sök', desc: 'Hittar vad som helst, oavsett flik eller status.' },
  { icon: '👥', title: 'Filtrera på tagg', desc: 'De flesta listvyer kan filtreras på tagg högst upp — bra när en lista växer sig lång.' },
]

function Chip({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.8rem',
        fontWeight: 600,
        background: theme.colors.surfaceGreen,
        color: theme.colors.text,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: '999px',
        padding: '0.05rem 0.55rem',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: theme.colors.text, marginBottom: '0.6rem' }}>
      {children}
    </div>
  )
}

function Card({ children, accent }) {
  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderTop: accent ? `3px solid ${accent}` : `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.md,
        boxShadow: theme.shadow.sm,
        padding: '0.9rem 1rem',
      }}
    >
      {children}
    </div>
  )
}

export default function HelpView() {
  return (
    <div style={{ padding: '1rem', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: theme.colors.text, marginBottom: '0.4rem' }}>
        Så jobbar du i KanDo
      </div>
      <p style={{ color: theme.colors.textMuted, marginTop: 0 }}>
        KanDo har två sätt att jobba — ett snabbspår för det som ska göras idag, och en Kanban-väg
        för sånt som tar flera steg. Allt börjar på samma ställe: du fångar tanken, sen väljer du väg.
      </p>

      <div style={{ marginTop: '1.75rem' }}>
        <SectionHeading>1. Fånga allt i Snabbfånga</SectionHeading>
        <p style={{ marginTop: 0 }}>
          Den runda <b>+</b>-knappen finns på alla flikar. Tala, skriv eller klistra in — spara sen.
          Innan du sparar kan du direkt märka den som:
        </p>
        <p style={{ margin: '0.35rem 0' }}>🔖 <b>Prioriterad</b> — hoppar direkt förbi Backlog och in i prioriteringen.</p>
        <p style={{ margin: '0.35rem 0' }}>📅 <b>Dagens Fokus</b> — läggs på dagens lista med en gång.</p>
        <p style={{ margin: '0.35rem 0' }}>🛒 <b>Inköpslista</b> — dyker upp där, oavsett vad den i övrigt är för typ av sak.</p>
        <p>Märker du inget alls hamnar den i <Chip>Backlog</Chip> — en enkel hög att sortera senare.</p>
      </div>

      <div style={{ marginTop: '1.75rem' }}>
        <SectionHeading>2. Välj väg: snabbt eller i steg</SectionHeading>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem' }}>
          <div style={{ flex: '1 1 240px' }}>
            <Card accent={theme.colors.accent}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>⚡ Snabbspåret</div>
              <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted, marginBottom: '0.6rem' }}>
                För puckar du bara vill beta av idag
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li>Öppna <Chip>Dagens Fokus</Chip></li>
                <li>Bocka av när det är gjort ✓</li>
                <li>Inget schema behövs — de 5 mest prioriterade dyker upp automatiskt om du inte schemalagt något själv</li>
              </ul>
            </Card>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <Card accent={theme.colors.primary}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>🪜 Kanban-vägen</div>
              <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted, marginBottom: '0.6rem' }}>
                För projekt och saker som tar flera pass
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li>Öppna <Chip>Kanban</Chip></li>
                <li>Dra kortet framåt en kolumn i taget</li>
                <li>Se alltid vad som väntar, pågår och är klart</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.75rem' }}>
        <SectionHeading>3. Kanban-vägen steg för steg</SectionHeading>
        <p style={{ marginTop: 0 }}>
          Fem steg, ett kort rör sig ett steg åt gången — dra det, eller använd <b>🔀 Triage</b> i
          kolumnrubriken för att swipa igenom korten ett i taget.
        </p>
        <div style={{ borderLeft: `2px solid ${theme.colors.border}`, marginLeft: '0.3rem', paddingLeft: '1rem' }}>
          {PIPELINE.map((step, i) => (
            <div key={step.label} style={{ paddingBottom: i === PIPELINE.length - 1 ? 0 : '0.9rem' }}>
              <div style={{ fontWeight: 700, color: theme.colors.primary }}>{step.label}</div>
              <div style={{ fontSize: '0.9rem', color: theme.colors.textMuted }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.75rem' }}>
        <SectionHeading>4. Sidoverktygen</SectionHeading>
        <p style={{ marginTop: 0 }}>Små flikar som gör vardagen enklare, oavsett vilken väg du kör.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.7rem' }}>
          {TOOLS.map((tool) => (
            <Card key={tool.title}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                {tool.icon} {tool.title}
              </div>
              <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted }}>{tool.desc}</div>
            </Card>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: '1.75rem',
          background: theme.colors.surfaceGreen,
          border: `1px solid ${theme.colors.border}`,
          borderLeft: `4px solid ${theme.colors.accent}`,
          borderRadius: theme.radius.sm,
          padding: '0.8rem 1rem',
          fontSize: '0.9rem',
        }}
      >
        <b style={{ color: theme.colors.primaryDark }}>Tumregel:</b> Om du bara har fem minuter — öppna
        Dagens Fokus och beta av. Om du planerar något större — lägg det i Backlog, prioritera det, och
        låt Kanban visa var det ligger.
      </div>
    </div>
  )
}
