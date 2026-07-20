import {
  FONT_BOLD,
  FONT_EXTRABOLD,
  FONT_MEDIUM,
  FONT_REGULAR,
  FONT_SEMIBOLD,
} from './fonts';

export { FONT_BOLD, FONT_EXTRABOLD, FONT_MEDIUM, FONT_REGULAR, FONT_SEMIBOLD } from './fonts';

export type ThemeMode = 'light' | 'dark';

// Weight ceiling is deliberately low (Uber/Kroger register): "bold" renders
// DM Sans 600, "heavy" 700. 800 is never used — thick display weights read as
// template noise at this type scale.
export const family = {
  regular: FONT_REGULAR,
  medium: FONT_MEDIUM,
  semibold: FONT_SEMIBOLD,
  bold: FONT_SEMIBOLD,
  heavy: FONT_BOLD,
} as const;

// Monochrome system. White surfaces, near-black ink, one blue reserved for
// interactive/active states, red reserved for emergency. Nothing else carries color.
export const lightColors = {
  bg: '#FFFFFF',
  bgAlt: '#F6F6F6',
  card: '#FFFFFF',
  cardSolid: '#FFFFFF',
  cardStrong: '#FFFFFF',
  nav: '#FFFFFF',
  frame: '#F6F6F6',

  primary: '#0A0A0A',
  primaryDark: '#000000',
  primarySoft: '#F3F3F3',
  primaryTint: 'rgba(10,10,10,0.06)',
  primaryFg: '#FFFFFF',

  accent: '#276EF1',
  accentDark: '#1E54C4',
  accentSoft: 'rgba(39,110,241,0.10)',
  accentFg: '#FFFFFF',
  info: '#276EF1',
  infoDark: '#1E54C4',
  infoSoft: 'rgba(39,110,241,0.10)',

  success: '#166C3B',
  successSoft: 'rgba(22,108,59,0.10)',
  successFg: '#FFFFFF',

  danger: '#BB032A',
  dangerDark: '#8E0224',
  dangerSoft: 'rgba(187,3,42,0.08)',
  dangerFg: '#FFFFFF',
  emergency: '#E11900',
  emergencyDark: '#B71500',
  emergencySoft: 'rgba(225,25,0,0.08)',

  warningBg: '#FFF7E0',
  warningText: '#6B5200',

  text: '#0A0A0A',
  textMuted: '#5E5E5E',
  textSubtle: '#8A8A8A',
  textOnDark: '#FFFFFF',

  border: '#E8E8E8',
  glassBorder: '#E8E8E8',
  chipBg: '#F3F3F3',
  star: '#0A0A0A',
  surfaceTint: '#F6F6F6',

  overlay: 'rgba(255,255,255,0.85)',
  overlayStrong: 'rgba(255,255,255,0.92)',
  scrim: 'rgba(0,0,0,0.04)',
  whatsapp: '#128C7E',
  whatsappText: '#FFFFFF',
  handle: '#D6D6D6',
};

export const darkColors: typeof lightColors = {
  bg: '#0A0A0A',
  bgAlt: '#121212',
  card: '#141414',
  cardSolid: '#141414',
  cardStrong: '#1A1A1A',
  nav: '#0A0A0A',
  frame: '#050505',

  primary: '#FFFFFF',
  primaryDark: '#F5F5F5',
  primarySoft: '#1F1F1F',
  primaryTint: 'rgba(255,255,255,0.08)',
  primaryFg: '#0A0A0A',

  accent: '#6FA1FF',
  accentDark: '#9DBFFF',
  accentSoft: 'rgba(111,161,255,0.14)',
  accentFg: '#0A0A0A',
  info: '#6FA1FF',
  infoDark: '#9DBFFF',
  infoSoft: 'rgba(111,161,255,0.14)',

  success: '#58C27D',
  successSoft: 'rgba(88,194,125,0.14)',
  successFg: '#06180D',

  danger: '#FF6B85',
  dangerDark: '#FF9CAD',
  dangerSoft: 'rgba(255,107,133,0.14)',
  dangerFg: '#20040B',
  emergency: '#E11900',
  emergencyDark: '#FF4B33',
  emergencySoft: 'rgba(225,25,0,0.18)',

  warningBg: '#241C06',
  warningText: '#F5D77B',

  text: '#F5F5F5',
  textMuted: '#A3A3A3',
  textSubtle: '#6E6E6E',
  textOnDark: '#0A0A0A',

  border: '#262626',
  glassBorder: '#262626',
  chipBg: '#1F1F1F',
  star: '#F5F5F5',
  surfaceTint: '#161616',

  overlay: 'rgba(0,0,0,0.55)',
  overlayStrong: 'rgba(0,0,0,0.72)',
  scrim: 'rgba(0,0,0,0.30)',
  whatsapp: '#25D366',
  whatsappText: '#062315',
  handle: '#3A3A3A',
};

export type AppColors = typeof lightColors;

export function paletteForMode(mode: ThemeMode) {
  return mode === 'dark' ? darkColors : lightColors;
}

// Legacy default for files that have not yet been made theme-aware.
export const colors = lightColors;

export const font = {
  xs: 13,
  sm: 15,
  md: 17,
  lg: 22,
  xl: 28,
  xxl: 36,
};

export const tracking = {
  display: -1,
  xxl: -0.6,
  xl: -0.4,
  lg: -0.2,
  md: 0,
  sm: 0,
  xs: 0,
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = { sm: 8, md: 10, lg: 12, xl: 16, pill: 999 };

// Minimum touch target for accessibility.
export const TAP = 56;

export const ROW_MIN_HEIGHT = 64;

// Flat surfaces separated by hairline borders; elevation only for floating layers.
export const shadow = {
  sm: {
    boxShadow: 'none',
  },
  md: {
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
} as const;
