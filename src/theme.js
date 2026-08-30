export const theme = {
  colors: {
    primary:       '#2D6A2D',
    primaryDark:   '#1A3A1A',
    primaryLight:  '#3D8B3D',
    accent:        '#F0C040',
    accentSoft:    '#D4C870',
    bg:            '#F5F0E0',
    surface:       '#EDE8D5',
    surfaceGreen:  '#E8F0D8',
    text:          '#1A3A1A',
    textMuted:     '#4A6A4A',
    textOnPrimary: '#F0C040',
    border:        '#C8D8B0',
    success:       '#34C759',
    danger:        '#CC3333',
    warning:       '#E8A020',
    // Subtask/child cards — deliberately its own hue (warm wheat, not
    // green or gold) so a nested child never reads as "done" or
    // "high priority" by accident. See spec discussion on child card styling.
    childTint:       '#EFE3C8',
    childTintBorder: '#DCC998',
  },
  shadow: {
    sm: '0 1px 3px rgba(26,58,26,0.15)',
    md: '0 4px 12px rgba(26,58,26,0.20)',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
  }
}
