export type ThemeMode = 'light' | 'dark';

export const lightColors = {
  bg: '#F4F4F1',
  bgAlt: '#FFFFFF',
  card: 'rgba(255,255,255,0.64)',
  cardSolid: '#FFFFFF',
  cardStrong: 'rgba(255,255,255,0.86)',
  nav: 'rgba(255,255,255,0.78)',
  frame: '#E3E3DD',

  primary: '#050505',
  primaryDark: '#111111',
  primarySoft: '#ECECEA',
  primaryTint: 'rgba(0,0,0,0.08)',

  accent: '#2A2A2A',
  accentDark: '#111111',
  accentSoft: 'rgba(0,0,0,0.06)',

  success: '#111111',
  successSoft: 'rgba(0,0,0,0.06)',

  danger: '#111111',
  dangerDark: '#050505',
  dangerSoft: 'rgba(0,0,0,0.08)',

  warningBg: '#F4F4EF',
  warningText: '#1C1C1C',

  text: '#050505',
  textMuted: '#545454',
  textSubtle: '#767676',
  textOnDark: '#FFFFFF',

  border: 'rgba(0,0,0,0.12)',
  glassBorder: 'rgba(255,255,255,0.76)',
  chipBg: 'rgba(255,255,255,0.66)',
  star: '#0F0F0F',
  surfaceTint: '#ECECE7',

  overlay: 'rgba(255,255,255,0.18)',
  overlayStrong: 'rgba(255,255,255,0.30)',
  scrim: 'rgba(0,0,0,0.06)',
  whatsapp: '#111111',
};

export const darkColors: typeof lightColors = {
  bg: '#050505',
  bgAlt: '#0D0D0D',
  card: 'rgba(255,255,255,0.08)',
  cardSolid: '#111111',
  cardStrong: 'rgba(255,255,255,0.12)',
  nav: 'rgba(10,10,10,0.78)',
  frame: '#000000',

  primary: '#F7F7F4',
  primaryDark: '#FFFFFF',
  primarySoft: '#1A1A1A',
  primaryTint: 'rgba(255,255,255,0.12)',

  accent: '#EAEAE6',
  accentDark: '#FFFFFF',
  accentSoft: 'rgba(255,255,255,0.08)',

  success: '#F7F7F4',
  successSoft: 'rgba(255,255,255,0.10)',

  danger: '#FFFFFF',
  dangerDark: '#FFFFFF',
  dangerSoft: 'rgba(255,255,255,0.10)',

  warningBg: '#1C1C1C',
  warningText: '#F4F4F0',

  text: '#FAFAF7',
  textMuted: '#B8B8B2',
  textSubtle: '#8D8D88',
  textOnDark: '#050505',

  border: 'rgba(255,255,255,0.14)',
  glassBorder: 'rgba(255,255,255,0.16)',
  chipBg: 'rgba(255,255,255,0.08)',
  star: '#FFFFFF',
  surfaceTint: '#121212',

  overlay: 'rgba(255,255,255,0.10)',
  overlayStrong: 'rgba(255,255,255,0.18)',
  scrim: 'rgba(0,0,0,0.24)',
  whatsapp: '#FFFFFF',
};

export type AppColors = typeof lightColors;

export function paletteForMode(mode: ThemeMode) {
  return mode === 'dark' ? darkColors : lightColors;
}

// Legacy default for files that have not yet been made theme-aware.
export const colors = lightColors;

// Deliberately large for older users.
export const font = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 28,
  xxl: 32,
};

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

// Minimum touch target for accessibility.
export const TAP = 56;

export const shadow = {
  sm: {
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
  },
  md: {
    boxShadow: '0 22px 70px rgba(0, 0, 0, 0.14)',
  },
} as const;
