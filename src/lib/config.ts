// Official public emergency rails used for the SOS surface.
export const EMERGENCY_PRIMARY_NUMBER = '112';
export const EMERGENCY_PRIMARY_DISPLAY = '112';
export const EMERGENCY_LINES = [
  { key: 'ambulance', number: '102', display: '102' },
  { key: 'police', number: '100', display: '100' },
  { key: 'fire', number: '101', display: '101' },
  { key: 'lpg', number: '1906', display: '1906' },
] as const;

// App-wide constants. Replace this with the staffed Saathi help-desk number.
export const HELPLINE_NUMBER = '+911800123456';
export const HELPLINE_DISPLAY = '1800-123-456';
