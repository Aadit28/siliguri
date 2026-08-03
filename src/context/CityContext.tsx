import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { City } from '../lib/types';
import { fetchCities } from '../lib/api';
import { DEFAULT_CITY_SLUG, FALLBACK_CITIES, getStoredCitySlug, storeCitySlug } from '../lib/city';
import { useAuth } from './AuthContext';

type CityContextValue = {
  cities: City[];
  city: City;
  /** True until the stored choice and the remote city list have both settled. */
  loading: boolean;
  setCitySlug: (slug: string) => void;
};

const CityContext = createContext<CityContextValue | null>(null);

function bySlug(cities: City[], slug: string | null | undefined) {
  return cities.find((item) => item.slug === slug) ?? null;
}

export function CityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [cities, setCities] = useState<City[]>(FALLBACK_CITIES);
  const [chosenSlug, setChosenSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCities(), getStoredCitySlug()])
      .then(([remote, stored]) => {
        if (cancelled) return;
        setCities(remote);
        setChosenSlug(stored);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // An account carrying its own city_id (city staff, or a user created by a
  // city admin) wins over the device choice: a Bengaluru admin signing in on a
  // demo phone must administer Bengaluru, not whatever the phone last showed.
  const accountCity = useMemo(
    () => cities.find((item) => item.id === user?.user_metadata?.city_id) ?? null,
    [cities, user?.user_metadata?.city_id],
  );

  const city = useMemo(
    () =>
      accountCity ??
      bySlug(cities, chosenSlug) ??
      bySlug(cities, DEFAULT_CITY_SLUG) ??
      cities[0] ??
      FALLBACK_CITIES[0],
    [accountCity, cities, chosenSlug],
  );

  const setCitySlug = useCallback((slug: string) => {
    setChosenSlug(slug);
    void storeCitySlug(slug);
  }, []);

  const value = useMemo<CityContextValue>(
    () => ({ cities, city, loading, setCitySlug }),
    [cities, city, loading, setCitySlug],
  );

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export function useCity() {
  const context = React.use(CityContext);
  if (!context) {
    throw new Error('useCity must be used inside CityProvider');
  }
  return context;
}
