// Saathi design system.
// Clinical + accessibility-first: crisp, modern surfaces (like Practo / 1mg)
// with NHS/USWDS-grade legibility for older users — high contrast, large bold
// type, big tap targets, one calm medical-blue accent and restrained color.

export const colors = {
  // Surfaces
  bg: '#F2F5F9', // clean cool off-white
  bgAlt: '#FFFFFF',
  card: '#FFFFFF',

  // Brand — calm, accessible medical blue (NHS-style)
  primary: '#005EB8',
  primaryDark: '#003E7E',
  primarySoft: '#E2EDFA', // tinted blue panel

  // Secondary — teal, used sparingly and only where a second hue truly helps
  accent: '#0F7A78',
  accentDark: '#0A5E5C',
  accentSoft: '#DCEFEE',

  // Success / verified — green
  success: '#0A7B3E',
  successSoft: '#E1F1E7',

  // Emergency / helpline — high-contrast red
  danger: '#D4351C',
  dangerDark: '#A82414',
  dangerSoft: '#FBE7E3',

  // Text — high contrast on white (all pass WCAG AA on card/bg)
  text: '#10243E', // near-black, slight blue
  textMuted: '#48566B',
  textOnDark: '#FFFFFF',

  // Lines & neutrals — visible, accessible borders
  border: '#D3DBE6',
  chipBg: '#E7ECF3',
  star: '#C77700',

  // Translucent overlays for use on the blue header
  overlay: 'rgba(255,255,255,0.20)',
  overlayStrong: 'rgba(255,255,255,0.30)',
};

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

// Soft elevation tokens. Work on web (mapped to box-shadow by react-native-web)
// and on native (shadow* on iOS, elevation on Android). Spread into a style.
export const shadow = {
  sm: {
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const;
