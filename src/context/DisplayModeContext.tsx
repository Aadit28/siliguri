import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'saathi.displayMode';

export type DisplayMode = 'phone' | 'computer';

type DisplayModeContextValue = {
  displayMode: DisplayMode;
  isComputerMode: boolean;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleDisplayMode: () => void;
};

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [displayMode, setMode] = useState<DisplayMode>('phone');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!mounted) return;
      if (stored === 'phone' || stored === 'computer') {
        setMode(stored);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  function setDisplayMode(nextMode: DisplayMode) {
    setMode(nextMode);
    AsyncStorage.setItem(STORAGE_KEY, nextMode).catch(() => undefined);
  }

  const value = useMemo<DisplayModeContextValue>(
    () => ({
      displayMode,
      isComputerMode: displayMode === 'computer',
      setDisplayMode,
      toggleDisplayMode: () => setDisplayMode(displayMode === 'computer' ? 'phone' : 'computer'),
    }),
    [displayMode],
  );

  return <DisplayModeContext.Provider value={value}>{children}</DisplayModeContext.Provider>;
}

export function useDisplayMode() {
  const context = React.use(DisplayModeContext);
  if (!context) {
    throw new Error('useDisplayMode must be used inside DisplayModeProvider');
  }
  return context;
}
