import { ServiceCategory, PostCategory } from './types';

export const SERVICE_CATEGORIES: { key: ServiceCategory; emoji: string }[] = [
  { key: 'doctor', emoji: '👨‍⚕️' },
  { key: 'hospital', emoji: '🏥' },
  { key: 'medical_shop', emoji: '💊' },
  { key: 'travel_agent', emoji: '✈️' },
  { key: 'daily_service', emoji: '🧹' },
];

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
