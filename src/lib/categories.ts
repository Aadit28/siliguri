import { ServiceCategory, PostCategory } from './types';

export const SERVICE_CATEGORIES: { key: ServiceCategory; emoji: string }[] = [
  { key: 'elder_home', emoji: '🏡' },
  { key: 'doctor', emoji: '👨‍⚕️' },
  { key: 'hospital', emoji: '🏥' },
  { key: 'medical_shop', emoji: '💊' },
  { key: 'travel_agent', emoji: '✈️' },
  { key: 'daily_service', emoji: '🧹' },
];

// Soft, distinct, harmonious tints so each category reads at a glance.
// bg = icon-tile background, fg = accent for the label / detail text.
export const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; fg: string }> = {
  elder_home: { bg: '#FCE9D6', fg: '#C2410C' },
  doctor: { bg: '#E0EDFB', fg: '#005EB8' },
  hospital: { bg: '#FBE3E3', fg: '#C2362B' },
  medical_shop: { bg: '#E2F1E7', fg: '#0A7B3E' },
  travel_agent: { bg: '#DCEFEF', fg: '#0F7A78' },
  daily_service: { bg: '#EAE6FB', fg: '#5B4BC4' },
};

export function categoryColor(cat: ServiceCategory) {
  return CATEGORY_COLORS[cat] ?? { bg: '#EAEFF5', fg: '#48566B' };
}

export const POST_CATEGORIES: { key: PostCategory; emoji: string }[] = [
  { key: 'general', emoji: '💬' },
  { key: 'health', emoji: '❤️' },
  { key: 'travel', emoji: '🧳' },
  { key: 'daily_life', emoji: '🏠' },
  { key: 'best_practice', emoji: '⭐' },
];

export function serviceEmoji(cat: ServiceCategory): string {
  return SERVICE_CATEGORIES.find((c) => c.key === cat)?.emoji ?? '📍';
}

export function postEmoji(cat: PostCategory): string {
  return POST_CATEGORIES.find((c) => c.key === cat)?.emoji ?? '💬';
}
