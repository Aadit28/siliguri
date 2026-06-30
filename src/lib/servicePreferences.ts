import 'expo-sqlite/localStorage/install';
import { useCallback, useEffect, useState } from 'react';

const FAVORITES_KEY = 'saathi.favoriteServiceIds';
const RECENT_KEY = 'saathi.recentServiceIds';
const MAX_RECENT = 12;

type PreferenceKey = typeof FAVORITES_KEY | typeof RECENT_KEY;
type Listener = () => void;

const listeners = new Map<PreferenceKey, Set<Listener>>();

function readIds(key: PreferenceKey): string[] {
  try {
    const stored = globalThis.localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key: PreferenceKey, ids: string[]) {
  globalThis.localStorage.setItem(key, JSON.stringify(ids));
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: PreferenceKey, listener: Listener) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);
  return () => {
    listeners.get(key)?.delete(listener);
  };
}

export function useServicePreferences() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readIds(FAVORITES_KEY));
  const [recentIds, setRecentIds] = useState<string[]>(() => readIds(RECENT_KEY));

  useEffect(() => subscribe(FAVORITES_KEY, () => setFavoriteIds(readIds(FAVORITES_KEY))), []);
  useEffect(() => subscribe(RECENT_KEY, () => setRecentIds(readIds(RECENT_KEY))), []);

  const toggleFavorite = useCallback((serviceId: string) => {
    const current = readIds(FAVORITES_KEY);
    writeIds(
      FAVORITES_KEY,
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [serviceId, ...current],
    );
  }, []);

  const recordViewed = useCallback((serviceId: string) => {
    const current = readIds(RECENT_KEY);
    writeIds(
      RECENT_KEY,
      [serviceId, ...current.filter((id) => id !== serviceId)].slice(0, MAX_RECENT),
    );
  }, []);

  return {
    favoriteIds,
    favoriteSet: new Set(favoriteIds),
    recentIds,
    toggleFavorite,
    recordViewed,
  };
}
