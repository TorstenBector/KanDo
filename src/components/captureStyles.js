import { theme } from '../theme'

// Pill styles shared by CaptureControls, QuickCapture and ItemDetailModal —
// kept out of the component file so Fast Refresh keeps working there.

export const pill = {
  fontSize: '0.8rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '999px',
  padding: '0.3rem 0.7rem',
  background: 'transparent',
  color: theme.colors.textMuted,
  cursor: 'pointer',
}

export const pillActive = {
  ...pill,
  border: `1px solid ${theme.colors.primary}`,
  background: theme.colors.primary,
  color: theme.colors.textOnPrimary,
}
