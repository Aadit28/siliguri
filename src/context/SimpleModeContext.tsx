import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'saathi.simple.v1';

type SimpleModeContextValue = {
  isSimple: boolean;
  toggleSimple: () => void;
  setSimple: (value: boolean) => void;
};

const SimpleModeContext = createContext<SimpleModeContextValue | null>(null);

// Easy view: one flag that scales type and touch targets and strips decorative
// motion across the senior surface. Off by default — an elder who has never
// asked for it keeps the layout they already learned.
export function SimpleModeProvider({ children }: { children: React.ReactNode }) {
  const [isSimple, setIsSimple] = useState(false);
  // The stored value arrives after the first render. Without this guard a tap
  // made in that window is overwritten by the late read.
  const userPicked = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || userPicked.current) return;
        if (stored === '1' || stored === '0') {
          setIsSimple(stored === '1');
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  function setSimple(value: boolean) {
    userPicked.current = true;
    setIsSimple(value);
    // A failed write costs the preference on next launch, nothing more; the
    // screen already reflects the tap.
    AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0').catch(() => undefined);
  }

  const value = useMemo<SimpleModeContextValue>(
    () => ({
      isSimple,
      setSimple,
      toggleSimple: () => setSimple(!isSimple),
    }),
    [isSimple],
  );

  return <SimpleModeContext.Provider value={value}>{children}</SimpleModeContext.Provider>;
}

export function useSimpleMode() {
  const context = React.use(SimpleModeContext);
  if (!context) {
    throw new Error('useSimpleMode must be used inside SimpleModeProvider');
  }
  return context;
}
