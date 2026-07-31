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
  // Darkened to clear WCAG AA (4.5:1) on white/#F6F6F6 for low vision. Prior
  // #8A8A8A (~3.5:1) failed; #6B6B6B is ~5:1. textMuted #4F4F4F is ~8.5:1.
  textMuted: '#4F4F4F',
  textSubtle: '#6B6B6B',
  textOnDark: '#FFFFFF',

  border: '#E8E8E8',
  glassBorder: '#E8E8E8',
  chipBg: '#F3F3F3',
  star: '#0A0A0A',
  surfaceTint: '#F6F6F6',

  overlay: 'rgba(255,255,255,0.85)',
  overlayStrong: 'rgba(255,255,255,0.92)',
  scrim: 'rgba(0,0,0,0.04)',
  navGlass: 'rgba(222,224,229,0.62)',
  navEdgeHi: 'rgba(255,255,255,0.92)',
  navEdgeLo: 'rgba(120,126,138,0.35)',
  navPill: 'rgba(255,255,255,0.66)',
  navPillEdge: 'rgba(255,255,255,0.95)',
  panelGlass: 'rgba(255,255,255,0.94)',
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
  // On near-black bg dark text must lighten to keep 4.5:1. Prior subtle #6E6E6E
  // (~4:1) failed; #8C8C8C is ~5.9:1. Muted #A3A3A3 (~9:1) already passes.
  textMuted: '#A3A3A3',
  textSubtle: '#8C8C8C',
  textOnDark: '#0A0A0A',

  border: '#262626',
  glassBorder: '#262626',
  chipBg: '#1F1F1F',
  star: '#F5F5F5',
  surfaceTint: '#161616',

  overlay: 'rgba(0,0,0,0.55)',
  overlayStrong: 'rgba(0,0,0,0.72)',
  scrim: 'rgba(0,0,0,0.30)',
  navGlass: 'rgba(4,4,6,0.74)',
  navEdgeHi: 'rgba(255,255,255,0.34)',
  navEdgeLo: 'rgba(255,255,255,0.05)',
  navPill: 'rgba(255,255,255,0.10)',
  navPillEdge: 'rgba(255,255,255,0.22)',
  panelGlass: 'rgba(20,20,20,0.92)',
  whatsapp: '#25D366',
  whatsappText: '#062315',
  handle: '#3A3A3A',
};

export type AppColors = typeof lightColors;

export function paletteForMode(mode: ThemeMode) {
  return mode === 'dark' ? darkColors : lightColors;
}

// Pastel tints live in one slot only — icon chips. Surfaces, text and CTAs
// stay monochrome. fg is a deep same-hue ink so glyphs keep >=4.5:1 on the
// tint; dark mode swaps tints for low-alpha washes so chips sit on any surface.
export type PastelName = 'sage' | 'sky' | 'coral' | 'rose' | 'peach' | 'lilac' | 'butter';

export type PastelTone = { bg: string; fg: string; border: string };

export const pastel: Record<ThemeMode, Record<PastelName, PastelTone>> = {
  light: {
    sage: { bg: '#E3F0E4', fg: '#2E5D3C', border: '#CDE3D0' },
    sky: { bg: '#E1EEFA', fg: '#22537F', border: '#C9E0F4' },
    coral: { bg: '#FBE5E4', fg: '#8E3630', border: '#F4CFCC' },
    rose: { bg: '#FAE4EF', fg: '#8C2F5D', border: '#F2CCE0' },
    peach: { bg: '#FDEBDC', fg: '#8A4A1B', border: '#F6D8BF' },
    lilac: { bg: '#ECE6F8', fg: '#4E3A80', border: '#DCD2F1' },
    butter: { bg: '#FBF0D4', fg: '#6F5716', border: '#F0E1B2' },
  },
  dark: {
    sage: { bg: 'rgba(110,190,130,0.16)', fg: '#A8D8B4', border: 'rgba(110,190,130,0.30)' },
    sky: { bg: 'rgba(100,170,240,0.16)', fg: '#A9CFF5', border: 'rgba(100,170,240,0.30)' },
    coral: { bg: 'rgba(240,120,110,0.16)', fg: '#F3B3AE', border: 'rgba(240,120,110,0.30)' },
    rose: { bg: 'rgba(235,110,175,0.16)', fg: '#F0B4D4', border: 'rgba(235,110,175,0.30)' },
    peach: { bg: 'rgba(245,150,80,0.16)', fg: '#F4C79E', border: 'rgba(245,150,80,0.30)' },
    lilac: { bg: 'rgba(150,120,235,0.18)', fg: '#C9BCF0', border: 'rgba(150,120,235,0.32)' },
    butter: { bg: 'rgba(235,190,80,0.16)', fg: '#E8D397', border: 'rgba(235,190,80,0.30)' },
  },
};

export function pastelForMode(mode: ThemeMode) {
  return pastel[mode];
}

// Legacy default for files that have not yet been made theme-aware.
export const colors = lightColors;

// Scale floor raised for low-vision elders (70+, cataracts): xs/sm were 13/15,
// too small for tab labels, tags, metadata and form labels. Bumped in measured
// 1-2px steps so layouts hold.
export const font = {
  xs: 15,
  sm: 16,
  md: 18,
  lg: 23,
  xl: 29,
  xxl: 37,
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

// Bottom clearance for scroll content on phone: the tab bar floats (absolute,
// glass) so screens must pad past it or the last row hides underneath.
export const TAB_BAR_CLEARANCE = 118;

// Flat surfaces separated by hairline borders; elevation only for floating layers.
export const shadow = {
  sm: {
    boxShadow: 'none',
  },
  md: {
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  },
} as const;
