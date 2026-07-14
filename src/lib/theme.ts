import {
  FONT_BOLD,
  FONT_EXTRABOLD,
  FONT_MEDIUM,
  FONT_REGULAR,
  FONT_SEMIBOLD,
} from './fonts';

export { FONT_BOLD, FONT_EXTRABOLD, FONT_MEDIUM, FONT_REGULAR, FONT_SEMIBOLD } from './fonts';

export type ThemeMode = 'light' | 'dark';

export const family = {
  regular: FONT_REGULAR,
  medium: FONT_MEDIUM,
  semibold: FONT_SEMIBOLD,
  bold: FONT_BOLD,
  heavy: FONT_EXTRABOLD,
} as const;

export const lightColors = {
  bg: '#F4F2EC',
  bgAlt: '#FBFAF7',
  card: 'rgba(255,255,255,0.96)',
  cardSolid: '#FFFFFF',
  cardStrong: '#FFFFFF',
  nav: '#123C38',
  frame: '#E7E3D9',

  primary: '#176B63',
  primaryDark: '#0B4D47',
  primarySoft: '#DCEEEA',
  primaryTint: 'rgba(23,107,99,0.10)',
  primaryFg: '#FFFFFF',

  accent: '#E06A4E',
  accentDark: '#9F3A28',
  accentSoft: 'rgba(224,106,78,0.14)',
  accentFg: '#FFFFFF',
  info: '#6157D8',
  infoDark: '#3329A8',
  infoSoft: 'rgba(97,87,216,0.13)',

  success: '#26734D',
  successSoft: 'rgba(38,115,77,0.13)',
  successFg: '#FFFFFF',

  danger: '#B42318',
  dangerDark: '#7A1C14',
  dangerSoft: 'rgba(180,35,24,0.12)',
  dangerFg: '#FFFFFF',
  emergency: '#D92D20',
  emergencyDark: '#A61E16',
  emergencySoft: 'rgba(217,45,32,0.12)',

  warningBg: '#FFF0C2',
  warningText: '#5D3B00',

  text: '#1C2826',
  textMuted: '#586764',
  textSubtle: '#788480',
  textOnDark: '#FFFFFF',

  border: 'rgba(28,40,38,0.12)',
  glassBorder: 'rgba(255,255,255,0.74)',
  chipBg: '#EFF5F2',
  star: '#E06A4E',
  surfaceTint: '#E6EFEB',

  overlay: 'rgba(255,255,255,0.28)',
  overlayStrong: 'rgba(255,255,255,0.42)',
  scrim: 'rgba(23,76,79,0.08)',
  whatsapp: '#128C7E',
  whatsappText: '#FFFFFF',
  handle: '#C9D1CE',
};

export const darkColors: typeof lightColors = {
  bg: '#07110F',
  bgAlt: '#0B1916',
  card: 'rgba(255,255,255,0.075)',
  cardSolid: '#0F1E1B',
  cardStrong: '#132521',
  nav: '#07110F',
  frame: '#06100F',

  primary: '#A4E5D1',
  primaryDark: '#D9FFF3',
  primarySoft: '#193B34',
  primaryTint: 'rgba(164,229,209,0.14)',
  primaryFg: '#06100F',

  accent: '#FFB59F',
  accentDark: '#FFE0D6',
  accentSoft: 'rgba(255,177,152,0.13)',
  accentFg: '#24100B',
  info: '#B9B1FF',
  infoDark: '#E1DDFF',
  infoSoft: 'rgba(185,177,255,0.14)',

  success: '#8BD8A8',
  successSoft: 'rgba(139,216,168,0.14)',
  successFg: '#061A10',

  danger: '#FFB4AB',
  dangerDark: '#FFDAD6',
  dangerSoft: 'rgba(255,180,171,0.14)',
  dangerFg: '#2A0E08',
  emergency: '#D92D20',
  emergencyDark: '#FFB4AB',
  emergencySoft: 'rgba(217,45,32,0.22)',

  warningBg: '#2C2110',
  warningText: '#FFE2A5',

  text: '#F7FAF4',
  textMuted: '#B9C8C2',
  textSubtle: '#83948E',
  textOnDark: '#06100F',

  border: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.16)',
  chipBg: 'rgba(255,255,255,0.09)',
  star: '#FFB198',
  surfaceTint: '#0D2421',

  overlay: 'rgba(255,255,255,0.10)',
  overlayStrong: 'rgba(255,255,255,0.18)',
  scrim: 'rgba(0,0,0,0.24)',
  whatsapp: '#25D366',
  whatsappText: '#062315',
  handle: '#49615A',
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

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

// Minimum touch target for accessibility.
export const TAP = 56;

export const ROW_MIN_HEIGHT = 64;

export const shadow = {
  sm: {
    boxShadow: '0 4px 14px rgba(18, 34, 31, 0.07)',
  },
  md: {
    boxShadow: '0 12px 36px rgba(18, 34, 31, 0.10)',
  },
} as const;
