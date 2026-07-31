import React, { createContext, useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { automaticDisplayMode, DisplayMode } from '../lib/display-mode';

export type { DisplayMode } from '../lib/display-mode';

type DisplayModeContextValue = {
  displayMode: DisplayMode;
  isComputerMode: boolean;
  toggleDisplayMode: () => void;
};

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const userAgent = process.env.EXPO_OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  const maxTouchPoints = process.env.EXPO_OS === 'web' && typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
  const automaticMode = automaticDisplayMode({ width, userAgent, maxTouchPoints, runtimeOS: process.env.EXPO_OS });

  // null = follow automatic detection; set only when the user taps the toggle.
  const [override, setOverride] = useState<DisplayMode | null>(null);
  const displayMode = override ?? automaticMode;

  const toggleDisplayMode = useCallback(() => {
    setOverride((prev) => ((prev ?? automaticMode) === 'phone' ? 'computer' : 'phone'));
  }, [automaticMode]);

  const value = useMemo<DisplayModeContextValue>(
    () => ({
      displayMode,
      isComputerMode: displayMode === 'computer',
      toggleDisplayMode,
    }),
    [displayMode, toggleDisplayMode],
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
