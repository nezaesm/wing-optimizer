// Sci-fi design tokens — silver/white metallic palette
export const SF = {
  // Core backgrounds
  bg:           '#010408',
  bgPanel:      'rgba(2, 4, 12, 0.94)',
  bgPanelHover: 'rgba(4, 6, 16, 0.97)',

  // Silver/white spectrum (replaces cyan)
  cyan:         '#d4d4d4',
  cyanBright:   '#f0f0f0',
  cyanDim:      'rgba(200, 200, 200, 0.55)',
  cyanFaint:    'rgba(180, 180, 180, 0.12)',
  cyanGhost:    'rgba(160, 160, 160, 0.05)',

  // Borders
  borderDim:    'rgba(160, 160, 160, 0.14)',
  border:       'rgba(190, 190, 190, 0.22)',
  borderBright: 'rgba(240, 240, 240, 0.45)',

  // Text
  textPrimary:  '#f0f0f0',
  textSub:      'rgba(210, 210, 210, 0.78)',
  textMuted:    'rgba(150, 150, 150, 0.50)',
  textData:     '#d4d4d4',

  // Status accents (keep for alerts)
  amber:        '#ffb020',
  red:          '#ff3d5a',
  green:        '#00ff88',
  white:        '#ffffff',

  // Glows — white/silver
  glowSm:    '0 0 10px rgba(200, 200, 200, 0.18)',
  glowMd:    '0 0 22px rgba(200, 200, 200, 0.28)',
  glowLg:    '0 0 48px rgba(200, 200, 200, 0.38)',
  glowInset: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',

  // Typography
  fontMono:    '"JetBrains Mono", "Courier New", monospace',
  fontSans:    '"Plus Jakarta Sans", system-ui, sans-serif',
  fontDisplay: '"Syne", system-ui, sans-serif',

  // Motion
  ease:    'cubic-bezier(0.23, 1, 0.32, 1)',
  easeIn:  'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',

  // THREE.js hex values
  cyanHex:     0xd4d4d4,
  bgHex:       0x010408,
  wingBodyHex: 0x7a7a8a,  // silver-gray
  gridHex:     0x0e0e18,

  // Layout
  navH: 72,
}
