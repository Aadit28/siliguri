import { ServiceCategory, PostCategory } from './types';

export const SERVICE_CATEGORIES: { key: ServiceCategory; emoji: string }[] = [
  { key: 'elder_home', emoji: '🏡' },
  { key: 'doctor', emoji: '👨‍⚕️' },
  { key: 'hospital', emoji: '🏥' },
  { key: 'medical_shop', emoji: '💊' },
  { key: 'travel_agent', emoji: '✈️' },
  { key: 'daily_service', emoji: '🧹' },
];

// Neutral icon-tile tones keep the app in a simple black-white visual system.
// bg = icon-tile background, fg = label / detail text.
export const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; fg: string }> = {
  elder_home: { bg: '#F6F6F2', fg: '#111111' },
  doctor: { bg: '#EFEFEB', fg: '#111111' },
  hospital: { bg: '#E8E8E3', fg: '#111111' },
  medical_shop: { bg: '#E1E1DD', fg: '#111111' },
  travel_agent: { bg: '#DADAD6', fg: '#111111' },
  daily_service: { bg: '#F0F0EE', fg: '#111111' },
};

export function categoryColor(cat: ServiceCategory) {
  return CATEGORY_COLORS[cat] ?? { bg: '#EAEAE6', fg: '#111111' };
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
