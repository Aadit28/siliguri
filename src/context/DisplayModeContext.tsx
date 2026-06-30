import React, { createContext, useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export type DisplayMode = 'phone' | 'computer';

type DisplayModeContextValue = {
  displayMode: DisplayMode;
  isComputerMode: boolean;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleDisplayMode: () => void;
};

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const displayMode: DisplayMode = Platform.OS === 'web' && width >= 740 ? 'computer' : 'phone';

  const value = useMemo<DisplayModeContextValue>(
    () => ({
      displayMode,
      isComputerMode: displayMode === 'computer',
      setDisplayMode: () => undefined,
      toggleDisplayMode: () => undefined,
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
