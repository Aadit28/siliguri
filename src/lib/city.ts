import AsyncStorage from '@react-native-async-storage/async-storage';
import { City } from './types';

/**
 * Which city's directory the app is showing.
 *
 * Stored per device rather than per user: unlike the onboarding flag, the city
 * is a property of where the phone physically is, and a shared family phone in
 * Siliguri stays a Siliguri phone no matter who signs in. An account that
 * carries its own city_id (staff, or a user created by a city admin) overrides
 * the device value — see CityContext.
 */

const KEY = 'saathi.city.v1';

export const DEFAULT_CITY_SLUG = 'siliguri';

// Used when Supabase is unreachable or the cities table has not been migrated
// yet, so the picker is never empty and demo mode still works offline.
export const FALLBACK_CITIES: City[] = [
  { id: 'local-siliguri', name: 'Siliguri', slug: 'siliguri', state: 'West Bengal', active: true },
  { id: 'local-bengaluru', name: 'Bengaluru', slug: 'bengaluru', state: 'Karnataka', active: true },
  { id: 'local-ahilyanagar', name: 'Ahilyanagar', slug: 'ahilyanagar', state: 'Maharashtra', active: true },
];

export async function getStoredCitySlug(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    // A storage failure just means we fall back to the default city.
    return null;
  }
}

export async function storeCitySlug(slug: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, slug);
  } catch {
    // Worst case the choice does not survive a restart. Never block the UI.
  }
}
