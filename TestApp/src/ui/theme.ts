/**
 * Tokens en hex para lo que NO acepta className: SVG, barra de pestanas,
 * ActivityIndicator, StatusBar. Espejo exacto de tailwind.config.js — si
 * cambia uno, cambia el otro.
 */
export const COLORS = {
  primary: '#C3002F',
  ink: '#0F1620',
  slate: '#1C2733',
  surface: '#FFFFFF',
  canvas: '#EEF1F5',
  line: '#D5DCE5',
  muted: '#5B6878',
  v1: '#E11D2E',
  v2: '#E08A00',
  v3: '#1D6FE0',
  synced: '#04814B',
  white: '#FFFFFF',
} as const;

export const GRADE_COLOR = {
  V1: COLORS.v1,
  V2: COLORS.v2,
  V3: COLORS.v3,
} as const;

/** Clases de fondo por severidad, para uso con className. */
export const GRADE_BG = {
  V1: 'bg-v1',
  V2: 'bg-v2',
  V3: 'bg-v3',
} as const;

/** Altura minima de un area de toque. Se opera con guantes. */
export const TOUCH = {
  min: 56,
  compact: 48,
} as const;
