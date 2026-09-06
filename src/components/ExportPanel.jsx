import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { theme } from '../theme'

const TYPE_LABEL = { idea: 'Idé', project: 'Projekt', task: 'Task' }
const STATUS_LABEL = { backlog: 'Backlog', prioriterad: 'Prioriterad', planerad: 'Planerad', pagar: 'Pågår', klar: 'Klar' }
const PRIORITY_LABEL = { hog: 'Hög', medel: 'Medel', lag: 'Låg' }

// Beyond Titel + Beskrivning (what was asked for), also included: Typ,
// Status and Prioritet (so a reader — human or AI — knows what kind of
// thing this is and how urgent it already is without opening the app),
// every Tagg (not just the one filtered on, in case an item carries more
// context), and Deluppgifter as a checklist (a project's structure is
// often exactly what's useful to hand to an AI for expanding on).
async function buildExportText(selectedTagIds) {
  const tagIdArr = [...selectedTagIds]
  const filterTags = (await db.tags.bulkGet(tagIdArr)).filter(Boolean)
  const links = await db.item_tags.where('tag_id').anyOf(tagIdArr).toArray()
  const itemIds = [...new Set(links.map((l) => l.item_id))]
  const items = (await db.items.bulkGet(itemIds)).filter(Boolean)
  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const lines = []
  const heading = filterTags.map((t) => t.name).join(' + ')
  lines.push(`# ${heading || 'Export'} (${items.length} KanDo${items.length === 1 ? '' : 's'})`, '')

  for (const item of items) {
    const itemTagLinks = await db.item_tags.where('item_id').equals(item.id).toArray()
    const itemTags = (await db.tags.bulkGet(itemTagLinks.map((l) => l.tag_id))).filter(Boolean)

    const relations = await db.item_relations
      .where({ from_item_id: item.id, relation_type: 'parent_child' })
      .toArray()
    const children = (await db.items.bulkGet(relations.map((r) => r.to_item_id))).filter(Boolean)

    const meta = [TYPE_LABEL[item.type], STATUS_LABEL[item.status]]
    if (item.backlog_priority) meta.push(`Prio: ${PRIORITY_LABEL[item.backlog_priority]}`)

    lines.push(`## ${item.title} [${meta.join(', ')}]`)
    lines.push(item.description?.trim() || '(ingen beskrivning)')
    if (itemTags.length > 0) {
      lines.push(`Taggar: ${itemTags.map((t) => t.name).join(', ')}`)
    }
    if (children.length > 0) {
      lines.push('Deluppgifter:')
      for (const child of children) {
        lines.push(`- [${child.status === 'klar' ? 'x' : ' '}] ${child.title}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

export default function ExportPanel({ selectedTagIds, onClose }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    buildExportText(selectedTagIds).then((t) => {
      if (!cancelled) { setText(t); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [selectedTagIds])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the text is
      // already selectable in the textarea below, so nothing is lost.
    }
  }

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
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: theme.shadow.md,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontWeight: 600, color: theme.colors.text, marginBottom: '0.5rem' }}>
          📋 Exportera markerade taggar
        </div>
        <p style={{ color: theme.colors.textMuted, fontSize: '0.8rem', margin: '0 0 0.6rem' }}>
          Klistra in i Claude eller valfri AI — text nedan, redo att kopiera.
        </p>

        {loading ? (
          <p style={{ color: theme.colors.textMuted }}>Bygger export…</p>
        ) : (
          <textarea
            readOnly
            value={text}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1,
              minHeight: '300px',
              width: '100%',
              borderRadius: theme.radius.sm,
              border: `1px solid ${theme.colors.border}`,
              padding: '0.6rem',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              resize: 'vertical',
              boxSizing: 'border-box',
              background: theme.colors.surface,
              color: theme.colors.text,
            }}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button onClick={onClose} style={secondaryBtn}>Stäng</button>
          <button onClick={copy} disabled={loading} style={primaryBtn}>
            {copied ? '✓ Kopierad' : '📋 Kopiera till urklipp'}
          </button>
        </div>
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
}

const secondaryBtn = {
  background: 'transparent',
  color: theme.colors.textMuted,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radius.sm,
  padding: '0.5rem 1rem',
  cursor: 'pointer',
}
