import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { AppColors, paletteForMode, ThemeMode } from '../lib/theme';

const STORAGE_KEY = 'saathi.theme.mode';

type ThemeContextValue = {
  mode: ThemeMode;
  isDark: boolean;
  colors: AppColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemMode = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemMode === 'dark' ? 'dark' : 'light');
  const userPicked = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!mounted || userPicked.current) return;
      if (stored === 'light' || stored === 'dark') {
        setMode(stored);
      } else {
        setMode(systemMode === 'dark' ? 'dark' : 'light');
      }
    });
    return () => {
      mounted = false;
    };
  }, [systemMode]);

  function setThemeMode(nextMode: ThemeMode) {
    userPicked.current = true;
    setMode(nextMode);
    AsyncStorage.setItem(STORAGE_KEY, nextMode).catch(() => undefined);
  }

  const value = useMemo<ThemeContextValue>(() => {
    const colors = paletteForMode(mode);
    return {
      mode,
      isDark: mode === 'dark',
      colors,
      toggleTheme: () => setThemeMode(mode === 'dark' ? 'light' : 'dark'),
      setThemeMode,
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.use(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside AppThemeProvider');
  }
  return context;
}
