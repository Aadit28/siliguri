import {
  FONT_REGULAR,
  FONT_MEDIUM,
  FONT_SEMIBOLD,
  FONT_BOLD,
  FONT_EXTRABOLD,
} from './fonts';

export {
  FONT_REGULAR,
  FONT_MEDIUM,
  FONT_SEMIBOLD,
  FONT_BOLD,
  FONT_EXTRABOLD,
} from './fonts';

export type ThemeMode = 'light' | 'dark';

// One family: DM Sans. When fontFamily is set, NEVER also set fontWeight
// (Android synthesizes fake bold). Weight is chosen only via family.*.
export const family = {
  regular: FONT_REGULAR,
  medium: FONT_MEDIUM,
  semibold: FONT_SEMIBOLD,
  bold: FONT_BOLD,
  heavy: FONT_EXTRABOLD,
} as const;

export const lightColors = {
  bg: '#F6F6F4',            // page (Kroger #F5F6F6 warmed)
  bgAlt: '#FFFFFF',         // sheets, forms, CTA bar (Uber white sheet)
  card: '#FFFFFF',          // standard card (flat, no blur)
  cardSolid: '#FFFFFF',     // sheet/dialog surface
  cardStrong: '#EFEFED',    // selected/pressed surface (Uber selected-row gray)
  nav: 'rgba(255,255,255,0.96)', // tab bar
  frame: '#E9E9E5',

  primary: '#000000',       // Uber black CTA
  primaryDark: '#262626',   // pressed state of primary
  primarySoft: '#EBEBE9',
  primaryTint: 'rgba(0,0,0,0.06)',   // press wash
  primaryFg: '#FFFFFF',     // text/icon on primary fill

  accent: '#1E5FC9',        // the one blue (AA on off-white)
  accentDark: '#16489C',    // pressed accent
  accentSoft: 'rgba(30,95,201,0.10)',
  accentFg: '#FFFFFF',

  success: '#0E7C3F',
  successSoft: 'rgba(14,124,63,0.12)',
  successFg: '#FFFFFF',

  danger: '#C9200F',
  dangerDark: '#A81A0C',    // pressed danger
  dangerSoft: 'rgba(201,32,15,0.10)',
  dangerFg: '#FFFFFF',

  warningBg: '#FBF3E4',
  warningText: '#7A4D0B',

  text: '#121316',
  textMuted: '#5B5B57',
  textSubtle: '#686863',
  textOnDark: '#FFFFFF',

  border: 'rgba(0,0,0,0.10)',       // hairlines, card borders
  glassBorder: 'rgba(0,0,0,0.16)',  // strong border: secondary-button outline, focus rings
  chipBg: '#ECECEA',
  star: '#121316',                  // monochrome rating, never gold
  surfaceTint: '#F1F1EF',           // tile/disc/search-pill fill

  overlay: 'rgba(0,0,0,0.04)',       // hover/press wash on surfaces
  overlayStrong: 'rgba(0,0,0,0.08)',
  scrim: 'rgba(0,0,0,0.45)',         // modal backdrop
  whatsapp: '#0E7C3F',               // = success; pair with successFg
  handle: '#E2E2E1',                 // sheet drag handle
};

export const darkColors: typeof lightColors = {
  bg: '#1F2023',
  bgAlt: '#26272A',
  card: '#2A2B2E',
  cardSolid: '#2A2B2E',
  cardStrong: '#313236',    // sunk/hover
  nav: 'rgba(31,32,35,0.96)',
  frame: '#141517',

  primary: '#EDEDEB',       // inverted near-white CTA
  primaryDark: '#FFFFFF',   // pressed
  primarySoft: '#313236',
  primaryTint: 'rgba(255,255,255,0.10)',
  primaryFg: '#17181A',

  accent: '#639AF5',
  accentDark: '#8AB4F8',    // pressed (lighter in dark)
  accentSoft: 'rgba(99,154,245,0.16)',
  accentFg: '#101114',

  success: '#4CC38A',
  successSoft: 'rgba(76,195,138,0.16)',
  successFg: '#0B2013',

  danger: '#F2695C',
  dangerDark: '#F58E84',    // pressed
  dangerSoft: 'rgba(242,105,92,0.16)',
  dangerFg: '#2A0E08',

  warningBg: '#2E2617',
  warningText: '#E8C87E',

  text: '#E8E9EA',
  textMuted: '#B3B4B6',
  textSubtle: '#96979A',
  textOnDark: '#17181A',    // text on the light (inverted) fills

  border: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.18)',
  chipBg: '#2A2B2E',
  star: '#E8E9EA',
  surfaceTint: '#2E2F33',

  overlay: 'rgba(255,255,255,0.06)',
  overlayStrong: 'rgba(255,255,255,0.10)',
  scrim: 'rgba(0,0,0,0.60)',
  whatsapp: '#4CC38A',      // = success; pair with successFg
  handle: '#494A4F',
};

export type AppColors = typeof lightColors;

export function paletteForMode(mode: ThemeMode) {
  return mode === 'dark' ? darkColors : lightColors;
}

// Legacy default for files that have not yet been made theme-aware.
export const colors = lightColors;

// Deliberately large for older users. md 18 is the body floor.
export const font = {
  xs: 14,      // captions, badges, tab labels, timestamps
  sm: 16,      // subtitles, meta, chip labels
  md: 18,      // body base
  lg: 22,      // H2/section headers, sheet/dialog titles
  xl: 28,      // large headings, key figures
  xxl: 34,     // H1 screen titles
  display: 40, // hero numerals/greeting only
};

// Letter-spacing (px) per size step; md and below stay 0.
export const tracking = {
  display: -1.0,
  xxl: -0.6,
  xl: -0.4,
  lg: -0.2,
  md: 0,
  sm: 0,
  xs: 0,
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

// Minimum touch target for accessibility.
export const TAP = 56;

// Uber row anatomy: rows grow with 2-line text but never shrink below this.
export const ROW_MIN_HEIGHT = 64;

// Bottom-sheet top-corner radius (= radius.xl).
export const SHEET_RADIUS = 24;

// Whisper shadows; borders carry structure. Same strings ship in dark mode
// (invisible on near-black is correct — glassBorder borders separate there).
export const shadow = {
  sm: { boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },              // cards
  md: { boxShadow: '0 2px 10px -2px rgba(0,0,0,0.12)' },        // dialogs, popped elements
  sheet: { boxShadow: '0 -8px 32px rgba(0,0,0,0.16)' },         // bottom sheets (light mode)
} as const;

// Use with Reanimated: Easing.bezier(...motion.easeOutQuint).
export const motion = {
  easeOutQuint: [0.23, 1, 0.32, 1] as const,        // entrances, sheets
  easeOutQuart: [0.22, 1, 0.36, 1] as const,        // generic state changes
  easeInQuint: [0.755, 0.05, 0.855, 0.06] as const, // exits
  pop: [0.34, 1.56, 0.64, 1] as const,              // press-release overshoot
  dur: {
    press: 120,
    fast: 160,
    base: 200,
    sheetIn: 280,
    sheetOut: 220,
    dialogIn: 200,
    dialogOut: 140,
  },
};
