import { attachmentIcon } from '../hooks/useAttachments'
import { theme } from '../theme'

// Thumbnail-sized tile for a non-image attachment (icon + filename) —
// same 4.5rem footprint as photo thumbnails so they sit in one row.
// Shared by Snabbfånga, kortvyn and den delade listvyn.
export default function FileTile({ kind, filename }) {
  return (
    <div
      title={filename}
      style={{
        width: '4.5rem', height: '4.5rem', borderRadius: theme.radius.sm,
        border: `1px solid ${theme.colors.border}`, background: theme.colors.surface,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '0.15rem', padding: '0.2rem', boxSizing: 'border-box', overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: '1.4rem' }}>{attachmentIcon(kind)}</span>
      <span style={{ fontSize: '0.55rem', color: theme.colors.textMuted, textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.1 }}>
        {filename}
      </span>
    </div>
  )
}
