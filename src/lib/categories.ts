import { pastel, PastelName, ThemeMode } from './theme';
import { ServiceCategory, PostCategory } from './types';

export const SERVICE_CATEGORIES: { key: ServiceCategory; emoji: string }[] = [
  { key: 'elder_home', emoji: '🏡' },
  { key: 'doctor', emoji: '👨‍⚕️' },
  { key: 'hospital', emoji: '🏥' },
  { key: 'medical_shop', emoji: '💊' },
  { key: 'travel_agent', emoji: '✈️' },
  { key: 'home_service', emoji: '🛠️' },
  { key: 'daily_service', emoji: '🧹' },
];

// Each category owns one pastel tone (chips/badges only; see theme.pastel).
export const CATEGORY_TONES: Record<ServiceCategory, PastelName> = {
  elder_home: 'sage',
  doctor: 'sky',
  hospital: 'coral',
  medical_shop: 'rose',
  travel_agent: 'peach',
  home_service: 'lilac',
  daily_service: 'butter',
};

// Per-category searchable keywords. Includes Hindi/Bengali transliterations
// (romanised) so an elder typing "daktar" or "bijli" still matches the English
// listing text. Keep transliterations lowercase and space/hyphen tolerant.
export const SERVICE_SEARCH_ALIASES: Record<ServiceCategory, string[]> = {
  elder_home: [
    'elder home',
    'elder care',
    'old age home',
    'senior care',
    'attendant',
    'nursing care',
    'briddhashram',
    'buzurg',
  ],
  doctor: [
    'doctor',
    'clinic',
    'appointment',
    'specialist',
    'physician',
    'opd',
    'daktar',
    'daktor',
    'chikitsak',
  ],
  hospital: ['hospital', 'emergency', 'ambulance', 'nursing home', 'icu', 'aspatal', 'haspatal'],
  medical_shop: [
    'medical shop',
    'medicine shop',
    'pharmacy',
    'chemist',
    'medicines',
    'prescription',
    'drugstore',
    'dawai',
    'dawa',
    'oshudh',
  ],
  travel_agent: [
    'travel',
    'transport',
    'taxi',
    'ride',
    'bus',
    'train',
    'flight',
    'airport',
    'station',
    'gaadi',
  ],
  home_service: [
    'home service',
    'home services',
    'handyman',
    'handyman services',
    'home repair',
    'doorstep service',
    'repair technician',
    'repair',
    'mistri',
    'mistiri',
    'bijli mistri',
    'nal mistri',
  ],
  daily_service: [
    'daily service',
    'daily help',
    'civic',
    'civil',
    'municipal',
    'water',
    'electricity board',
    'gas',
    'lpg',
    'post office',
    'plumber',
    'plumbing',
    'electrician',
    'carpenter',
    'pest control',
    'handyman',
    'bijli',
    'nal',
    'mistri',
    'barhai',
    'jhadu',
  ],
};

// Query-text expansion: maps common misspellings and Hindi/Bengali
// transliterations a user might type into the canonical English terms present
// in SERVICE_SEARCH_ALIASES / listing text. Single source of truth — the
// Services screen imports expandServiceQuery rather than keeping its own copy.
export const SERVICE_QUERY_ALIASES: Record<string, string[]> = {
  'medical store': ['medical shop', 'pharmacy'],
  'medicine store': ['medical shop', 'pharmacy'],
  chemist: ['medical shop', 'pharmacy'],
  dawai: ['medical shop', 'pharmacy', 'medicine'],
  dawa: ['medical shop', 'pharmacy', 'medicine'],
  oshudh: ['medical shop', 'pharmacy', 'medicine'],
  'wheel chair': ['wheelchair'],
  plumber: ['plumber'],
  pluber: ['plumber'],
  plummer: ['plumber'],
  plumbers: ['plumber'],
  nal: ['plumber'],
  'nal mistri': ['plumber'],
  'nal-mistri': ['plumber'],
  mistri: ['plumber', 'electrician', 'carpenter'],
  electrician: ['electrician', 'electrical'],
  electricians: ['electrician', 'electrical'],
  electricans: ['electrician', 'electrical'],
  electrican: ['electrician', 'electrical'],
  electroicoams: ['electrician', 'electrical'],
  electronician: ['electrician', 'electrical'],
  bijli: ['electrician', 'electrical'],
  'bijli mistri': ['electrician', 'electrical'],
  doctor: ['doctor'],
  daktar: ['doctor'],
  daktor: ['doctor'],
  aspatal: ['hospital'],
  haspatal: ['hospital'],
  barhai: ['carpenter'],
  'civil help': ['civic help', 'daily service'],
  'civil services': ['civic help', 'daily service'],
};

// Kept as a named alias so any older import path still resolves.
export const SERVICE_QUERY_ALIAS_MAP = SERVICE_QUERY_ALIASES;

export function expandServiceQuery(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Array.from(new Set([q, ...(SERVICE_QUERY_ALIASES[q] ?? [])]));
}

export function categoryColor(cat: ServiceCategory, mode: ThemeMode = 'light') {
  return pastel[mode][CATEGORY_TONES[cat] ?? 'butter'];
}

export const POST_CATEGORIES: { key: PostCategory; emoji: string }[] = [
  { key: 'general', emoji: 'QA' },
  { key: 'health', emoji: 'HL' },
  { key: 'travel', emoji: 'TR' },
  { key: 'daily_life', emoji: 'DL' },
  { key: 'best_practice', emoji: 'TIP' },
];

export function serviceSearchAliases(cat: ServiceCategory): string[] {
  return SERVICE_SEARCH_ALIASES[cat] ?? [];
}

export function postEmoji(cat: PostCategory): string {
  return POST_CATEGORIES.find((c) => c.key === cat)?.emoji ?? 'QA';
}
