import React, { createContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { automaticDisplayMode, DisplayMode } from '../lib/display-mode';

export type { DisplayMode } from '../lib/display-mode';

type DisplayModeContextValue = {
  displayMode: DisplayMode;
  isComputerMode: boolean;
};

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const userAgent = process.env.EXPO_OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  const maxTouchPoints = process.env.EXPO_OS === 'web' && typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
  const displayMode = automaticDisplayMode({ width, userAgent, maxTouchPoints, runtimeOS: process.env.EXPO_OS });

  const value = useMemo<DisplayModeContextValue>(
    () => ({
      displayMode,
      isComputerMode: displayMode === 'computer',
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
