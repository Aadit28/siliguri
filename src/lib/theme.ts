// Elderly-friendly theme: large type, high contrast, big tap targets.
export const colors = {
  bg: '#F7F9FC',
  card: '#FFFFFF',
  primary: '#1565C0', // strong, trustworthy blue
  primaryDark: '#0D47A1',
  accent: '#2E7D32', // green for "verified" / positive
  danger: '#C62828', // helpline / emergency red
  text: '#15233B',
  textMuted: '#5A6B82',
  border: '#DDE4EE',
  chipBg: '#E8F0FB',
  star: '#F5A623',
};

// Deliberately large for older users.
export const font = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 28,
  xxl: 34,
};

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

// Minimum touch target for accessibility.
export const TAP = 56;
