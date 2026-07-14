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

// Subtle, adult-leaning tones keep categories distinct without feeling playful.
// bg = badge background, fg = badge text, border = card accent/badge outline.
export const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; fg: string; border: string }> = {
  elder_home: { bg: '#EEF2E9', fg: '#324436', border: '#C8D5C4' },
  doctor: { bg: '#EAF0F4', fg: '#294659', border: '#C7D6E1' },
  hospital: { bg: '#F2ECE4', fg: '#5A4433', border: '#DCCCBD' },
  medical_shop: { bg: '#F4E8E6', fg: '#6A4036', border: '#E2C8C1' },
  travel_agent: { bg: '#E8EFEB', fg: '#355145', border: '#C7D6CD' },
  home_service: { bg: '#EFEDE6', fg: '#49463A', border: '#D4CEC2' },
  daily_service: { bg: '#EFEAE2', fg: '#5A493B', border: '#D7C9BB' },
};

export const SERVICE_SEARCH_ALIASES: Record<ServiceCategory, string[]> = {
  elder_home: ['elder home', 'elder care', 'old age home', 'senior care', 'attendant', 'nursing care'],
  doctor: ['doctor', 'clinic', 'appointment', 'specialist', 'physician', 'opd'],
  hospital: ['hospital', 'emergency', 'ambulance', 'nursing home', 'icu'],
  medical_shop: [
    'medical shop',
    'medicine shop',
    'pharmacy',
    'chemist',
    'medicines',
    'prescription',
    'drugstore',
  ],
  travel_agent: ['travel', 'transport', 'taxi', 'ride', 'bus', 'train', 'flight', 'airport', 'station'],
  home_service: [
    'home service',
    'home services',
    'handyman',
    'handyman services',
    'home repair',
    'doorstep service',
    'repair technician',
    'repair',
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
  ],
};

export function categoryColor(cat: ServiceCategory) {
  return CATEGORY_COLORS[cat] ?? { bg: '#EAEAE6', fg: '#111111', border: '#D8D8D2' };
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
